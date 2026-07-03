import sys


def test_account_center_page_uses_existing_billing_apis(client):
    resp = client.get("/account")

    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    assert "Realtime Transcription 账户中心" in html
    assert "/api/auth/login" in html
    assert "/api/auth/register" in html
    assert "/api/auth/logout" in html
    assert "/api/billing/me" in html
    assert "/api/billing/create-order" in html
    assert "/api/billing/orders/" in html
    assert "充值 ¥9.90" in html
    assert "rtCloudToken" not in html
    assert "Authorization" not in html


def test_account_center_auth_uses_httponly_cookies(client):
    auth = client.post(
        "/api/auth/register",
        json={"email": "browser@example.com", "password": "password123", "browser_session": True},
    )

    assert auth.status_code == 201
    payload = auth.get_json()
    assert payload["balance_cents"] == 100
    assert "token" not in payload
    assert "refresh_token" not in payload
    cookies = "\n".join(auth.headers.getlist("Set-Cookie"))
    assert "rt_access=" in cookies
    assert "rt_refresh=" in cookies
    assert "HttpOnly" in cookies
    assert "SameSite=Lax" in cookies

    account = client.get("/api/billing/me")
    assert account.status_code == 200
    assert account.get_json()["email"] == "browser@example.com"
    assert client.post("/api/asr/sign", json={"engine_model": "16k_zh"}).status_code == 401

    refreshed = client.post("/api/auth/refresh", json={})
    assert refreshed.status_code == 200
    assert "token" not in refreshed.get_json()
    assert "rt_access=" in "\n".join(refreshed.headers.getlist("Set-Cookie"))

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 200
    assert client.get("/api/billing/me").status_code == 401


def test_browser_session_cookies_are_secure_in_production(client, monkeypatch):
    auth_module = sys.modules["auth"]
    monkeypatch.setattr(auth_module.config, "ENV", "production")
    resp = client.post(
        "/api/auth/register",
        json={"email": "secure-cookie@example.com", "password": "password123", "browser_session": True},
    )

    assert resp.status_code == 201
    cookies = "\n".join(resp.headers.getlist("Set-Cookie"))
    assert "rt_access=" in cookies
    assert "rt_refresh=" in cookies
    assert "Secure" in cookies


def test_plugin_token_auth_response_stays_token_based(client):
    reg = client.post(
        "/api/auth/register",
        json={"email": "plugin@example.com", "password": "password123"},
    )

    assert reg.status_code == 201
    payload = reg.get_json()
    assert payload["token"]
    assert payload["refresh_token"]
    assert not reg.headers.getlist("Set-Cookie")
