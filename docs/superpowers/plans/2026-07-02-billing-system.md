# Billing System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a usable paid cloud ASR billing system: users can register, pay, receive credit, consume hosted ASR with balance checks, and see current balance/usage inside Obsidian.

**Architecture:** Keep the current Flask billing server and Obsidian plugin client. Make the server authoritative for money: payment callbacks or verified payment queries credit balances, sign requests reserve balance, usage reports settle reservations, and expired reservations are charged by policy. Keep this prepaid balance model; do not add subscriptions, coupons, admin dashboards, or multiple payment providers yet.

**Tech Stack:** Flask, SQLAlchemy, SQLite/PostgreSQL-compatible schema, bcrypt, PyJWT, requests, Node/TypeScript, Obsidian Plugin API, built-in `node:test`.

---

## File Structure

- `billing-server/money.py`: Create. Decimal-safe money parsing/formatting shared by payment and tests.
- `billing-server/errors.py`: Create. Small JSON error helpers so endpoints return consistent `{error, code}` bodies.
- `billing-server/config.py`: Modify. Add strict production config validation, public server URL, CORS origins, and payment query URL.
- `billing-server/models.py`: Modify. Add order timestamps/provider fields, payment transaction id, credited timestamp, sign request status fields, unique constraints needed for idempotency.
- `billing-server/database.py`: Modify. Add SQLite foreign key pragmas and engine options that work for test clients.
- `billing-server/auth.py`: Modify. Validate email/password consistently and return user profile payload through one helper.
- `billing-server/payment_xunhu.py`: Modify. Fix order creation atomicity, add payment query endpoint, make callback idempotent and testable.
- `billing-server/signing.py`: Modify. Validate engine model, precharge with locked user row, record reservation state, never leave dirty reservations on signing failure.
- `billing-server/billing.py`: Modify. Make settlement idempotent, add `/api/billing/me`, add robust usage history, make expired settlement explicit.
- `billing-server/app.py`: Modify. Add `/healthz`, `/readyz`, config validation at startup, and opt-in background settlement loop.
- `billing-server/self_check.py`: Modify. Cover the complete happy path with mocked payment and mocked signing.
- `billing-server/tests/conftest.py`: Create. Test app factory, isolated SQLite database, monkeypatch helpers.
- `billing-server/tests/test_auth.py`: Create. Auth registration/login/refresh cases.
- `billing-server/tests/test_payment.py`: Create. Create order, callback credit, duplicate callback, bad signature, active query.
- `billing-server/tests/test_billing.py`: Create. Sign precharge, report settlement, double report idempotency, expired settlement.
- `billing-server/tests/test_config.py`: Create. Production config fails closed when secrets are missing.
- `src/services/CloudAuthService.ts`: Modify. Add `getAccount()`, `getOrderStatus()`, better server URL normalization, consistent error extraction.
- `src/settings.ts`: Modify. Show logged-in cloud account state, balance refresh, recharge pending/success/error states, and avoid requiring manual setting reload after payment.
- `src/i18n.ts`: Modify. Add missing cloud billing labels and errors.
- `src/main.ts`: Modify only if needed. Surface payment/balance errors cleanly before recording starts.
- `tests/cloudAuthService.test.ts`: Create. Unit test server URL normalization and client API behavior with mocked `fetch`.
- `README.md` / `README_EN.md`: Modify. Replace MVP text with deployable billing server instructions and operational caveats.
- `docs/superpowers/plans/2026-07-02-billing-system.md`: This plan.

---

### Task 1: Python Billing Test Harness

**Files:**
- Modify: `billing-server/requirements.txt`
- Create: `billing-server/tests/conftest.py`
- Create: `billing-server/tests/test_auth.py`

- [ ] **Step 1: Add test dependencies**

Append:

```txt
pytest>=8.0
```

- [ ] **Step 2: Write the test app fixture**

Create `billing-server/tests/conftest.py`:

