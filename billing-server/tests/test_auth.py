from conftest import register_and_login


def test_register_login_refresh(client):
    auth = register_and_login(client)
    assert auth["token"]
    assert auth["refresh_token"]
    assert auth["balance_cents"] >= 0

    refresh = client.post("/api/auth/refresh", json={"refresh_token": auth["refresh_token"]})
    assert refresh.status_code == 200
    assert refresh.get_json()["token"]


def test_register_rejects_duplicate_email(client):
    register_and_login(client)
    duplicate = client.post("/api/auth/register", json={"email": "paid@example.com", "password": "password123"})
    assert duplicate.status_code == 409
