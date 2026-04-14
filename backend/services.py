import sqlite3
from collections import defaultdict
from contextlib import contextmanager
from datetime import UTC, datetime


def utc_now():
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")


def date_today():
    return datetime.now(UTC).strftime("%Y-%m-%d")


@contextmanager
def connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def row_to_dict(row):
    return dict(row) if row is not None else None


def rows_to_dicts(rows):
    return [dict(row) for row in rows]


def get_user_by_email(email, db_path):
    with connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT users.*, departments.code AS department_code, departments.name AS department_name
            FROM users
            LEFT JOIN departments ON departments.id = users.department_id
            WHERE lower(users.email) = lower(?)
            """,
            (email.strip(),),
        ).fetchone()
        return row_to_dict(row)


def get_user_by_id(user_id, db_path):
    with connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT users.*, departments.code AS department_code, departments.name AS department_name
            FROM users
            LEFT JOIN departments ON departments.id = users.department_id
            WHERE users.id = ?
            """,
            (user_id,),
        ).fetchone()
        return row_to_dict(row)


def log_action(conn, user_id, actor_name, action, entity_type, entity_id=None, details=None):
    conn.execute(
        """
        INSERT INTO audit_logs (user_id, actor_name, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (user_id, actor_name, action, entity_type, entity_id, details, utc_now()),
    )


def add_notification(conn, user_ids, title, message, category, action_link=None):
    conn.executemany(
        """
        INSERT INTO notifications (user_id, title, message, category, is_read, created_at, action_link)
        VALUES (?, ?, ?, ?, 0, ?, ?)
        """,
        [(user_id, title, message, category, utc_now(), action_link) for user_id in user_ids],
    )


def get_settings(db_path):
    with connect(db_path) as conn:
        rows = conn.execute("SELECT key, value FROM system_settings").fetchall()
        return {row["key"]: row["value"] for row in rows}


def get_setting(db_path, key, default=None):
    with connect(db_path) as conn:
        row = conn.execute("SELECT value FROM system_settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


def login_user(email, password, db_path):
    user = get_user_by_email(email, db_path)
    if not user or user["password"] != password.strip():
        return None, "invalid credentials"
    if user["status"] != "active":
        return None, f"account is {user['status']}"
    if user["role"] in {"student", "teacher"} and get_setting(db_path, "maintenance_mode", "0") == "1":
        return None, "portal under maintenance"
    with connect(db_path) as conn:
        conn.execute(
            "UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?",
            (utc_now(), utc_now(), user["id"]),
        )
    return {
        "userId": user["id"],
        "role": user["role"],
        "name": user["name"],
        "email": user["email"],
        "status": user["status"],
        "department": user["department_code"],
        "rollNo": user["roll_no"],
        "employeeId": user["employee_id"],
    }, None


def get_profile(user_id, db_path):
    user = get_user_by_id(user_id, db_path)
    if not user:
        return None
    with connect(db_path) as conn:
        profile = {
            "userId": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "phone": user["phone"],
            "status": user["status"],
            "department": {"code": user["department_code"], "name": user["department_name"]},
            "lastLoginAt": user["last_login_at"],
        }
        if user["role"] == "student":
            profile["details"] = row_to_dict(
                conn.execute(
                    """
                    SELECT program, batch, semester, section, academic_year, cgpa, total_credits,
                           earned_credits, advisor_name, hostel_name, scholarship_status,
                           rank_position, date_of_birth
                    FROM student_profiles
                    WHERE user_id = ?
                    """,
                    (user_id,),
                ).fetchone()
            )
        elif user["role"] == "teacher":
            profile["details"] = row_to_dict(
                conn.execute(
                    """
                    SELECT designation, specialization, qualification, experience_years, office_room
                    FROM teacher_profiles
                    WHERE user_id = ?
                    """,
                    (user_id,),
                ).fetchone()
            )
        else:
            profile["details"] = row_to_dict(
                conn.execute("SELECT title, super_admin FROM admin_profiles WHERE user_id = ?", (user_id,)).fetchone()
            )
    return profile


def update_profile(user_id, payload, db_path):
    updates = []
    values = []
    for field in ("name", "phone"):
        if payload.get(field):
            updates.append(f"{field} = ?")
            values.append(payload[field].strip())
    if not updates:
        return get_profile(user_id, db_path)
    values.extend([utc_now(), user_id])
    with connect(db_path) as conn:
        conn.execute(f"UPDATE users SET {', '.join(updates)}, updated_at = ? WHERE id = ?", values)
    return get_profile(user_id, db_path)


def change_password(user_id, current_password, new_password, db_path):
    user = get_user_by_id(user_id, db_path)
    if not user or user["password"] != current_password:
        raise ValueError("current password is incorrect")
    with connect(db_path) as conn:
        conn.execute(
            "UPDATE users SET password = ?, password_reset_required = 0, updated_at = ? WHERE id = ?",
            (new_password, utc_now(), user_id),
        )
        log_action(conn, user_id, user["name"], "Changed password", "user", user_id, "Password updated from profile.")
    return {"message": "password updated"}


def get_notifications(user_id, db_path):
    with connect(db_path) as conn:
        items = rows_to_dicts(
            conn.execute(
                """
                SELECT id, title, message, category, is_read, created_at, action_link
                FROM notifications
                WHERE user_id = ?
                ORDER BY datetime(created_at) DESC
                LIMIT 25
                """,
                (user_id,),
            ).fetchall()
        )
        unread = conn.execute(
            "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0",
            (user_id,),
        ).fetchone()["total"]
        return {"unreadCount": unread, "items": items}


def mark_notification_read(user_id, notification_id, db_path):
    with connect(db_path) as conn:
        conn.execute("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", (notification_id, user_id))
    return {"message": "notification marked as read"}


def _attendance_summary(conn, student_id, semester=None, subject=None, month=None, date_filter=None):
    params = [student_id]
    where = ["course_enrollments.student_id = ?"]
    if semester:
        where.append("courses.semester = ?")
        params.append(int(semester))
    if subject:
        where.append("courses.name = ?")
        params.append(subject)
    if month:
        where.append("substr(attendance_sessions.session_date, 1, 7) = ?")
        params.append(month)
    if date_filter:
        where.append("attendance_sessions.session_date = ?")
        params.append(date_filter)
    rows = conn.execute(
        f"""
        SELECT
          courses.id AS course_id,
          courses.code,
          courses.name AS subject,
          COUNT(attendance_sessions.id) AS delivered,
          SUM(CASE WHEN attendance_records.status = 'present' THEN 1 ELSE 0 END) AS present_count,
          SUM(CASE WHEN attendance_records.status IN ('present', 'late', 'medical_leave') THEN 1 ELSE 0 END) AS attended,
          SUM(CASE WHEN attendance_records.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
          SUM(CASE WHEN attendance_records.status = 'late' THEN 1 ELSE 0 END) AS late_count,
          SUM(CASE WHEN attendance_records.status = 'medical_leave' THEN 1 ELSE 0 END) AS medical_leave_count
        FROM course_enrollments
        JOIN courses ON courses.id = course_enrollments.course_id
        LEFT JOIN attendance_sessions ON attendance_sessions.course_id = courses.id
        LEFT JOIN attendance_records
          ON attendance_records.session_id = attendance_sessions.id
         AND attendance_records.student_id = course_enrollments.student_id
        WHERE {' AND '.join(where)}
        GROUP BY courses.id, courses.code, courses.name
        ORDER BY courses.name
        """,
        params,
    ).fetchall()
    items = []
    delivered_total = 0
    attended_total = 0
    present_total = 0
    absent_total = 0
    late_total = 0
    medical_leave_total = 0
    for row in rows:
        delivered = row["delivered"] or 0
        attended = row["attended"] or 0
        present = row["present_count"] or 0
        absent = row["absent_count"] or 0
        late = row["late_count"] or 0
        medical_leave = row["medical_leave_count"] or 0
        delivered_total += delivered
        attended_total += attended
        present_total += present
        absent_total += absent
        late_total += late
        medical_leave_total += medical_leave
        items.append(
            {
                "courseId": row["course_id"],
                "code": row["code"],
                "subject": row["subject"],
                "delivered": delivered,
                "attended": attended,
                "presentCount": present,
                "absentCount": absent,
                "lateCount": late,
                "medicalLeaveCount": medical_leave,
                "percentage": round((attended / delivered) * 100, 2) if delivered else 0,
            }
        )
    return {
        "overallPercentage": round((attended_total / delivered_total) * 100, 2) if delivered_total else 0,
        "deliveredTotal": delivered_total,
        "attendedTotal": attended_total,
        "presentTotal": present_total,
        "absentTotal": absent_total,
        "lateTotal": late_total,
        "medicalLeaveTotal": medical_leave_total,
        "items": items,
    }


def _student_timetable(conn, student_id, view="day", date_value=None):
    section = conn.execute("SELECT section FROM student_profiles WHERE user_id = ?", (student_id,)).fetchone()
    if not section:
        return {"date": date_today(), "items": []}
    date_value = date_value or date_today()
    day_name = datetime.strptime(date_value, "%Y-%m-%d").strftime("%A")
    rows = conn.execute(
        """
        SELECT
          timetable_slots.id,
          timetable_slots.day_of_week,
          timetable_slots.start_time,
          timetable_slots.end_time,
          timetable_slots.room,
          timetable_slots.slot_type,
          timetable_slots.status,
          timetable_slots.note,
          courses.name AS course_name,
          courses.code AS course_code,
          users.name AS teacher_name
        FROM timetable_slots
        JOIN courses ON courses.id = timetable_slots.course_id
        JOIN users ON users.id = courses.teacher_id
        WHERE courses.section = ?
        ORDER BY timetable_slots.start_time
        """,
        (section["section"],),
    ).fetchall()
    items = []
    for row in rows:
        if view == "day" and row["day_of_week"] != day_name:
            continue
        items.append(
            {
                "id": row["id"],
                "day": row["day_of_week"],
                "date": date_value,
                "time": f"{row['start_time']} - {row['end_time']}",
                "course": row["course_name"],
                "code": row["course_code"],
                "teacher": row["teacher_name"],
                "room": row["room"],
                "type": row["slot_type"],
                "status": row["status"],
                "note": row["note"],
            }
        )
    return {"date": date_value, "view": view, "items": items}


def _student_results(conn, student_id, semester=6):
    result_rows = rows_to_dicts(
        conn.execute(
            """
            SELECT
              course_results.course_id,
              courses.name AS subject,
              courses.code,
              course_results.internal_score,
              course_results.external_score,
              course_results.total_score,
              course_results.grade_letter,
              course_results.grade_point,
              course_results.credits
            FROM course_results
            JOIN courses ON courses.id = course_results.course_id
            WHERE course_results.student_id = ? AND course_results.semester = ?
            ORDER BY courses.name
            """,
            (student_id, semester),
        ).fetchall()
    )
    summary_rows = rows_to_dicts(
        conn.execute(
            """
            SELECT semester, academic_year, sgpa, cgpa, credits_registered, credits_earned, rank_position
            FROM semester_performance
            WHERE student_id = ?
            ORDER BY semester
            """,
            (student_id,),
        ).fetchall()
    )
    total_credits = sum(row["credits"] for row in result_rows)
    total_credit_points = sum(row["credits"] * row["grade_point"] for row in result_rows)
    return {"semester": int(semester), "summary": summary_rows, "items": result_rows, "sgpa": round(total_credit_points / total_credits, 2) if total_credits else 0}


def _student_assignments(conn, student_id):
    return rows_to_dicts(
        conn.execute(
            """
            SELECT
              assignments.id,
              assignments.title,
              assignments.description,
              assignments.due_date,
              assignments.max_score,
              assignments.status,
              courses.name AS subject,
              assignment_submissions.status AS submission_status,
              assignment_submissions.score,
              assignment_submissions.submitted_at
            FROM assignment_submissions
            JOIN assignments ON assignments.id = assignment_submissions.assignment_id
            JOIN courses ON courses.id = assignments.course_id
            WHERE assignment_submissions.student_id = ?
            ORDER BY date(assignments.due_date) ASC
            """,
            (student_id,),
        ).fetchall()
    )


def _student_notices(conn):
    return rows_to_dicts(
        conn.execute(
            """
            SELECT notices.id, notices.title, notices.message, notices.audience, notices.priority,
                   notices.created_at, users.name AS published_by
            FROM notices
            JOIN users ON users.id = notices.published_by
            WHERE notices.active = 1
            ORDER BY datetime(notices.created_at) DESC
            LIMIT 10
            """
        ).fetchall()
    )


def _student_library(conn, student_id):
    return rows_to_dicts(
        conn.execute(
            """
            SELECT
              library_loans.id,
              library_books.title,
              library_books.author,
              library_loans.issue_date,
              library_loans.due_date,
              library_loans.status,
              library_loans.fine_amount
            FROM library_loans
            JOIN library_books ON library_books.id = library_loans.book_id
            WHERE library_loans.student_id = ?
            ORDER BY date(library_loans.due_date)
            """,
            (student_id,),
        ).fetchall()
    )


def _student_placements(conn, student_id):
    return rows_to_dicts(
        conn.execute(
            """
            SELECT
              placements.id,
              placements.company,
              placements.role,
              placements.package_lpa,
              placements.deadline,
              placements.drive_date,
              placements.min_cgpa,
              placements.location,
              placements.status,
              placement_applications.status AS application_status,
              placement_applications.note
            FROM placements
            LEFT JOIN placement_applications
              ON placement_applications.placement_id = placements.id
             AND placement_applications.student_id = ?
            ORDER BY date(placements.drive_date)
            """,
            (student_id,),
        ).fetchall()
    )


def _student_fees(conn, student_id):
    items = rows_to_dicts(conn.execute("SELECT id, fee_head, term_label, amount, due_date, status, paid_at, transaction_ref FROM fee_items WHERE student_id = ? ORDER BY date(due_date)", (student_id,)).fetchall())
    scholarship = rows_to_dicts(conn.execute("SELECT id, name, amount, status, disbursed_at FROM scholarship_awards WHERE student_id = ? ORDER BY id DESC", (student_id,)).fetchall())
    pending_total = round(sum(item["amount"] for item in items if item["status"] in {"pending", "overdue"}), 2)
    return {"pendingTotal": pending_total, "items": items, "scholarships": scholarship}


def _student_grievances(conn, student_id):
    return rows_to_dicts(conn.execute("SELECT id, category, subject, message, status, priority, resolution_note, created_at, updated_at FROM grievances WHERE submitted_by = ? ORDER BY datetime(created_at) DESC", (student_id,)).fetchall())


def _student_requests(conn, student_id):
    return rows_to_dicts(conn.execute("SELECT id, request_type, from_date, to_date, reason, attachment_name, status, reviewed_at, created_at FROM workflow_requests WHERE student_id = ? ORDER BY datetime(created_at) DESC", (student_id,)).fetchall())


def get_student_dashboard(
    user_id,
    db_path,
    attendance_semester=6,
    results_semester=6,
    attendance_subject=None,
    attendance_view="overall",
    timetable_view="day",
    timetable_date=None,
):
    with connect(db_path) as conn:
        profile = get_profile(user_id, db_path)
        attendance = _attendance_summary(conn, user_id, semester=attendance_semester, subject=attendance_subject)
        assignments = _student_assignments(conn, user_id)
        fees = _student_fees(conn, user_id)
        grievances = _student_grievances(conn, user_id)
        details = profile["details"]
        return {
            "profile": profile,
            "kpis": {
                "cgpa": details["cgpa"],
                "rank": details["rank_position"],
                "attendance": attendance["overallPercentage"],
                "credits": details["earned_credits"],
                "totalCredits": details["total_credits"],
                "pendingAssignments": len([item for item in assignments if item["submission_status"] == "pending"]),
                "pendingFees": fees["pendingTotal"],
                "openGrievances": len([item for item in grievances if item["status"] in {"open", "in_review"}]),
            },
            "attendance": attendance,
            "attendanceView": attendance_view,
            "timetable": _student_timetable(conn, user_id, view=timetable_view, date_value=timetable_date),
            "results": _student_results(conn, user_id, semester=results_semester),
            "assignments": assignments,
            "notices": _student_notices(conn),
            "library": _student_library(conn, user_id),
            "placements": _student_placements(conn, user_id),
            "fees": fees,
            "requests": _student_requests(conn, user_id),
            "grievances": grievances,
            "notifications": get_notifications(user_id, db_path),
        }


def get_student_attendance(user_id, db_path, semester=6, subject=None, month=None, date_filter=None):
    with connect(db_path) as conn:
        params = [user_id, int(semester), subject, subject]
        clauses = [
            "attendance_records.student_id = ?",
            "courses.semester = ?",
            "(? IS NULL OR courses.name = ?)",
        ]
        if month:
            clauses.append("substr(attendance_sessions.session_date, 1, 7) = ?")
            params.append(month)
        if date_filter:
            clauses.append("attendance_sessions.session_date = ?")
            params.append(date_filter)
        sessions = rows_to_dicts(
            conn.execute(
                f"""
                SELECT
                  attendance_sessions.session_date,
                  attendance_sessions.start_time,
                  attendance_sessions.end_time,
                  courses.name AS subject,
                  courses.code,
                  attendance_records.status
                FROM attendance_records
                JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id
                JOIN courses ON courses.id = attendance_sessions.course_id
                WHERE {' AND '.join(clauses)}
                ORDER BY date(attendance_sessions.session_date) DESC, attendance_sessions.start_time
                """,
                params,
            ).fetchall()
        )
        grouped = defaultdict(
            lambda: {
                "date": "",
                "sessionCount": 0,
                "presentCount": 0,
                "absentCount": 0,
                "lateCount": 0,
                "medicalLeaveCount": 0,
                "sessions": [],
            }
        )
        for session in sessions:
            day = grouped[session["session_date"]]
            day["date"] = session["session_date"]
            day["sessionCount"] += 1
            if session["status"] == "present":
                day["presentCount"] += 1
            elif session["status"] == "absent":
                day["absentCount"] += 1
            elif session["status"] == "late":
                day["lateCount"] += 1
            elif session["status"] == "medical_leave":
                day["medicalLeaveCount"] += 1
            day["sessions"].append(session)
        daywise = sorted(grouped.values(), key=lambda item: item["date"], reverse=True)
        return {
            "summary": _attendance_summary(conn, user_id, semester=semester, subject=subject, month=month, date_filter=date_filter),
            "sessions": sessions,
            "daywise": daywise,
            "filters": {
                "semester": int(semester),
                "subject": subject or "",
                "month": month or "",
                "date": date_filter or "",
            },
        }


def submit_student_request(user_id, payload, db_path):
    request_type = payload.get("requestType", "absence")
    if request_type not in {"medical_leave", "absence"}:
        raise ValueError("invalid request type")
    with connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO workflow_requests (
              student_id, request_type, from_date, to_date, reason, attachment_name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
            """,
            (user_id, request_type, payload["fromDate"], payload["toDate"], payload["reason"].strip(), payload.get("attachmentName"), utc_now()),
        )
        request_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        add_notification(conn, [user_id], "Request Submitted", f"{request_type.replace('_', ' ').title()} request has been submitted for review.", "workflow", "#requests")
        admin_ids = [row["id"] for row in conn.execute("SELECT id FROM users WHERE role = 'admin'").fetchall()]
        add_notification(conn, admin_ids, "New Workflow Request", "A student submitted a new absence or medical leave request.", "workflow", "#grievances")
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Submitted workflow request", "workflow_request", request_id, payload["reason"].strip())
    return {"message": "request submitted", "requestId": request_id}


def submit_grievance(user_id, payload, db_path):
    with connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO grievances (
              submitted_by, category, subject, message, status, priority, assigned_to, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'open', ?, (SELECT id FROM users WHERE role = 'admin' LIMIT 1), ?, ?)
            """,
            (user_id, payload["category"], payload["subject"].strip(), payload["message"].strip(), payload.get("priority", "medium"), utc_now(), utc_now()),
        )
        grievance_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        add_notification(conn, [user_id], "Grievance Filed", "Your grievance is now in the review queue.", "grievance", "#grievance")
        admin_ids = [row["id"] for row in conn.execute("SELECT id FROM users WHERE role = 'admin'").fetchall()]
        add_notification(conn, admin_ids, "New Grievance", "A student raised a new grievance requiring review.", "grievance", "#grievances")
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Submitted grievance", "grievance", grievance_id, payload["subject"].strip())
    return {"message": "grievance submitted", "grievanceId": grievance_id}


def pay_fee_items(user_id, fee_ids, db_path):
    if not fee_ids:
        raise ValueError("no fee items selected")
    with connect(db_path) as conn:
        placeholders = ",".join("?" for _ in fee_ids)
        rows = conn.execute(
            f"SELECT id, amount FROM fee_items WHERE student_id = ? AND id IN ({placeholders}) AND status IN ('pending', 'overdue')",
            [user_id, *fee_ids],
        ).fetchall()
        if not rows:
            raise ValueError("no payable fee items found")
        for row in rows:
            conn.execute(
                "UPDATE fee_items SET status = 'paid', paid_at = ?, transaction_ref = ? WHERE id = ?",
                (utc_now(), f"TXN-{user_id}-{row['id']}-{datetime.now(UTC).strftime('%H%M%S')}", row["id"]),
            )
        total = round(sum(row["amount"] for row in rows), 2)
        actor = get_user_by_id(user_id, db_path)
        add_notification(conn, [user_id], "Fee Payment Success", f"Payment recorded for Rs. {total}.", "fees", "#fees")
        log_action(conn, user_id, actor["name"], "Paid fee items", "fee_item", None, f"Paid {len(rows)} fee items totalling Rs. {total}.")
    return {"message": "payment recorded", "amount": total}


def apply_for_placement(user_id, placement_id, db_path):
    with connect(db_path) as conn:
        placement = conn.execute("SELECT * FROM placements WHERE id = ?", (placement_id,)).fetchone()
        if not placement:
            raise ValueError("placement not found")
        if conn.execute("SELECT id FROM placement_applications WHERE placement_id = ? AND student_id = ?", (placement_id, user_id)).fetchone():
            raise ValueError("already applied")
        conn.execute(
            "INSERT INTO placement_applications (placement_id, student_id, status, applied_at, note) VALUES (?, ?, 'applied', ?, ?)",
            (placement_id, user_id, utc_now(), "Application submitted through student portal."),
        )
        actor = get_user_by_id(user_id, db_path)
        add_notification(conn, [user_id], "Placement Application Submitted", f"You have applied to {placement['company']} for {placement['role']}.", "placement", "#placements")
        log_action(conn, user_id, actor["name"], "Applied for placement", "placement", placement_id, placement["company"])
    return {"message": "application submitted"}


def renew_library_loan(user_id, loan_id, db_path):
    with connect(db_path) as conn:
        loan = conn.execute("SELECT id, status FROM library_loans WHERE id = ? AND student_id = ?", (loan_id, user_id)).fetchone()
        if not loan:
            raise ValueError("loan not found")
        if loan["status"] == "renewal_requested":
            raise ValueError("renewal already requested")
        conn.execute("UPDATE library_loans SET status = 'renewal_requested' WHERE id = ?", (loan_id,))
        actor = get_user_by_id(user_id, db_path)
        add_notification(conn, [user_id], "Library Renewal Requested", "The renewal request has been routed to library staff.", "library", "#library")
        log_action(conn, user_id, actor["name"], "Requested library renewal", "library_loan", loan_id, None)
    return {"message": "renewal requested"}


def _grade_for(total_score):
    if total_score >= 135:
        return "A+", 10.0
    if total_score >= 125:
        return "A", 9.0
    if total_score >= 112:
        return "B+", 8.0
    if total_score >= 100:
        return "B", 7.0
    if total_score >= 90:
        return "C", 6.0
    return "P", 5.0


def get_teacher_dashboard(user_id, db_path):
    with connect(db_path) as conn:
        profile = get_profile(user_id, db_path)
        courses = rows_to_dicts(
            conn.execute(
                """
                SELECT id, code, name, section, credits, status
                FROM courses
                WHERE teacher_id = ?
                ORDER BY section, name
                """,
                (user_id,),
            ).fetchall()
        )
        unique_students = conn.execute(
            """
            SELECT COUNT(DISTINCT student_id) AS total
            FROM course_enrollments
            WHERE course_id IN (SELECT id FROM courses WHERE teacher_id = ?)
            """,
            (user_id,),
        ).fetchone()["total"]
        pending_assignments = conn.execute(
            "SELECT COUNT(*) AS total FROM assignments WHERE teacher_id = ? AND status = 'open' AND date(due_date) >= date(?)",
            (user_id, date_today()),
        ).fetchone()["total"]
        attendance_row = conn.execute(
            """
            SELECT
              COUNT(attendance_records.id) AS delivered,
              SUM(CASE WHEN attendance_records.status IN ('present', 'late', 'medical_leave') THEN 1 ELSE 0 END) AS attended
            FROM attendance_records
            JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id
            WHERE attendance_sessions.teacher_id = ?
            """,
            (user_id,),
        ).fetchone()
        avg_attendance = round(((attendance_row["attended"] or 0) / attendance_row["delivered"]) * 100, 2) if attendance_row["delivered"] else 0
        chart_rows = rows_to_dicts(
            conn.execute(
                """
                SELECT
                  courses.name || ' (' || courses.section || ')' AS label,
                  ROUND(AVG(marks.score), 2) AS avg_score
                FROM marks
                JOIN assessments ON assessments.id = marks.assessment_id
                JOIN courses ON courses.id = assessments.course_id
                WHERE assessments.teacher_id = ?
                GROUP BY courses.id
                ORDER BY courses.section, courses.name
                """,
                (user_id,),
            ).fetchall()
        )
        roster_rows = conn.execute(
            """
            SELECT DISTINCT
              users.id,
              users.name,
              users.roll_no,
              users.email,
              users.phone,
              student_profiles.cgpa,
              student_profiles.section
            FROM course_enrollments
            JOIN users ON users.id = course_enrollments.student_id
            JOIN student_profiles ON student_profiles.user_id = users.id
            JOIN courses ON courses.id = course_enrollments.course_id
            WHERE courses.teacher_id = ?
            ORDER BY student_profiles.section, users.name
            """,
            (user_id,),
        ).fetchall()
        roster = []
        for row in roster_rows:
            attendance = _attendance_summary(conn, row["id"], semester=6)
            roster.append({**dict(row), "attendance": attendance["overallPercentage"], "risk": "at_risk" if attendance["overallPercentage"] < 75 else "stable"})
        assignments = rows_to_dicts(
            conn.execute(
                """
                SELECT
                  assignments.id,
                  assignments.title,
                  assignments.description,
                  assignments.due_date,
                  assignments.max_score,
                  assignments.status,
                  courses.name AS subject,
                  COUNT(assignment_submissions.id) AS total_students,
                  SUM(CASE WHEN assignment_submissions.status IN ('submitted', 'graded') THEN 1 ELSE 0 END) AS submitted_count
                FROM assignments
                JOIN courses ON courses.id = assignments.course_id
                LEFT JOIN assignment_submissions ON assignment_submissions.assignment_id = assignments.id
                WHERE assignments.teacher_id = ?
                GROUP BY assignments.id
                ORDER BY date(assignments.due_date)
                """,
                (user_id,),
            ).fetchall()
        )
        timetable = rows_to_dicts(
            conn.execute(
                """
                SELECT
                  timetable_slots.id,
                  timetable_slots.day_of_week,
                  timetable_slots.start_time,
                  timetable_slots.end_time,
                  timetable_slots.room,
                  timetable_slots.slot_type,
                  timetable_slots.status,
                  timetable_slots.note,
                  courses.name AS subject,
                  courses.section
                FROM timetable_slots
                JOIN courses ON courses.id = timetable_slots.course_id
                WHERE courses.teacher_id = ?
                ORDER BY CASE timetable_slots.day_of_week
                  WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
                  WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7
                END, timetable_slots.start_time
                """,
                (user_id,),
            ).fetchall()
        )
        announcements = rows_to_dicts(
            conn.execute(
                "SELECT id, title, message, audience, priority, created_at FROM notices WHERE published_by = ? ORDER BY datetime(created_at) DESC LIMIT 10",
                (user_id,),
            ).fetchall()
        )
        return {
            "profile": profile,
            "kpis": {
                "classes": len(courses),
                "students": unique_students,
                "pendingAssignments": pending_assignments,
                "avgAttendance": avg_attendance,
                "todayClasses": len([slot for slot in timetable if slot["day_of_week"] == "Thursday"]),
            },
            "courses": courses,
            "chart": {"labels": [row["label"] for row in chart_rows], "values": [row["avg_score"] for row in chart_rows]},
            "roster": roster,
            "assignments": assignments,
            "timetable": timetable,
            "announcements": announcements,
            "reports": {
                "attendanceSessions": conn.execute("SELECT COUNT(*) AS total FROM attendance_sessions WHERE teacher_id = ?", (user_id,)).fetchone()["total"],
                "assignments": len(assignments),
                "avgAttendance": avg_attendance,
                "avgMarks": round(sum(row["avg_score"] for row in chart_rows) / len(chart_rows), 2) if chart_rows else 0,
                "studentCount": unique_students,
            },
            "notifications": get_notifications(user_id, db_path),
        }


def get_teacher_attendance(user_id, db_path, course_id=None, date_filter=None):
    with connect(db_path) as conn:
        params = [user_id]
        clauses = ["courses.teacher_id = ?"]
        if course_id:
            clauses.append("courses.id = ?")
            params.append(int(course_id))
        if date_filter:
            clauses.append("attendance_sessions.session_date = ?")
            params.append(date_filter)
        rows = conn.execute(
            f"""
            SELECT
              attendance_sessions.id,
              attendance_sessions.session_date,
              courses.id AS course_id,
              courses.name AS course_name,
              courses.section,
              COUNT(attendance_records.id) AS total_records,
              SUM(CASE WHEN attendance_records.status = 'present' THEN 1 ELSE 0 END) AS present_count,
              SUM(CASE WHEN attendance_records.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
              SUM(CASE WHEN attendance_records.status = 'late' THEN 1 ELSE 0 END) AS late_count
            FROM attendance_sessions
            JOIN courses ON courses.id = attendance_sessions.course_id
            LEFT JOIN attendance_records ON attendance_records.session_id = attendance_sessions.id
            WHERE {' AND '.join(clauses)}
            GROUP BY attendance_sessions.id
            ORDER BY date(attendance_sessions.session_date) DESC
            """,
            params,
        ).fetchall()
        return rows_to_dicts(rows)


def submit_teacher_attendance(user_id, payload, db_path):
    course_id = int(payload["courseId"])
    session_date = payload["date"]
    records = payload["records"]
    with connect(db_path) as conn:
        course = conn.execute("SELECT id, name FROM courses WHERE id = ? AND teacher_id = ?", (course_id, user_id)).fetchone()
        if not course:
            raise ValueError("course not found")
        slot = conn.execute("SELECT id, start_time, end_time FROM timetable_slots WHERE course_id = ? ORDER BY id LIMIT 1", (course_id,)).fetchone()
        existing = conn.execute("SELECT id FROM attendance_sessions WHERE course_id = ? AND session_date = ?", (course_id, session_date)).fetchone()
        if existing:
            session_id = existing["id"]
            conn.execute("DELETE FROM attendance_records WHERE session_id = ?", (session_id,))
            updated = True
        else:
            conn.execute(
                """
                INSERT INTO attendance_sessions (
                  course_id, teacher_id, timetable_slot_id, session_date, delivered_count,
                  start_time, end_time, status, note, created_at
                ) VALUES (?, ?, ?, ?, 1, ?, ?, 'completed', ?, ?)
                """,
                (course_id, user_id, slot["id"] if slot else None, session_date, slot["start_time"] if slot else "09:00", slot["end_time"] if slot else "10:00", "Attendance updated from teacher portal.", utc_now()),
            )
            session_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            updated = False
        for record in records:
            conn.execute("INSERT INTO attendance_records (session_id, student_id, status, remark) VALUES (?, ?, ?, ?)", (session_id, int(record["studentId"]), record["status"], record.get("remark", "")))
        absent_ids = [int(record["studentId"]) for record in records if record["status"] in {"absent", "medical_leave"}]
        if absent_ids:
            add_notification(conn, absent_ids, "Attendance Updated", f"{course['name']} attendance for {session_date} has been updated.", "attendance", "#attendance")
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Submitted attendance", "attendance_session", session_id, f"{course['name']} on {session_date}")
    return {"message": "attendance saved", "updated": updated, "sessionId": session_id}


def _recalculate_course_results(conn, course_id):
    rows = conn.execute(
        """
        SELECT
          marks.student_id,
          SUM(CASE WHEN assessments.exam_type IN ('Internal Exam 1', 'Internal Exam 2') THEN marks.score ELSE 0 END) AS internal_score,
          SUM(CASE WHEN assessments.exam_type = 'Mid-Term' THEN marks.score ELSE 0 END) AS external_score
        FROM marks
        JOIN assessments ON assessments.id = marks.assessment_id
        WHERE assessments.course_id = ?
        GROUP BY marks.student_id
        """,
        (course_id,),
    ).fetchall()
    course = conn.execute("SELECT credits FROM courses WHERE id = ?", (course_id,)).fetchone()
    for row in rows:
        internal_score = round(row["internal_score"] or 0, 2)
        external_score = round(row["external_score"] or 0, 2)
        total_score = internal_score + external_score
        grade_letter, grade_point = _grade_for(total_score)
        existing = conn.execute("SELECT id FROM course_results WHERE course_id = ? AND student_id = ? AND semester = 6", (course_id, row["student_id"])).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE course_results
                SET internal_score = ?, external_score = ?, total_score = ?, grade_letter = ?, grade_point = ?, published_on = ?
                WHERE id = ?
                """,
                (internal_score, external_score, total_score, grade_letter, grade_point, date_today(), existing["id"]),
            )
        else:
            conn.execute(
                """
                INSERT INTO course_results (
                  student_id, course_id, semester, academic_year, internal_score, external_score,
                  total_score, grade_letter, grade_point, credits, published_on
                ) VALUES (?, ?, 6, '2025-2026', ?, ?, ?, ?, ?, ?, ?)
                """,
                (row["student_id"], course_id, internal_score, external_score, total_score, grade_letter, grade_point, course["credits"], date_today()),
            )


def submit_teacher_marks(user_id, payload, db_path):
    course_id = int(payload["courseId"])
    exam_type = payload["examType"]
    max_score = int(payload["maxScore"])
    with connect(db_path) as conn:
        course = conn.execute("SELECT id, name FROM courses WHERE id = ? AND teacher_id = ?", (course_id, user_id)).fetchone()
        if not course:
            raise ValueError("course not found")
        assessment = conn.execute("SELECT id FROM assessments WHERE course_id = ? AND exam_type = ? AND semester = 6", (course_id, exam_type)).fetchone()
        if assessment:
            assessment_id = assessment["id"]
            conn.execute("UPDATE assessments SET max_score = ?, published_on = ? WHERE id = ?", (max_score, date_today(), assessment_id))
        else:
            conn.execute("INSERT INTO assessments (course_id, teacher_id, exam_type, max_score, semester, published_on) VALUES (?, ?, ?, ?, 6, ?)", (course_id, user_id, exam_type, max_score, date_today()))
            assessment_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        for record in payload["records"]:
            existing = conn.execute("SELECT id FROM marks WHERE assessment_id = ? AND student_id = ?", (assessment_id, int(record["studentId"]))).fetchone()
            if existing:
                conn.execute("UPDATE marks SET score = ?, remark = ?, updated_at = ? WHERE id = ?", (float(record["score"]), record.get("remark", ""), utc_now(), existing["id"]))
            else:
                conn.execute("INSERT INTO marks (assessment_id, student_id, score, remark, updated_at) VALUES (?, ?, ?, ?, ?)", (assessment_id, int(record["studentId"]), float(record["score"]), record.get("remark", ""), utc_now()))
        _recalculate_course_results(conn, course_id)
        student_ids = [int(record["studentId"]) for record in payload["records"]]
        add_notification(conn, student_ids, "Marks Published", f"{course['name']} {exam_type} marks are now available in the portal.", "results", "#results")
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Published marks", "assessment", assessment_id, f"{course['name']} {exam_type}")
    return {"message": "marks saved", "assessmentId": assessment_id}


def create_teacher_assignment(user_id, payload, db_path):
    with connect(db_path) as conn:
        course = conn.execute("SELECT id, name FROM courses WHERE id = ? AND teacher_id = ?", (int(payload["courseId"]), user_id)).fetchone()
        if not course:
            raise ValueError("course not found")
        conn.execute(
            """
            INSERT INTO assignments (
              course_id, teacher_id, title, description, due_date, max_score, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
            """,
            (course["id"], user_id, payload["title"].strip(), payload["description"].strip(), payload["dueDate"], int(payload["maxScore"]), utc_now()),
        )
        assignment_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        student_ids = [row["student_id"] for row in conn.execute("SELECT student_id FROM course_enrollments WHERE course_id = ?", (course["id"],)).fetchall()]
        conn.executemany(
            "INSERT INTO assignment_submissions (assignment_id, student_id, status, score, file_name, submitted_at, feedback) VALUES (?, ?, 'pending', NULL, NULL, NULL, NULL)",
            [(assignment_id, student_id) for student_id in student_ids],
        )
        add_notification(conn, student_ids, "New Assignment", f"{payload['title']} has been published for {course['name']}.", "assignment", "#assignments")
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Created assignment", "assignment", assignment_id, payload["title"].strip())
    return {"message": "assignment created", "assignmentId": assignment_id}


def notify_student_from_teacher(user_id, payload, db_path):
    with connect(db_path) as conn:
        student_id = int(payload["studentId"])
        add_notification(conn, [student_id], payload.get("title", "Faculty Message"), payload["message"].strip(), "notification", "#profile")
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Contacted student", "notification", student_id, payload["message"].strip())
    return {"message": "notification sent"}


def update_teacher_timetable_slot(user_id, slot_id, payload, db_path):
    with connect(db_path) as conn:
        slot = conn.execute(
            """
            SELECT timetable_slots.id, timetable_slots.course_id, courses.name AS course_name
            FROM timetable_slots
            JOIN courses ON courses.id = timetable_slots.course_id
            WHERE timetable_slots.id = ? AND courses.teacher_id = ?
            """,
            (slot_id, user_id),
        ).fetchone()
        if not slot:
            raise ValueError("slot not found")
        conn.execute(
            """
            UPDATE timetable_slots
            SET room = COALESCE(?, room), status = COALESCE(?, status), note = COALESCE(?, note), updated_at = ?, updated_by = ?
            WHERE id = ?
            """,
            (payload.get("room"), payload.get("status"), payload.get("note"), utc_now(), user_id, slot_id),
        )
        student_ids = [row["student_id"] for row in conn.execute("SELECT student_id FROM course_enrollments WHERE course_id = ?", (slot["course_id"],)).fetchall()]
        add_notification(conn, student_ids, "Timetable Updated", f"{slot['course_name']} timetable has been updated by faculty.", "timetable", "#timetable")
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Updated timetable slot", "timetable_slot", slot_id, payload.get("note"))
    return {"message": "timetable updated"}


def create_teacher_notice(user_id, payload, db_path):
    with connect(db_path) as conn:
        conn.execute(
            "INSERT INTO notices (title, message, audience, priority, published_by, created_at, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
            (payload["title"].strip(), payload["message"].strip(), payload.get("audience", "student"), payload.get("priority", "medium"), user_id, utc_now()),
        )
        notice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        if payload.get("audience", "student") in {"student", "all"}:
            student_ids = [row["id"] for row in conn.execute("SELECT id FROM users WHERE role = 'student'").fetchall()]
            add_notification(conn, student_ids, "New Notice", payload["title"].strip(), "notice", "#notices")
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Published notice", "notice", notice_id, payload["title"].strip())
    return {"message": "notice published", "noticeId": notice_id}


def get_admin_dashboard(user_id, db_path):
    with connect(db_path) as conn:
        profile = get_profile(user_id, db_path)
        stats = conn.execute(
            """
            SELECT
              SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students,
              SUM(CASE WHEN role = 'teacher' THEN 1 ELSE 0 END) AS teachers,
              SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins,
              COUNT(*) AS total_users
            FROM users
            WHERE status != 'archived'
            """
        ).fetchone()
        chart = rows_to_dicts(
            conn.execute(
                """
                SELECT
                  departments.code,
                  departments.name,
                  SUM(CASE WHEN users.role = 'student' THEN 1 ELSE 0 END) AS students,
                  SUM(CASE WHEN users.role = 'teacher' THEN 1 ELSE 0 END) AS teachers
                FROM departments
                LEFT JOIN users ON users.department_id = departments.id AND users.status != 'archived'
                GROUP BY departments.id
                ORDER BY departments.code
                """
            ).fetchall()
        )
        users = rows_to_dicts(
            conn.execute(
                """
                SELECT
                  users.id,
                  users.name,
                  users.email,
                  users.role,
                  users.status,
                  users.roll_no,
                  users.employee_id,
                  users.last_login_at,
                  departments.code AS department
                FROM users
                LEFT JOIN departments ON departments.id = users.department_id
                ORDER BY CASE users.role WHEN 'admin' THEN 1 WHEN 'teacher' THEN 2 ELSE 3 END, users.name
                """
            ).fetchall()
        )
        departments = rows_to_dicts(
            conn.execute(
                """
                SELECT
                  departments.id,
                  departments.code,
                  departments.name,
                  departments.hod_name,
                  departments.active,
                  SUM(CASE WHEN users.role = 'teacher' AND users.status != 'archived' THEN 1 ELSE 0 END) AS faculty_count,
                  SUM(CASE WHEN users.role = 'student' AND users.status != 'archived' THEN 1 ELSE 0 END) AS student_count
                FROM departments
                LEFT JOIN users ON users.department_id = departments.id
                GROUP BY departments.id
                ORDER BY departments.code
                """
            ).fetchall()
        )
        courses = rows_to_dicts(
            conn.execute(
                """
                SELECT
                  courses.id,
                  courses.code,
                  courses.name,
                  courses.section,
                  courses.semester,
                  courses.credits,
                  courses.status,
                  departments.code AS department,
                  users.name AS teacher_name,
                  users.id AS teacher_id
                FROM courses
                JOIN departments ON departments.id = courses.department_id
                JOIN users ON users.id = courses.teacher_id
                ORDER BY courses.code
                """
            ).fetchall()
        )
        timetable = rows_to_dicts(
            conn.execute(
                """
                SELECT
                  timetable_slots.id,
                  courses.code AS course_code,
                  courses.name AS course_name,
                  courses.section,
                  courses.id AS course_id,
                  timetable_slots.day_of_week,
                  timetable_slots.start_time,
                  timetable_slots.end_time,
                  timetable_slots.room,
                  timetable_slots.slot_type,
                  timetable_slots.status,
                  timetable_slots.note
                FROM timetable_slots
                JOIN courses ON courses.id = timetable_slots.course_id
                ORDER BY courses.section, timetable_slots.day_of_week, timetable_slots.start_time
                """
            ).fetchall()
        )
        grievances = rows_to_dicts(
            conn.execute(
                """
                SELECT
                  grievances.id,
                  users.name AS submitted_by,
                  grievances.category,
                  grievances.subject,
                  grievances.status,
                  grievances.priority,
                  grievances.resolution_note,
                  grievances.created_at,
                  grievances.updated_at
                FROM grievances
                JOIN users ON users.id = grievances.submitted_by
                ORDER BY CASE grievances.status WHEN 'open' THEN 1 WHEN 'in_review' THEN 2 ELSE 3 END,
                         datetime(grievances.created_at) DESC
                """
            ).fetchall()
        )
        notices = rows_to_dicts(
            conn.execute(
                """
                SELECT
                  notices.id,
                  notices.title,
                  notices.message,
                  notices.audience,
                  notices.priority,
                  notices.active,
                  notices.created_at,
                  users.name AS published_by
                FROM notices
                JOIN users ON users.id = notices.published_by
                ORDER BY datetime(notices.created_at) DESC
                """
            ).fetchall()
        )
        audit_logs = rows_to_dicts(
            conn.execute(
                "SELECT id, actor_name, action, entity_type, entity_id, details, created_at FROM audit_logs ORDER BY datetime(created_at) DESC LIMIT 25"
            ).fetchall()
        )
        settings = get_settings(db_path)
        reports = {
            "openGrievances": len([item for item in grievances if item["status"] in {"open", "in_review"}]),
            "activeNotices": len([item for item in notices if item["active"] == 1]),
            "reviewCourses": len([item for item in courses if item["status"] == "review"]),
            "systemStatus": "Maintenance" if settings.get("maintenance_mode") == "1" else "Live",
        }
        return {
            "profile": profile,
            "kpis": {
                "totalUsers": stats["total_users"],
                "students": stats["students"],
                "teachers": stats["teachers"],
                "departments": len(departments),
                "pendingGrievances": reports["openGrievances"],
                "systemStatus": reports["systemStatus"],
            },
            "chart": chart,
            "users": users,
            "departments": departments,
            "courses": courses,
            "timetable": timetable,
            "grievances": grievances,
            "notices": notices,
            "reports": reports,
            "settings": settings,
            "auditLogs": audit_logs,
            "notifications": get_notifications(user_id, db_path),
        }


def create_user(admin_id, payload, db_path):
    role = payload["role"]
    if role not in {"student", "teacher", "admin"}:
        raise ValueError("invalid role")
    with connect(db_path) as conn:
        dept = conn.execute("SELECT id FROM departments WHERE code = ?", (payload.get("department", "CSE"),)).fetchone()
        dept_id = dept["id"] if dept else None
        conn.execute(
            """
            INSERT INTO users (
              email, password, role, name, roll_no, employee_id, department_id, phone,
              status, password_reset_required, last_login_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, NULL, ?, ?)
            """,
            (payload["email"].strip().lower(), payload.get("password", "changeme123"), role, payload["name"].strip(), payload.get("rollNo"), payload.get("employeeId"), dept_id, payload.get("phone"), utc_now(), utc_now()),
        )
        user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        if role == "student":
            conn.execute(
                """
                INSERT INTO student_profiles (
                  user_id, program, batch, semester, section, academic_year, cgpa, total_credits,
                  earned_credits, attendance_threshold, advisor_name, hostel_name, scholarship_status,
                  rank_position, date_of_birth
                ) VALUES (?, ?, ?, ?, ?, ?, 0, 180, 0, 75, ?, ?, ?, 0, ?)
                """,
                (user_id, payload.get("program", "B.Tech Computer Science and Engineering (AI/ML)"), payload.get("batch", "2022-2026"), int(payload.get("semester", 6)), payload.get("section", "A"), payload.get("academicYear", "2025-2026"), payload.get("advisorName", "Dr. Ritu Mehta"), payload.get("hostelName", ""), payload.get("scholarshipStatus", "pending"), payload.get("dateOfBirth", "2005-01-01")),
            )
        elif role == "teacher":
            conn.execute(
                "INSERT INTO teacher_profiles (user_id, designation, specialization, qualification, experience_years, office_room) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, payload.get("designation", "Assistant Professor"), payload.get("specialization", "Academic Operations"), payload.get("qualification", "Masters"), int(payload.get("experienceYears", 2)), payload.get("officeRoom", "TBD")),
            )
        else:
            conn.execute("INSERT INTO admin_profiles (user_id, title, super_admin) VALUES (?, ?, 0)", (user_id, payload.get("title", "Administrator")))
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Created user", "user", user_id, payload["email"].strip().lower())
    return {"message": "user created", "userId": user_id}


def update_user_status(admin_id, target_user_id, status, db_path):
    if status not in {"active", "suspended", "archived"}:
        raise ValueError("invalid status")
    with connect(db_path) as conn:
        conn.execute("UPDATE users SET status = ?, updated_at = ? WHERE id = ?", (status, utc_now(), target_user_id))
        add_notification(conn, [target_user_id], "Account Status Updated", f"Your account status is now {status}.", "system", "#profile")
        actor = get_user_by_id(admin_id, db_path)
        target = get_user_by_id(target_user_id, db_path)
        log_action(conn, admin_id, actor["name"], f"Updated user status to {status}", "user", target_user_id, target["email"] if target else None)
    return {"message": f"user {status}"}


def reset_user_password(admin_id, target_user_id, new_password, db_path):
    with connect(db_path) as conn:
        conn.execute("UPDATE users SET password = ?, password_reset_required = 1, updated_at = ? WHERE id = ?", (new_password, utc_now(), target_user_id))
        add_notification(conn, [target_user_id], "Password Reset", "An administrator reset your password. Please change it after login.", "security", "#profile")
        actor = get_user_by_id(admin_id, db_path)
        target = get_user_by_id(target_user_id, db_path)
        log_action(conn, admin_id, actor["name"], "Reset user password", "user", target_user_id, target["email"] if target else None)
    return {"message": "password reset"}


def update_course(admin_id, course_id, payload, db_path):
    with connect(db_path) as conn:
        if payload.get("teacherId"):
            conn.execute("UPDATE courses SET teacher_id = ? WHERE id = ?", (int(payload["teacherId"]), course_id))
            add_notification(conn, [int(payload["teacherId"])], "Course Assignment Updated", "You have been assigned a course by the admin team.", "course", "#courses")
        if payload.get("status"):
            conn.execute("UPDATE courses SET status = ? WHERE id = ?", (payload["status"], course_id))
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Updated course", "course", course_id, payload.get("note"))
    return {"message": "course updated"}


def create_or_update_timetable(admin_id, payload, db_path, slot_id=None):
    with connect(db_path) as conn:
        if slot_id:
            conn.execute(
                """
                UPDATE timetable_slots
                SET room = ?, status = ?, note = ?, updated_at = ?, updated_by = ?
                WHERE id = ?
                """,
                (payload["room"], payload["status"], payload.get("note"), utc_now(), admin_id, slot_id),
            )
            affected_slot_id = slot_id
        else:
            conn.execute(
                """
                INSERT INTO timetable_slots (
                  course_id, day_of_week, start_time, end_time, room, slot_type, status, note, updated_at, updated_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (int(payload["courseId"]), payload["dayOfWeek"], payload["startTime"], payload["endTime"], payload["room"], payload["slotType"], payload["status"], payload.get("note"), utc_now(), admin_id),
            )
            affected_slot_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        slot = conn.execute(
            """
            SELECT courses.name AS course_name, courses.id AS course_id
            FROM timetable_slots
            JOIN courses ON courses.id = timetable_slots.course_id
            WHERE timetable_slots.id = ?
            """,
            (affected_slot_id,),
        ).fetchone()
        student_ids = [row["student_id"] for row in conn.execute("SELECT student_id FROM course_enrollments WHERE course_id = ?", (slot["course_id"],)).fetchall()]
        add_notification(conn, student_ids, "Timetable Updated", f"{slot['course_name']} timetable was updated by admin.", "timetable", "#timetable")
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Updated timetable", "timetable_slot", affected_slot_id, payload.get("note"))
    return {"message": "timetable saved", "slotId": affected_slot_id}


def publish_notice(admin_id, payload, db_path):
    with connect(db_path) as conn:
        conn.execute(
            "INSERT INTO notices (title, message, audience, priority, published_by, created_at, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
            (payload["title"].strip(), payload["message"].strip(), payload.get("audience", "all"), payload.get("priority", "medium"), admin_id, utc_now()),
        )
        notice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        audience = payload.get("audience", "all")
        if audience == "student":
            target_ids = [row["id"] for row in conn.execute("SELECT id FROM users WHERE role = 'student' AND status = 'active'").fetchall()]
        elif audience == "teacher":
            target_ids = [row["id"] for row in conn.execute("SELECT id FROM users WHERE role = 'teacher' AND status = 'active'").fetchall()]
        else:
            target_ids = [row["id"] for row in conn.execute("SELECT id FROM users WHERE status = 'active'").fetchall()]
        add_notification(conn, target_ids, "New Notice", payload["title"].strip(), "notice", "#notices")
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Published notice", "notice", notice_id, payload["title"].strip())
    return {"message": "notice published", "noticeId": notice_id}


def unpublish_notice(admin_id, notice_id, db_path):
    with connect(db_path) as conn:
        conn.execute("UPDATE notices SET active = 0 WHERE id = ?", (notice_id,))
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Unpublished notice", "notice", notice_id, None)
    return {"message": "notice unpublished"}


def resolve_grievance(admin_id, grievance_id, resolution_note, db_path):
    with connect(db_path) as conn:
        grievance = conn.execute("SELECT submitted_by FROM grievances WHERE id = ?", (grievance_id,)).fetchone()
        if not grievance:
            raise ValueError("grievance not found")
        conn.execute(
            """
            UPDATE grievances
            SET status = 'resolved', resolution_note = ?, updated_at = ?, assigned_to = ?
            WHERE id = ?
            """,
            (resolution_note.strip(), utc_now(), admin_id, grievance_id),
        )
        add_notification(conn, [grievance["submitted_by"]], "Grievance Resolved", resolution_note.strip(), "grievance", "#grievance")
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Resolved grievance", "grievance", grievance_id, resolution_note.strip())
    return {"message": "grievance resolved"}


def update_settings(admin_id, payload, db_path):
    allowed = {"site_name", "current_session", "attendance_threshold", "maintenance_mode", "student_portal_enabled", "teacher_portal_enabled", "grievance_module_active"}
    with connect(db_path) as conn:
        for key, value in payload.items():
            if key not in allowed:
                continue
            existing = conn.execute("SELECT key FROM system_settings WHERE key = ?", (key,)).fetchone()
            if existing:
                conn.execute("UPDATE system_settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = ?", (str(value), utc_now(), admin_id, key))
            else:
                conn.execute("INSERT INTO system_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)", (key, str(value), utc_now(), admin_id))
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Updated settings", "system_setting", None, ", ".join(sorted(payload.keys())))
    return get_settings(db_path)
