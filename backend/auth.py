import os
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash

# --------------------
# DB CONFIG
# --------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "users.db"))

# --------------------
# DB Connection Helper
# --------------------
def get_connection():
    return sqlite3.connect(DB_PATH)

# --------------------
# Get User from DB
# --------------------
def get_user(email):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT role, name, password FROM users WHERE email = ?",
        (email,)
    )

    user = cursor.fetchone()
    conn.close()

    return user

# --------------------
# Password Utilities (FUTURE READY)
# --------------------
def hash_password(password):
    return generate_password_hash(password)

def verify_password(hashed, plain):
    return check_password_hash(hashed, plain)

# --------------------
# Login Logic (DB BASED)
# --------------------
def login_user(email, password):
    email = email.strip()
    password = password.strip()

    user = get_user(email)

    if not user:
        return None

    role, name, stored_password = user

    # Week-1 → plain match
    if stored_password != password:
        return None

    # Future upgrade (when hashed):
    # if not verify_password(stored_password, password):
    #     return None

    return {
        "role": role,
        "name": name
    }