```python
import importlib
import os
import sys
from pathlib import Path

import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))


@pytest.fixture()
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("BS_DATABASE_URL", f"sqlite:///{tmp_path}/billing.db")
    monkeypatch.setenv("BS_SECRET_KEY", "test-secret-with-at-least-32-characters")
    monkeypatch.setenv("BS_DISABLE_SETTLEMENT_LOOP", "1")

    for name in [
        "config",
        "models",
        "database",
        "auth",
        "billing",
        "signing",
        "payment_xunhu",
        "app",
    ]:
        sys.modules.pop(name, None)

    app_module = importlib.import_module("app")
    database = importlib.import_module("database")
    database.init_db()
    return app_module.create_app()


@pytest.fixture()
def client(app):
    return app.test_client()


def register_and_login(client, email="paid@example.com", password="password123"):
    reg = client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201, reg.get_data(as_text=True)
    return reg.get_json()
```

- [ ] **Step 3: Write auth tests**

Create `billing-server/tests/test_auth.py`:

```python
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
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd billing-server
python -m pytest tests/test_auth.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add billing-server/requirements.txt billing-server/tests/conftest.py billing-server/tests/test_auth.py
git commit -m "test: add billing server auth harness"
```

---

### Task 2: Shared Money and Error Helpers

**Files:**
- Create: `billing-server/money.py`
- Create: `billing-server/errors.py`
- Modify: `billing-server/payment_xunhu.py`
- Test: `billing-server/tests/test_payment.py`

- [ ] **Step 1: Write money tests**

Create the first cases in `billing-server/tests/test_payment.py`:

```python
import pytest

from money import cents_to_yuan, yuan_to_cents


def test_money_parsing_is_decimal_safe():
    assert yuan_to_cents("9.90") == 990
    assert yuan_to_cents("9.999") == 1000
    assert cents_to_yuan(990) == "9.90"


@pytest.mark.parametrize("amount", ["0", "0.99", "501", "abc", ""])
def test_money_rejects_invalid_amounts(amount):
    with pytest.raises(ValueError):
        yuan_to_cents(amount)
```

- [ ] **Step 2: Create `money.py`**

```python
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

MIN_RECHARGE_YUAN = Decimal("1.00")
MAX_RECHARGE_YUAN = Decimal("500.00")


def yuan_to_cents(amount: str) -> int:
    try:
        yuan = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        raise ValueError("Invalid amount")
    if yuan < MIN_RECHARGE_YUAN or yuan > MAX_RECHARGE_YUAN:
        raise ValueError("Amount must be between ¥1.00 and ¥500.00")
    return int(yuan * 100)


def cents_to_yuan(cents: int) -> str:
    return f"{Decimal(cents) / Decimal(100):.2f}"
```

- [ ] **Step 3: Create `errors.py`**

```python
from flask import jsonify


def error_response(message: str, status: int, code: str | None = None):
    body = {"error": message}
    if code:
        body["code"] = code
    return jsonify(body), status
```

- [ ] **Step 4: Replace duplicated money code**

In `billing-server/payment_xunhu.py`, remove local `_yuan_to_cents`, `_cents_to_yuan`, min/max constants and import:

```python
from money import cents_to_yuan, yuan_to_cents
```

Then replace call sites.

- [ ] **Step 5: Run tests**

```bash
cd billing-server
python -m pytest tests/test_payment.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add billing-server/money.py billing-server/errors.py billing-server/payment_xunhu.py billing-server/tests/test_payment.py
git commit -m "refactor: share billing money helpers"
```

---

### Task 3: Payment Order Creation Is Atomic and Queryable

**Files:**
- Modify: `billing-server/models.py`
- Modify: `billing-server/payment_xunhu.py`
- Test: `billing-server/tests/test_payment.py`

- [ ] **Step 1: Add failing order tests**

Append:

```python
from conftest import register_and_login


def test_create_order_does_not_persist_when_provider_fails(client, monkeypatch):
    auth = register_and_login(client)

    import payment_xunhu
    payment_xunhu.config.XUNHU_APPID = "appid"
    payment_xunhu.config.XUNHU_APPSECRET = "secret"
    payment_xunhu.config.XUNHU_NOTIFY_URL = "https://example.com/callback"

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
```

