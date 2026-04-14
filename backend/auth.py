import os

try:
    from .services import login_user as login_with_services
except ImportError:
    from services import login_user as login_with_services


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "users.db"))


def login_user(email, password, db_path=DB_PATH):
    user, error = login_with_services(email, password, db_path)
    return None if error else user
