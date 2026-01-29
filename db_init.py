import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "users.db")
SQL_PATH = os.path.join(BASE_DIR, "backend", "db_init.sql")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

with open(SQL_PATH, "r") as f:
    cursor.executescript(f.read())

conn.commit()
conn.close()

print("✅ users.db created successfully")