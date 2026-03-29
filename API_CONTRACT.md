# API Contract
--------------------------------------------------

## POST /login

### Request (Frontend → Backend)
```json
{
  "email": "string",
  "password": "string"
}
```

### Success Response (200)
```json
{
  "role": "student | teacher | admin",
  "name": "string"
}
```

### Error Response (400 / 401)
```json
{
  "error": "invalid credentials"
}
```

--------------------------------------------------

## GET /api/student/dashboard

### Headers
```
X-Role: student
```

### Success Response (200)
```json
{
  "attendance": 82,
  "cgpa": 8.4,
  "subjects": 6
}
```

### Error Response (403)
```json
{
  "error": "unauthorized"
}
```

--------------------------------------------------

## GET /api/teacher/dashboard

### Headers
```
X-Role: teacher
```

### Success Response (200)
```json
{
  "classes": 5,
  "students": 240,
  "pending": 3
}
```

### Error Response (403)
```json
{
  "error": "unauthorized"
}
```

--------------------------------------------------

## GET /api/admin/dashboard

### Headers
```
X-Role: admin
```

### Success Response (200)
```json
{
  "users": 1330,
  "status": "online",
  "reports": 48
}
```

### Error Response (403)
```json
{
  "error": "unauthorized"
}
```

--------------------------------------------------

## GLOBAL RULES

- Field names must match EXACTLY (no renaming)
- Backend must return JSON only
- Frontend must send header `X-Role`
- No extra or missing fields allowed
- Any API change → update this file first

--------------------------------------------------
```# API Contract

This file defines the exact request/response format between frontend and backend.

--------------------------------------------------

## POST /login

### Request (Frontend → Backend)
```json
{
  "email": "string",
  "password": "string"
}
```

### Success Response (200)
```json
{
  "role": "student | teacher | admin",
  "name": "string"
}
```

### Error Response (400 / 401)
```json
{
  "error": "invalid credentials"
}
```

--------------------------------------------------

## GET /api/student/dashboard

### Headers
```
X-Role: student
```

### Success Response (200)
```json
{
  "attendance": 82,
  "cgpa": 8.4,
  "subjects": 6
}
```

### Error Response (403)
```json
{
  "error": "unauthorized"
}
```

--------------------------------------------------

## GET /api/teacher/dashboard

### Headers
```
X-Role: teacher
```

### Success Response (200)
```json
{
  "classes": 5,
  "students": 240,
  "pending": 3
}
```

### Error Response (403)
```json
{
  "error": "unauthorized"
}
```

--------------------------------------------------

## GET /api/admin/dashboard

### Headers
```
X-Role: admin
```

### Success Response (200)
```json
{
  "users": 1330,
  "status": "online",
  "reports": 48
}
```

### Error Response (403)
```json
{
  "error": "unauthorized"
}
```

--------------------------------------------------

## GLOBAL RULES

- Field names must match EXACTLY (no renaming)
- Backend must return JSON only
- Frontend must send header `X-Role`
- No extra or missing fields allowed
- Any API change → update this file first

--------------------------------------------------
```