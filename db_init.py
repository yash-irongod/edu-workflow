import os
import sqlite3
from collections import defaultdict
from datetime import date, datetime, timedelta


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "users.db")
SCHEMA_PATH = os.path.join(BASE_DIR, "backend", "db_init.sql")


FIRST_NAMES = [
    "Priya", "Rahul", "Anjali", "Arjun", "Sneha", "Karan", "Isha", "Rohan",
    "Nikita", "Aman", "Meera", "Yash", "Tanya", "Aditya", "Sanya", "Harsh",
    "Pooja", "Vivek", "Neha", "Ishaan", "Ritika", "Dev", "Kavya", "Manav",
    "Aditi", "Varun", "Simran", "Aryan", "Diya", "Siddharth"
]

LAST_NAMES = [
    "Sharma", "Verma", "Kapoor", "Reddy", "Singh", "Nair", "Gupta", "Bose",
    "Mehta", "Iyer", "Ahuja", "Das", "Mishra", "Rao", "Pandey"
]


def iso(days_offset=0):
    return (date(2026, 4, 14) + timedelta(days=days_offset)).isoformat()


def timestamp(days_offset=0, hour=9, minute=0):
    base = datetime(2026, 4, 14, hour=hour, minute=minute)
    return (base + timedelta(days=days_offset)).strftime("%Y-%m-%d %H:%M:%S")


def grade_for(total_score):
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


def build_student_seed():
    students = []
    for index in range(30):
        section = "A" if index < 15 else "B"
        first = FIRST_NAMES[index]
        last = LAST_NAMES[index % len(LAST_NAMES)]
        name = f"{first} {last}"
        roll = f"2024CS04{index + 1:02d}"
        email = "s@x.com" if index == 0 else f"{first.lower()}.{last.lower()}{index + 1}@edu.in"
        cgpa = round(7.2 + (index % 8) * 0.18 + (0.25 if section == "B" else 0.0), 2)
        rank = index + 1
        students.append(
            {
                "name": "Priya Sharma" if index == 0 else name,
                "email": email,
                "roll_no": "2024CS0472" if index == 0 else roll,
                "phone": f"+91 98{index + 10:03d}{index + 40:05d}",
                "section": "B" if index == 0 else section,
                "cgpa": 8.74 if index == 0 else cgpa,
                "rank": 12 if index == 0 else rank,
                "scholarship": "credited" if index % 4 == 0 else "approved" if index % 7 == 0 else "pending",
                "hostel": "Kaveri Hostel" if section == "B" else "Narmada Hostel",
                "dob": f"2004-{(index % 9) + 1:02d}-{(index % 19) + 5:02d}",
            }
        )
    return students


def execute_many(cursor, query, rows):
    cursor.executemany(query, rows)