- [ ] **Step 2: Add model fields**

Modify `Order` in `billing-server/models.py`:

```python
provider = Column(String(32), nullable=False, default="xunhu")
provider_order_id = Column(String(128), nullable=True)
payment_url = Column(String(2048), nullable=True)
credited_at = Column(DateTime(timezone=True), nullable=True)
updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
```

- [ ] **Step 3: Change order creation flow**

In `create_payment_url()`:

1. Validate config and amount first.
2. Call provider first.
3. Only insert `Order` after provider returns a usable payment URL.
4. Return `502` for provider/network failures from `create_order()`.

Concrete shape:

```python
provider_result = _create_xunhu_order(
    trade_order_id=trade_order_id,
    amount_cents=amount_cents,
    title=title,
    return_url=return_url,
)
if "error" in provider_result:
    return {"error": provider_result["error"], "status": provider_result.get("status", 502)}

db = SessionLocal()
try:
    order = Order(
        id=new_uuid(),
        user_id=user_id,
        trade_order_id=trade_order_id,
        amount_cents=amount_cents,
        status=OrderStatus.CREATED,
        idempotency_key=trade_order_id,
        provider="xunhu",
        provider_order_id=provider_result.get("open_order_id"),
        payment_url=provider_result["url"],
    )
    db.add(order)
    db.commit()
finally:
    db.close()
```

- [ ] **Step 4: Add order status endpoint**

In `payment_xunhu.py`:

```python
@payment_bp.route("/orders/<trade_order_id>", methods=["GET"])
def get_order(trade_order_id: str):
    user_id, err = require_auth()
    if err:
        return err
    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.user_id == user_id, Order.trade_order_id == trade_order_id).first()
        if not order:
            return jsonify({"error": "Order not found"}), 404
        return jsonify({
            "order_id": order.trade_order_id,
            "amount_cents": order.amount_cents,
            "status": order.status,
            "created_at": order.created_at.isoformat(),
        }), 200
    finally:
        db.close()
```

- [ ] **Step 5: Run tests**

```bash
cd billing-server
python -m pytest tests/test_payment.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add billing-server/models.py billing-server/payment_xunhu.py billing-server/tests/test_payment.py
git commit -m "fix: make payment order creation atomic"
```

---

### Task 4: Payment Callback Idempotency and Active Reconciliation

**Files:**
- Modify: `billing-server/payment_xunhu.py`
- Test: `billing-server/tests/test_payment.py`

- [ ] **Step 1: Add callback and refresh tests**

Add these tests:

```python
from database import SessionLocal
from models import User


def _configure_payment(payment_xunhu):
    payment_xunhu.config.XUNHU_APPID = "appid"
    payment_xunhu.config.XUNHU_APPSECRET = "secret"
    payment_xunhu.config.XUNHU_NOTIFY_URL = "https://example.com/callback"


def _fake_successful_order(client, monkeypatch, token):
    import payment_xunhu
    _configure_payment(payment_xunhu)

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
    db = SessionLocal()
    try:
        return db.query(User).filter(User.email == email).one().balance_cents
    finally:
        db.close()


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

    class QueryResponse:
        def json(self):
            return {
                "errcode": 0,
                "data": {"status": "OD", "open_order_id": "open-123", "total_fee": "9.90"},
                "errmsg": "success!",
            }

    monkeypatch.setattr(payment_xunhu.requests, "post", lambda *a, **k: QueryResponse())
    resp = client.post(
        f"/api/billing/orders/{order_id}/refresh",
        headers={"Authorization": f"Bearer {auth['token']}"},
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)
    assert resp.get_json()["status"] == "CREDITED"


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
```

Use the existing `_sign()` helper for callback payload.

- [ ] **Step 2: Add provider query function**

Add:

