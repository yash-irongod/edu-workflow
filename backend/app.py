import os

from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from .services import (
        apply_for_placement,
        change_password,
        create_or_update_timetable,
        create_teacher_assignment,
        create_teacher_notice,
        create_user,
        get_admin_dashboard,
        get_notifications,
        get_profile,
        get_setting,
        get_settings,
        get_student_attendance,
        get_student_dashboard,
        get_teacher_attendance,
        get_teacher_dashboard,
        login_user,
        mark_notification_read,
        notify_student_from_teacher,
        pay_fee_items,
        publish_notice,
        renew_library_loan,
        resolve_grievance,
        reset_user_password,
        submit_grievance,
        submit_student_request,
        submit_teacher_attendance,
        submit_teacher_marks,
        unpublish_notice,
        update_course,
        update_profile,
        update_settings,
        update_teacher_timetable_slot,
        update_user_status,
    )
except ImportError:
    from services import (
        apply_for_placement,
        change_password,
        create_or_update_timetable,
        create_teacher_assignment,
        create_teacher_notice,
        create_user,
        get_admin_dashboard,
        get_notifications,
        get_profile,
        get_setting,
        get_settings,
        get_student_attendance,
        get_student_dashboard,
        get_teacher_attendance,
        get_teacher_dashboard,
        login_user,
        mark_notification_read,
        notify_student_from_teacher,
        pay_fee_items,
        publish_notice,
        renew_library_loan,
        resolve_grievance,
        reset_user_password,
        submit_grievance,
        submit_student_request,
        submit_teacher_attendance,
        submit_teacher_marks,
        unpublish_notice,
        update_course,
        update_profile,
        update_settings,
        update_teacher_timetable_slot,
        update_user_status,
    )


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "users.db"))


