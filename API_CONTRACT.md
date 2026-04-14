# API Contract

## Authentication

### `POST /login`

Request:

```json
{
  "email": "string",
  "password": "string"
}
```

Success response:

```json
{
  "userId": 1,
  "role": "student",
  "name": "Priya Sharma",
  "email": "s@x.com",
  "status": "active",
  "department": "CSE",
  "rollNo": "2024CS0472",
  "employeeId": null
}
```

Error response:

```json
{
  "error": "invalid credentials"
}
```

Possible auth errors:

- `invalid credentials`
- `account is suspended`
- `portal under maintenance`

## Session Headers

All authenticated API routes require:

- `X-Role: student | teacher | admin`
- `X-User-Id: integer`

## Shared Endpoints

### `GET /api/me`

Returns the authenticated profile, role metadata, and role-specific detail block.

### `PATCH /api/me`

Supported fields:

```json
{
  "name": "string",
  "phone": "string"
}
```

### `POST /api/me/change-password`

```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

### `GET /api/me/notifications`

Returns unread count and recent notification items.

### `POST /api/me/notifications/:id/read`

Marks a notification as read.

## Student APIs

### `GET /api/student/dashboard`

Query params:

- `attendanceSemester`
- `resultsSemester`
- `subject`
- `attendanceView`
- `timetableView`
- `date`

Legacy `semester` is still accepted and is used as a fallback for both `attendanceSemester` and `resultsSemester`.

Returns:

- profile
- KPI summary
- attendance summary
- timetable
- results
- assignments
- notices
- library loans
- placements
- fees and scholarships
- workflow requests
- grievances
- notifications

### `GET /api/student/attendance`

Query params:

- `semester`
- `subject`
- `month` in `YYYY-MM`
- `date` in `YYYY-MM-DD`

Returns:

- `summary`
- `sessions`
- `daywise`
- `filters`

### `POST /api/student/requests`

```json
{
  "requestType": "medical_leave | absence",
  "fromDate": "2026-04-14",
  "toDate": "2026-04-15",
  "reason": "string",
  "attachmentName": "string"
}
```

### `POST /api/student/grievances`

```json
{
  "category": "Academic",
  "subject": "string",
  "message": "string",
  "priority": "high | medium | low"
}
```

### `POST /api/student/fees/pay`

```json
{
  "feeIds": [1, 2]
}
```

### `POST /api/student/placements/:id/apply`

Applies the authenticated student to the placement drive.

### `POST /api/student/library/:id/renew`

Creates a renewal request for the selected active loan.

## Teacher APIs

### `GET /api/teacher/dashboard`

Returns:

- faculty profile
- KPI summary
- course list
- performance chart data
- roster
- assignments
- timetable
- announcements
- report summary
- notifications

### `GET /api/teacher/attendance`

Optional query params:

- `courseId`
- `date`

### `POST /api/teacher/attendance`

```json
{
  "courseId": 7,
  "date": "2026-04-14",
  "records": [
    { "studentId": 1, "status": "present" }
  ]
}
```

### `POST /api/teacher/marks`

```json
{
  "courseId": 7,
  "examType": "Internal Exam 1",
  "maxScore": 50,
  "records": [
    {
      "studentId": 1,
      "score": 49,
      "remark": "Excellent recovery"
    }
  ]
}
```

Marks update assessment storage and refresh `course_results`.

### `POST /api/teacher/assignments`

```json
{
  "courseId": 7,
  "title": "string",
  "description": "string",
  "dueDate": "2026-04-18",
  "maxScore": 20
}
```

### `POST /api/teacher/notifications`

```json
{
  "studentId": 1,
  "title": "string",
  "message": "string"
}
```

### `PATCH /api/teacher/timetable/:id`

```json
{
  "room": "B-201",
  "status": "updated",
  "note": "Room shifted due to lab maintenance."
}
```

### `POST /api/teacher/notices`

```json
{
  "title": "string",
  "message": "string",
  "audience": "student | all",
  "priority": "high | medium | low"
}
```

## Admin APIs

### `GET /api/admin/dashboard`

Returns:

- admin profile
- KPI summary
- department chart
- users
- departments
- courses
- timetable
- grievances
- notices
- settings
- audit logs
- notifications

### `POST /api/admin/users`

```json
{
  "name": "Ravi Tiwari",
  "email": "ravi.tiwari@edu.in",
  "role": "student",
  "department": "CSE",
  "password": "changeme123"
}
```

### `PATCH /api/admin/users/:id/status`

```json
{
  "status": "active | suspended | archived"
}
```

### `POST /api/admin/users/:id/reset-password`

```json
{
  "newPassword": "temp1234"
}
```

### `PATCH /api/admin/courses/:id`

```json
{
  "teacherId": 2,
  "status": "review",
  "note": "Faculty reassigned"
}
```

### `POST /api/admin/timetable`

```json
{
  "courseId": 7,
  "dayOfWeek": "Thursday",
  "startTime": "09:00",
  "endTime": "10:00",
  "room": "A-204",
  "slotType": "Lecture",
  "status": "scheduled",
  "note": "string"
}
```

### `PATCH /api/admin/timetable/:id`

Same payload as create.

### `POST /api/admin/notices`

```json
{
  "title": "string",
  "message": "string",
  "audience": "all | student | teacher",
  "priority": "high | medium | low"
}
```

### `DELETE /api/admin/notices/:id`

Soft-unpublishes the notice by setting `active = 0`.

### `POST /api/admin/grievances/:id/resolve`

```json
{
  "resolutionNote": "string"
}
```

### `GET /api/admin/settings`

### `PATCH /api/admin/settings`

Supported keys:

- `site_name`
- `current_session`
- `attendance_threshold`
- `maintenance_mode`
- `student_portal_enabled`
- `teacher_portal_enabled`
- `grievance_module_active`