```python
XUNHU_QUERY_URL = "https://api.xunhupay.com/payment/query.html"


def query_payment_status(trade_order_id: str) -> dict[str, Any]:
    params = {
        "appid": config.XUNHU_APPID,
        "out_trade_order": trade_order_id,
        "time": str(int(time.time())),
        "nonce_str": os.urandom(16).hex(),
    }
    params["hash"] = _sign(params, config.XUNHU_APPSECRET)
    resp = requests.post(XUNHU_QUERY_URL, data=params, timeout=10)
    return resp.json()
```

Use the same signing rules as payment creation. Per Xunhu query docs, map local `Order.trade_order_id` to request parameter `out_trade_order`; only use `open_order_id` if querying by provider order id.

- [ ] **Step 3: Add reconcile endpoint**

Add authenticated endpoint:

```python
@payment_bp.route("/orders/<trade_order_id>/refresh", methods=["POST"])
def refresh_order(trade_order_id: str):
    user_id, err = require_auth()
    if err:
        return err
    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.user_id == user_id, Order.trade_order_id == trade_order_id).with_for_update().first()
        if not order:
            return jsonify({"error": "Order not found"}), 404
        result = query_payment_status(trade_order_id)
        if result.get("errcode") != 0:
            return jsonify({"error": result.get("errmsg", "Payment query failed")}), 502
        data = result.get("data") or {}
        if data.get("status") == "OD":
            credit_paid_order(db, order, yuan_to_cents(str(data.get("total_fee", cents_to_yuan(order.amount_cents)))))
            db.commit()
        return jsonify({
            "order_id": order.trade_order_id,
            "amount_cents": order.amount_cents,
            "status": order.status,
            "balance_cents": db.query(User).filter(User.id == user_id).one().balance_cents,
        }), 200
    finally:
        db.close()
```

It queries the provider, and if provider reports paid, routes through the same crediting helper used by callback.

- [ ] **Step 4: Extract credit helper**

Create:

```python
def credit_paid_order(db, order: Order, paid_amount_cents: int) -> bool:
    if order.status == OrderStatus.CREDITED:
        return False
    if paid_amount_cents != order.amount_cents:
        raise ValueError("Payment amount mismatch")
    user = db.query(User).filter(User.id == order.user_id).with_for_update().first()
    user.balance_cents += order.amount_cents
    order.status = OrderStatus.CREDITED
    order.credited_at = utcnow()
    return True
```

- [ ] **Step 5: Run tests**

```bash
cd billing-server
python -m pytest tests/test_payment.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add billing-server/payment_xunhu.py billing-server/tests/test_payment.py
git commit -m "feat: reconcile paid recharge orders"
```

---

### Task 5: ASR Reservation and Settlement Hardening

**Files:**
- Modify: `billing-server/signing.py`
- Modify: `billing-server/billing.py`
- Modify: `billing-server/models.py`
- Test: `billing-server/tests/test_billing.py`

- [ ] **Step 1: Write settlement tests**

Create `billing-server/tests/test_billing.py`:

```python
from conftest import register_and_login


def test_sign_precharges_and_report_refunds_unused_balance(client, monkeypatch):
    import config
    config.TENCENT_APP_ID = "123"
    config.TENCENT_SECRET_ID = "sid"
    config.TENCENT_SECRET_KEY = "skey"
    auth = register_and_login(client)
    token = auth["token"]

    sign = client.post("/api/asr/sign", json={"engine_model": "16k_zh"}, headers={"Authorization": f"Bearer {token}"})
    assert sign.status_code == 200, sign.get_data(as_text=True)
    body = sign.get_json()

    report = client.post(
        "/api/billing/report",
        json={"sign_request_id": body["sign_request_id"], "duration_seconds": 60},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert report.status_code == 200
    assert report.get_json()["refund_cents"] >= 0


def test_report_is_idempotent(client, monkeypatch):
    import config
    from database import SessionLocal
    from models import UsageRecord

    config.TENCENT_APP_ID = "123"
    config.TENCENT_SECRET_ID = "sid"
    config.TENCENT_SECRET_KEY = "skey"
    auth = register_and_login(client, email="idempotent@example.com")
    token = auth["token"]

    sign = client.post("/api/asr/sign", json={"engine_model": "16k_zh"}, headers={"Authorization": f"Bearer {token}"})
    assert sign.status_code == 200, sign.get_data(as_text=True)
    sign_request_id = sign.get_json()["sign_request_id"]

    payload = {"sign_request_id": sign_request_id, "duration_seconds": 60}
    first = client.post("/api/billing/report", json=payload, headers={"Authorization": f"Bearer {token}"})
    second = client.post("/api/billing/report", json=payload, headers={"Authorization": f"Bearer {token}"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.get_json()["cost_cents"] == first.get_json()["cost_cents"]

    db = SessionLocal()
    try:
        assert db.query(UsageRecord).filter(UsageRecord.sign_request_id == sign_request_id).count() == 1
    finally:
        db.close()
```

