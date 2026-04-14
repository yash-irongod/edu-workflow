from functools import wraps

from flask import jsonify, request


def require_role(expected_role):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            role = request.headers.get("X-Role", "").strip().lower()
            user_id = request.headers.get("X-User-Id", "").strip()
            if not role or not user_id:
                return jsonify({"error": "role or user header missing"}), 401
            if role != expected_role.lower():
                return jsonify({"error": "unauthorized"}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator
