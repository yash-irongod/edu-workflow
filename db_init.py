import sqlite3
import os

# Base directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Database path
DB_PATH = os.path.join(BASE_DIR, "users.db")

# SQL file path
SQL_PATH = os.path.join(BASE_DIR, "backend", "db_init.sql")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    with open(SQL_PATH, "r") as f:
        sql_script = f.read()
        cursor.executescript(sql_script)

    conn.commit()
    conn.close()

    print("✅ Database initialized successfully!")

if __name__ == "__main__":
    init_db()