- [ ] **Step 2: Validate engine models**

In `signing.py`, add:

```python
ALLOWED_ENGINE_MODELS = {"16k_zh", "16k_zh_large", "16k_en", "16k_zh_en"}
```

Reject unknown models with 400.

- [ ] **Step 3: Add reservation status fields**

In `SignRequest`, add:

```python
status = Column(String(16), nullable=False, default="RESERVED")
error = Column(String(255), nullable=True)
```

- [ ] **Step 4: Make report idempotency strong**

In `report_usage()`:

- Lock the `SignRequest`.
- If already settled, return current record without balance mutation.
- Create at most one `UsageRecord` per `sign_request_id`; add a unique constraint if needed.

- [ ] **Step 5: Make expired settlement visible**

When `settle_expired_requests()` charges the precharge, set:

```python
sr.status = "EXPIRED_CHARGED"
sr.anomaly_flag = 1
```

- [ ] **Step 6: Run tests**

```bash
cd billing-server
python -m pytest tests/test_billing.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add billing-server/models.py billing-server/signing.py billing-server/billing.py billing-server/tests/test_billing.py
git commit -m "fix: harden ASR usage settlement"
```

---

### Task 6: Account State API for Plugin

**Files:**
- Modify: `billing-server/billing.py`
- Modify: `src/services/CloudAuthService.ts`
- Test: `tests/cloudAuthService.test.ts`

- [ ] **Step 1: Add server `/me` endpoint**

In `billing.py`:

```python
@billing_bp.route("/me", methods=["GET"])
def get_me():
    user_id, err = require_auth()
    if err:
        return err
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify({
            "email": user.email,
            "balance_cents": user.balance_cents,
            "created_at": user.created_at.isoformat(),
        }), 200
    finally:
        db.close()
```

- [ ] **Step 2: Add TS client tests**

Create `tests/cloudAuthService.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { CloudAuthService } from "../src/services/CloudAuthService.ts";

test("CloudAuthService trims trailing slash in server URL", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (url: string) => {
    requests.push(url);
    return new Response(JSON.stringify({ balance_cents: 100 }), { status: 200 });
  }) as typeof fetch;

  const svc = new CloudAuthService({
    serverUrl: "https://api.example.com/",
    token: "token",
    refreshToken: "refresh",
    tokenExpiresAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    balanceCents: 0,
  });
  await svc.getBalance();
  assert.equal(requests[0], "https://api.example.com/api/billing/balance");
});
```

- [ ] **Step 3: Normalize server URL**

In `CloudAuthService` constructor/updateSettings:

```ts
private normalizeSettings(settings: CloudAuthSettings): CloudAuthSettings {
  return { ...settings, serverUrl: settings.serverUrl.replace(/\/+$/, "") };
}
```

- [ ] **Step 4: Add `getAccount()` and `getOrderStatus()`**

```ts
async getAccount(): Promise<{ email: string; balance_cents: number; created_at: string }> {
  const resp = await this.authGet("/api/billing/me");
  if (!resp.ok) throw await this.readError(resp, "Failed to get account");
  return resp.json();
}
```

- [ ] **Step 5: Run TS tests**

```bash
node --experimental-strip-types --test tests/cloudAuthService.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add billing-server/billing.py src/services/CloudAuthService.ts tests/cloudAuthService.test.ts
git commit -m "feat: expose cloud account state"
```

