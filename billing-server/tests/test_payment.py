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
    return payment_xunhu


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

    class FakeResponse:
        def json(self):
            return {
                "errcode": 0,
                "url": "https://pay.example.com/order",
                "url_qrcode": "https://pay.example.com/qr",
                "open_order_id": "provider-123",
            }

    monkeypatch.setattr(payment_xunhu.requests, "post", lambda *a, **k: FakeResponse())

    resp = client.post(
        "/api/billing/create-order",
        json={"amount": "9.90"},
        headers={"Authorization": f"Bearer {auth['token']}"},
    )
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["url"] == "https://pay.example.com/order"
    assert payload["url_qrcode"] == "https://pay.example.com/qr"
    assert payload["order_id"].startswith("RT-")

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
