from werkzeug.security import generate_password_hash, check_password_hash

def hash_password(password):
    return generate_password_hash(password)

def verify_password(hashed, plain):
    return check_password_hash(hashed, plain)

#I have created password hashing for future use by Pranav and you

# Pinki Continue your work after this