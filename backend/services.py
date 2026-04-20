import sqlite3
from collections import defaultdict
from contextlib import contextmanager
from datetime import UTC, datetime
import os


def utc_now():
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")


def date_today():
    return datetime.now(UTC).strftime("%Y-%m-%d")


@contextmanager
def connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    _ensure_optional_columns(conn)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def row_to_dict(row):
    return dict(row) if row is not None else None


def rows_to_dicts(rows):
    return [dict(row) for row in rows]


DAY_SEQUENCE = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
STANDARD_EXAM_TYPES = ("Internal Exam 1", "Internal Exam 2", "Mid-Term", "Lab 1", "Lab 2", "Final Exam")


def _sql_day_order(column_name="day_of_week"):
    cases = " ".join(f"WHEN '{day}' THEN {idx}" for idx, day in enumerate(DAY_SEQUENCE, start=1))
    return f"CASE {column_name} {cases} ELSE 99 END"


def _apply_attendance_date_filters(clauses, params, month=None, date_filter=None, date_from=None, date_to=None):
    if month:
        clauses.append("substr(attendance_sessions.session_date, 1, 7) = ?")
        params.append(month)
    if date_filter:
        clauses.append("attendance_sessions.session_date = ?")
        params.append(date_filter)
    if date_from:
        clauses.append("date(attendance_sessions.session_date) >= date(?)")
        params.append(date_from)
    if date_to:
        clauses.append("date(attendance_sessions.session_date) <= date(?)")
        params.append(date_to)


def _default_max_score(exam_type):
    defaults = {
        "Internal Exam 1": 30,
        "Internal Exam 2": 30,
        "Mid-Term": 40,
        "Lab 1": 20,
        "Lab 2": 20,
        "Final Exam": 100,
    }
    return defaults.get(exam_type, 50)


def _attendance_report_rows(conn, from_date=None, to_date=None):
    clauses = ["1 = 1"]
    params = []
    if from_date:
        clauses.append("date(attendance_sessions.session_date) >= date(?)")
        params.append(from_date)
    if to_date:
        clauses.append("date(attendance_sessions.session_date) <= date(?)")
        params.append(to_date)
    return rows_to_dicts(
        conn.execute(
            f"""
            SELECT
              attendance_sessions.session_date,
              courses.code AS course_code,
              courses.name AS course_name,
              courses.section,
              departments.code AS department_code,
              users.name AS teacher_name,
              COUNT(attendance_records.id) AS total_records,
              SUM(CASE WHEN attendance_records.status = 'present' THEN 1 ELSE 0 END) AS present_count,
              SUM(CASE WHEN attendance_records.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
              SUM(CASE WHEN attendance_records.status = 'late' THEN 1 ELSE 0 END) AS late_count,
              SUM(CASE WHEN attendance_records.status = 'medical_leave' THEN 1 ELSE 0 END) AS medical_leave_count
            FROM attendance_sessions
            JOIN courses ON courses.id = attendance_sessions.course_id
            JOIN departments ON departments.id = courses.department_id
            JOIN users ON users.id = courses.teacher_id
            LEFT JOIN attendance_records ON attendance_records.session_id = attendance_sessions.id
            WHERE {' AND '.join(clauses)}
            GROUP BY attendance_sessions.id
            ORDER BY date(attendance_sessions.session_date) DESC, courses.code
            """,
            params,
        ).fetchall()
    )


def _marks_report_rows(conn):
    return rows_to_dicts(
        conn.execute(
            """
            SELECT
              courses.code AS course_code,
              courses.name AS course_name,
              courses.section,
              departments.code AS department_code,
              users.name AS teacher_name,
              assessments.exam_type,
              assessments.max_score,
              COUNT(marks.id) AS records_count,
              ROUND(AVG(marks.score), 2) AS average_score,
              ROUND(MAX(marks.score), 2) AS highest_score,
              ROUND(MIN(marks.score), 2) AS lowest_score,
              assessments.published_on
            FROM assessments
            JOIN courses ON courses.id = assessments.course_id
            JOIN departments ON departments.id = courses.department_id
            JOIN users ON users.id = courses.teacher_id
            LEFT JOIN marks ON marks.assessment_id = assessments.id
            GROUP BY assessments.id
            ORDER BY date(assessments.published_on) DESC, courses.code, assessments.exam_type
            """
        ).fetchall()
    )


def _column_exists(conn, table_name, column_name):
    columns = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(row["name"] == column_name for row in columns)


def _ensure_optional_columns(conn):
    additions = {
        "users": [
            ("profile_image_data", "TEXT"),
            ("profile_image_mime", "TEXT"),
        ],
        "fee_items": [
            ("created_by", "INTEGER"),
            ("created_at", "TEXT"),
            ("note", "TEXT"),
        ],
    }
    for table_name, columns in additions.items():
        for column_name, column_type in columns:
            if not _column_exists(conn, table_name, column_name):
                conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")


def _assignment_submission_name_column(conn):
    if _column_exists(conn, "assignment_submissions", "file_name"):
        return "file_name"
    if _column_exists(conn, "assignment_submissions", "attachment_name"):
        return "attachment_name"
    return None


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
        f"""
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
            "profileImageData": user.get("profile_image_data") if isinstance(user, dict) else user["profile_image_data"],
            "profileImageMime": user.get("profile_image_mime") if isinstance(user, dict) else user["profile_image_mime"],
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
    if "profileImageData" in payload:
        updates.append("profile_image_data = ?")
        values.append((payload.get("profileImageData") or "").strip() or None)
    if "profileImageMime" in payload:
        updates.append("profile_image_mime = ?")
        values.append((payload.get("profileImageMime") or "").strip() or None)
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
                f"""
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


def _attendance_summary(conn, student_id, semester=None, subject=None, month=None, date_filter=None, date_from=None, date_to=None):
    params = [student_id]
    where = ["course_enrollments.student_id = ?"]
    if semester:
        where.append("courses.semester = ?")
        params.append(int(semester))
    if subject:
        where.append("courses.name = ?")
        params.append(subject)
    _apply_attendance_date_filters(where, params, month=month, date_filter=date_filter, date_from=date_from, date_to=date_to)
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
        return {"date": date_today(), "items": [], "weekly": {}}
    date_value = date_value or date_today()
    day_name = datetime.strptime(date_value, "%Y-%m-%d").strftime("%A")
    # Filter timetable by the courses the student is actually enrolled in
    # This prevents MBA students from seeing CSE timetables etc.
    rows = conn.execute(
        f"""
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
        WHERE courses.id IN (
          SELECT course_id FROM course_enrollments WHERE student_id = ?
        )
        ORDER BY {_sql_day_order("timetable_slots.day_of_week")}, timetable_slots.start_time
        """,
        (student_id,),
    ).fetchall()
    # Build day items (for requested date) and full weekly map
    day_items = []
    weekly = {}
    for row in rows:
        slot = {
            "id": row["id"],
            "day": row["day_of_week"],
            "date": date_value,
            "time": f"{row['start_time']} - {row['end_time']}",
            "start_time": row["start_time"],
            "end_time": row["end_time"],
            "course_name": row["course_name"],
            "subject": row["course_name"],
            "course_code": row["course_code"],
            "code": row["course_code"],
            "teacher": row["teacher_name"],
            "room": row["room"],
            "slot_type": row["slot_type"],
            "type": row["slot_type"],
            "status": row["status"],
            "note": row["note"],
        }
        if row["day_of_week"] == day_name:
            day_items.append(slot)
        # Build weekly mapping day -> list of slots
        d = row["day_of_week"]
        if d not in weekly:
            weekly[d] = []
        weekly[d].append(slot)
    return {"date": date_value, "view": view, "items": day_items, "weekly": weekly}


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
    computed_sgpa = round(total_credit_points / total_credits, 2) if total_credits else 0

    # Pull per-semester performance row (SGPA, CGPA, rank, credits) for selected semester
    sem_perf = None
    for row in summary_rows:
        if row["semester"] == int(semester):
            sem_perf = row
            break

    assessment_rows = rows_to_dicts(
        conn.execute(
            """
            SELECT
              assessments.course_id,
              assessments.exam_type,
              assessments.max_score,
              marks.score,
              marks.remark
            FROM assessments
            JOIN marks ON marks.assessment_id = assessments.id
            WHERE marks.student_id = ? AND assessments.semester = ?
            ORDER BY assessments.course_id, assessments.exam_type
            """,
            (student_id, int(semester)),
        ).fetchall()
    )
    assessment_map = defaultdict(list)
    for row in assessment_rows:
        assessment_map[row["course_id"]].append(
            {
                "examType": row["exam_type"],
                "score": row["score"],
                "maxScore": row["max_score"],
                "remark": row["remark"],
            }
        )
    for item in result_rows:
        item["assessments"] = assessment_map.get(item["course_id"], [])
        remarks = [x["remark"] for x in item["assessments"] if x.get("remark")]
        item["teacher_remark"] = remarks[-1] if remarks else None

    return {
        "semester": int(semester),
        "summary": summary_rows,
        "items": result_rows,
        "sgpa": sem_perf["sgpa"] if sem_perf else computed_sgpa,
        "cgpa": sem_perf["cgpa"] if sem_perf else 0,
        "credits_earned": sem_perf["credits_earned"] if sem_perf else total_credits,
        "credits_registered": sem_perf["credits_registered"] if sem_perf else total_credits,
        "rank_position": sem_perf["rank_position"] if sem_perf else None,
        "academic_year": sem_perf["academic_year"] if sem_perf else None,
    }


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
              assignments.attachment_name,
              assignments.attachment_path,
              courses.name AS subject,
              assignment_submissions.status AS submission_status,
              assignment_submissions.score,
              assignment_submissions.submission_text,
              assignment_submissions.attachment_name AS submission_attachment_name,
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


