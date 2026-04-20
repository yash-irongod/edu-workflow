PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS workflow_requests;
DROP TABLE IF EXISTS placement_applications;
DROP TABLE IF EXISTS placements;
DROP TABLE IF EXISTS library_loans;
DROP TABLE IF EXISTS library_books;
DROP TABLE IF EXISTS study_materials;
DROP TABLE IF EXISTS exam_schedule;
DROP TABLE IF EXISTS teacher_student_actions;
DROP TABLE IF EXISTS fee_items;
DROP TABLE IF EXISTS scholarship_awards;
DROP TABLE IF EXISTS grievances;
DROP TABLE IF EXISTS notices;
DROP TABLE IF EXISTS assignment_submissions;
DROP TABLE IF EXISTS assignments;
DROP TABLE IF EXISTS marks;
DROP TABLE IF EXISTS assessments;
DROP TABLE IF EXISTS course_results;
DROP TABLE IF EXISTS semester_performance;
DROP TABLE IF EXISTS attendance_records;
DROP TABLE IF EXISTS attendance_sessions;
DROP TABLE IF EXISTS timetable_slots;
DROP TABLE IF EXISTS course_enrollments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS admin_profiles;
DROP TABLE IF EXISTS teacher_profiles;
DROP TABLE IF EXISTS student_profiles;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS system_settings;

PRAGMA foreign_keys = ON;

CREATE TABLE departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  hod_name TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  name TEXT NOT NULL,
  roll_no TEXT UNIQUE,
  employee_id TEXT UNIQUE,
  department_id INTEGER,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  password_reset_required INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE student_profiles (
  user_id INTEGER PRIMARY KEY,
  program TEXT NOT NULL,
  batch TEXT NOT NULL,
  semester INTEGER NOT NULL,
  section TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  cgpa REAL NOT NULL,
  total_credits INTEGER NOT NULL,
  earned_credits INTEGER NOT NULL,
  attendance_threshold INTEGER NOT NULL DEFAULT 75,
  advisor_name TEXT,
  hostel_name TEXT,
  scholarship_status TEXT,
  rank_position INTEGER,
  date_of_birth TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE teacher_profiles (
  user_id INTEGER PRIMARY KEY,
  designation TEXT NOT NULL,
  specialization TEXT NOT NULL,
  qualification TEXT NOT NULL,
  experience_years INTEGER NOT NULL,
  office_room TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE admin_profiles (
  user_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  super_admin INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  department_id INTEGER NOT NULL,
  semester INTEGER NOT NULL,
  section TEXT NOT NULL,
  credits INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'review', 'archived')),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (teacher_id) REFERENCES users(id)
);

CREATE TABLE course_enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'dropped')),
  UNIQUE (course_id, student_id),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE timetable_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  day_of_week TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  room TEXT NOT NULL,
  slot_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'updated', 'cancelled')),
  note TEXT,
  updated_at TEXT NOT NULL,
  updated_by INTEGER,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE attendance_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  timetable_slot_id INTEGER,
  session_date TEXT NOT NULL,
  delivered_count INTEGER NOT NULL DEFAULT 1,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (timetable_slot_id) REFERENCES timetable_slots(id)
);

CREATE TABLE attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'medical_leave')),
  remark TEXT,
  UNIQUE (session_id, student_id),
  FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE semester_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  semester INTEGER NOT NULL,
  academic_year TEXT NOT NULL,
  sgpa REAL NOT NULL,
  cgpa REAL NOT NULL,
  credits_registered INTEGER NOT NULL,
  credits_earned INTEGER NOT NULL,
  rank_position INTEGER NOT NULL,
  UNIQUE (student_id, semester),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE course_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  semester INTEGER NOT NULL,
  academic_year TEXT NOT NULL,
  internal_score REAL NOT NULL,
  external_score REAL NOT NULL,
  total_score REAL NOT NULL,
  grade_letter TEXT NOT NULL,
  grade_point REAL NOT NULL,
  credits INTEGER NOT NULL,
  published_on TEXT NOT NULL,
  UNIQUE (student_id, course_id, semester),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  exam_type TEXT NOT NULL,
  max_score INTEGER NOT NULL,
  semester INTEGER NOT NULL,
  published_on TEXT NOT NULL,
  UNIQUE (course_id, exam_type, semester),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id)
);

CREATE TABLE marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  score REAL NOT NULL,
  remark TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (assessment_id, student_id),
  FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  due_date TEXT NOT NULL,
  max_score INTEGER NOT NULL,
  attachment_name TEXT,
  attachment_path TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id)
);

CREATE TABLE assignment_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'graded', 'late')),
  score REAL,
  submission_text TEXT,
  attachment_name TEXT,
  attachment_path TEXT,
  submitted_at TEXT,
  feedback TEXT,
  UNIQUE (assignment_id, student_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  audience TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  published_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (published_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE grievances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_by INTEGER NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  attachment_name TEXT,
  attachment_path TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  assigned_to INTEGER,
  resolution_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submitted_by) REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

CREATE TABLE scholarship_awards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'credited', 'pending')),
  disbursed_at TEXT,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE fee_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  fee_head TEXT NOT NULL,
  term_label TEXT NOT NULL,
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'scholarship_adjusted')),
  paid_at TEXT,
  transaction_ref TEXT,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE library_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  isbn TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT NOT NULL,
  total_copies INTEGER NOT NULL,
  available_copies INTEGER NOT NULL
);

CREATE TABLE library_loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  returned_at TEXT,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'overdue', 'returned', 'renewal_requested')),
  fine_amount REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (book_id) REFERENCES library_books(id),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE study_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  material_type TEXT NOT NULL CHECK (material_type IN ('pdf', 'video', 'link', 'notes')),
  attachment_name TEXT,
  attachment_path TEXT,
  external_url TEXT,
  uploaded_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE exam_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  exam_type TEXT NOT NULL,
  exam_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  venue TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  published_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (published_by) REFERENCES users(id)
);

CREATE TABLE placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  package_lpa REAL NOT NULL,
  deadline TEXT NOT NULL,
  drive_date TEXT NOT NULL,
  min_cgpa REAL NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ongoing', 'closed'))
);

CREATE TABLE placement_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placement_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'shortlisted', 'rejected', 'offered')),
  applied_at TEXT NOT NULL,
  note TEXT,
  resume_link TEXT,
  cover_letter TEXT,
  UNIQUE (placement_id, student_id),
  FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE workflow_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('medical_leave', 'absence')),
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  attachment_name TEXT,
  attachment_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by INTEGER,
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE TABLE teacher_student_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('contact', 'alert', 'view')),
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  action_link TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by INTEGER,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_users_role_status ON users(role, status);
CREATE INDEX idx_courses_teacher_section ON courses(teacher_id, section);
CREATE INDEX idx_enrollments_student ON course_enrollments(student_id);
CREATE INDEX idx_attendance_sessions_course_date ON attendance_sessions(course_id, session_date);
CREATE INDEX idx_attendance_records_student ON attendance_records(student_id);
CREATE INDEX idx_course_results_student_semester ON course_results(student_id, semester);
CREATE INDEX idx_marks_assessment_student ON marks(assessment_id, student_id);
CREATE INDEX idx_assignments_course_due ON assignments(course_id, due_date);
CREATE INDEX idx_notices_active_audience ON notices(active, audience, created_at);
CREATE INDEX idx_grievances_status ON grievances(status, priority);
CREATE INDEX idx_fee_items_student_status ON fee_items(student_id, status);
CREATE INDEX idx_requests_student_status ON workflow_requests(student_id, status);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
