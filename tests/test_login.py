import requests

res = requests.post(
    "http://localhost:5000/login",
    json={"email": "s@x.com", "password": "123"}
)

assert res.status_code == 200
assert res.json()["role"] == "student"

print("Login test passed")