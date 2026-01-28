from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# --------------------
# Health Check Route
# --------------------
@app.route("/")
def home():
    return "Backend running"

# --------------------
# Login Route (Stub)
# --------------------
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()

    if not data:
        return jsonify({"error": "invalid request"}), 400

    # Temporary hardcoded login (Week-1)
    if data.get("email") == "s@x.com" and data.get("password") == "123":
        return jsonify({
            "role": "student",
            "name": "Student One"
        })

    return jsonify({"error": "invalid credentials"}), 401


# --------------------
# App Runner
# --------------------
if __name__ == "__main__":
    app.run(debug=True)

# PINKI CONTINUE DB LOGIC AND ALL AFTER THIS I HAVE MADE BASIC