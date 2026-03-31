-- =========================
-- CLEAN START
-- =========================
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS marks;
DROP TABLE IF EXISTS workflow_requests;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS notifications;

-- =========================
-- USERS
-- =========================
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL
);

-- =========================
-- SUBJECTS
-- =========================
CREATE TABLE subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  teacher_id INTEGER,
  FOREIGN KEY (teacher_id) REFERENCES users(id)
);

-- =========================
-- CLASSES
-- =========================
CREATE TABLE classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER,
  teacher_id INTEGER,
  name TEXT,
  FOREIGN KEY (subject_id) REFERENCES subjects(id),
  FOREIGN KEY (teacher_id) REFERENCES users(id)
);

-- =========================
-- ATTENDANCE
-- =========================
CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- =========================
-- MARKS
-- =========================
CREATE TABLE marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  exam_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- =========================
-- WORKFLOW REQUESTS
-- =========================
CREATE TABLE workflow_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  type TEXT,
  status TEXT,
  created_at TEXT,
  FOREIGN KEY (student_id) REFERENCES users(id)
);

-- =========================
-- REPORTS
-- =========================
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  content TEXT,
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- =========================
-- NOTIFICATIONS
-- =========================
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  message TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- =========================
-- SAMPLE USERS
-- =========================
INSERT INTO users (email, password, role, name) VALUES
('s@x.com', '123', 'student', 'Student One'),
('t@x.com', '123', 'teacher', 'Teacher One'),
('a@x.com', '123', 'admin', 'Admin One');

-- =========================
-- SAMPLE SUBJECTS
-- =========================
INSERT INTO subjects (name, code, teacher_id) VALUES
('Mathematics', 'M101', 2),
('Physics', 'P101', 2),
('Computer Science', 'CS101', 2);

-- =========================
-- SAMPLE CLASSES
-- =========================
INSERT INTO classes (subject_id, teacher_id, name) VALUES
(1, 2, 'Class A'),
(2, 2, 'Class B'),
(3, 2, 'Class C');

-- =========================
-- SAMPLE ATTENDANCE
-- =========================
INSERT INTO attendance (student_id, subject_id, date, status) VALUES
(1, 1, '2026-03-01', 'present'),
(1, 1, '2026-03-02', 'absent'),
(1, 2, '2026-03-01', 'present'),
(1, 3, '2026-03-03', 'present');

-- =========================
-- SAMPLE MARKS
-- =========================
INSERT INTO marks (student_id, subject_id, exam_name, score, max_score) VALUES
(1, 1, 'Midterm', 78, 100),
(1, 2, 'Midterm', 85, 100),
(1, 3, 'Midterm', 90, 100);

-- =========================
-- SAMPLE WORKFLOW REQUESTS
-- =========================
INSERT INTO workflow_requests (student_id, type, status, created_at) VALUES
(1, 'Leave Request', 'Pending', '2026-03-20'),
(1, 'Re-evaluation', 'Approved', '2026-03-18'),
(1, 'Bonafide Certificate', 'Pending', '2026-03-22');

-- =========================
-- SAMPLE REPORTS
-- =========================
INSERT INTO reports (user_id, content, created_at) VALUES
(1, 'Performance report generated', '2026-03-21');

-- =========================
-- SAMPLE NOTIFICATIONS
-- =========================
INSERT INTO notifications (user_id, message, created_at) VALUES
(1, 'New marks uploaded', '2026-03-22');