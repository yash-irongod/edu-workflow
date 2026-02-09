-- =========================
-- Database Initialization
-- Week-1: Users Table
-- =========================

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL
);

-- Clean old data (safe for re-running)
DELETE FROM users;

-- Insert sample users
INSERT INTO users (email, password, role, name) VALUES
('s@x.com', '123', 'student', 'Student One'),
('t@x.com', '123', 'teacher', 'Teacher One'),
('a@x.com', '123', 'admin', 'Admin One');
