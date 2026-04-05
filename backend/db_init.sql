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
-- =========================
-- FEE TABLE
-- =========================
CREATE TABLE IF NOT EXISTS fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  amount INTEGER,
  status TEXT CHECK(status IN ('paid', 'pending')),
  payment_date TEXT,
  FOREIGN KEY (student_id) REFERENCES users(id)
);
-- =========================
-- GRIEVANCE TABLE
-- =========================
CREATE TABLE IF NOT EXISTS grievances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  subject TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
-- =========================
-- NOTICE TABLE
-- =========================
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  message TEXT,
  created_at TEXT
);
-- =========================
-- PLACEMENT TABLE
-- =========================
CREATE TABLE IF NOT EXISTS placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT,
  role TEXT,
  package INTEGER,
  deadline TEXT
);
-- FEES
INSERT INTO fees (student_id, amount, status, payment_date) VALUES
(1, 50000, 'paid', '2026-03-01');

-- GRIEVANCES
INSERT INTO grievances (user_id, subject, message, status, created_at) VALUES
(1, 'Attendance Issue', 'Attendance not updated', 'pending', '2026-03-20');

-- NOTICES
INSERT INTO notices (title, message, created_at) VALUES
('Holiday', 'College closed tomorrow', '2026-03-22');

-- PLACEMENTS
INSERT INTO placements (company, role, package, deadline) VALUES
('TCS', 'Software Engineer', 700000, '2026-04-10');

-- ========================
-- department TABLE
-- =========================
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);
-- =========================
-- courses TABLE
-- =========================
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT,
  department_id INTEGER,
  teacher_id INTEGER,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (teacher_id) REFERENCES users(id)
);
-- =========================
-- TIME TABLE SLOTS 
-- =========================
CREATE TABLE IF NOT EXISTS timetable_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER,
  day TEXT,
  time TEXT,
  room TEXT,
  FOREIGN KEY (course_id) REFERENCES courses(id)
);
-- =========================
-- Assignment TABLE
-- =========================
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  FOREIGN KEY (course_id) REFERENCES courses(id)
);
-- =========================
-- ASSIGNMENT SUBMISSIONS TABLE
-- =========================
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER,
  student_id INTEGER,
  file TEXT,
  submitted_at TEXT,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id),
  FOREIGN KEY (student_id) REFERENCES users(id)
);
-- =========================
-- STUDY MATERIALS TABLE
-- =========================
CREATE TABLE IF NOT EXISTS study_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER,
  title TEXT,
  file TEXT,
  FOREIGN KEY (course_id) REFERENCES courses(id)
);
-- =========================
-- Library Books TABLE
-- =========================
CREATE TABLE IF NOT EXISTS library_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  author TEXT,
  available INTEGER DEFAULT 1
);
-- =========================
-- LIBRARY LOAN TABLE
-- =========================
CREATE TABLE IF NOT EXISTS library_loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER,
  student_id INTEGER,
  issue_date TEXT,
  return_date TEXT,
  FOREIGN KEY (book_id) REFERENCES library_books(id),
  FOREIGN KEY (student_id) REFERENCES users(id)
);
-- =========================
-- PLACEMENT APPLICATIONS TABLE
-- =========================
CREATE TABLE IF NOT EXISTS placement_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placement_id INTEGER,
  student_id INTEGER,
  status TEXT DEFAULT 'applied',
  FOREIGN KEY (placement_id) REFERENCES placements(id),
  FOREIGN KEY (student_id) REFERENCES users(id)
);
-- =========================
-- SYSTEM SETTINGS TABLE
-- =========================
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT,
  value TEXT
);
-- =========================
-- activity feed TABLE
-- =========================
CREATE TABLE IF NOT EXISTS activity_feed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  activity TEXT,
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
-- =========================
-- AUDIT LOGS TABLE
-- =========================
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
-- ================================
-- 🏢 DEPARTMENTS
-- ================================
INSERT INTO departments (name) VALUES
('Computer Science'),
('Mechanical');

-- ================================
-- 📘 COURSES
-- ================================
INSERT INTO courses (name, code, department_id, teacher_id) VALUES
('B.Tech CSE','CSE101',1,2);

-- ================================
-- 📅 TIMETABLE
-- ================================
INSERT INTO timetable_slots (course_id, day, time, room) VALUES
(1,'Monday','10:00 AM','Room 101'),
(1,'Tuesday','11:00 AM','Room 102');

-- ================================
-- 📝 ASSIGNMENTS
-- ================================
INSERT INTO assignments (course_id, title, description, due_date) VALUES
(1,'Math Assignment','Solve problems','2026-04-10');

-- ================================
-- 📤 ASSIGNMENT SUBMISSIONS
-- ================================
INSERT INTO assignment_submissions (assignment_id, student_id, file, submitted_at) VALUES
(1,1,'assignment1.pdf','2026-04-02');

-- ================================
-- 📚 STUDY MATERIAL
-- ================================
INSERT INTO study_materials (course_id, title, file) VALUES
(1,'Lecture Notes','notes.pdf');

-- ================================
-- 📚 LIBRARY BOOKS
-- ================================
INSERT INTO library_books (title, author, available) VALUES
('Data Structures','Cormen',1);

-- ================================
-- 📚 LIBRARY LOANS
-- ================================
INSERT INTO library_loans (book_id, student_id, issue_date, return_date) VALUES
(1,1,'2026-04-01','2026-04-10');

-- ================================
-- 📊 ACTIVITY FEED
-- ================================
INSERT INTO activity_feed (user_id, activity, created_at) VALUES
(1,'Logged in','2026-04-01'),
(2,'Uploaded assignment','2026-04-02');

-- ================================
-- 🧾 AUDIT LOGS
-- ================================
INSERT INTO audit_logs (user_id, action, created_at) VALUES
(3,'Created course','2026-04-01');

-- ================================
-- ⚙️ SYSTEM SETTINGS
-- ================================
INSERT INTO system_settings (key, value) VALUES
('site_name','EduWorkflow'),
('semester','2');