def create_app(database_path=None):
    app = Flask(__name__)
    app.config["DATABASE_PATH"] = database_path or os.environ.get("EDU_WORKFLOW_DB_PATH", DEFAULT_DB_PATH)
    CORS(app)

    def json_error(message, status=400):
        return jsonify({"error": message}), status

    def session_user(expected_role=None):
        role = request.headers.get("X-Role", "").strip().lower()
        user_id = request.headers.get("X-User-Id", "").strip()
        if expected_role and role != expected_role:
            return None, json_error("unauthorized", 403)
        if not role or not user_id.isdigit():
            return None, json_error("role or user header missing", 401)
        if expected_role in {"student", "teacher"} and get_setting(app.config["DATABASE_PATH"], "maintenance_mode", "0") == "1":
            return None, json_error("portal under maintenance", 503)
        return {"role": role, "userId": int(user_id)}, None

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "backend running", "database": app.config["DATABASE_PATH"]})

    @app.route("/login", methods=["POST"])
    def login():
        data = request.get_json(silent=True) or {}
        email = data.get("email", "").strip()
        password = data.get("password", "").strip()
        if not email or not password:
            return json_error("email and password required")
        user, error = login_user(email, password, app.config["DATABASE_PATH"])
        if error:
            return json_error(error, 403 if error == "portal under maintenance" else 401)
        return jsonify(user)

    @app.route("/api/me", methods=["GET"])
    def me():
        session, error = session_user()
        if error:
            return error
        return jsonify(get_profile(session["userId"], app.config["DATABASE_PATH"]))

    @app.route("/api/me", methods=["PATCH"])
    def update_me():
        session, error = session_user()
        if error:
            return error
        return jsonify(update_profile(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))

    @app.route("/api/me/change-password", methods=["POST"])
    def change_my_password():
        session, error = session_user()
        if error:
            return error
        data = request.get_json(silent=True) or {}
        try:
            result = change_password(session["userId"], data.get("currentPassword", ""), data.get("newPassword", ""), app.config["DATABASE_PATH"])
        except ValueError as exc:
            return json_error(str(exc), 400)
        return jsonify(result)

    @app.route("/api/me/notifications", methods=["GET"])
    def my_notifications():
        session, error = session_user()
        if error:
            return error
        return jsonify(get_notifications(session["userId"], app.config["DATABASE_PATH"]))

    @app.route("/api/me/notifications/<int:notification_id>/read", methods=["POST"])
    def read_notification(notification_id):
        session, error = session_user()
        if error:
            return error
        return jsonify(mark_notification_read(session["userId"], notification_id, app.config["DATABASE_PATH"]))

    @app.route("/api/student/dashboard", methods=["GET"])
    def student_dashboard():
        session, error = session_user("student")
        if error:
            return error
        semester = int(request.args.get("semester", 6))
        return jsonify(
            get_student_dashboard(
                session["userId"],
                app.config["DATABASE_PATH"],
                attendance_semester=int(request.args.get("attendanceSemester", semester)),
                results_semester=int(request.args.get("resultsSemester", semester)),
                attendance_subject=request.args.get("subject"),
                attendance_view=request.args.get("attendanceView", "overall"),
                timetable_view=request.args.get("timetableView", "day"),
                timetable_date=request.args.get("date"),
            )
        )

    @app.route("/api/student/attendance", methods=["GET"])
    def student_attendance():
        session, error = session_user("student")
        if error:
            return error
        return jsonify(
            get_student_attendance(
                session["userId"],
                app.config["DATABASE_PATH"],
                semester=int(request.args.get("semester", 6)),
                subject=request.args.get("subject"),
                month=request.args.get("month"),
                date_filter=request.args.get("date"),
            )
        )

    @app.route("/api/student/requests", methods=["POST"])
    def student_request():
        session, error = session_user("student")
        if error:
            return error
        try:
            return jsonify(submit_student_request(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except (KeyError, ValueError) as exc:
            return json_error(str(exc), 400)

    @app.route("/api/student/grievances", methods=["POST"])
    def student_grievance():
        session, error = session_user("student")
        if error:
            return error
        try:
            return jsonify(submit_grievance(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except (KeyError, ValueError) as exc:
            return json_error(str(exc), 400)

    @app.route("/api/student/fees/pay", methods=["POST"])
    def student_fee_payment():
        session, error = session_user("student")
        if error:
            return error
        try:
            return jsonify(pay_fee_items(session["userId"], (request.get_json(silent=True) or {}).get("feeIds", []), app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/student/placements/<int:placement_id>/apply", methods=["POST"])
    def student_apply_placement(placement_id):
        session, error = session_user("student")
        if error:
            return error
        try:
            return jsonify(apply_for_placement(session["userId"], placement_id, app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/student/library/<int:loan_id>/renew", methods=["POST"])
    def student_renew_library(loan_id):
        session, error = session_user("student")
        if error:
            return error
        try:
            return jsonify(renew_library_loan(session["userId"], loan_id, app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/teacher/dashboard", methods=["GET"])
    def teacher_dashboard():
        session, error = session_user("teacher")
        if error:
            return error
        return jsonify(get_teacher_dashboard(session["userId"], app.config["DATABASE_PATH"]))

    @app.route("/api/teacher/attendance", methods=["GET"])
    def teacher_attendance():
        session, error = session_user("teacher")
        if error:
            return error
        return jsonify(get_teacher_attendance(session["userId"], app.config["DATABASE_PATH"], course_id=request.args.get("courseId"), date_filter=request.args.get("date")))

    @app.route("/api/teacher/attendance", methods=["POST"])
    def teacher_attendance_submit():
        session, error = session_user("teacher")
        if error:
            return error
        try:
            return jsonify(submit_teacher_attendance(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except (KeyError, ValueError) as exc:
            return json_error(str(exc), 400)

    @app.route("/api/teacher/marks", methods=["POST"])
    def teacher_marks_submit():
        session, error = session_user("teacher")
        if error:
            return error
        try:
            return jsonify(submit_teacher_marks(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except (KeyError, ValueError) as exc:
            return json_error(str(exc), 400)

    @app.route("/api/teacher/assignments", methods=["POST"])
    def teacher_assignment_submit():
        session, error = session_user("teacher")
        if error:
            return error
        try:
            return jsonify(create_teacher_assignment(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except (KeyError, ValueError) as exc:
            return json_error(str(exc), 400)

    @app.route("/api/teacher/notifications", methods=["POST"])
    def teacher_contact_student():
        session, error = session_user("teacher")
        if error:
            return error
        try:
            return jsonify(notify_student_from_teacher(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except (KeyError, ValueError) as exc:
            return json_error(str(exc), 400)

    @app.route("/api/teacher/timetable/<int:slot_id>", methods=["PATCH"])
    def teacher_update_timetable(slot_id):
        session, error = session_user("teacher")
        if error:
            return error
        try:
            return jsonify(update_teacher_timetable_slot(session["userId"], slot_id, request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/teacher/notices", methods=["POST"])
    def teacher_notice_publish():
        session, error = session_user("teacher")
        if error:
            return error
        try:
            return jsonify(create_teacher_notice(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except (KeyError, ValueError) as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/dashboard", methods=["GET"])
    def admin_dashboard():
        session, error = session_user("admin")
        if error:
            return error
        return jsonify(get_admin_dashboard(session["userId"], app.config["DATABASE_PATH"]))

    @app.route("/api/admin/users", methods=["POST"])
    def admin_create_user():
        session, error = session_user("admin")
        if error:
            return error
        try:
            return jsonify(create_user(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except (KeyError, ValueError) as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/users/<int:target_user_id>/status", methods=["PATCH"])
    def admin_update_user_status(target_user_id):
        session, error = session_user("admin")
        if error:
            return error
        try:
            return jsonify(update_user_status(session["userId"], target_user_id, (request.get_json(silent=True) or {}).get("status"), app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/users/<int:target_user_id>/reset-password", methods=["POST"])
    def admin_reset_password(target_user_id):
        session, error = session_user("admin")
        if error:
            return error
        return jsonify(reset_user_password(session["userId"], target_user_id, (request.get_json(silent=True) or {}).get("newPassword", "temp1234"), app.config["DATABASE_PATH"]))

    @app.route("/api/admin/courses/<int:course_id>", methods=["PATCH"])
    def admin_course_update(course_id):
        session, error = session_user("admin")
        if error:
            return error
        try:
            return jsonify(update_course(session["userId"], course_id, request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/timetable", methods=["POST"])
    def admin_timetable_create():
        session, error = session_user("admin")
        if error:
            return error
        try:
            return jsonify(create_or_update_timetable(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except (KeyError, ValueError) as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/timetable/<int:slot_id>", methods=["PATCH"])
    def admin_timetable_update(slot_id):
        session, error = session_user("admin")
        if error:
            return error
        try:
            return jsonify(create_or_update_timetable(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"], slot_id=slot_id))
        except (KeyError, ValueError) as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/notices", methods=["POST"])
    def admin_notice_publish():
        session, error = session_user("admin")
        if error:
            return error
        try:
            return jsonify(publish_notice(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except (KeyError, ValueError) as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/notices/<int:notice_id>", methods=["DELETE"])
    def admin_notice_unpublish(notice_id):
        session, error = session_user("admin")
        if error:
            return error
        return jsonify(unpublish_notice(session["userId"], notice_id, app.config["DATABASE_PATH"]))

    @app.route("/api/admin/grievances/<int:grievance_id>/resolve", methods=["POST"])
    def admin_resolve_grievance(grievance_id):
        session, error = session_user("admin")
        if error:
            return error
        try:
            return jsonify(resolve_grievance(session["userId"], grievance_id, (request.get_json(silent=True) or {}).get("resolutionNote", ""), app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/settings", methods=["GET"])
    def admin_settings_get():
        session, error = session_user("admin")
        if error:
            return error
        return jsonify(get_settings(app.config["DATABASE_PATH"]))

    @app.route("/api/admin/settings", methods=["PATCH"])
    def admin_settings_update():
        session, error = session_user("admin")
        if error:
            return error
        return jsonify(update_settings(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
