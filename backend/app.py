from flask import Flask, request, jsonify
from flask_cors import CORS
from auth import login_user

app = Flask(__name__)
CORS(app)

# --------------------
# Health Check Route
# --------------------
@app.route("/")
def home():
    return "Backend running"

# --------------------
# Login Route
# --------------------
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

    # API_CONTRACT.md compliant response
    return jsonify({
        "role": user["role"],
        "name": user["name"]
    }), 200


# --------------------
# App Runner
# --------------------
if __name__ == "__main__":
    app.run(debug=True)