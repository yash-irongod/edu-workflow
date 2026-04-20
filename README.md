# EduWorkflow v8.0
### Premium Academic Management Platform

EduWorkflow is a production-ready, full-stack academic institution management system designed for students, faculty, and administrators. It combines role-based dashboards, connected workflows, attendance and marks management, notices, assignments, requests, reports, and institutional operations into one polished platform.

Built with a Python/Flask backend, SQLite database, and a premium vanilla JavaScript frontend.

---

## Quick Start

    # 1. Install backend dependencies
    pip install flask flask-cors

    # 2. Initialize the database
    # This creates users.db with seeded institutional data
    python db_init.py

    # 3. Start the Flask backend
    python backend/app.py

    # 4. Open the frontend
    # Serve the frontend folder with any static server
    python -m http.server 8080 --directory frontend

    # 5. Visit
    # http://localhost:8080

---

## Test Credentials

| Role    | Email   | Password |
|---------|---------|----------|
| Student | s@x.com | 123      |
| Teacher | t@x.com | 123      |
| Admin   | a@x.com | 123      |

---

## What EduWorkflow Does

EduWorkflow is built to reduce the friction of running an academic institution by connecting the main daily workflows in one place:

- student academic tracking
- faculty operations
- admin governance and oversight
- notices and communications
- assignments and submissions
- attendance and marks
- timetable and course coordination
- requests, grievances, and institutional records

The goal is not just to display data, but to make the dashboards feel connected, usable, and realistic for a real institution.

---

## Core Features
![Login UI](assets/login.png)

### Student Portal
![Students Dashboard](assets/students_dashboard.png)
- Live home dashboard with academic summary cards
- Attendance tracking with filters and subject-wise views
- Timetable with day/week visibility
- Results with semester history and subject-wise breakdown
- Assignment submission tracking
- Campus desk for notices, study materials, exam schedules, and library items
- Fees, requests, grievances, and placement-related views
- Profile management with document downloads

### Teacher Portal
![Teachers Dashboard](assets/teachers_dashboard.png)
- Daily dashboard and teaching overview
- Attendance marking and history
- Marks entry and assessment management
- Assignment creation and submission review
- Student roster and filters
- Timetable management
- Notice publishing
- Student communication and status updates

### Admin Panel
![Admin Dashboard](assets/admin_dashboard.png)
- Institution-wide dashboard and analytics
- User directory and role management
- Department and course management
- Timetable configuration and clash handling
- Notice board management
- Grievance review and workflow resolution
- Settings and system-level control
- Reports and exports
- Audit and activity visibility

---

## Recent Improvements in This Version

This version includes major stability and workflow improvements, including:

- better student semester handling
- stronger attendance and results data flow
- improved timetable logic for role-based visibility
- notification click-to-navigate behavior
- assignment attachment and submission visibility
- teacher attendance preload for previous dates
- teacher marks preload for existing exam entries
- admin user-course enrollment controls
- secure attachment download routes
- improved exports and notice workflows
- settings toggle enforcement in backend
- dashboard stability fixes for login/loading issues

---

## Project Structure

    eduworkflow-v8/
    ├── backend/
    │   ├── app.py
    │   ├── services.py
    │   ├── auth.py
    │   ├── middleware.py
    │   ├── db_init.sql
    │   └── requirements.txt
    ├── frontend/
    │   ├── index.html
    │   ├── student.html
    │   ├── teacher.html
    │   ├── admin.html
    │   ├── app.js
    │   ├── api.js
    │   ├── login.js
    │   └── css/
    │       ├── style.css
    │       └── login.css
    ├── db_init.py
    └── assets/
        └── uploads/

---

## Tech Stack

### Frontend
- HTML5
- CSS3
- Vanilla JavaScript
- Chart.js

### Backend
- Python
- Flask
- Flask-CORS
- SQLite

### Storage
- SQLite database
- Local file uploads for documents and attachments

---

## Database Overview

The database covers the core institutional workflows, including:

- users
- student / teacher / admin profiles
- departments
- courses
- enrollments
- timetable slots
- attendance sessions and attendance records
- assessments and marks
- results and semester performance
- assignments and submissions
- notices
- grievances
- requests
- fees and scholarships
- library books and loans
- study materials
- exam schedules
- placements and applications
- notifications
- system settings
- audit logs

---

## Seed Data

The seeded database includes realistic institutional sample data such as:

- students, teachers, and admin accounts
- departments and courses
- timetable entries
- attendance records
- marks and results
- assignments and submissions
- notices and study materials
- grievances and requests
- fees and other workflow records

This makes the app usable immediately after setup.

---

## API Overview

All authenticated requests use the current session role and user identity set by the frontend.

### Common
- `POST /login`
- `GET /api/me`
- `PATCH /api/me`
- `POST /api/me/change-password`
- `GET /api/me/notifications`

### Student
- `GET /api/student/dashboard`
- `GET /api/student/attendance`
- `POST /api/student/requests`
- `POST /api/student/grievances`
- `POST /api/student/fees/pay`
- `POST /api/student/placements/:id/apply`
- `POST/PATCH/DELETE /api/student/assignments/:id/submit`
- `POST /api/student/library/:id/renew`

### Teacher
- `GET /api/teacher/dashboard`
- `GET/POST /api/teacher/attendance`
- `POST /api/teacher/marks`
- `POST /api/teacher/assignments`
- `PATCH /api/teacher/assignments/:id`
- `POST /api/teacher/timetable/:id`
- `POST /api/teacher/notices`

### Admin
- `GET /api/admin/dashboard`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`
- `POST /api/admin/departments`
- `PATCH /api/admin/departments/:id`
- `POST /api/admin/courses`
- `PATCH /api/admin/courses/:id`
- `POST/PATCH /api/admin/timetable`
- `GET /api/admin/timetable/clashes`
- `POST /api/admin/notices`
- `PATCH/DELETE /api/admin/notices/:id`
- `POST /api/admin/grievances/:id/resolve`
- `GET/PATCH /api/admin/settings`

---

## Role-Based Highlights

### Student
- attendance progress and history
- semester-wise results
- active assignments and submissions
- notices and study materials
- profile and document downloads

### Teacher
- daily attendance and class history
- marks entry and assessment handling
- assignments and submissions
- student roster tools
- notice publishing

### Admin
- system-wide monitoring
- user and course lifecycle management
- notice board and grievance workflows
- timetable configuration
- exports and reporting
- settings and institutional control

---

## Design System

EduWorkflow uses a custom design system built for clarity, consistency, and a premium institutional feel.

Key design traits:
- clean dashboard hierarchy
- responsive layout behavior
- strong card-based information structure
- polished login animation
- modal-driven interactions
- toast notifications and feedback states
- consistent iconography and typography
- modern dark sidebar + warm accent styling

---

## Setup Notes

- Start the backend before opening the frontend.
- Use the seeded credentials above for testing.
- If the frontend is served separately, make sure it can reach the backend running on `http://127.0.0.1:5000`.
- Uploaded files are stored under the uploads directory.

---

## License

MIT License

---

## Final Note

EduWorkflow is designed as a real academic operations platform rather than a simple demo. It focuses on connected workflows, role-based control, practical institutional features, and a polished user experience that feels ready for real-world use.