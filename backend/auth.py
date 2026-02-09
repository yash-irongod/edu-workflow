from werkzeug.security import generate_password_hash, check_password_hash

# --------------------
# Temporary In-Memory Users (Week-1)
# --------------------
# Later replace with real DB
users_db = {
    "admin@gmail.com": {
        "password": "admin123",
        "role": "admin",
        "name": "Admin User"
    },
    "user@gmail.com": {
        "password": "user123",
        "role": "student",
        "name": "Student User"
    }
}

# --------------------
# Password Utilities (Future Use)
# --------------------
def hash_password(password):
    return generate_password_hash(password)

def verify_password(hashed, plain):
    return check_password_hash(hashed, plain)

# --------------------
# Login Logic
# --------------------
def login_user(email, password):
    user = users_db.get(email)

    if not user:
        return None

    # Week-1: plain password check
    if user["password"] != password:
        return None

    return {
        "role": user["role"],
        "name": user["name"]
    }