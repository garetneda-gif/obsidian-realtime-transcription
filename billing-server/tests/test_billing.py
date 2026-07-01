from datetime import timedelta

from conftest import register_and_login


def _configure_asr():
    import billing
    import signing

    signing.config.TENCENT_APP_ID = "123456"
    signing.config.TENCENT_SECRET_ID = "secret-id"
    signing.config.TENCENT_SECRET_KEY = "secret-key"
    signing.config.PRECHARGE_MINUTES = 30
    signing.config.PRICE_PER_HOUR_CENTS = 200
    signing.config.SIGN_VALID_MINUTES = 30
    billing.config.PRECHARGE_MINUTES = 30
    billing.config.PRICE_PER_HOUR_CENTS = 200
    billing.config.REPORT_TIMEOUT_MINUTES = 10
    return signing, billing


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _set_sign_request_created_at(sign_request_id: str, created_at):
    from database import SessionLocal
    from models import SignRequest

    db = SessionLocal()
    try:
        sign_req = db.query(SignRequest).filter(SignRequest.id == sign_request_id).one()
        sign_req.created_at = created_at
        db.commit()
    finally:
        db.close()


def _user_balance(email: str) -> int:
    from database import SessionLocal
    from models import User

    db = SessionLocal()
    try:
        return db.query(User).filter(User.email == email).one().balance_cents
    finally:
        db.close()


def _usage_count(sign_request_id: str) -> int:
    from database import SessionLocal
    from models import UsageRecord

    db = SessionLocal()
    try:
        return db.query(UsageRecord).filter(UsageRecord.sign_request_id == sign_request_id).count()
    finally:
        db.close()


def test_account_endpoint_returns_current_balance(client):
    _configure_asr()
    auth = register_and_login(client, email="me@example.com")

    resp = client.get("/api/billing/me", headers=_auth_header(auth["token"]))

    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["email"] == "me@example.com"
    assert payload["balance_cents"] == 100
    assert "password_hash" not in payload
    assert "token" not in payload


def test_usage_record_has_unique_sign_request_index(client):
    from database import engine
    from sqlalchemy import inspect

    indexes = inspect(engine).get_indexes("usage_records")
    unique_fields = {
        tuple(index["column_names"])
        for index in indexes
        if index.get("unique")
    }

    assert ("sign_request_id",) in unique_fields


def test_sign_precharges_balance_and_records_reservation(client):
    _configure_asr()
    auth = register_and_login(client, email="sign@example.com")

    resp = client.post(
        "/api/asr/sign",
        json={"engine_model": "16k_zh"},
        headers=_auth_header(auth["token"]),
    )

    assert resp.status_code == 200, resp.get_data(as_text=True)
    payload = resp.get_json()
    assert payload["precharge_cents"] == 100
    assert payload["balance_cents"] == 0
    assert payload["signed_url"].startswith("wss://asr.cloud.tencent.com/")
    assert _user_balance("sign@example.com") == 0


def test_sign_rejects_insufficient_balance(client):
    _configure_asr()
    auth = register_and_login(client)
    client.post("/api/asr/sign", json={"engine_model": "16k_zh"}, headers=_auth_header(auth["token"]))

    resp = client.post(
        "/api/asr/sign",
        json={"engine_model": "16k_zh"},
        headers=_auth_header(auth["token"]),
    )

    assert resp.status_code == 402
    payload = resp.get_json()
    assert payload["balance_cents"] == 0
    assert payload["required_cents"] == 100


def test_sign_rejects_unsupported_engine_model(client):
    _configure_asr()
    auth = register_and_login(client)

    resp = client.post(
        "/api/asr/sign",
        json={"engine_model": "bad_model"},
        headers=_auth_header(auth["token"]),
    )

    assert resp.status_code == 400
    assert "allowed_models" in resp.get_json()


def test_signing_failure_rolls_back_precharge(client, monkeypatch):
    signing, _billing = _configure_asr()
    auth = register_and_login(client, email="rollback@example.com")

    def fail_sign(_voice_id, _engine_model):
        raise RuntimeError("provider failure")

    monkeypatch.setattr(signing, "_build_signed_url", fail_sign)

    resp = client.post(
        "/api/asr/sign",
        json={"engine_model": "16k_zh"},
        headers=_auth_header(auth["token"]),
    )

    assert resp.status_code == 503
    assert _user_balance("rollback@example.com") == 100

    from database import SessionLocal
    from models import SignRequest

    db = SessionLocal()
    try:
        assert db.query(SignRequest).count() == 0
    finally:
        db.close()


def test_report_usage_refunds_unused_precharge_once(client):
    _signing, _billing = _configure_asr()
    auth = register_and_login(client, email="report@example.com")
    sign = client.post("/api/asr/sign", json={"engine_model": "16k_zh"}, headers=_auth_header(auth["token"]))
    sign_request_id = sign.get_json()["sign_request_id"]

    from models import utcnow

    _set_sign_request_created_at(sign_request_id, utcnow() - timedelta(minutes=5))

    first = client.post(
        "/api/billing/report",
        json={"sign_request_id": sign_request_id, "duration_seconds": 60},
        headers=_auth_header(auth["token"]),
    )
    second = client.post(
        "/api/billing/report",
        json={"sign_request_id": sign_request_id, "duration_seconds": 60},
        headers=_auth_header(auth["token"]),
    )

    assert first.status_code == 200, first.get_data(as_text=True)
    assert second.status_code == 200, second.get_data(as_text=True)
    assert first.get_json()["cost_cents"] == 4
    assert first.get_json()["refund_cents"] == 96
    assert second.get_json()["refund_cents"] == 0
    assert _user_balance("report@example.com") == 96
    assert _usage_count(sign_request_id) == 1


def test_report_usage_rejects_invalid_duration(client):
    _configure_asr()
    auth = register_and_login(client)
    sign = client.post("/api/asr/sign", json={"engine_model": "16k_zh"}, headers=_auth_header(auth["token"]))

    resp = client.post(
        "/api/billing/report",
        json={"sign_request_id": sign.get_json()["sign_request_id"], "duration_seconds": "bad"},
        headers=_auth_header(auth["token"]),
    )

    assert resp.status_code == 400


def test_expired_settlement_is_idempotent(client):
    _signing, billing = _configure_asr()
    auth = register_and_login(client, email="expired@example.com")
    sign = client.post("/api/asr/sign", json={"engine_model": "16k_zh"}, headers=_auth_header(auth["token"]))
    sign_request_id = sign.get_json()["sign_request_id"]

    from models import utcnow

    _set_sign_request_created_at(sign_request_id, utcnow() - timedelta(minutes=30))

    first = billing.settle_expired_requests()
    second = billing.settle_expired_requests()

    assert first == 1
    assert second == 0
    assert _usage_count(sign_request_id) == 1
    assert _user_balance("expired@example.com") == 0
