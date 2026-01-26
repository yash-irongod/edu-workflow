# API Contract

## POST /login

### Request (Frontend → Backend)
{
  "email": "string",
  "password": "string"
}

### Success Response (Backend → Frontend)
{
  "role": "student | teacher | admin",
  "name": "string"
}

### Error Response
{
  "error": "invalid credentials"
}