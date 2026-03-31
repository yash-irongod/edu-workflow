from flask import Flask, request, jsonify
from flask_cors import CORS
from auth import login_user
from middleware import require_role

app = Flask(__name__)
CORS(app)


# ------------------------
# LOGIN API
# ------------------------

@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()

    if not data:
        return jsonify({"error": "invalid request"}), 400

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "email and password required"}), 400

    user = login_user(email, password)

    if not user:
        return jsonify({"error": "invalid credentials"}), 401

    return jsonify(user)


# ------------------------
# STUDENT DASHBOARD
# ------------------------

@app.route("/api/student/dashboard", methods=["GET"])
@require_role("student")
def student_dashboard():
    return jsonify({
        "attendance": 82,
        "cgpa": 8.4,
        "subjects": 6
    })


# ------------------------
# TEACHER DASHBOARD
# ------------------------

@app.route("/api/teacher/dashboard", methods=["GET"])
@require_role("teacher")
def teacher_dashboard():
    return jsonify({
        "classes": 5,
        "students": 240,
        "pending": 3
    })


# ------------------------
# ADMIN DASHBOARD
# ------------------------

@app.route("/api/admin/dashboard", methods=["GET"])
@require_role("admin")
def admin_dashboard():
    return jsonify({
        "users": 1330,
        "status": "online",
        "reports": 48
    })


# ------------------------
# OPTIONAL APIs (NOT IN CONTRACT — KEEP BUT IGNORE)
# ------------------------

@app.route("/api/student/attendance", methods=["GET"])
@require_role("student")
def get_attendance():
    return jsonify({
        "attendance": 82,
        "total_classes": 100,
        "attended": 82
    })


@app.route("/api/student/marks", methods=["GET"])
@require_role("student")
def get_marks():
    return jsonify({
        "subjects": [
            {"name": "Math", "marks": 85},
            {"name": "Physics", "marks": 78},
            {"name": "CS", "marks": 90}
        ]
    })


@app.route("/api/student/request", methods=["POST"])
@require_role("student")
def create_request():
    data = request.get_json()

    if not data:
        return jsonify({"error": "invalid request"}), 400

    return jsonify({
        "message": "request submitted",
        "status": "pending"
    })


@app.route("/api/admin/approve", methods=["POST"])
@require_role("admin")
def approve_request():
    data = request.get_json()

    if not data:
        return jsonify({"error": "invalid request"}), 400

    return jsonify({
        "message": "request approved"
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "backend running"
    })


if __name__ == "__main__":
    app.run(debug=True)