def _student_study_materials(conn, student_id):
    """Return study materials for courses the student is enrolled in."""
    return rows_to_dicts(
        conn.execute(
            """
            SELECT
              study_materials.id,
              study_materials.title,
              study_materials.material_type,
              study_materials.attachment_name,
              study_materials.attachment_path,
              study_materials.external_url,
              study_materials.created_at,
              courses.name AS course_name,
              courses.code AS course_code,
              users.name AS teacher_name
            FROM study_materials
            JOIN courses ON courses.id = study_materials.course_id
            JOIN users ON users.id = study_materials.uploaded_by
            WHERE study_materials.course_id IN (
              SELECT course_id FROM course_enrollments WHERE student_id = ?
            )
            ORDER BY datetime(study_materials.created_at) DESC
            """,
            (student_id,),
        ).fetchall()
    )


def _student_exam_schedule(conn, student_id):
    """Return upcoming and recent exam schedule for courses the student is enrolled in."""
    return rows_to_dicts(
        conn.execute(
            """
            SELECT
              exam_schedule.id,
              exam_schedule.exam_type,
              exam_schedule.exam_date,
              exam_schedule.start_time,
              exam_schedule.venue,
              exam_schedule.duration_minutes,
              assessments.max_score AS max_marks,
              exam_schedule.created_at,
              courses.name AS course_name,
              courses.code AS course_code,
              users.name AS published_by
            FROM exam_schedule
            JOIN courses ON courses.id = exam_schedule.course_id
            JOIN users ON users.id = exam_schedule.published_by
            LEFT JOIN assessments
              ON assessments.course_id = exam_schedule.course_id
             AND assessments.exam_type = exam_schedule.exam_type
             AND assessments.semester = courses.semester
            WHERE exam_schedule.course_id IN (
              SELECT course_id FROM course_enrollments WHERE student_id = ?
            )
            ORDER BY date(exam_schedule.exam_date), exam_schedule.start_time
            """,
            (student_id,),
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
              placement_applications.note,
              placement_applications.resume_link,
              placement_applications.cover_letter,
              placement_applications.applied_at
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
    return rows_to_dicts(
        conn.execute(
            """
            SELECT id, request_type, from_date, to_date, reason, attachment_name, status,
                   reviewed_at, review_note, created_at
            FROM workflow_requests
            WHERE student_id = ?
            ORDER BY datetime(created_at) DESC
            """,
            (student_id,),
        ).fetchall()
    )


def get_student_dashboard(
    user_id,
    db_path,
    attendance_semester=6,
    results_semester=6,
    attendance_subject=None,
    attendance_view="overall",
    timetable_view="day",
    timetable_date=None,
    attendance_month=None,
    attendance_date=None,
    attendance_from_date=None,
    attendance_to_date=None,
):
    with connect(db_path) as conn:
        profile = get_profile(user_id, db_path)
        student_semester = (profile.get("details") or {}).get("semester", 6)
        if attendance_semester is None:
            attendance_semester = student_semester
        if results_semester is None:
            results_semester = student_semester
        attendance = _attendance_summary(
            conn,
            user_id,
            semester=attendance_semester,
            subject=attendance_subject,
            month=attendance_month,
            date_filter=attendance_date,
            date_from=attendance_from_date,
            date_to=attendance_to_date,
        )
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
            "studyMaterials": _student_study_materials(conn, user_id),
            "examSchedule": _student_exam_schedule(conn, user_id),
            "notifications": get_notifications(user_id, db_path),
        }


def get_student_attendance(user_id, db_path, semester=6, subject=None, month=None, date_filter=None, date_from=None, date_to=None):
    with connect(db_path) as conn:
        if semester is None:
            sem_row = conn.execute("SELECT semester FROM student_profiles WHERE user_id = ?", (user_id,)).fetchone()
            semester = sem_row["semester"] if sem_row else 6
        params = [user_id, int(semester), subject, subject]
        clauses = [
            "attendance_records.student_id = ?",
            "courses.semester = ?",
            "(? IS NULL OR courses.name = ?)",
        ]
        _apply_attendance_date_filters(clauses, params, month=month, date_filter=date_filter, date_from=date_from, date_to=date_to)
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
        matrix_dates = []
        matrix_lookup = {}
        for session in reversed(sessions):
            session_date = session["session_date"]
            if session_date not in matrix_dates:
                matrix_dates.append(session_date)
            cell_key = f"{session['subject']}__{session_date}"
            cell = matrix_lookup.setdefault(
                cell_key,
                {
                    "subject": session["subject"],
                    "code": session["code"],
                    "date": session_date,
                    "presentCount": 0,
                    "absentCount": 0,
                    "lateCount": 0,
                    "medicalLeaveCount": 0,
                    "sessionCount": 0,
                },
            )
            cell["sessionCount"] += 1
            if session["status"] == "present":
                cell["presentCount"] += 1
            elif session["status"] == "absent":
                cell["absentCount"] += 1
            elif session["status"] == "late":
                cell["lateCount"] += 1
            elif session["status"] == "medical_leave":
                cell["medicalLeaveCount"] += 1
        matrix_rows = []
        for item in _attendance_summary(
            conn,
            user_id,
            semester=semester,
            subject=subject,
            month=month,
            date_filter=date_filter,
            date_from=date_from,
            date_to=date_to,
        )["items"]:
            row = {"subject": item["subject"], "code": item["code"], "cells": [], "total": item["attended"], "delivered": item["delivered"]}
            for session_date in matrix_dates:
                cell = matrix_lookup.get(f"{item['subject']}__{session_date}")
                row["cells"].append(cell or {"subject": item["subject"], "code": item["code"], "date": session_date, "sessionCount": 0, "presentCount": 0, "absentCount": 0, "lateCount": 0, "medicalLeaveCount": 0})
            matrix_rows.append(row)
        return {
            "summary": _attendance_summary(conn, user_id, semester=semester, subject=subject, month=month, date_filter=date_filter, date_from=date_from, date_to=date_to),
            "sessions": sessions,
            "daywise": daywise,
            "matrix": {"dates": matrix_dates, "rows": matrix_rows},
            "filters": {
                "semester": int(semester),
                "subject": subject or "",
                "month": month or "",
                "date": date_filter or "",
                "fromDate": date_from or "",
                "toDate": date_to or "",
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
    if get_setting(db_path, "grievance_module_active", "1") == "0":
        raise ValueError("grievance module is currently disabled")
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


def submit_assignment(user_id, assignment_id, payload, db_path):
    note = (payload.get("submissionText") or payload.get("note") or "").strip()
    attachment_name = (payload.get("attachmentName") or payload.get("attachment") or "").strip() or None
    with connect(db_path) as conn:
        submission = conn.execute(
            """
            SELECT assignment_submissions.id, assignment_submissions.status, assignments.title, assignments.due_date
            FROM assignment_submissions
            JOIN assignments ON assignments.id = assignment_submissions.assignment_id
            WHERE assignment_submissions.assignment_id = ? AND assignment_submissions.student_id = ?
            """,
            (assignment_id, user_id),
        ).fetchone()
        if not submission:
            raise ValueError("assignment not found")
        if submission["status"] == "graded":
            raise ValueError("graded submissions cannot be edited")
        if submission["due_date"] and submission["due_date"] < date_today():
            raise ValueError("assignment deadline has passed")
        attachment_col = _assignment_submission_name_column(conn)
        if attachment_col:
            conn.execute(
                f"""
                UPDATE assignment_submissions
                SET status = 'submitted', feedback = ?, {attachment_col} = ?, submitted_at = ?
                WHERE assignment_id = ? AND student_id = ?
                """,
                (note, attachment_name, utc_now(), assignment_id, user_id),
            )
        else:
            conn.execute(
                f"""
                UPDATE assignment_submissions
                SET status = 'submitted', feedback = ?, submitted_at = ?
                WHERE assignment_id = ? AND student_id = ?
                """,
                (note, utc_now(), assignment_id, user_id),
            )
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Submitted assignment", "assignment_submission", submission["id"], submission["title"])
    return {"message": "assignment submitted"}


def update_assignment_submission(user_id, assignment_id, payload, db_path):
    note = (payload.get("submissionText") or payload.get("note") or "").strip()
    attachment_name = (payload.get("attachmentName") or payload.get("attachment") or "").strip() or None
    with connect(db_path) as conn:
        submission = conn.execute(
            """
            SELECT assignment_submissions.id, assignment_submissions.status, assignments.due_date
            FROM assignment_submissions
            JOIN assignments ON assignments.id = assignment_submissions.assignment_id
            WHERE assignment_submissions.assignment_id = ? AND assignment_submissions.student_id = ?
            """,
            (assignment_id, user_id),
        ).fetchone()
        if not submission:
            raise ValueError("submission not found")
        if submission["status"] == "graded":
            raise ValueError("graded submissions cannot be edited")
        if submission["due_date"] and submission["due_date"] < date_today():
            raise ValueError("assignment deadline has passed")
        attachment_col = _assignment_submission_name_column(conn)
        if attachment_col:
            conn.execute(
                f"""
                UPDATE assignment_submissions
                SET status = 'submitted', feedback = ?, {attachment_col} = COALESCE(?, {attachment_col}), submitted_at = ?
                WHERE assignment_id = ? AND student_id = ?
                """,
                (note, attachment_name, utc_now(), assignment_id, user_id),
            )
        else:
            conn.execute(
                f"""
                UPDATE assignment_submissions
                SET status = 'submitted', feedback = ?, submitted_at = ?
                WHERE assignment_id = ? AND student_id = ?
                """,
                (note, utc_now(), assignment_id, user_id),
            )
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Updated assignment submission", "assignment_submission", submission["id"], None)
    return {"message": "submission updated"}


def delete_assignment_submission(user_id, assignment_id, db_path):
    with connect(db_path) as conn:
        submission = conn.execute(
            """
            SELECT assignment_submissions.id, assignment_submissions.status, assignments.due_date
            FROM assignment_submissions
            JOIN assignments ON assignments.id = assignment_submissions.assignment_id
            WHERE assignment_submissions.assignment_id = ? AND assignment_submissions.student_id = ?
            """,
            (assignment_id, user_id),
        ).fetchone()
        if not submission:
            raise ValueError("submission not found")
        if submission["status"] == "graded":
            raise ValueError("graded submissions cannot be deleted")
        if submission["due_date"] and submission["due_date"] < date_today():
            raise ValueError("assignment deadline has passed")
        attachment_col = _assignment_submission_name_column(conn)
        if attachment_col:
            conn.execute(
                f"""
                UPDATE assignment_submissions
                SET status = 'pending', feedback = NULL, {attachment_col} = NULL, submitted_at = NULL
                WHERE assignment_id = ? AND student_id = ?
                """,
                (assignment_id, user_id),
            )
        else:
            conn.execute(
                f"""
                UPDATE assignment_submissions
                SET status = 'pending', feedback = NULL, submitted_at = NULL
                WHERE assignment_id = ? AND student_id = ?
                """,
                (assignment_id, user_id),
            )
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Deleted assignment submission", "assignment_submission", submission["id"], None)
    return {"message": "submission reset"}


def apply_for_placement(user_id, placement_id, db_path, resume_link=None, cover_letter=None):
    with connect(db_path) as conn:
        placement = conn.execute("SELECT * FROM placements WHERE id = ?", (placement_id,)).fetchone()
        if not placement:
            raise ValueError("placement not found")
        if conn.execute("SELECT id FROM placement_applications WHERE placement_id = ? AND student_id = ?", (placement_id, user_id)).fetchone():
            raise ValueError("already applied")
        conn.execute(
            """INSERT INTO placement_applications
               (placement_id, student_id, status, applied_at, note, resume_link, cover_letter)
               VALUES (?, ?, 'applied', ?, ?, ?, ?)""",
            (
                placement_id,
                user_id,
                utc_now(),
                "Submitted via student portal",
                (resume_link or "").strip() or None,
                (cover_letter or "").strip() or None,
            ),
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
                f"""
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
                f"""
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
                "todayClasses": len([slot for slot in timetable if slot["day_of_week"] == datetime.now().strftime("%A")]),
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


def get_attendance_session(user_id, course_id, date_val, db_path):
    """Return per-student attendance status for a specific course+date (for preloading the form)."""
    with connect(db_path) as conn:
        course = conn.execute("SELECT id FROM courses WHERE id = ? AND teacher_id = ?", (course_id, user_id)).fetchone()
        if not course:
            return {"records": [], "exists": False}
        session_row = conn.execute(
            "SELECT id FROM attendance_sessions WHERE course_id = ? AND session_date = ?",
            (course_id, date_val),
        ).fetchone()
        if not session_row:
            return {"records": [], "exists": False}
        records = rows_to_dicts(conn.execute(
            """
            SELECT attendance_records.student_id, attendance_records.status, attendance_records.remark
            FROM attendance_records
            WHERE attendance_records.session_id = ?
            """,
            (session_row["id"],),
        ).fetchall())
        return {"records": records, "exists": True, "sessionId": session_row["id"]}


def get_marks_session(user_id, course_id, exam_type, db_path):
    """Return per-student scores for a specific course+exam_type (for preloading the marks form)."""
    with connect(db_path) as conn:
        course = conn.execute("SELECT id FROM courses WHERE id = ? AND teacher_id = ?", (course_id, user_id)).fetchone()
        if not course:
            return {"records": [], "exists": False, "maxScore": _default_max_score(exam_type)}
        assessment = conn.execute(
            "SELECT id, max_score FROM assessments WHERE course_id = ? AND exam_type = ? AND semester = 6",
            (course_id, exam_type),
        ).fetchone()
        if not assessment:
            return {"records": [], "exists": False, "maxScore": _default_max_score(exam_type)}
        records = rows_to_dicts(conn.execute(
            "SELECT student_id, score, remark FROM marks WHERE assessment_id = ?",
            (assessment["id"],),
        ).fetchall())
        return {"records": records, "exists": True, "maxScore": assessment["max_score"], "assessmentId": assessment["id"]}


def get_assignment_submissions(user_id, assignment_id, db_path):
    """Return all student submissions for an assignment (for teacher review)."""
    with connect(db_path) as conn:
        assignment = conn.execute(
            "SELECT id, title, max_score FROM assignments WHERE id = ? AND teacher_id = ?",
            (assignment_id, user_id),
        ).fetchone()
        if not assignment:
            return {"submissions": [], "assignment": None}
        attachment_col = _assignment_submission_name_column(conn)
        select_attachment = f", assignment_submissions.{attachment_col} AS file_name" if attachment_col else ""
        submissions = rows_to_dicts(conn.execute(
            f"""
            SELECT
              assignment_submissions.id AS submission_id,
              users.id AS student_id,
              users.name AS student_name,
              users.roll_no,
              assignment_submissions.status,
              assignment_submissions.score,
              assignment_submissions.feedback,
              assignment_submissions.submitted_at,
              assignment_submissions.submission_text
              {select_attachment}
            FROM assignment_submissions
            JOIN users ON users.id = assignment_submissions.student_id
            WHERE assignment_submissions.assignment_id = ?
            ORDER BY assignment_submissions.status, users.name
            """,
            (assignment_id,),
        ).fetchall())
        return {
            "submissions": submissions,
            "assignment": dict(assignment),
            "stats": {
                "total": len(submissions),
                "submitted": len([s for s in submissions if s["status"] in {"submitted", "graded"}]),
                "pending": len([s for s in submissions if s["status"] == "pending"]),
                "graded": len([s for s in submissions if s["status"] == "graded"]),
            },
        }


def get_teacher_attendance(user_id, db_path, course_id=None, date_filter=None, from_date=None, to_date=None):
    with connect(db_path) as conn:
        params = [user_id]
        clauses = ["courses.teacher_id = ?"]
        if course_id:
            clauses.append("courses.id = ?")
            params.append(int(course_id))
        _apply_attendance_date_filters(clauses, params, date_filter=date_filter, date_from=from_date, date_to=to_date)
        rows = conn.execute(
            f"""
            SELECT
              attendance_sessions.id,
              attendance_sessions.session_date,
              courses.id AS course_id,
              courses.code AS course_code,
              courses.name AS course_name,
              courses.section,
              COUNT(attendance_records.id) AS total_records,
              SUM(CASE WHEN attendance_records.status = 'present' THEN 1 ELSE 0 END) AS present_count,
              SUM(CASE WHEN attendance_records.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
              SUM(CASE WHEN attendance_records.status = 'late' THEN 1 ELSE 0 END) AS late_count,
              SUM(CASE WHEN attendance_records.status = 'medical_leave' THEN 1 ELSE 0 END) AS medical_leave_count
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
    requested_max_score = int(payload["maxScore"])
    with connect(db_path) as conn:
        course = conn.execute("SELECT id, name FROM courses WHERE id = ? AND teacher_id = ?", (course_id, user_id)).fetchone()
        if not course:
            raise ValueError("course not found")
        assessment = conn.execute("SELECT id, max_score FROM assessments WHERE course_id = ? AND exam_type = ? AND semester = 6", (course_id, exam_type)).fetchone()
        if assessment:
            assessment_id = assessment["id"]
            max_score = int(assessment["max_score"])
            conn.execute("UPDATE assessments SET published_on = ? WHERE id = ?", (date_today(), assessment_id))
        else:
            max_score = requested_max_score
            if max_score <= 0:
                raise ValueError("max score must be greater than zero")
            conn.execute("INSERT INTO assessments (course_id, teacher_id, exam_type, max_score, semester, published_on) VALUES (?, ?, ?, ?, 6, ?)", (course_id, user_id, exam_type, max_score, date_today()))
            assessment_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        for record in payload["records"]:
            score = float(record["score"])
            if score < 0 or score > max_score:
                raise ValueError(f"score must be between 0 and {max_score}")
            existing = conn.execute("SELECT id FROM marks WHERE assessment_id = ? AND student_id = ?", (assessment_id, int(record["studentId"]))).fetchone()
            if existing:
                conn.execute("UPDATE marks SET score = ?, remark = ?, updated_at = ? WHERE id = ?", (score, record.get("remark", ""), utc_now(), existing["id"]))
            else:
                conn.execute("INSERT INTO marks (assessment_id, student_id, score, remark, updated_at) VALUES (?, ?, ?, ?, ?)", (assessment_id, int(record["studentId"]), score, record.get("remark", ""), utc_now()))
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
        attachment_name = (payload.get("attachmentName") or "").strip()
        attachment_path = (payload.get("attachmentPath") or "").strip()
        description = payload["description"].strip()
        if attachment_name and not _column_exists(conn, "assignments", "attachment_name"):
            description = f"{description}\n\nAttachment: {attachment_name}{f' ({attachment_path})' if attachment_path else ''}"
        has_attachment_columns = _column_exists(conn, "assignments", "attachment_name") and _column_exists(conn, "assignments", "attachment_path")
        if has_attachment_columns:
            conn.execute(
                """
                INSERT INTO assignments (
                  course_id, teacher_id, title, description, due_date, max_score, attachment_name, attachment_path, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
                """,
                (
                    course["id"],
                    user_id,
                    payload["title"].strip(),
                    description,
                    payload["dueDate"],
                    int(payload["maxScore"]),
                    attachment_name or None,
                    attachment_path or None,
                    utc_now(),
                    utc_now(),
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO assignments (
                  course_id, teacher_id, title, description, due_date, max_score, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
                """,
                (course["id"], user_id, payload["title"].strip(), description, payload["dueDate"], int(payload["maxScore"]), utc_now(), utc_now()),
            )
        assignment_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        student_ids = [row["student_id"] for row in conn.execute("SELECT student_id FROM course_enrollments WHERE course_id = ?", (course["id"],)).fetchall()]
        attachment_col = _assignment_submission_name_column(conn)
        if attachment_col:
            conn.executemany(
                f"INSERT INTO assignment_submissions (assignment_id, student_id, status, score, {attachment_col}, submitted_at, feedback) VALUES (?, ?, 'pending', NULL, NULL, NULL, NULL)",
                [(assignment_id, student_id) for student_id in student_ids],
            )
        else:
            conn.executemany(
                "INSERT INTO assignment_submissions (assignment_id, student_id, status, score, submitted_at, feedback) VALUES (?, ?, 'pending', NULL, NULL, NULL)",
                [(assignment_id, student_id) for student_id in student_ids],
            )
        add_notification(conn, student_ids, "New Assignment", f"{payload['title']} has been published for {course['name']}.", "assignment", "#assignments")
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Created assignment", "assignment", assignment_id, payload["title"].strip())
    return {"message": "assignment created", "assignmentId": assignment_id}


def update_teacher_assignment(user_id, assignment_id, payload, db_path):
    with connect(db_path) as conn:
        assignment = conn.execute(
            """
            SELECT assignments.id, assignments.course_id, assignments.title, assignments.description
            FROM assignments
            JOIN courses ON courses.id = assignments.course_id
            WHERE assignments.id = ? AND courses.teacher_id = ?
            """,
            (assignment_id, user_id),
        ).fetchone()
        if not assignment:
            raise ValueError("assignment not found")
        next_title = (payload.get("title") or assignment["title"]).strip()
        next_description = (payload.get("description") or assignment["description"] or "").strip()
        next_due_date = (payload.get("dueDate") or "").strip()
        next_status = (payload.get("status") or "open").strip().lower()
        if next_status not in {"open", "closed"}:
            raise ValueError("invalid assignment status")
        next_max_score = int(payload.get("maxScore", 0) or 0)
        if next_max_score <= 0:
            raise ValueError("max score must be greater than 0")
        attachment_name = (payload.get("attachmentName") or "").strip()
        attachment_path = (payload.get("attachmentPath") or "").strip()
        if attachment_name and not _column_exists(conn, "assignments", "attachment_name"):
            next_description = f"{next_description}\n\nAttachment: {attachment_name}{f' ({attachment_path})' if attachment_path else ''}"
        has_attachment_columns = _column_exists(conn, "assignments", "attachment_name") and _column_exists(conn, "assignments", "attachment_path")
        if has_attachment_columns:
            conn.execute(
                """
                UPDATE assignments
                SET title = ?, description = ?, due_date = ?, max_score = ?, attachment_name = ?, attachment_path = ?, status = ?
                WHERE id = ?
                """,
                (next_title, next_description, next_due_date, next_max_score, attachment_name or None, attachment_path or None, next_status, assignment_id),
            )
        else:
            conn.execute(
                """
                UPDATE assignments
                SET title = ?, description = ?, due_date = ?, max_score = ?, status = ?
                WHERE id = ?
                """,
                (next_title, next_description, next_due_date, next_max_score, next_status, assignment_id),
            )
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Updated assignment", "assignment", assignment_id, next_title)
    return {"message": "assignment updated", "assignmentId": assignment_id}


def delete_teacher_assignment(user_id, assignment_id, db_path):
    with connect(db_path) as conn:
        assignment = conn.execute("SELECT id, title FROM assignments WHERE id = ? AND teacher_id = ?", (assignment_id, user_id)).fetchone()
        if not assignment:
            raise ValueError("assignment not found")
        conn.execute("DELETE FROM assignments WHERE id = ?", (assignment_id,))
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Deleted assignment", "assignment", assignment_id, assignment["title"])
    return {"message": "assignment deleted"}


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
            "INSERT INTO notices (title, message, audience, priority, published_by, created_at, updated_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
            (payload["title"].strip(), payload["message"].strip(), payload.get("audience", "student"), payload.get("priority", "medium"), user_id, utc_now(), utc_now()),
        )
        notice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        if payload.get("audience", "student") in {"student", "all"}:
            student_ids = [row["id"] for row in conn.execute("SELECT id FROM users WHERE role = 'student'").fetchall()]
            add_notification(conn, student_ids, "New Notice", payload["title"].strip(), "notice", "#notices")
        actor = get_user_by_id(user_id, db_path)
        log_action(conn, user_id, actor["name"], "Published notice", "notice", notice_id, payload["title"].strip())
    return {"message": "notice published", "noticeId": notice_id}


def _admin_workflow_requests(conn):
    return rows_to_dicts(
        conn.execute(
            """
            SELECT
              workflow_requests.id,
              workflow_requests.student_id,
              users.name AS student_name,
              users.roll_no,
              workflow_requests.request_type,
              workflow_requests.from_date,
              workflow_requests.to_date,
              workflow_requests.reason,
              workflow_requests.attachment_name,
              workflow_requests.status,
              workflow_requests.reviewed_at,
              workflow_requests.review_note,
              workflow_requests.created_at
            FROM workflow_requests
            JOIN users ON users.id = workflow_requests.student_id
            ORDER BY CASE workflow_requests.status WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
                     datetime(workflow_requests.created_at) DESC
            """
        ).fetchall()
    )


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
                  departments.code AS department,
                  GROUP_CONCAT(course_enrollments.course_id) AS enrolled_course_ids
                FROM users
                LEFT JOIN departments ON departments.id = users.department_id
                LEFT JOIN course_enrollments ON course_enrollments.student_id = users.id
                GROUP BY users.id
                ORDER BY CASE users.role WHEN 'admin' THEN 1 WHEN 'teacher' THEN 2 ELSE 3 END, users.name
                """
            ).fetchall()
        )
        for user in users:
            ids = [int(x) for x in str(user.get("enrolled_course_ids") or "").split(",") if x]
            user["enrolledCourseIds"] = ids
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
                WHERE courses.section != 'ALL'
                ORDER BY courses.semester DESC, courses.code
                """
            ).fetchall()
        )
        timetable = rows_to_dicts(
            conn.execute(
                f"""
                SELECT
                  timetable_slots.id,
                  courses.code AS course_code,
                  courses.name AS course_name,
                  courses.section,
                  courses.id AS course_id,
                  departments.code AS department_code,
                  users.name AS teacher_name,
                  timetable_slots.day_of_week,
                  timetable_slots.start_time,
                  timetable_slots.end_time,
                  timetable_slots.room,
                  timetable_slots.slot_type,
                  timetable_slots.status,
                  timetable_slots.note
                FROM timetable_slots
                JOIN courses ON courses.id = timetable_slots.course_id
                JOIN departments ON departments.id = courses.department_id
                JOIN users ON users.id = courses.teacher_id
                WHERE courses.section != 'ALL'
                ORDER BY departments.code, courses.section, {_sql_day_order("timetable_slots.day_of_week")}, timetable_slots.start_time
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
                  grievances.message,
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
        workflow_requests = _admin_workflow_requests(conn)
        fee_summary = rows_to_dicts(
            conn.execute(
                """
                SELECT
                  users.id AS student_id,
                  users.name AS student_name,
                  users.roll_no,
                  COALESCE(SUM(CASE WHEN fee_items.status IN ('pending', 'overdue') THEN fee_items.amount ELSE 0 END), 0) AS due_amount,
                  COUNT(CASE WHEN fee_items.status IN ('pending', 'overdue') THEN 1 END) AS pending_items
                FROM users
                LEFT JOIN fee_items ON fee_items.student_id = users.id
                WHERE users.role = 'student' AND users.status = 'active'
                GROUP BY users.id
                ORDER BY due_amount DESC, users.name
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
            "attendanceAudit": _attendance_report_rows(conn),
            "marksAudit": _marks_report_rows(conn),
            "grievances": grievances,
            "workflowRequests": workflow_requests,
            "feeSummary": fee_summary,
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
        target = conn.execute("SELECT id, role, email FROM users WHERE id = ?", (target_user_id,)).fetchone()
        if not target:
            raise ValueError("user not found")
        if target["role"] == "admin" and status in {"suspended", "archived"}:
            raise ValueError("Administrator accounts cannot be suspended or archived")
        if target_user_id == admin_id and status in {"suspended", "archived"}:
            raise ValueError("You cannot suspend your own account")
        conn.execute("UPDATE users SET status = ?, updated_at = ? WHERE id = ?", (status, utc_now(), target_user_id))
        if status != "active":
            add_notification(conn, [target_user_id], "Account Status Updated", f"Your account status is now {status}.", "system", "#profile")
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], f"Updated user status to {status}", "user", target_user_id, target["email"] if target else None)
    return {"message": f"user {status}"}


def update_user(admin_id, target_user_id, payload, db_path):
    allowed_fields = {"name", "email", "phone", "department", "role"}
    clean = {key: value for key, value in payload.items() if key in allowed_fields and value is not None}
    if not clean:
        raise ValueError("no user updates provided")
    with connect(db_path) as conn:
        target = conn.execute("SELECT id, email, role FROM users WHERE id = ?", (target_user_id,)).fetchone()
        if not target:
            raise ValueError("user not found")
        updates = []
        values = []
        if clean.get("name"):
            updates.append("name = ?")
            values.append(clean["name"].strip())
        if clean.get("email"):
            updates.append("email = ?")
            values.append(clean["email"].strip().lower())
        if "phone" in clean:
            updates.append("phone = ?")
            values.append((clean.get("phone") or "").strip() or None)
        if clean.get("role") in {"student", "teacher", "admin"}:
            updates.append("role = ?")
            values.append(clean["role"])
        if clean.get("department"):
            dept = conn.execute("SELECT id FROM departments WHERE code = ?", (clean["department"],)).fetchone()
            updates.append("department_id = ?")
            values.append(dept["id"] if dept else None)
        updates.append("updated_at = ?")
        values.append(utc_now())
        values.append(target_user_id)
        conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", values)
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Updated user profile", "user", target_user_id, clean.get("email", target["email"]))
    return {"message": "user updated"}


def generate_student_document(user_id, doc_type, db_path):
    normalized = (doc_type or "").strip().lower()
    if normalized in {"id_card", "id"}:
        normalized = "id-card"
    if normalized in {"admit_card", "admit"}:
        normalized = "admit-card"
    if normalized not in {"id-card", "bonafide", "admit-card"}:
        raise ValueError("invalid document type")
    profile = get_profile(user_id, db_path)
    if not profile or profile.get("role") != "student":
        raise ValueError("student profile not found")
    details = profile.get("details") or {}
    has_photo = bool(profile.get("profileImageData"))
    if normalized == "id-card":
        filename = f"student-id-{user_id}.txt"
        lines = [
            "EduWorkflow Student Identity Card",
            f"Name: {profile.get('name', '-')}",
            f"Email: {profile.get('email', '-')}",
            f"Program: {details.get('program', '-')}",
            f"Batch: {details.get('batch', '-')}",
            f"Semester: {details.get('semester', '-')}",
            f"Section: {details.get('section', '-')}",
            f"Department: {(profile.get('department') or {}).get('name', '-')}",
            f"Photo Uploaded: {'Yes' if has_photo else 'No'}",
            f"Issued On: {date_today()}",
        ]
    elif normalized == "admit-card":
        with connect(db_path) as conn:
            exams = rows_to_dicts(
                conn.execute(
                    """
                    SELECT
                      exam_schedule.exam_type,
                      exam_schedule.exam_date,
                      exam_schedule.start_time,
                      exam_schedule.venue,
                      exam_schedule.duration_minutes,
                      courses.code AS course_code,
                      courses.name AS course_name,
                      users.name AS faculty_name
                    FROM exam_schedule
                    JOIN courses ON courses.id = exam_schedule.course_id
                    JOIN users ON users.id = courses.teacher_id
                    WHERE exam_schedule.course_id IN (
                      SELECT course_id FROM course_enrollments WHERE student_id = ?
                    )
                    ORDER BY date(exam_schedule.exam_date), exam_schedule.start_time
                    """,
                    (user_id,),
                ).fetchall()
            )
        filename = f"admit-card-{user_id}.txt"
        lines = [
            "EduWorkflow Admit Card",
            f"Name: {profile.get('name', '-')}",
            f"Roll No: {get_user_by_id(user_id, db_path).get('roll_no', '-')}",
            f"Program: {details.get('program', '-')}",
            f"Semester: {details.get('semester', '-')}",
            f"Department: {(profile.get('department') or {}).get('name', '-')}",
            f"Photo Uploaded: {'Yes' if has_photo else 'No'}",
            "",
            "Exam Schedule:",
        ]
        if exams:
            for idx, exam in enumerate(exams, start=1):
                lines.append(
                    f"{idx}. {exam['exam_type']} | {exam['course_code']} {exam['course_name']} | "
                    f"{exam['exam_date']} {exam['start_time']} | {exam['venue']} | {exam['duration_minutes']} mins | Faculty: {exam['faculty_name']}"
                )
        else:
            lines.append("No scheduled exams found.")
        lines.extend(["", f"Issued On: {date_today()}"])
    else:
        filename = f"bonafide-{user_id}.txt"
        lines = [
            "Bonafide Certificate",
            "This is to certify that the following student is currently enrolled:",
            f"Name: {profile.get('name', '-')}",
            f"Program: {details.get('program', '-')}",
            f"Batch: {details.get('batch', '-')}",
            f"Academic Year: {details.get('academic_year', '-')}",
            f"Semester: {details.get('semester', '-')}",
            f"Department: {(profile.get('department') or {}).get('name', '-')}",
            f"Issued Date: {date_today()}",
            "For institutional verification only.",
        ]
    return {"filename": filename, "mimeType": "text/plain", "content": "\n".join(lines)}


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
        course = conn.execute("SELECT id, teacher_id, name FROM courses WHERE id = ?", (course_id,)).fetchone()
        if not course:
            raise ValueError("course not found")
        teacher_id = course["teacher_id"]
        if payload.get("teacherId"):
            teacher_id = int(payload["teacherId"])
            conn.execute("UPDATE courses SET teacher_id = ? WHERE id = ?", (teacher_id, course_id))
            add_notification(conn, [teacher_id], "Course Assignment Updated", "You have been assigned a course by the admin team.", "course", "#courses")
        if payload.get("status"):
            conn.execute("UPDATE courses SET status = ? WHERE id = ?", (payload["status"], course_id))
        policies = payload.get("assessmentPolicies") or []
        for policy in policies:
            exam_type = (policy.get("examType") or "").strip()
            if exam_type not in STANDARD_EXAM_TYPES:
                continue
            try:
                max_score = int(policy.get("maxScore"))
            except (TypeError, ValueError):
                continue
            if max_score <= 0:
                continue
            existing = conn.execute(
                "SELECT id FROM assessments WHERE course_id = ? AND exam_type = ? AND semester = 6",
                (course_id, exam_type),
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE assessments SET max_score = ?, teacher_id = ?, published_on = ? WHERE id = ?",
                    (max_score, teacher_id, date_today(), existing["id"]),
                )
            else:
                conn.execute(
                    "INSERT INTO assessments (course_id, teacher_id, exam_type, max_score, semester, published_on) VALUES (?, ?, ?, ?, 6, ?)",
                    (course_id, teacher_id, exam_type, max_score, date_today()),
                )
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Updated course", "course", course_id, payload.get("note"))
    return {"message": "course updated"}


def create_course(admin_id, payload, db_path):
    required = ["code", "name", "department", "teacherId", "semester", "credits", "section"]
    missing = [field for field in required if payload.get(field) in (None, "")]
    if missing:
        raise ValueError(f"missing fields: {', '.join(missing)}")
    with connect(db_path) as conn:
        dept = conn.execute("SELECT id FROM departments WHERE code = ?", (payload["department"].strip().upper(),)).fetchone()
        if not dept:
            raise ValueError("department not found")
        teacher = conn.execute("SELECT id FROM users WHERE id = ? AND role = 'teacher'", (int(payload["teacherId"]),)).fetchone()
        if not teacher:
            raise ValueError("teacher not found")
        conn.execute(
            """
            INSERT INTO courses (code, name, department_id, teacher_id, semester, credits, section, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["code"].strip().upper(),
                payload["name"].strip(),
                dept["id"],
                int(payload["teacherId"]),
                int(payload["semester"]),
                int(payload["credits"]),
                payload["section"].strip().upper(),
                payload.get("status", "active"),
            ),
        )
        course_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Created course", "course", course_id, payload["code"].strip().upper())
    return {"message": "course created", "courseId": course_id}


def create_department(admin_id, payload, db_path):
    name = (payload.get("name") or "").strip()
    code = (payload.get("code") or "").strip().upper()
    if not name or not code:
        raise ValueError("name and code are required")
    with connect(db_path) as conn:
        existing = conn.execute("SELECT id FROM departments WHERE code = ?", (code,)).fetchone()
        if existing:
            raise ValueError(f"department code '{code}' already exists")
        conn.execute(
            "INSERT INTO departments (name, code, hod_name, active) VALUES (?, ?, ?, 1)",
            (name, code, (payload.get("hodName") or "").strip()),
        )
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Created department", "department", new_id, name)
    return {"message": "department created", "id": new_id}


def manage_department(admin_id, department_id, payload, db_path):
    with connect(db_path) as conn:
        department = conn.execute("SELECT id, name FROM departments WHERE id = ?", (department_id,)).fetchone()
        if not department:
            raise ValueError("department not found")
        updates = []
        values = []
        if payload.get("name"):
            updates.append("name = ?")
            values.append(payload["name"].strip())
        if payload.get("code"):
            updates.append("code = ?")
            values.append(payload["code"].strip().upper())
        if "hodName" in payload:
            updates.append("hod_name = ?")
            values.append((payload.get("hodName") or "").strip())
        if "active" in payload:
            updates.append("active = ?")
            values.append(1 if str(payload["active"]).lower() in {"1", "true", "yes"} else 0)
        if not updates:
            raise ValueError("no department updates provided")
        values.append(department_id)
        conn.execute(f"UPDATE departments SET {', '.join(updates)} WHERE id = ?", values)
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Managed department", "department", department_id, payload.get("name", department["name"]))
    return {"message": "department updated"}


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


def check_timetable_clashes(db_path):
    with connect(db_path) as conn:
        rows = rows_to_dicts(
            conn.execute(
                """
                SELECT
                  day_of_week, start_time, end_time, room,
                  COUNT(*) AS total,
                  GROUP_CONCAT(timetable_slots.id) AS slot_ids,
                  GROUP_CONCAT(courses.code || ' (' || courses.section || ')', ' | ') AS courses
                FROM timetable_slots
                JOIN courses ON courses.id = timetable_slots.course_id
                GROUP BY day_of_week, start_time, end_time, room
                HAVING COUNT(*) > 1
                ORDER BY { _sql_day_order("day_of_week") }, start_time
                """
            ).fetchall()
        )
    clashes = [
        {
            "day": row["day_of_week"],
            "startTime": row["start_time"],
            "endTime": row["end_time"],
            "room": row["room"],
            "slotIds": row["slot_ids"].split(",") if row.get("slot_ids") else [],
            "count": row["total"],
            "courses": row.get("courses") or "",
        }
        for row in rows
    ]
    return {"hasClash": bool(clashes), "clashes": clashes}


def export_courses_csv(db_path):
    with connect(db_path) as conn:
        rows = rows_to_dicts(
            conn.execute(
                """
                SELECT courses.code, courses.name, departments.code AS department,
                       users.name AS teacher, courses.section, courses.semester,
                       courses.credits, courses.status
                FROM courses
                JOIN departments ON departments.id = courses.department_id
                JOIN users ON users.id = courses.teacher_id
                ORDER BY courses.code
                """
            ).fetchall()
        )
    header = "code,name,department,teacher,section,semester,credits,status"
    body = [
        ",".join(
            [
                str(row["code"]),
                str(row["name"]).replace(",", " "),
                str(row["department"]),
                str(row["teacher"]).replace(",", " "),
                str(row["section"]),
                str(row["semester"]),
                str(row["credits"]),
                str(row["status"]),
            ]
        )
        for row in rows
    ]
    return "\n".join([header, *body])


def export_attendance_csv(db_path):
    with connect(db_path) as conn:
        rows = _attendance_report_rows(conn)
    header = "session_date,department,course_code,course_name,section,teacher,total_records,present_count,absent_count,late_count,medical_leave_count"
    body = [
        ",".join(
            [
                str(row["session_date"]),
                str(row["department_code"]),
                str(row["course_code"]),
                str(row["course_name"]).replace(",", " "),
                str(row["section"]),
                str(row["teacher_name"]).replace(",", " "),
                str(row["total_records"] or 0),
                str(row["present_count"] or 0),
                str(row["absent_count"] or 0),
                str(row["late_count"] or 0),
                str(row["medical_leave_count"] or 0),
            ]
        )
        for row in rows
    ]
    return "\n".join([header, *body])


def export_marks_csv(db_path):
    with connect(db_path) as conn:
        rows = _marks_report_rows(conn)
    header = "published_on,department,course_code,course_name,section,teacher,exam_type,max_score,records_count,average_score,highest_score,lowest_score"
    body = [
        ",".join(
            [
                str(row["published_on"] or ""),
                str(row["department_code"]),
                str(row["course_code"]),
                str(row["course_name"]).replace(",", " "),
                str(row["section"]),
                str(row["teacher_name"]).replace(",", " "),
                str(row["exam_type"]),
                str(row["max_score"]),
                str(row["records_count"] or 0),
                str(row["average_score"] or 0),
                str(row["highest_score"] or 0),
                str(row["lowest_score"] or 0),
            ]
        )
        for row in rows
    ]
    return "\n".join([header, *body])


def publish_notice(admin_id, payload, db_path):
    with connect(db_path) as conn:
        audience = (payload.get("audience", "all") or "all").strip()
        priority = (payload.get("priority", "medium") or "medium").strip()
        if audience not in {"all", "student", "teacher"}:
            raise ValueError("invalid notice audience")
        if priority not in {"high", "medium", "low"}:
            raise ValueError("invalid notice priority")
        conn.execute(
            "INSERT INTO notices (title, message, audience, priority, published_by, created_at, updated_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
            (payload["title"].strip(), payload["message"].strip(), audience, priority, admin_id, utc_now(), utc_now()),
        )
        notice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
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
        notice = conn.execute("SELECT id, title FROM notices WHERE id = ?", (notice_id,)).fetchone()
        if not notice:
            raise ValueError("notice not found")
        conn.execute("UPDATE notices SET active = 0, updated_at = ?, updated_by = ? WHERE id = ?", (utc_now(), admin_id, notice_id))
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Unpublished notice", "notice", notice_id, notice["title"])
    return {"message": "notice unpublished"}


def update_notice(admin_id, notice_id, payload, db_path):
    with connect(db_path) as conn:
        notice = conn.execute("SELECT id, title, active, audience FROM notices WHERE id = ?", (notice_id,)).fetchone()
        if not notice:
            raise ValueError("notice not found")
        updates = []
        values = []
        if payload.get("title"):
            updates.append("title = ?")
            values.append(payload["title"].strip())
        if payload.get("message"):
            updates.append("message = ?")
            values.append(payload["message"].strip())
        if payload.get("audience"):
            if payload["audience"].strip() not in {"all", "student", "teacher"}:
                raise ValueError("invalid notice audience")
            updates.append("audience = ?")
            values.append(payload["audience"].strip())
        if payload.get("priority"):
            if payload["priority"].strip() not in {"high", "medium", "low"}:
                raise ValueError("invalid notice priority")
            updates.append("priority = ?")
            values.append(payload["priority"].strip())
        if "active" in payload:
            updates.append("active = ?")
            values.append(1 if str(payload["active"]).lower() in {"1", "true", "yes"} else 0)
        if not updates:
            raise ValueError("no notice updates provided")
        updates.append("updated_at = ?")
        values.append(utc_now())
        updates.append("updated_by = ?")
        values.append(admin_id)
        values.append(notice_id)
        conn.execute(f"UPDATE notices SET {', '.join(updates)} WHERE id = ?", values)
        audience = (payload.get("audience") or notice["audience"] or "all").strip()
        active = payload.get("active", notice["active"])
        is_active = str(active).lower() in {"1", "true", "yes"} if isinstance(active, str) else bool(active)
        if is_active:
            if audience == "student":
                target_ids = [row["id"] for row in conn.execute("SELECT id FROM users WHERE role = 'student' AND status = 'active'").fetchall()]
            elif audience == "teacher":
                target_ids = [row["id"] for row in conn.execute("SELECT id FROM users WHERE role = 'teacher' AND status = 'active'").fetchall()]
            else:
                target_ids = [row["id"] for row in conn.execute("SELECT id FROM users WHERE status = 'active'").fetchall()]
            add_notification(conn, target_ids, "Notice Updated", (payload.get("title") or notice["title"]).strip(), "notice", "#notices")
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Updated notice", "notice", notice_id, payload.get("title", notice["title"]))
    return {"message": "notice updated"}


def resolve_grievance(admin_id, grievance_id, resolution_note, db_path, status="resolved"):
    normalized_status = (status or "resolved").strip().lower()
    if normalized_status not in {"in_review", "resolved", "closed"}:
        raise ValueError("invalid grievance status")
    with connect(db_path) as conn:
        grievance = conn.execute("SELECT submitted_by FROM grievances WHERE id = ?", (grievance_id,)).fetchone()
        if not grievance:
            raise ValueError("grievance not found")
        conn.execute(
            """
            UPDATE grievances
            SET status = ?, resolution_note = ?, updated_at = ?, assigned_to = ?
            WHERE id = ?
            """,
            (normalized_status, resolution_note.strip(), utc_now(), admin_id, grievance_id),
        )
        add_notification(conn, [grievance["submitted_by"]], f"Grievance {titleize_status(normalized_status)}", resolution_note.strip(), "grievance", "#grievance")
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], f"Updated grievance status to {normalized_status}", "grievance", grievance_id, resolution_note.strip())
    return {"message": f"grievance {normalized_status}"}


def resolve_workflow_request(admin_id, request_id, decision, review_note, db_path):
    normalized = (decision or "").strip().lower()
    if normalized not in {"approved", "rejected"}:
        raise ValueError("invalid decision")
    with connect(db_path) as conn:
        req = conn.execute(
            """
            SELECT id, student_id, request_type, from_date, to_date, status
            FROM workflow_requests
            WHERE id = ?
            """,
            (request_id,),
        ).fetchone()
        if not req:
            raise ValueError("request not found")
        if req["status"] != "pending":
            raise ValueError("request already reviewed")
        conn.execute(
            """
            UPDATE workflow_requests
            SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?
            WHERE id = ?
            """,
            (normalized, admin_id, utc_now(), (review_note or "").strip(), request_id),
        )
        auto_marked = 0
        if normalized == "approved" and req["request_type"] == "medical_leave":
            session_rows = conn.execute(
                """
                SELECT attendance_sessions.id AS session_id
                FROM attendance_sessions
                JOIN course_enrollments ON course_enrollments.course_id = attendance_sessions.course_id
                WHERE course_enrollments.student_id = ?
                  AND date(attendance_sessions.session_date) BETWEEN date(?) AND date(?)
                """,
                (req["student_id"], req["from_date"], req["to_date"]),
            ).fetchall()
            for row in session_rows:
                existing = conn.execute(
                    "SELECT id FROM attendance_records WHERE session_id = ? AND student_id = ?",
                    (row["session_id"], req["student_id"]),
                ).fetchone()
                if existing:
                    conn.execute(
                        "UPDATE attendance_records SET status = 'medical_leave', remark = COALESCE(remark, 'Auto-approved medical leave') WHERE id = ?",
                        (existing["id"],),
                    )
                else:
                    conn.execute(
                        "INSERT INTO attendance_records (session_id, student_id, status, remark) VALUES (?, ?, 'medical_leave', ?)",
                        (row["session_id"], req["student_id"], "Auto-approved medical leave"),
                    )
                auto_marked += 1
        add_notification(
            conn,
            [req["student_id"]],
            "Request Reviewed",
            f"Your {req['request_type'].replace('_', ' ')} request has been {normalized}.",
            "workflow",
            "#requests",
        )
        actor = get_user_by_id(admin_id, db_path)
        log_action(
            conn,
            admin_id,
            actor["name"],
            f"Reviewed workflow request ({normalized})",
            "workflow_request",
            request_id,
            (review_note or "").strip(),
        )
    return {"message": f"request {normalized}", "autoMarkedAttendance": auto_marked}


def create_fee_item(admin_id, payload, db_path):
    fee_head = (payload.get("feeHead") or "").strip()
    term_label = (payload.get("termLabel") or "").strip()
    due_date = (payload.get("dueDate") or "").strip()
    amount = float(payload.get("amount", 0) or 0)
    if not fee_head or not term_label or not due_date or amount <= 0:
        raise ValueError("feeHead, termLabel, dueDate and positive amount are required")
    target = (payload.get("target") or "student").strip().lower()
    with connect(db_path) as conn:
        if target == "all_students":
            student_ids = [row["id"] for row in conn.execute("SELECT id FROM users WHERE role = 'student' AND status = 'active'").fetchall()]
        else:
            student_id = int(payload.get("studentId") or 0)
            if not student_id:
                raise ValueError("studentId is required")
            exists = conn.execute("SELECT id FROM users WHERE id = ? AND role = 'student'", (student_id,)).fetchone()
            if not exists:
                raise ValueError("student not found")
            student_ids = [student_id]
        created_at_value = utc_now()
        for student_id in student_ids:
            conn.execute(
                """
                INSERT INTO fee_items (student_id, fee_head, term_label, amount, due_date, status, created_by, created_at, note)
                VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
                """,
                (student_id, fee_head, term_label, amount, due_date, admin_id, created_at_value, (payload.get("note") or "").strip() or None),
            )
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Created fee item(s)", "fee_item", None, f"{fee_head} for {len(student_ids)} student(s)")
    return {"message": "fee items created", "count": len(student_ids)}


def titleize_status(value):
    return str(value).replace("_", " ").title()


def resolve_attachment_download(owner_user_id, role, item_type, item_id, db_path):
    with connect(db_path) as conn:
        if item_type == "study_material":
            row = conn.execute(
                """
                SELECT id, attachment_name, attachment_path, external_url
                FROM study_materials
                WHERE id = ?
                """,
                (item_id,),
            ).fetchone()
            if not row:
                raise ValueError("study material not found")
            if role == "student":
                allowed = conn.execute(
                    """
                    SELECT 1
                    FROM course_enrollments
                    WHERE student_id = ? AND course_id = (SELECT course_id FROM study_materials WHERE id = ?)
                    """,
                    (owner_user_id, item_id),
                ).fetchone()
                if not allowed:
                    raise ValueError("not authorized")
            elif role == "teacher":
                allowed = conn.execute(
                    """
                    SELECT 1 FROM courses
                    WHERE teacher_id = ? AND id = (SELECT course_id FROM study_materials WHERE id = ?)
                    """,
                    (owner_user_id, item_id),
                ).fetchone()
                if not allowed:
                    raise ValueError("not authorized")
        elif item_type == "assignment_file":
            row = conn.execute(
                """
                SELECT id, attachment_name, attachment_path
                FROM assignments
                WHERE id = ?
                """,
                (item_id,),
            ).fetchone()
            if not row:
                raise ValueError("assignment not found")
            if role == "student":
                allowed = conn.execute(
                    """
                    SELECT 1
                    FROM course_enrollments
                    WHERE student_id = ? AND course_id = (SELECT course_id FROM assignments WHERE id = ?)
                    """,
                    (owner_user_id, item_id),
                ).fetchone()
                if not allowed:
                    raise ValueError("not authorized")
            elif role == "teacher":
                allowed = conn.execute("SELECT 1 FROM assignments WHERE id = ? AND teacher_id = ?", (item_id, owner_user_id)).fetchone()
                if not allowed:
                    raise ValueError("not authorized")
        elif item_type == "assignment_submission":
            row = conn.execute(
                """
                SELECT assignment_submissions.id, assignment_submissions.attachment_name, assignment_submissions.attachment_path
                FROM assignment_submissions
                WHERE assignment_submissions.id = ?
                """,
                (item_id,),
            ).fetchone()
            if not row:
                raise ValueError("submission not found")
        else:
            raise ValueError("invalid item type")
        if not row["attachment_name"]:
            raise ValueError("no attachment available")
        path = (row["attachment_path"] or "").strip()
        if path:
            abs_path = path if os.path.isabs(path) else os.path.abspath(os.path.join(os.path.dirname(db_path), path))
            if os.path.exists(abs_path):
                return {"mode": "file", "path": abs_path, "filename": row["attachment_name"]}
        return {
            "mode": "virtual",
            "filename": row["attachment_name"],
            "mimeType": "text/plain",
            "content": f"Attachment metadata only.\nFile Name: {row['attachment_name']}\nStored Path: {path or '-'}\n",
            "externalUrl": row["external_url"] if "external_url" in row.keys() else None,
        }


def enroll_student_to_course(admin_id, student_id, course_id, db_path):
    with connect(db_path) as conn:
        student = conn.execute("SELECT id, name FROM users WHERE id = ? AND role = 'student'", (student_id,)).fetchone()
        course = conn.execute("SELECT id, name FROM courses WHERE id = ?", (course_id,)).fetchone()
        if not student or not course:
            raise ValueError("student or course not found")
        existing = conn.execute("SELECT id FROM course_enrollments WHERE student_id = ? AND course_id = ?", (student_id, course_id)).fetchone()
        if existing:
            return {"message": "already enrolled"}
        conn.execute("INSERT INTO course_enrollments (course_id, student_id, status) VALUES (?, ?, 'enrolled')", (course_id, student_id))
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Enrolled student to course", "course_enrollment", None, f"{student['name']} -> {course['name']}")
    return {"message": "student enrolled"}


def remove_student_enrollment(admin_id, student_id, course_id, db_path):
    with connect(db_path) as conn:
        conn.execute("DELETE FROM course_enrollments WHERE student_id = ? AND course_id = ?", (student_id, course_id))
        actor = get_user_by_id(admin_id, db_path)
        log_action(conn, admin_id, actor["name"], "Removed student enrollment", "course_enrollment", None, f"{student_id} from {course_id}")
    return {"message": "enrollment removed"}


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
