import os
import sqlite3
from datetime import datetime, timezone


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "users.db")
SQL_PATH = os.path.join(BASE_DIR, "db_init.sql")

def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def seed_if_empty(conn: sqlite3.Connection):
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute("SELECT COUNT(*) AS c FROM users").fetchone()
    if row and row["c"] > 0:
        return

    now = utc_now()

    # Departments
    cur.execute(
        "INSERT INTO departments (code, name, hod_name, active) VALUES (?, ?, ?, 1)",
        ("CSE", "Computer Science & Engineering", "Dr. HOD",),
    )
    dept_id = cur.lastrowid

    # Users
    # NOTE: Passwords are plain-text in this demo DB (as per existing backend logic).
    cur.execute(
        """
        INSERT INTO users (email, password, role, name, roll_no, employee_id, department_id, phone, status, password_reset_required, last_login_at, created_at, updated_at)
        VALUES (?, ?, 'admin', ?, NULL, NULL, ?, ?, 'active', 0, NULL, ?, ?)
        """,
        ("admin@edu.com", "admin123", "Admin", dept_id, "9999999999", now, now),
    )
    admin_id = cur.lastrowid
    cur.execute(
        "INSERT INTO admin_profiles (user_id, title, super_admin) VALUES (?, ?, 1)",
        (admin_id, "System Administrator"),
    )

    cur.execute(
        """
        INSERT INTO users (email, password, role, name, roll_no, employee_id, department_id, phone, status, password_reset_required, last_login_at, created_at, updated_at)
        VALUES (?, ?, 'teacher', ?, NULL, ?, ?, ?, 'active', 0, NULL, ?, ?)
        """,
        ("teacher@edu.com", "teacher123", "Teacher One", "TCH001", dept_id, "9888888888", now, now),
    )
    teacher_id = cur.lastrowid
    cur.execute(
        """
        INSERT INTO teacher_profiles (user_id, designation, specialization, qualification, experience_years, office_room)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (teacher_id, "Assistant Professor", "Software Engineering", "M.Tech", 5, "B-201"),
    )

    cur.execute(
        """
        INSERT INTO users (email, password, role, name, roll_no, employee_id, department_id, phone, status, password_reset_required, last_login_at, created_at, updated_at)
        VALUES (?, ?, 'student', ?, ?, NULL, ?, ?, 'active', 0, NULL, ?, ?)
        """,
        ("student@edu.com", "student123", "Student One", "CSE001", dept_id, "9777777777", now, now),
    )
    student_id = cur.lastrowid
    cur.execute(
        """
        INSERT INTO student_profiles (user_id, program, batch, semester, section, academic_year, cgpa, total_credits, earned_credits, advisor_name, hostel_name, scholarship_status, rank_position, date_of_birth)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            student_id,
            "B.Tech CSE",
            "2025-2029",
            2,
            "A",
            "2025-2026",
            8.2,
            160,
            40,
            "Teacher One",
            "Day Scholar",
            "—",
            12,
            "2006-01-01",
        ),
    )

    # Minimal course + enrollment + timetable slot so dashboards have something to show.
    cur.execute(
        """
        INSERT INTO courses (code, name, department_id, semester, section, credits, teacher_id, capacity, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
        """,
        ("ETCCCH104", "Engineering Chemistry", dept_id, 2, "A", 4, teacher_id, 60),
    )
    course_id = cur.lastrowid
    cur.execute(
        "INSERT INTO course_enrollments (course_id, student_id, status) VALUES (?, ?, 'enrolled')",
        (course_id, student_id),
    )
    cur.execute(
        """
        INSERT INTO timetable_slots (course_id, day_of_week, start_time, end_time, room, slot_type, status, note, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, 'scheduled', NULL, ?, ?)
        """,
        (course_id, "Monday", "09:10", "10:00", "A-101", "Lecture", now, teacher_id),
    )

    conn.commit()


def main():
    if not os.path.exists(SQL_PATH):
        raise SystemExit(f"db_init.sql not found at: {SQL_PATH}")

    with open(SQL_PATH, "r", encoding="utf-8") as f:
        sql = f.read()

    os.makedirs(os.path.dirname(DEFAULT_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    try:
        conn.executescript(sql)
        seed_if_empty(conn)
        conn.commit()
    finally:
        conn.close()

    print(f"Database initialized at: {DEFAULT_DB_PATH}")


if __name__ == "__main__":
    main()

