import os

from flask import Flask, jsonify, request, Response, send_file
from flask_cors import CORS

try:
    from .services import (
        apply_for_placement,
        change_password,
        check_timetable_clashes,
        create_course,
        create_or_update_timetable,
        export_attendance_csv,
        export_courses_csv,
        export_marks_csv,
        generate_student_document,
        create_teacher_assignment,
        create_teacher_notice,
        create_fee_item,
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
        create_department,
        manage_department,
        get_attendance_session,
        get_marks_session,
        get_assignment_submissions,
        notify_student_from_teacher,
        pay_fee_items,
        publish_notice,
        renew_library_loan,
        resolve_grievance,
        resolve_workflow_request,
        resolve_attachment_download,
        enroll_student_to_course,
        remove_student_enrollment,
        reset_user_password,
        submit_assignment,
        submit_grievance,
        submit_student_request,
        submit_teacher_attendance,
        submit_teacher_marks,
        unpublish_notice,
        update_notice,
        update_teacher_assignment,
        delete_teacher_assignment,
        update_assignment_submission,
        update_course,
        update_profile,
        update_settings,
        update_teacher_timetable_slot,
        update_user,
        update_user_status,
        delete_assignment_submission,
    )
except ImportError:
    from services import (
        apply_for_placement,
        change_password,
        check_timetable_clashes,
        create_course,
        create_department,
        create_or_update_timetable,
        export_attendance_csv,
        export_courses_csv,
        export_marks_csv,
        generate_student_document,
        create_teacher_assignment,
        create_teacher_notice,
        create_fee_item,
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
        manage_department,
        get_attendance_session,
        get_marks_session,
        get_assignment_submissions,
        notify_student_from_teacher,
        pay_fee_items,
        publish_notice,
        renew_library_loan,
        resolve_grievance,
        resolve_workflow_request,
        resolve_attachment_download,
        enroll_student_to_course,
        remove_student_enrollment,
        reset_user_password,
        submit_assignment,
        submit_grievance,
        submit_student_request,
        submit_teacher_attendance,
        submit_teacher_marks,
        unpublish_notice,
        update_notice,
        update_teacher_assignment,
        delete_teacher_assignment,
        update_assignment_submission,
        update_course,
        update_profile,
        update_settings,
        update_teacher_timetable_slot,
        update_user,
        update_user_status,
        delete_assignment_submission,
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
        if expected_role == "student":
            if get_setting(app.config["DATABASE_PATH"], "maintenance_mode", "0") == "1":
                return None, json_error("portal under maintenance", 503)
            if get_setting(app.config["DATABASE_PATH"], "student_portal_enabled", "1") == "0":
                return None, json_error("student portal is currently disabled", 503)
        if expected_role == "teacher":
            if get_setting(app.config["DATABASE_PATH"], "maintenance_mode", "0") == "1":
                return None, json_error("portal under maintenance", 503)
            if get_setting(app.config["DATABASE_PATH"], "teacher_portal_enabled", "1") == "0":
                return None, json_error("teacher portal is currently disabled", 503)
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
        profile = get_profile(session["userId"], app.config["DATABASE_PATH"]) or {}
        default_sem = ((profile.get("details") or {}).get("semester") or 6)
        semester = int(request.args.get("semester", default_sem))
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
                attendance_month=request.args.get("month"),
                attendance_date=request.args.get("attendanceDate"),
                attendance_from_date=request.args.get("fromDate"),
                attendance_to_date=request.args.get("toDate"),
            )
        )

    @app.route("/api/student/attendance", methods=["GET"])
    def student_attendance():
        session, error = session_user("student")
        if error:
            return error
        profile = get_profile(session["userId"], app.config["DATABASE_PATH"]) or {}
        default_sem = ((profile.get("details") or {}).get("semester") or 6)
        return jsonify(
            get_student_attendance(
                session["userId"],
                app.config["DATABASE_PATH"],
                semester=int(request.args.get("semester", default_sem)),
                subject=request.args.get("subject"),
                month=request.args.get("month"),
                date_filter=request.args.get("date"),
                date_from=request.args.get("fromDate"),
                date_to=request.args.get("toDate"),
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
            payload = request.get_json(silent=True) or {}
            return jsonify(
                apply_for_placement(
                    session["userId"],
                    placement_id,
                    app.config["DATABASE_PATH"],
                    resume_link=payload.get("resumeLink"),
                    cover_letter=payload.get("coverLetter"),
                )
            )
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/student/assignments/<int:assignment_id>/submit", methods=["POST"])
    def student_submit_assignment(assignment_id):
        session, error = session_user("student")
        if error:
            return error
        try:
            return jsonify(submit_assignment(session["userId"], assignment_id, request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/student/assignments/<int:assignment_id>/submit", methods=["PATCH"])
    def student_update_assignment_submission(assignment_id):
        session, error = session_user("student")
        if error:
            return error
        try:
            return jsonify(update_assignment_submission(session["userId"], assignment_id, request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/student/assignments/<int:assignment_id>/submit", methods=["DELETE"])
    def student_delete_assignment_submission(assignment_id):
        session, error = session_user("student")
        if error:
            return error
        try:
            return jsonify(delete_assignment_submission(session["userId"], assignment_id, app.config["DATABASE_PATH"]))
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

    @app.route("/api/student/documents/<doc_type>", methods=["GET"])
    def student_document(doc_type):
        session, error = session_user("student")
        if error:
            return error
        try:
            return jsonify(generate_student_document(session["userId"], doc_type, app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/files/<item_type>/<int:item_id>", methods=["GET"])
    def download_attachment(item_type, item_id):
        session, error = session_user()
        if error:
            return error
        try:
            data = resolve_attachment_download(
                session["userId"],
                session["role"],
                item_type,
                item_id,
                app.config["DATABASE_PATH"],
            )
        except ValueError as exc:
            return json_error(str(exc), 400)
        if data["mode"] == "file":
            return send_file(data["path"], as_attachment=True, download_name=data["filename"])
        return jsonify(data)

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
        return jsonify(
            get_teacher_attendance(
                session["userId"],
                app.config["DATABASE_PATH"],
                course_id=request.args.get("courseId"),
                date_filter=request.args.get("date"),
                from_date=request.args.get("fromDate"),
                to_date=request.args.get("toDate"),
            )
        )

    @app.route("/api/teacher/attendance/session", methods=["GET"])
    def teacher_attendance_session():
        """Return per-student attendance for a specific course+date so the form can preload."""
        session, error = session_user("teacher")
        if error:
            return error
        course_id = request.args.get("courseId")
        date_val = request.args.get("date")
        if not course_id or not date_val:
            return json_error("courseId and date required", 400)
        return jsonify(get_attendance_session(session["userId"], int(course_id), date_val, app.config["DATABASE_PATH"]))

    @app.route("/api/teacher/marks/session", methods=["GET"])
    def teacher_marks_session():
        """Return per-student marks for a specific course+exam type so the form can preload."""
        session, error = session_user("teacher")
        if error:
            return error
        course_id = request.args.get("courseId")
        exam_type = request.args.get("examType")
        if not course_id or not exam_type:
            return json_error("courseId and examType required", 400)
        return jsonify(get_marks_session(session["userId"], int(course_id), exam_type, app.config["DATABASE_PATH"]))

    @app.route("/api/teacher/assignments/<int:assignment_id>/submissions", methods=["GET"])
    def teacher_assignment_submissions(assignment_id):
        """Return all student submissions for a specific assignment."""
        session, error = session_user("teacher")
        if error:
            return error
        return jsonify(get_assignment_submissions(session["userId"], assignment_id, app.config["DATABASE_PATH"]))

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

    @app.route("/api/teacher/assignments/<int:assignment_id>", methods=["PATCH"])
    def teacher_assignment_update(assignment_id):
        session, error = session_user("teacher")
        if error:
            return error
        try:
            return jsonify(update_teacher_assignment(session["userId"], assignment_id, request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/teacher/assignments/<int:assignment_id>", methods=["DELETE"])
    def teacher_assignment_delete(assignment_id):
        session, error = session_user("teacher")
        if error:
            return error
        try:
            return jsonify(delete_teacher_assignment(session["userId"], assignment_id, app.config["DATABASE_PATH"]))
        except ValueError as exc:
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

    @app.route("/api/admin/users/<int:target_user_id>", methods=["PATCH"])
    def admin_update_user(target_user_id):
        session, error = session_user("admin")
        if error:
            return error
        try:
            return jsonify(update_user(session["userId"], target_user_id, request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
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

    @app.route("/api/admin/courses", methods=["POST"])
    def admin_create_course():
        session, error = session_user("admin")
        if error:
            return error
        try:
            return jsonify(create_course(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/courses/export", methods=["GET"])
    def admin_export_courses():
        session, error = session_user("admin")
        if error:
            return error
        csv_data = export_courses_csv(app.config["DATABASE_PATH"])
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=courses-export.csv"},
        )

    @app.route("/api/admin/reports/attendance-export", methods=["GET"])
    def admin_export_attendance():
        session, error = session_user("admin")
        if error:
            return error
        csv_data = export_attendance_csv(app.config["DATABASE_PATH"])
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=attendance-report.csv"},
        )

    @app.route("/api/admin/reports/marks-export", methods=["GET"])
    def admin_export_marks():
        session, error = session_user("admin")
        if error:
            return error
        csv_data = export_marks_csv(app.config["DATABASE_PATH"])
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=marks-summary.csv"},
        )

    @app.route("/api/admin/departments", methods=["POST"])
    def admin_create_department():
        session, error = session_user("admin")
        if error:
            return error
        try:
            return jsonify(create_department(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except (KeyError, ValueError) as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/departments/<int:department_id>", methods=["PATCH"])
    def admin_manage_department(department_id):
        session, error = session_user("admin")
        if error:
            return error
        try:
            return jsonify(manage_department(session["userId"], department_id, request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
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

    @app.route("/api/admin/timetable/clashes", methods=["GET"])
    def admin_timetable_clashes():
        session, error = session_user("admin")
        if error:
            return error
        return jsonify(check_timetable_clashes(app.config["DATABASE_PATH"]))

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

    @app.route("/api/admin/notices/<int:notice_id>", methods=["PATCH"])
    def admin_notice_update(notice_id):
        session, error = session_user("admin")
        if error:
            return error
        try:
            return jsonify(update_notice(session["userId"], notice_id, request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/grievances/<int:grievance_id>/resolve", methods=["POST"])
    def admin_resolve_grievance(grievance_id):
        session, error = session_user("admin")
        if error:
            return error
        try:
            payload = request.get_json(silent=True) or {}
            return jsonify(
                resolve_grievance(
                    session["userId"],
                    grievance_id,
                    payload.get("resolutionNote", ""),
                    app.config["DATABASE_PATH"],
                    status=payload.get("status", "resolved"),
                )
            )
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/workflow-requests/<int:request_id>/review", methods=["POST"])
    def admin_review_workflow_request(request_id):
        session, error = session_user("admin")
        if error:
            return error
        try:
            payload = request.get_json(silent=True) or {}
            return jsonify(
                resolve_workflow_request(
                    session["userId"],
                    request_id,
                    payload.get("decision", ""),
                    payload.get("reviewNote", ""),
                    app.config["DATABASE_PATH"],
                )
            )
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/fees", methods=["POST"])
    def admin_create_fee_items():
        session, error = session_user("admin")
        if error:
            return error
        try:
            return jsonify(create_fee_item(session["userId"], request.get_json(silent=True) or {}, app.config["DATABASE_PATH"]))
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/enrollments", methods=["POST"])
    def admin_enroll_student():
        session, error = session_user("admin")
        if error:
            return error
        payload = request.get_json(silent=True) or {}
        try:
            return jsonify(
                enroll_student_to_course(
                    session["userId"],
                    int(payload.get("studentId")),
                    int(payload.get("courseId")),
                    app.config["DATABASE_PATH"],
                )
            )
        except ValueError as exc:
            return json_error(str(exc), 400)

    @app.route("/api/admin/enrollments", methods=["DELETE"])
    def admin_unenroll_student():
        session, error = session_user("admin")
        if error:
            return error
        payload = request.get_json(silent=True) or {}
        try:
            return jsonify(
                remove_student_enrollment(
                    session["userId"],
                    int(payload.get("studentId")),
                    int(payload.get("courseId")),
                    app.config["DATABASE_PATH"],
                )
            )
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
    # Bind on all interfaces so frontend served via Live Server (LAN IP) can reach backend.
    app.run(host="0.0.0.0", port=5000, debug=True)
