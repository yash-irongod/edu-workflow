# API Contract

## POST /login

### Request (Frontend → Backend)
```json
{
  "email": "string",
  "password": "string"
}
```

### Success Response (Backend → Frontend)
```json
{
  "role": "student | teacher | admin",
  "name": "string"
}
```

### Error Response
```json
{
  "error": "invalid credentials"
}
```

### Rules
- Field names must match exactly
- Frontend and backend must follow this format
- Any change must be updated here first