def create_users(cursor):
    now = timestamp(0, 8, 30)
    departments = [
        ("CSE", "Computer Science and Engineering", "Prof. D. Rao"),
        ("ECE", "Electronics and Communication Engineering", "Dr. S. Nair"),
        ("ME", "Mechanical Engineering", "Prof. R. Gupta"),
        ("CE", "Civil Engineering", "Prof. M. Khan"),
        ("EE", "Electrical Engineering", "Prof. P. Thomas"),
        ("MBA", "School of Management", "Prof. V. Menon"),
    ]
    execute_many(
        cursor,
        "INSERT INTO departments (code, name, hod_name, active) VALUES (?, ?, ?, 1)",
        departments,
    )
    dept_map = {row["code"]: row["id"] for row in cursor.execute("SELECT id, code FROM departments").fetchall()}

    teachers = [
        ("t@x.com", "123", "teacher", "Dr. Rajiv Mehra", None, "FAC-2018-045", dept_map["CSE"], "+91 9880012345"),
        ("ahuja@edu.in", "123", "teacher", "Prof. Neel Ahuja", None, "FAC-2019-018", dept_map["CSE"], "+91 9880012399"),
        ("kapoor@edu.in", "123", "teacher", "Dr. Sonal Kapoor", None, "FAC-2020-032", dept_map["CSE"], "+91 9880012400"),
        ("singh@edu.in", "123", "teacher", "Prof. Vikram Singh", None, "FAC-2017-011", dept_map["CSE"], "+91 9880012401"),
        ("bose@edu.in", "123", "teacher", "Dr. Arindam Bose", None, "FAC-2016-054", dept_map["CSE"], "+91 9880012402"),
        ("mentor@edu.in", "123", "teacher", "Dr. Ritu Mehta", None, "FAC-2015-025", dept_map["CSE"], "+91 9880012403"),
    ]
    execute_many(
        cursor,
        """
        INSERT INTO users (
          email, password, role, name, roll_no, employee_id, department_id, phone,
          status, password_reset_required, last_login_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?, ?)
        """,
        [(email, password, role, name, roll_no, employee_id, department_id, phone, now, now, now)
         for email, password, role, name, roll_no, employee_id, department_id, phone in teachers],
    )

    cursor.execute(
        """
        INSERT INTO users (
          email, password, role, name, department_id, phone, status,
          password_reset_required, last_login_at, created_at, updated_at
        ) VALUES (?, ?, 'admin', ?, ?, ?, 'active', 0, ?, ?, ?)
        """,
        ("a@x.com", "123", "System Admin", dept_map["CSE"], "+91 9800100001", now, now, now),
    )

    students = build_student_seed()
    execute_many(
        cursor,
        """
        INSERT INTO users (
          email, password, role, name, roll_no, employee_id, department_id, phone,
          status, password_reset_required, last_login_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                student["email"],
                "123",
                "student",
                student["name"],
                student["roll_no"],
                None,
                dept_map["CSE"],
                student["phone"],
                "active",
                0,
                timestamp(-(index % 5), 9 + (index % 4), 10),
                now,
                now,
            )
            for index, student in enumerate(students)
        ],
    )

    users = {row["email"]: row["id"] for row in cursor.execute("SELECT id, email FROM users").fetchall()}
    execute_many(
        cursor,
        """
        INSERT INTO teacher_profiles (
          user_id, designation, specialization, qualification, experience_years, office_room
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (users["t@x.com"], "Associate Professor", "Deep Learning, Vision AI", "PhD - IIT Delhi", 8, "CSE-204"),
            (users["ahuja@edu.in"], "Assistant Professor", "MLOps, Cloud Systems", "MTech - IIIT Hyderabad", 6, "CSE-118"),
            (users["kapoor@edu.in"], "Associate Professor", "NLP, Information Retrieval", "PhD - NIT Trichy", 7, "CSE-305"),
            (users["singh@edu.in"], "Professor", "Cloud Infrastructure", "PhD - BITS Pilani", 11, "CSE-210"),
            (users["bose@edu.in"], "Associate Professor", "Reinforcement Learning", "PhD - IISc Bangalore", 9, "CSE-212"),
            (users["mentor@edu.in"], "Professor", "Academic Mentoring", "PhD - JNU", 12, "CSE-101"),
        ],
    )
    cursor.execute("INSERT INTO admin_profiles (user_id, title, super_admin) VALUES (?, ?, 1)", (users["a@x.com"], "Super Administrator"))

    for index, student in enumerate(students):
        user_id = users[student["email"]]
        cursor.execute(
            """
            INSERT INTO student_profiles (
              user_id, program, batch, semester, section, academic_year, cgpa, total_credits,
              earned_credits, attendance_threshold, advisor_name, hostel_name, scholarship_status,
              rank_position, date_of_birth
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                "B.Tech Computer Science and Engineering (AI/ML)",
                "2022-2026",
                6,
                student["section"],
                "2025-2026",
                student["cgpa"],
                180,
                148 + (index % 7),
                75,
                "Dr. Ritu Mehta",
                student["hostel"],
                student["scholarship"],
                student["rank"],
                student["dob"],
            ),
        )
        sgpa_values = [7.81, 8.05, 8.21, 8.36, 8.58, student["cgpa"]]
        if index % 5 == 0:
            sgpa_values = [7.44, 7.68, 7.92, 8.04, 8.22, student["cgpa"]]
        for semester, sgpa in enumerate(sgpa_values, start=1):
            cursor.execute(
                """
                INSERT INTO semester_performance (
                  student_id, semester, academic_year, sgpa, cgpa,
                  credits_registered, credits_earned, rank_position
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    semester,
                    f"202{semester // 2 + 2}-202{semester // 2 + 3}",
                    round(sgpa, 2),
                    round(min(student["cgpa"], sgpa if semester == 6 else sgpa - 0.03), 2),
                    24 if semester < 6 else 21,
                    24 if semester < 6 else 21,
                    max(1, student["rank"] + (6 - semester)),
                ),
            )
    return users, dept_map


