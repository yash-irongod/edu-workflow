import os
import sqlite3
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# 🔒 ABSOLUTE DATABASE PATH (NO MORE RELATIVE PATHS)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "users.db"))

def get_user(email):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT role, name, password FROM users WHERE email = ?",
        (email,)
    )
    row = cursor.fetchone()
    conn.close()
    return row


@app.route("/login", methods=["POST"])
def login():

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    user = get_user(email)
    if not user:
        return jsonify({"error": "Invalid credentials"}), 401

    role, name, stored_password = user
    if stored_password != password:
        return jsonify({"error": "Invalid credentials"}), 401

    return jsonify({
        "role": role,
        "name": name
    })


if __name__ == "__main__":
    app.run()