-- =====================================================
-- Database Initialization Script
-- Project: Edu Workflow System
-- Purpose: Create users table and insert sample users
-- =====================================================

-- STEP 1: Create users table
-- This table stores all users who can log in to the system

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    name TEXT NOT NULL
);

-- -----------------------------------------------------
-- STEP 2: Insert sample users
-- These are demo users for Week-1 login testing
-- Passwords are plain text for now (hashed later)
-- -----------------------------------------------------

INSERT INTO users (id, email, password, role, name) VALUES
(1, 's@x.com', '123', 'student', 'Student One'),
(2, 't@x.com', '123', 'teacher', 'Teacher One'),
(3, 'a@x.com', '123', 'admin', 'Admin One');

-- -----------------------------------------------------
-- End of file
-- -----------------------------------------------------
