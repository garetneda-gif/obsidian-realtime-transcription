import pytest

from conftest import register_and_login
from money import cents_to_yuan, yuan_to_cents


def test_money_parsing_is_decimal_safe():
    assert yuan_to_cents("9.90") == 990
    assert yuan_to_cents("9.999") == 1000
    assert cents_to_yuan(990) == "9.90"


@pytest.mark.parametrize("amount", ["0", "0.99", "501", "abc", ""])
def test_money_rejects_invalid_amounts(amount):
    with pytest.raises(ValueError):
        yuan_to_cents(amount)


def _configure_payment(monkeypatch):
    import payment_xunhu

    payment_xunhu.config.XUNHU_APPID = "appid"
    payment_xunhu.config.XUNHU_APPSECRET = "secret"
    payment_xunhu.config.XUNHU_NOTIFY_URL = "https://example.com/callback"
    payment_xunhu.config.PUBLIC_SERVER_URL = "https://billing.example.com"
    return payment_xunhu


def _fake_successful_order(client, monkeypatch, token):
    payment_xunhu = _configure_payment(monkeypatch)

    class FakeResponse:
        def json(self):
            return {
                "errcode": 0,
                "url": "https://pay.example/order",
                "url_qrcode": "https://pay.example/qr",
                "open_order_id": "open-123",
            }

    monkeypatch.setattr(payment_xunhu.requests, "post", lambda *a, **k: FakeResponse())
    resp = client.post(
        "/api/billing/create-order",
        json={"amount": "9.90"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)
    return resp.get_json()["order_id"]


def _balance_for_email(email):
    from database import SessionLocal
    from models import User

    db = SessionLocal()
    try:
        return db.query(User).filter(User.email == email).one().balance_cents
    finally:
        db.close()


def test_create_order_does_not_persist_when_provider_fails(client, monkeypatch):
    auth = register_and_login(client)
    payment_xunhu = _configure_payment(monkeypatch)

    class FakeResponse:
        def json(self):
            return {"errcode": 1, "errmsg": "provider down"}

    monkeypatch.setattr(payment_xunhu.requests, "post", lambda *a, **k: FakeResponse())

    resp = client.post(
        "/api/billing/create-order",
        json={"amount": "9.90"},
        headers={"Authorization": f"Bearer {auth['token']}"},
    )
    assert resp.status_code == 502

    from database import SessionLocal
    from models import Order

    db = SessionLocal()
    try:
        assert db.query(Order).count() == 0
    finally:
        db.close()


def test_create_order_persists_after_provider_success_and_is_queryable(client, monkeypatch):
    auth = register_and_login(client)
    payment_xunhu = _configure_payment(monkeypatch)
    seen_provider_payload = {}

    class FakeResponse:
        def json(self):
            return {
                "errcode": 0,
                "url": "https://pay.example.com/order",
                "url_qrcode": "https://pay.example.com/qr",
                "open_order_id": "provider-123",
            }

    def fake_post(url, data, timeout):
        seen_provider_payload.update(data)
        return FakeResponse()

    monkeypatch.setattr(payment_xunhu.requests, "post", fake_post)

    resp = client.post(
        "/api/billing/create-order",
        json={"amount": "9.90", "return_url": "https://evil.example/account"},
        headers={"Authorization": f"Bearer {auth['token']}"},
    )
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["url"] == "https://pay.example.com/order"
    assert payload["url_qrcode"] == "https://pay.example.com/qr"
    assert payload["order_id"].startswith("RT-")
    assert seen_provider_payload["return_url"] == (
        f"https://billing.example.com/account?order={payload['order_id']}"
    )

    status_resp = client.get(
        f"/api/billing/orders/{payload['order_id']}",
        headers={"Authorization": f"Bearer {auth['token']}"},
    )
    assert status_resp.status_code == 200
    status_payload = status_resp.get_json()
    assert status_payload["order_id"] == payload["order_id"]
    assert status_payload["amount_cents"] == 990
    assert status_payload["status"] == "CREATED"
    assert status_payload["created_at"]

    other_auth = register_and_login(client, email="other@example.com")
    other_resp = client.get(
        f"/api/billing/orders/{payload['order_id']}",
        headers={"Authorization": f"Bearer {other_auth['token']}"},
    )
    assert other_resp.status_code == 404


def test_create_order_accepts_account_center_cookie(client, monkeypatch):
    email = "cookie-pay@example.com"
    client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123", "browser_session": True},
    )
    payment_xunhu = _configure_payment(monkeypatch)
    seen_provider_payload = {}

    class FakeResponse:
        def json(self):
            return {
                "errcode": 0,
                "url": "https://pay.example.com/order",
                "url_qrcode": "https://pay.example.com/qr",
                "open_order_id": "provider-cookie",
            }

    def fake_post(url, data, timeout):
        seen_provider_payload.update(data)
        return FakeResponse()

    monkeypatch.setattr(payment_xunhu.requests, "post", fake_post)

    resp = client.post("/api/billing/create-order", json={"amount": "9.90"})

    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["order_id"].startswith("RT-")
    assert seen_provider_payload["return_url"] == (
        f"https://billing.example.com/account?order={payload['order_id']}"
    )

    before = _balance_for_email(email)

    class QueryResponse:
        def json(self):
            return {
                "errcode": 0,
                "data": {"status": "OD", "open_order_id": "provider-cookie", "total_fee": "9.90"},
                "errmsg": "success!",
            }

    monkeypatch.setattr(payment_xunhu.requests, "post", lambda *a, **k: QueryResponse())
    refresh_resp = client.post(f"/api/billing/orders/{payload['order_id']}/refresh")

    assert refresh_resp.status_code == 200, refresh_resp.get_data(as_text=True)
    refresh_payload = refresh_resp.get_json()
    assert refresh_payload["status"] == "CREDITED"
    assert refresh_payload["balance_cents"] == before + 990
    assert _balance_for_email(email) == before + 990

    client.post(
        "/api/auth/register",
        json={"email": "other-cookie@example.com", "password": "password123", "browser_session": True},
    )
    other_resp = client.get(f"/api/billing/orders/{payload['order_id']}")
    assert other_resp.status_code == 404


