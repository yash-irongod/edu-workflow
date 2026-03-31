from functools import wraps
from flask import request, jsonify


def require_role(expected_role):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):

            role = request.headers.get("X-Role")

            # Missing header
            if not role:
                return jsonify({
                    "error": "role header missing"
                }), 401

            # Wrong role
            if role.lower() != expected_role.lower():
                return jsonify({
                    "error": "unauthorized"
                }), 403

            return fn(*args, **kwargs)

        return wrapper
    return decorator