def create_courses(cursor, users, dept_map):
    courses = [
        ("CS601", "Deep Learning", dept_map["CSE"], 6, "A", 4, users["t@x.com"], 60, "active"),
        ("CS602", "MLOps Practicals", dept_map["CSE"], 6, "A", 4, users["ahuja@edu.in"], 60, "active"),
        ("CS603", "NLP and Transformers", dept_map["CSE"], 6, "A", 4, users["kapoor@edu.in"], 60, "active"),
        ("CS604", "Cloud Computing", dept_map["CSE"], 6, "A", 3, users["singh@edu.in"], 60, "review"),
        ("CS605", "Reinforcement Learning", dept_map["CSE"], 6, "A", 4, users["bose@edu.in"], 60, "active"),
        ("CS606", "Data Ethics", dept_map["CSE"], 6, "A", 2, users["mentor@edu.in"], 60, "active"),
        ("CS611", "Deep Learning", dept_map["CSE"], 6, "B", 4, users["t@x.com"], 60, "active"),
        ("CS612", "MLOps Practicals", dept_map["CSE"], 6, "B", 4, users["ahuja@edu.in"], 60, "active"),
        ("CS613", "NLP and Transformers", dept_map["CSE"], 6, "B", 4, users["kapoor@edu.in"], 60, "active"),
        ("CS614", "Cloud Computing", dept_map["CSE"], 6, "B", 3, users["singh@edu.in"], 60, "review"),
        ("CS615", "Reinforcement Learning", dept_map["CSE"], 6, "B", 4, users["bose@edu.in"], 60, "active"),
        ("CS616", "Data Ethics", dept_map["CSE"], 6, "B", 2, users["mentor@edu.in"], 60, "active"),
    ]
    execute_many(
        cursor,
        """
        INSERT INTO courses (
          code, name, department_id, semester, section, credits, teacher_id, capacity, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        courses,
    )
    return {row["code"]: dict(row) for row in cursor.execute("SELECT id, code, name, teacher_id, section, credits FROM courses").fetchall()}


def enroll_students(cursor, course_map):
    students = cursor.execute(
        """
        SELECT users.id, student_profiles.section
        FROM users
        JOIN student_profiles ON student_profiles.user_id = users.id
        ORDER BY users.id
        """
    ).fetchall()
    for student in students:
        for course in course_map.values():
            if course["section"] == student["section"]:
                cursor.execute("INSERT INTO course_enrollments (course_id, student_id, status) VALUES (?, ?, 'enrolled')", (course["id"], student["id"]))


def create_timetable(cursor, course_map, users):
    slot_templates = [
        ("Thursday", "08:30", "09:30", "A-204", "Lecture"),
        ("Thursday", "09:45", "10:45", "Lab-3", "Practical"),
        ("Thursday", "11:00", "12:00", "B-101", "Lecture"),
        ("Thursday", "14:00", "15:00", "C-210", "Lecture"),
        ("Thursday", "15:15", "16:15", "C-212", "Lecture"),
        ("Friday", "10:00", "11:00", "Open Elective Hall", "Seminar"),
    ]
    grouped = defaultdict(list)
    for course in course_map.values():
        grouped[course["section"]].append(course)
    for section, courses in grouped.items():
        for index, course in enumerate(courses):
            day_of_week, start_time, end_time, room, slot_type = slot_templates[index]
            status = "updated" if course["name"] == "Cloud Computing" and section == "B" else "scheduled"
            note = "Room updated after faculty request" if status == "updated" else ""
            cursor.execute(
                """
                INSERT INTO timetable_slots (
                  course_id, day_of_week, start_time, end_time, room, slot_type, status, note, updated_at, updated_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (course["id"], day_of_week, start_time, end_time, room, slot_type, status, note, timestamp(-1, 17, 10), users["a@x.com"]),
            )


def create_attendance(cursor, course_map):
    students = cursor.execute(
        """
        SELECT users.id, users.name, student_profiles.section
        FROM users
        JOIN student_profiles ON student_profiles.user_id = users.id
        ORDER BY users.id
        """
    ).fetchall()
    slots = {row["course_id"]: row for row in cursor.execute("SELECT id, course_id, start_time, end_time FROM timetable_slots").fetchall()}
    for course in course_map.values():
        course_students = [student for student in students if student["section"] == course["section"]]
        for offset in range(7):
            session_date = date(2026, 4, 14) - timedelta(days=offset * 2 + (0 if course["section"] == "B" else 1))
            slot = slots[course["id"]]
            cursor.execute(
                """
                INSERT INTO attendance_sessions (
                  course_id, teacher_id, timetable_slot_id, session_date, delivered_count,
                  start_time, end_time, status, note, created_at
                ) VALUES (?, ?, ?, ?, 1, ?, ?, 'completed', ?, ?)
                """,
                (course["id"], course["teacher_id"], slot["id"], session_date.isoformat(), slot["start_time"], slot["end_time"], "Weekly academic session", timestamp(-(offset * 2), 18, 0)),
            )
            session_id = cursor.lastrowid
            for student_index, student in enumerate(course_students):
                status = "present"
                if (student_index + offset) % 11 == 0:
                    status = "medical_leave" if student["name"] == "Priya Sharma" and course["name"] == "Cloud Computing" else "absent"
                elif (student_index + offset) % 7 == 0:
                    status = "late"
                cursor.execute(
                    "INSERT INTO attendance_records (session_id, student_id, status, remark) VALUES (?, ?, ?, ?)",
                    (session_id, student["id"], status, "Medical leave approved" if status == "medical_leave" else ""),
                )


def create_results_and_marks(cursor, course_map):
    students = cursor.execute(
        """
        SELECT users.id, student_profiles.section
        FROM users
        JOIN student_profiles ON student_profiles.user_id = users.id
        ORDER BY users.id
        """
    ).fetchall()
    for course in course_map.values():
        assessments = {}
        for exam_type, max_score in [("Internal Exam 1", 50), ("Internal Exam 2", 50), ("Mid-Term", 100)]:
            cursor.execute(
                "INSERT INTO assessments (course_id, teacher_id, exam_type, max_score, semester, published_on) VALUES (?, ?, ?, ?, 6, ?)",
                (course["id"], course["teacher_id"], exam_type, max_score, iso(-4)),
            )
            assessments[exam_type] = cursor.lastrowid
        for index, student in enumerate([row for row in students if row["section"] == course["section"]]):
            internal_one = 34 + ((index + len(course["name"])) % 14)
            internal_two = 32 + ((index * 2 + len(course["code"])) % 16)
            external = 58 + ((index * 3 + course["id"]) % 28)
            total = internal_one + internal_two + external
            grade_letter, grade_point = grade_for(total)
            execute_many(
                cursor,
                "INSERT INTO marks (assessment_id, student_id, score, remark, updated_at) VALUES (?, ?, ?, ?, ?)",
                [
                    (assessments["Internal Exam 1"], student["id"], internal_one, "Consistent progress", timestamp(-3, 15, 15)),
                    (assessments["Internal Exam 2"], student["id"], internal_two, "Improved problem solving", timestamp(-2, 15, 15)),
                    (assessments["Mid-Term"], student["id"], external, "End-sem review", timestamp(-1, 15, 15)),
                ],
            )
            cursor.execute(
                """
                INSERT INTO course_results (
                  student_id, course_id, semester, academic_year, internal_score, external_score,
                  total_score, grade_letter, grade_point, credits, published_on
                ) VALUES (?, ?, 6, '2025-2026', ?, ?, ?, ?, ?, ?, ?)
                """,
                (student["id"], course["id"], internal_one + internal_two, external, total, grade_letter, grade_point, course["credits"], iso(-1)),
            )


def create_assignments(cursor, course_map):
    specs = [
        ("Deep Learning", "Lab Report: CNN Architecture", "Submit notebook and evaluation notes.", iso(2), 15),
        ("MLOps Practicals", "Mini Project Deployment Plan", "Document CI/CD, monitoring, and rollback steps.", iso(5), 20),
        ("NLP and Transformers", "Attention Mechanism Essay", "Explain encoder-decoder attention with examples.", iso(8), 10),
        ("Cloud Computing", "AWS Cost Optimisation Worksheet", "Analyse a weekly cloud usage dataset.", iso(10), 25),
        ("Reinforcement Learning", "Policy Gradient Implementation", "Compare baseline and tuned runs.", iso(13), 30),
        ("Data Ethics", "Responsible AI Reflection", "Write a policy memo for model governance.", iso(9), 10),
    ]
    for course in course_map.values():
        for _, title, description, due_date, max_score in [item for item in specs if item[0] == course["name"]]:
            cursor.execute(
                """
                INSERT INTO assignments (
                  course_id, teacher_id, title, description, due_date, max_score, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
                """,
                (course["id"], course["teacher_id"], title, description, due_date, max_score, iso(-5)),
            )
            assignment_id = cursor.lastrowid
            for position, row in enumerate(cursor.execute("SELECT student_id FROM course_enrollments WHERE course_id = ?", (course["id"],)).fetchall()):
                status = "submitted" if position % 4 != 0 else "pending"
                if position % 9 == 0:
                    status = "graded"
                cursor.execute(
                    """
                    INSERT INTO assignment_submissions (
                      assignment_id, student_id, status, score, file_name, submitted_at, feedback
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        assignment_id,
                        row["student_id"],
                        status,
                        max_score - (position % 5) if status == "graded" else None,
                        f"{title.lower().replace(' ', '_')}.pdf" if status != "pending" else None,
                        iso(-2) if status != "pending" else None,
                        "Please improve references" if status == "graded" and position % 3 == 0 else "Good submission" if status == "graded" else None,
                    ),
                )


def create_notices_grievances_finance(cursor, users):
    execute_many(
        cursor,
        "INSERT INTO notices (title, message, audience, priority, published_by, created_at, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
        [
            ("End-Semester Exam Schedule Released", "Exam schedule for Semester VI is now live on the portal.", "all", "high", users["a@x.com"], iso(-3)),
            ("Mini Project Milestone Review", "Project review slots open for all final-year AI/ML sections.", "student", "high", users["t@x.com"], iso(-2)),
            ("Library Fine Amnesty Week", "Submit overdue books this week for fine relief.", "all", "medium", users["a@x.com"], iso(-6)),
            ("Campus Placement Drive", "TCS, Infosys, and Google recruiter interactions start next week.", "student", "high", users["a@x.com"], iso(-5)),
        ],
    )
    students = cursor.execute("SELECT id FROM users WHERE role = 'student' ORDER BY id").fetchall()
    execute_many(
        cursor,
        """
        INSERT INTO grievances (
          submitted_by, category, subject, message, status, priority, assigned_to, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (students[0]["id"], "Examination", "Request for re-evaluation - Deep Learning Internal 2", "Marks entry appears lower than answer sheet total.", "open", "high", users["a@x.com"], iso(-1), iso(-1)),
            (students[2]["id"], "Fees", "Scholarship credit not reflected", "Government scholarship is approved but not adjusted in fee ledger.", "in_review", "medium", users["a@x.com"], iso(-4), iso(-2)),
            (students[4]["id"], "Academic", "Attendance discrepancy in Cloud Computing", "Two sessions are missing despite manual sign-in.", "resolved", "medium", users["a@x.com"], iso(-8), iso(-3)),
        ],
    )
    cursor.execute("UPDATE grievances SET resolution_note = ? WHERE status = 'resolved'", ("Attendance was corrected and students were notified.",))
    for position, student in enumerate(students):
        execute_many(
            cursor,
            """
            INSERT INTO fee_items (
              student_id, fee_head, term_label, amount, due_date, status, paid_at, transaction_ref
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (student["id"], "Tuition Fee", "Semester VI", 45000, iso(-90), "paid", iso(-75), f"TXN-{student['id']}-01"),
                (student["id"], "Hostel Fee", "Semester VI", 18000, iso(-90), "paid", iso(-74), f"TXN-{student['id']}-02"),
                (student["id"], "Exam Form Fee", "Semester VI", 1500, iso(6), "paid" if position % 5 == 0 else "pending", iso(-5) if position % 5 == 0 else None, f"TXN-{student['id']}-03" if position % 5 == 0 else None),
                (student["id"], "Library Fine", "Semester VI", 40 + (position % 4) * 20, iso(3), "pending", None, None),
            ],
        )
        if position % 4 == 0:
            cursor.execute("INSERT INTO scholarship_awards (student_id, name, amount, status, disbursed_at) VALUES (?, ?, ?, ?, ?)", (student["id"], "Merit Scholarship", 25000, "credited", iso(-30)))


def create_library_and_placements(cursor):
    execute_many(
        cursor,
        "INSERT INTO library_books (isbn, title, author, category, total_copies, available_copies) VALUES (?, ?, ?, ?, ?, ?)",
        [
            ("9780262035613", "Deep Learning", "Ian Goodfellow", "AI", 8, 5),
            ("9781492055020", "Designing Data-Intensive Applications", "Martin Kleppmann", "Systems", 6, 4),
            ("9781098103247", "Machine Learning Engineering", "Andriy Burkov", "MLOps", 5, 3),
            ("9780134190440", "Cloud Computing Concepts", "Thomas Erl", "Cloud", 4, 2),
        ],
    )
    students = cursor.execute("SELECT id FROM users WHERE role = 'student' ORDER BY id LIMIT 5").fetchall()
    books = cursor.execute("SELECT id FROM library_books ORDER BY id").fetchall()
    for position, student in enumerate(students):
        cursor.execute(
            """
            INSERT INTO library_loans (
              book_id, student_id, issue_date, due_date, returned_at, status, fine_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (books[position % len(books)]["id"], student["id"], iso(-20 + position), iso(-2 + position), None, "overdue" if position == 0 else "issued", 40 if position == 0 else 0),
        )
    execute_many(
        cursor,
        "INSERT INTO placements (company, role, package_lpa, deadline, drive_date, min_cgpa, location, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
            ("TCS", "Software Engineer", 7.0, iso(12), iso(21), 7.0, "Noida", "open"),
            ("Infosys", "Systems Engineer", 6.5, iso(12), iso(21), 7.0, "Bengaluru", "open"),
            ("Google", "SWE Intern - ML", 9.6, iso(18), iso(30), 8.5, "Hyderabad", "open"),
            ("Amazon", "SDE - AI/ML", 32.0, iso(-2), iso(10), 8.0, "Hyderabad", "ongoing"),
        ],
    )
    priya_id = cursor.execute("SELECT id FROM users WHERE email = 's@x.com'").fetchone()["id"]
    amazon_id = cursor.execute("SELECT id FROM placements WHERE company = 'Amazon'").fetchone()["id"]
    cursor.execute("INSERT INTO placement_applications (placement_id, student_id, status, applied_at, note) VALUES (?, ?, 'shortlisted', ?, ?)", (amazon_id, priya_id, iso(-4), "Round 2 interview on 2026-04-20"))


def create_requests_notifications_and_logs(cursor, users):
    priya_id = cursor.execute("SELECT id FROM users WHERE email = 's@x.com'").fetchone()["id"]
    execute_many(
        cursor,
        """
        INSERT INTO workflow_requests (
          student_id, request_type, from_date, to_date, reason, attachment_name, status,
          reviewed_by, reviewed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (priya_id, "medical_leave", iso(-5), iso(-4), "Fever and doctor-advised rest during Cloud Computing sessions.", "medical_certificate_priya.pdf", "approved", users["a@x.com"], timestamp(-3, 11, 15), timestamp(-5, 8, 30)),
            (priya_id, "absence", iso(1), iso(1), "Placement drive travel to Bengaluru campus office.", "placement_drive_letter.pdf", "pending", None, None, timestamp(0, 16, 5)),
        ],
    )
    execute_many(
        cursor,
        "INSERT INTO notifications (user_id, title, message, category, is_read, created_at, action_link) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            (priya_id, "Attendance Alert", "Cloud Computing attendance is below the institutional threshold.", "attendance", 0, timestamp(-1, 9, 30), "#attendance"),
            (priya_id, "Assignment Reminder", "Mini Project Deployment Plan is due in 5 days.", "assignment", 0, timestamp(-1, 10, 0), "#assignments"),
            (priya_id, "Placement Update", "Amazon has shortlisted you for the next interview round.", "placement", 1, timestamp(-2, 18, 15), "#placements"),
            (users["t@x.com"], "Student Contact Logged", "A support message was sent to Arjun Kapoor regarding low attendance.", "notification", 0, timestamp(-1, 12, 40), "#students"),
            (users["a@x.com"], "System Summary", "Maintenance mode is currently disabled and all role portals are live.", "system", 0, timestamp(0, 7, 0), "#settings"),
        ],
    )
    execute_many(
        cursor,
        "INSERT INTO system_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)",
        [
            ("site_name", "EduWorkflow", timestamp(-2, 17, 0), users["a@x.com"]),
            ("current_session", "2025-2026", timestamp(-2, 17, 0), users["a@x.com"]),
            ("attendance_threshold", "75", timestamp(-2, 17, 0), users["a@x.com"]),
            ("maintenance_mode", "0", timestamp(-2, 17, 0), users["a@x.com"]),
            ("student_portal_enabled", "1", timestamp(-2, 17, 0), users["a@x.com"]),
            ("teacher_portal_enabled", "1", timestamp(-2, 17, 0), users["a@x.com"]),
            ("grievance_module_active", "1", timestamp(-2, 17, 0), users["a@x.com"]),
        ],
    )
    execute_many(
        cursor,
        "INSERT INTO audit_logs (user_id, actor_name, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            (users["a@x.com"], "System Admin", "Created new course shell for CS614", "course", 10, "Cloud Computing for Section B placed under review.", timestamp(-4, 15, 0)),
            (users["t@x.com"], "Dr. Rajiv Mehra", "Uploaded Internal Exam 2 marks", "assessment", 2, "Marks published for Deep Learning, Section B.", timestamp(-2, 14, 0)),
            (users["a@x.com"], "System Admin", "Published institute-wide exam notice", "notice", 1, "Exam schedule pushed to all roles.", timestamp(-3, 16, 30)),
            (users["t@x.com"], "Dr. Rajiv Mehra", "Contacted at-risk student", "notification", None, "Alert sent to Arjun Kapoor regarding attendance recovery.", timestamp(-1, 12, 40)),
            (users["a@x.com"], "System Admin", "Reviewed medical leave request", "workflow_request", 1, "Medical leave approved for Priya Sharma.", timestamp(-3, 11, 15)),
        ],
    )


def init_db(db_path=DEFAULT_DB_PATH):
    if os.path.exists(db_path):
        os.remove(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    with open(SCHEMA_PATH, "r", encoding="utf-8") as schema_file:
        cursor.executescript(schema_file.read())
    users, dept_map = create_users(cursor)
    course_map = create_courses(cursor, users, dept_map)
    enroll_students(cursor, course_map)
    create_timetable(cursor, course_map, users)
    create_attendance(cursor, course_map)
    create_results_and_marks(cursor, course_map)
    create_assignments(cursor, course_map)
    create_notices_grievances_finance(cursor, users)
    create_library_and_placements(cursor)
    create_requests_notifications_and_logs(cursor, users)
    conn.commit()
    conn.close()
    return db_path


if __name__ == "__main__":
    init_db()
    print(f"Database initialized at {DEFAULT_DB_PATH}")