---

### Task 7: Obsidian Cloud Account UI

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/i18n.ts`
- Test: existing TS tests and manual Obsidian settings QA

- [ ] **Step 1: Add UI strings**

Add keys:

```ts
"settings.cloud.refreshBalance.btn": "刷新余额",
"settings.cloud.paymentPending": "支付完成后点击刷新余额",
"settings.cloud.serverRequired": "请先填写服务器地址",
"settings.cloud.orderStatusPaid": "充值已到账",
"settings.cloud.orderStatusPending": "订单尚未支付",
```

and English equivalents.

- [ ] **Step 2: Make login/register require server URL**

In `src/settings.ts`, before `new CloudAuthService(...)`, reject empty `serverUrl` with `Notice`.

- [ ] **Step 3: Refresh balance after payment**

After `window.open(order.url)`, store `lastOrderId` locally in the setting tab instance, and show a `刷新余额` button that calls:

```ts
await svc.getOrderStatus(lastOrderId);
await svc.getBalance();
this.display();
```

No polling yet. User-initiated refresh is enough.

- [ ] **Step 4: Run tests/build**

```bash
node --experimental-strip-types --test tests/*.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Manual QA**

Start a local billing server with fake payment disabled:

```bash
cd billing-server
python self_check.py
```

Then in Obsidian:

1. Open plugin settings.
2. Select `云端托管`.
3. Enter server URL.
4. Register/login.
5. Confirm balance appears.
6. Click recharge and verify a clear error if payment is not configured.

- [ ] **Step 6: Commit**

```bash
git add src/settings.ts src/i18n.ts src/services/CloudAuthService.ts tests/cloudAuthService.test.ts
git commit -m "feat: improve cloud billing settings UI"
```

---

### Task 8: Deployable Server Startup and Health

**Files:**
- Modify: `billing-server/config.py`
- Modify: `billing-server/app.py`
- Modify: `billing-server/Dockerfile`
- Create: `billing-server/.env.example`
- Test: `billing-server/tests/test_config.py`

- [ ] **Step 1: Write config tests**

Create `billing-server/tests/test_config.py`:

```python
import importlib
import sys


def test_production_requires_real_secret(monkeypatch):
    monkeypatch.setenv("BS_ENV", "production")
    monkeypatch.setenv("BS_SECRET_KEY", "change-me-in-production")
    sys.modules.pop("config", None)
    config = importlib.import_module("config")
    try:
        config.validate_config()
    except RuntimeError as e:
        assert "BS_SECRET_KEY" in str(e)
    else:
        raise AssertionError("expected config failure")
```

- [ ] **Step 2: Add config validation**

In `config.py`:

```python
ENV = os.getenv("BS_ENV", "development")
DISABLE_SETTLEMENT_LOOP = os.getenv("BS_DISABLE_SETTLEMENT_LOOP", "") == "1"
PUBLIC_SERVER_URL = os.getenv("BS_PUBLIC_SERVER_URL", "")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("BS_ALLOWED_ORIGINS", "app://obsidian.md").split(",") if o.strip()]


def validate_config() -> None:
    if ENV == "production" and (SECRET_KEY == "change-me-in-production" or len(SECRET_KEY) < 32):
        raise RuntimeError("BS_SECRET_KEY must be set to a strong secret in production")
```

- [ ] **Step 3: Use config in app**

In `app.py`:

```python
CORS(app, origins=config.ALLOWED_ORIGINS)

@app.route("/healthz")
def healthz():
    return {"status": "ok"}, 200

@app.route("/readyz")
def readyz():
    return {"status": "ready"}, 200
```

Only start settlement thread when `not config.DISABLE_SETTLEMENT_LOOP`.

- [ ] **Step 4: Add `.env.example`**

Create `billing-server/.env.example`:

```dotenv
BS_ENV=production
BS_HOST=0.0.0.0
BS_PORT=8900
BS_PUBLIC_SERVER_URL=https://asr-api.example.com
BS_ALLOWED_ORIGINS=app://obsidian.md
BS_SECRET_KEY=replace-with-at-least-32-random-characters
BS_JWT_ACCESS_DAYS=7
BS_JWT_REFRESH_DAYS=30

TENCENT_APP_ID=
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=

AP_XUNHU_APPID=
AP_XUNHU_APPSECRET=
AP_XUNHU_NOTIFY_URL=https://asr-api.example.com/api/billing/callback/xunhu

BS_PRECHARGE_MINUTES=30
BS_PRICE_PER_HOUR_CENTS=200
BS_INITIAL_BALANCE_CENTS=100
BS_REPORT_TIMEOUT_MINUTES=10
BS_SIGN_VALID_MINUTES=30

BS_DATABASE_URL=sqlite:///billing.db
BS_LOGIN_RATE_LIMIT=5
```

- [ ] **Step 5: Run tests**

```bash
cd billing-server
python -m pytest tests/test_config.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add billing-server/config.py billing-server/app.py billing-server/Dockerfile billing-server/.env.example billing-server/tests/test_config.py
git commit -m "feat: harden billing server startup"
```

---

### Task 9: End-to-End Self Check

**Files:**
- Modify: `billing-server/self_check.py`
- Test: `billing-server/self_check.py`

- [ ] **Step 1: Replace MVP self-check**

Update `self_check.py` to:

1. Boot isolated SQLite.
2. Register user.
3. Login user.
4. Mock payment provider success.
5. Create recharge order.
6. Simulate valid paid callback.
7. Assert balance increased.
8. Mock Tencent config.
9. Request ASR sign.
10. Report 60 seconds usage.
11. Assert final balance and usage record.

- [ ] **Step 2: Run self-check**

```bash
cd billing-server
python self_check.py
```

Expected:

```txt
billing-server self-check ok
```

- [ ] **Step 3: Commit**

```bash
git add billing-server/self_check.py
git commit -m "test: cover billing server end-to-end self check"
```

---

### Task 10: Documentation and Release

**Files:**
- Modify: `README.md`
- Modify: `README_EN.md`
- Modify: `.logs/changes.md`
- Modify: `.logs/progress.md`

- [ ] **Step 1: Update docs**

Replace the current cloud billing section with:

- Deployment requirements.
- Environment variables.
- Payment callback URL.
- Pricing model: prepaid balance, precharge, settlement, expired charge.
- Security warnings: never expose Tencent or payment secrets to plugin users.
- Manual test checklist.

- [ ] **Step 2: Run all checks**

```bash
cd billing-server
python -m pytest tests -q
python self_check.py
cd ..
node --experimental-strip-types --test tests/*.test.ts
npm run build
```

Expected: all PASS.

- [ ] **Step 3: Manual Obsidian QA**

1. Copy built `main.js`, `manifest.json`, `styles.css` into the vault plugin directory.
2. Restart Obsidian.
3. Open Realtime Transcription settings.
4. Register/login against local server.
5. Trigger recharge flow with fake provider disabled and verify clear error.
6. Trigger cloud ASR with enough balance and verify precharge/report calls in server logs.

- [ ] **Step 4: Commit**

```bash
git add README.md README_EN.md .logs/changes.md .logs/progress.md
git commit -m "docs: document cloud billing operation"
```

- [ ] **Step 5: Release**

Use existing release flow:

```bash
npm version patch --no-git-tag-version
npm run build
git add manifest.json package.json package-lock.json versions.json styles.css
git commit -m "chore: release billing system"
git push origin feat/claudian-direct-context
```

Then publish GitHub release with `main.js`, `manifest.json`, `styles.css`.

---

## External References Checked

- Xunhu Pay API homepage: `https://api.xunhupay.com/`
- Xunhu Pay payment API docs: `https://www.xunhupay.com/doc/api/pay.html`
- Xunhu Pay order query API docs: `https://www.xunhupay.com/doc/api/search.html`

Use these docs when implementing `payment_xunhu.py` signing, callback, and order query. If provider docs disagree with this plan, provider docs win.
