# EduWorkflow

EduWorkflow is a role-based academic workflow and student services platform for institutions. It includes student, teacher, and admin portals backed by Flask and SQLite, with academic records, attendance, marks, timetable data, notices, requests, finance items, and grievances all stored in the same application database.

## Current Highlights

- student, teacher, and admin portals render from stored application data
- student attendance supports semester, subject, month, date, and day-wise views
- result semester selection is independent from attendance filters
- teacher actions update attendance, marks, assignments, notices, and timetable records
- admin actions manage users, course ownership, timetable slots, grievances, notices, and settings
- tests cover login, role boundaries, maintenance mode, teacher mark propagation, admin user lifecycle actions, and student attendance contract behavior

## Product Scope

### Student portal

- CGPA, rank, attendance, credits, results, timetable, assignments, notices, placements, fees, scholarships, grievances, and profile are loaded from the application database
- attendance supports semester, subject, month, date, and day-wise filters
- medical leave and absence requests are stored as real workflow requests
- fee payments update ledger rows
- placement applications and library renewals create real records

### Teacher workspace

- class performance chart is computed from stored marks
- attendance submission writes session and per-student records
- marks publication updates assessment storage and student result totals
- assignment creation seeds submission rows for enrolled students
- student contact actions create notifications
- timetable updates notify enrolled students
- faculty notices are stored centrally

### Admin console

- user management supports create, suspend, restore, archive, and password reset
- course assignment and review status update real course records
- timetable creation and edits propagate to student and teacher views
- grievances can be resolved with recorded notes
- notice publishing and unpublishing are real actions
- maintenance mode blocks student and teacher access while preserving admin access
- audit logs track critical actions

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript, Chart.js
- Backend: Flask, Flask-CORS
- Database: SQLite
- Tests: Python `unittest`

## Repository Structure

```text
backend/
  app.py
  auth.py
  db_init.sql
  middleware.py
  services.py
frontend/
  index.html
  student.html
  teacher.html
  admin.html
  api.js
  app.js
  login.js
  css/
tests/
db_init.py
API_CONTRACT.md
```

## Setup

1. Create or activate a Python environment.
2. Install dependencies:

```bash
pip install flask flask-cors
```

3. Initialize the database:

```bash
python db_init.py
```

4. Start the backend:

```bash
python backend/app.py
```

5. Open the frontend:

- `frontend/index.html`

## Demo Credentials

- Student: `s@x.com` / `123`
- Teacher: `t@x.com` / `123`
- Admin: `a@x.com` / `123`

## Test Command

```bash
python -m unittest discover -s tests -v
```

## Notes

- The API contract is documented in [API_CONTRACT.md](/C:/Users/Lenovo/Desktop/Edu-Workflow-Beta/API_CONTRACT.md).
- `db_init.py` recreates the SQLite database from the schema in `backend/db_init.sql`.
- Maintenance mode is enforced at login and on authenticated student/teacher routes.

## Remaining Gaps

- file upload storage is represented as attachment or file-name metadata only
- there is no JWT/session server yet; the current frontend uses header-based role and user id state after login
- exports and document downloads are not yet implemented as generated files