def test_paid_callback_credits_balance_once(client, monkeypatch):
    import payment_xunhu

    email = "callback@example.com"
    auth = register_and_login(client, email=email)
    order_id = _fake_successful_order(client, monkeypatch, auth["token"])
    before = _balance_for_email(email)

    payload = {
        "trade_order_id": order_id,
        "total_fee": "9.90",
        "status": "OD",
        "time": str(int(payment_xunhu.time.time())),
        "nonce_str": "callback-nonce",
    }
    payload["hash"] = payment_xunhu._sign(payload, payment_xunhu.config.XUNHU_APPSECRET)

    first = client.post("/api/billing/callback/xunhu", data=payload)
    assert first.status_code == 200
    assert first.get_data(as_text=True) == "success"
    assert _balance_for_email(email) == before + 990

    second = client.post("/api/billing/callback/xunhu", data=payload)
    assert second.status_code == 200
    assert _balance_for_email(email) == before + 990


def test_refresh_order_credits_paid_provider_result(client, monkeypatch):
    import payment_xunhu

    email = "refresh-paid@example.com"
    auth = register_and_login(client, email=email)
    order_id = _fake_successful_order(client, monkeypatch, auth["token"])
    before = _balance_for_email(email)
    seen_query = {}

    class QueryResponse:
        def json(self):
            return {
                "errcode": 0,
                "data": {"status": "OD", "open_order_id": "open-123", "total_fee": "9.90"},
                "errmsg": "success!",
            }

    def fake_query(url, data, timeout):
        seen_query.update(data)
        return QueryResponse()

    monkeypatch.setattr(payment_xunhu.requests, "post", fake_query)
    resp = client.post(
        f"/api/billing/orders/{order_id}/refresh",
        headers={"Authorization": f"Bearer {auth['token']}"},
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)
    payload = resp.get_json()
    assert payload["status"] == "CREDITED"
    assert payload["balance_cents"] == before + 990
    assert _balance_for_email(email) == before + 990
    assert seen_query["out_trade_order"] == order_id
    assert "open_order_id" not in seen_query


def test_refresh_order_keeps_pending_provider_result(client, monkeypatch):
    import payment_xunhu

    auth = register_and_login(client, email="refresh-pending@example.com")
    order_id = _fake_successful_order(client, monkeypatch, auth["token"])

    class QueryResponse:
        def json(self):
            return {
                "errcode": 0,
                "data": {"status": "WP", "open_order_id": "open-123", "total_fee": "9.90"},
                "errmsg": "success!",
            }

    monkeypatch.setattr(payment_xunhu.requests, "post", lambda *a, **k: QueryResponse())
    resp = client.post(
        f"/api/billing/orders/{order_id}/refresh",
        headers={"Authorization": f"Bearer {auth['token']}"},
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)
    assert resp.get_json()["status"] == "CREATED"
