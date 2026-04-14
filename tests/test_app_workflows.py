import os
import sqlite3
import tempfile
import unittest

from backend.app import create_app
from db_init import init_db


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        init_db(self.db_path)
        app = create_app(self.db_path)
        app.config["TESTING"] = True
        self.client = app.test_client()

    def tearDown(self):
        if os.path.exists(self.db_path):
            try:
                os.remove(self.db_path)
            except PermissionError:
                pass

    def login_headers(self, email, password):
        response = self.client.post("/login", json={"email": email, "password": password})
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        return {
            "X-Role": payload["role"],
            "X-User-Id": str(payload["userId"]),
        }, payload

    def test_login_returns_expanded_session_payload(self):
        response = self.client.post("/login", json={"email": "s@x.com", "password": "123"})
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["role"], "student")
        self.assertGreater(payload["userId"], 0)
        self.assertEqual(payload["rollNo"], "2024CS0472")
        self.assertEqual(payload["name"], "Priya Sharma")

    def test_role_boundaries_block_student_from_admin_dashboard(self):
        headers, _ = self.login_headers("s@x.com", "123")
        response = self.client.get("/api/admin/dashboard", headers=headers)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.get_json()["error"], "unauthorized")

    def test_maintenance_mode_blocks_student_but_not_admin(self):
        admin_headers, _ = self.login_headers("a@x.com", "123")
        student_headers, _ = self.login_headers("s@x.com", "123")

        update_response = self.client.patch(
            "/api/admin/settings",
            headers=admin_headers,
            json={"maintenance_mode": "1"},
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.get_json()["maintenance_mode"], "1")

        student_dashboard = self.client.get("/api/student/dashboard", headers=student_headers)
        self.assertEqual(student_dashboard.status_code, 503)

        blocked_login = self.client.post("/login", json={"email": "s@x.com", "password": "123"})
        self.assertEqual(blocked_login.status_code, 403)
        self.assertEqual(blocked_login.get_json()["error"], "portal under maintenance")

        admin_dashboard = self.client.get("/api/admin/dashboard", headers=admin_headers)
        self.assertEqual(admin_dashboard.status_code, 200)

    def test_teacher_marks_update_student_results(self):
        teacher_headers, _ = self.login_headers("t@x.com", "123")
        student_headers, student_payload = self.login_headers("s@x.com", "123")

        before = self.client.get("/api/student/dashboard?semester=6", headers=student_headers).get_json()
        deep_learning_before = next(item for item in before["results"]["items"] if item["code"] == "CS611")

        marks_response = self.client.post(
            "/api/teacher/marks",
            headers=teacher_headers,
            json={
                "courseId": 7,
                "examType": "Internal Exam 1",
                "maxScore": 50,
                "records": [
                    {
                        "studentId": student_payload["userId"],
                        "score": 49,
                        "remark": "Excellent recovery",
                    }
                ],
            },
        )
        self.assertEqual(marks_response.status_code, 200)

        after = self.client.get("/api/student/dashboard?semester=6", headers=student_headers).get_json()
        deep_learning_after = next(item for item in after["results"]["items"] if item["code"] == "CS611")

        self.assertGreater(deep_learning_after["internal_score"], deep_learning_before["internal_score"])
        self.assertGreater(deep_learning_after["total_score"], deep_learning_before["total_score"])

    def test_student_dashboard_keeps_attendance_and_results_semesters_separate(self):
        student_headers, _ = self.login_headers("s@x.com", "123")

        response = self.client.get(
            "/api/student/dashboard?attendanceSemester=6&resultsSemester=5",
            headers=student_headers,
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()

        self.assertEqual(payload["results"]["semester"], 5)
        self.assertGreater(len(payload["attendance"]["items"]), 0)
        self.assertEqual(len(payload["results"]["items"]), 0)

    def test_student_attendance_returns_daywise_groups_and_date_filter(self):
        student_headers, _ = self.login_headers("s@x.com", "123")

        response = self.client.get(
            "/api/student/attendance?semester=6&date=2026-04-14",
            headers=student_headers,
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()

        self.assertEqual(payload["filters"]["date"], "2026-04-14")
        self.assertGreater(len(payload["sessions"]), 0)
        self.assertGreater(len(payload["daywise"]), 0)
        self.assertTrue(all(item["session_date"] == "2026-04-14" for item in payload["sessions"]))
        self.assertEqual(payload["daywise"][0]["date"], "2026-04-14")
        self.assertEqual(payload["daywise"][0]["sessionCount"], len(payload["sessions"]))

    def test_admin_user_lifecycle_actions_are_persisted(self):
        admin_headers, _ = self.login_headers("a@x.com", "123")

        create_response = self.client.post(
            "/api/admin/users",
            headers=admin_headers,
            json={
                "name": "Ravi Tiwari",
                "email": "ravi.tiwari@edu.in",
                "role": "student",
                "department": "CSE",
                "section": "A",
                "password": "welcome123",
            },
        )
        self.assertEqual(create_response.status_code, 200)
        user_id = create_response.get_json()["userId"]

        suspend_response = self.client.patch(
            f"/api/admin/users/{user_id}/status",
            headers=admin_headers,
            json={"status": "suspended"},
        )
        self.assertEqual(suspend_response.status_code, 200)

        reset_response = self.client.post(
            f"/api/admin/users/{user_id}/reset-password",
            headers=admin_headers,
            json={"newPassword": "reset999"},
        )
        self.assertEqual(reset_response.status_code, 200)

        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT status, password, password_reset_required FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
            self.assertEqual(row[0], "suspended")
            self.assertEqual(row[1], "reset999")
            self.assertEqual(row[2], 1)


if __name__ == "__main__":
    unittest.main()
