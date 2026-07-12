# pyright: reportImplicitRelativeImport=false
import base64
import hashlib
import hmac
import json
import os
import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, quote, urlsplit


SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))
DB_FILE = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
DB_FILE.close()
os.environ["BS_DATABASE_URL"] = f"sqlite:///{DB_FILE.name}"

import config
import auth
import billing
import captcha
import database
import deepgram
import payment_creem
import payment_xunhu
import oauth
import signing
from billing import PLANS
from flask import Flask
from models import CaptchaChallenge, Order, OrderStatus, RateLimitEvent, SignRequest, UsageRecord, User, new_uuid, utcnow


class JsonResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self.payload = payload
        self.ok = 200 <= status_code < 300

    def json(self):
        return self.payload


class PaymentCallbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database.init_db()
        cls.app = Flask(__name__)
        cls.app.register_blueprint(auth.auth_bp)
        cls.app.register_blueprint(billing.billing_bp)
        cls.app.register_blueprint(signing.signing_bp)
        cls.app.register_blueprint(payment_creem.creem_bp)
        cls.app.register_blueprint(payment_xunhu.payment_bp)
        cls.app.register_blueprint(oauth.oauth_bp)
        cls.client = cls.app.test_client()

    @classmethod
    def tearDownClass(cls):
        database.engine.dispose()
        os.unlink(DB_FILE.name)

    def setUp(self):
        db = database.SessionLocal()
        db.query(RateLimitEvent).delete()
        db.query(CaptchaChallenge).delete()
        db.query(UsageRecord).delete()
        db.query(SignRequest).delete()
        db.query(Order).delete()
        db.query(User).delete()
        db.commit()
        db.close()
        config.CREEM_WEBHOOK_SECRET = "creem-test-secret"
        config.CREEM_PRODUCTS = {
            "trial": "prod_trial",
            "standard": "prod_standard",
            "pro": "prod_pro",
        }
        config.XUNHU_APPSECRET = "xunhu-test-secret"
        config.TENCENT_APP_ID = "1234567890"
        config.TENCENT_SECRET_ID = "tencent-secret-id"
        config.TENCENT_SECRET_KEY = "tencent-secret-key"
        config.DEEPGRAM_API_KEY = "deepgram-test-key"
        config.DEEPGRAM_PROJECT_ID = "deepgram-test-project"
        config.DEEPGRAM_TOKEN_TTL_SECONDS = 15
        config.PRICE_PER_HOUR_CENTS = 200
        config.PRECHARGE_MINUTES = 30
        config.PUBLIC_SERVER_URL = "https://example.invalid"
        config.GOOGLE_CLIENT_ID = "google-client-id"
        config.GOOGLE_CLIENT_SECRET = "google-client-secret"
        self.order_users = {}
        self.creem_checkouts = {}
        self.creem_get_patcher = patch.object(payment_creem.requests, "get", side_effect=self.creem_get)
        self.creem_get_patcher.start()
        self.addCleanup(self.creem_get_patcher.stop)

    def creem_get(self, *args, **kwargs):
        checkout_id = str((kwargs.get("params") or {}).get("checkout_id") or "")
        checkout = self.creem_checkouts.get(checkout_id)
        return JsonResponse(200 if checkout else 404, checkout or {"error": "not found"})

    def test_captcha_is_png_backed_by_shared_single_use_challenge(self):
        captcha_id = new_uuid()
        answer = "A2B3"
        db = database.SessionLocal()
        db.add(CaptchaChallenge(
            id=captcha_id,
            answer_digest=captcha._answer_digest(captcha_id, answer),
            fail_count=0,
            expires_at=utcnow() + timedelta(minutes=5),
        ))
        db.commit()
        db.close()

        image = captcha._render_png_data_url(answer)
        self.assertTrue(image.startswith("data:image/png;base64,"))
        self.assertEqual(base64.b64decode(image.split(",", 1)[1])[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(captcha.verify_image_captcha(captcha_id, answer), (True, "ok"))
        self.assertEqual(captcha.verify_image_captcha(captcha_id, answer), (False, "not_found"))

    def test_captcha_issuance_is_rate_limited(self):
        original_limit = config.CAPTCHA_RATE_LIMIT_PER_MINUTE
        config.CAPTCHA_RATE_LIMIT_PER_MINUTE = 2
        self.addCleanup(setattr, config, "CAPTCHA_RATE_LIMIT_PER_MINUTE", original_limit)

        self.assertEqual(self.client.post("/api/auth/captcha/image").status_code, 200)
        self.assertEqual(self.client.post("/api/auth/captcha/image").status_code, 200)
        self.assertEqual(self.client.post("/api/auth/captcha/image").status_code, 429)

    def test_login_ip_limit_cannot_be_bypassed_by_rotating_user_agent(self):
        original_ip_limit = config.AUTH_IP_RATE_LIMIT_PER_MINUTE
        config.AUTH_IP_RATE_LIMIT_PER_MINUTE = 1
        self.addCleanup(setattr, config, "AUTH_IP_RATE_LIMIT_PER_MINUTE", original_ip_limit)
        payload = {
            "email": "missing@example.invalid",
            "password": "wrong-password",
            "captcha_id": "captcha-test-id",
            "captcha_answer": "ABCD",
        }
        with patch.object(auth, "verify_image_captcha", return_value=(True, "ok")):
            first = self.client.post(
                "/api/auth/login",
                json=payload,
                headers={"x-vercel-forwarded-for": "203.0.113.10", "User-Agent": "browser-a"},
            )
            second = self.client.post(
                "/api/auth/login",
                json=payload,
                headers={"x-vercel-forwarded-for": "203.0.113.10", "User-Agent": "browser-b"},
            )
        self.assertEqual(first.status_code, 401)
        self.assertEqual(second.status_code, 429)

    def test_registration_ip_limit_blocks_rotating_emails_and_grants_no_free_balance(self):
        original_limit = config.REGISTRATION_RATE_LIMIT_PER_HOUR
        config.REGISTRATION_RATE_LIMIT_PER_HOUR = 1
        self.addCleanup(setattr, config, "REGISTRATION_RATE_LIMIT_PER_HOUR", original_limit)
        with patch.object(auth, "verify_image_captcha", return_value=(True, "ok")):
            first = self.client.post(
                "/api/auth/register",
                json={
                    "email": "first-registration@example.invalid",
                    "password": "password123",
                    "captcha_id": "captcha-a",
                    "captcha_answer": "ABCD",
                },
                headers={"x-vercel-forwarded-for": "203.0.113.11", "User-Agent": "browser-a"},
            )
            second = self.client.post(
                "/api/auth/register",
                json={
                    "email": "second-registration@example.invalid",
                    "password": "password123",
                    "captcha_id": "captcha-b",
                    "captcha_answer": "EFGH",
                },
                headers={"x-vercel-forwarded-for": "203.0.113.11", "User-Agent": "browser-b"},
            )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.get_json()["balance_cents"], 0)
        self.assertEqual(second.status_code, 429)

    def test_rate_limit_admission_is_atomic(self):
        def claim(_index):
            with self.app.test_request_context(
                "/api/auth/captcha/image",
                headers={"x-vercel-forwarded-for": "203.0.113.12"},
            ):
                return auth._check_rate_limit("atomic-test", auth._client_ip(), 1)

        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(claim, range(4)))
        self.assertEqual(results.count(True), 1)
        self.assertEqual(results.count(False), 3)

    def create_order(self, trade_order_id: str, amount_cents: int = 499, credit_cents: int = 490) -> str:
        user_id = new_uuid()
        db = database.SessionLocal()
        db.add(User(id=user_id, email=f"{user_id}@example.invalid", password_hash="x", balance_cents=0))
        db.add(Order(
            id=new_uuid(),
            user_id=user_id,
            trade_order_id=trade_order_id,
            amount_cents=amount_cents,
            credit_cents=credit_cents,
            provider_product_id="prod_trial",
            status=OrderStatus.CREATED,
            idempotency_key=f"ch_{trade_order_id}" if trade_order_id.startswith("CR-") else trade_order_id,
        ))
        db.commit()
        db.close()
        self.order_users[trade_order_id] = user_id
        return user_id

    def balance(self, user_id: str) -> int:
        db = database.SessionLocal()
        user = db.query(User).filter(User.id == user_id).first()
        value = user.balance_cents
        db.close()
        return value

    def authenticate_as(self, user_id: str):
        original = auth.require_auth
        auth.require_auth = lambda: (user_id, None)
        self.addCleanup(setattr, auth, "require_auth", original)

    def authenticate_asr_as(self, user_id: str):
        original_signing_auth = signing.require_auth
        original_billing_auth = billing.require_auth
        signing.require_auth = lambda: (user_id, None)
        billing.require_auth = lambda: (user_id, None)
        self.addCleanup(setattr, signing, "require_auth", original_signing_auth)
        self.addCleanup(setattr, billing, "require_auth", original_billing_auth)

    def create_asr_user(self, balance_cents: int = 500) -> str:
        user_id = new_uuid()
        db = database.SessionLocal()
        db.add(User(
            id=user_id,
            email=f"asr-{user_id}@example.invalid",
            password_hash="x",
            balance_cents=balance_cents,
        ))
        db.commit()
        db.close()
        return user_id

    def create_deepgram_session(self, user_id: str, client_session_id: str = "client-session-0001"):
        self.authenticate_asr_as(user_id)
        response = self.client.post(
            "/api/asr/session",
            json={
                "client_session_id": client_session_id,
                "provider": "deepgram",
                "language": "en",
            },
        )
        self.assertEqual(response.status_code, 200)
        return response.get_json()

    def deepgram_usage_record(
        self,
        session_id: str,
        request_id: str,
        duration: float = 12.4,
        extra_session_id: str | None = None,
    ):
        websocket_url = deepgram.build_websocket_url(extra_session_id or session_id, "en")
        parsed = urlsplit(websocket_url)
        return {
            "request": {
                "request_id": request_id,
                "project_uuid": config.DEEPGRAM_PROJECT_ID,
                "path": f"{parsed.path}?{parsed.query}",
                "response": {
                    "details": {
                        "usd": 0.00099,
                        "duration": duration,
                        "method": "streaming",
                        "tier": "nova-3",
                    },
                    "code": 200,
                },
                "code": 200,
            },
        }

    def creem_payload(
        self,
        trade_order_id: str,
        amount: int = 499,
        product_id: str = "prod_trial",
        checkout_id: str | None = None,
        metadata_user_id: str | None = None,
    ) -> bytes:
        resolved_checkout_id = checkout_id or f"ch_{trade_order_id}"
        provider_checkout = {
            "id": resolved_checkout_id,
            "request_id": trade_order_id,
            "status": "completed",
            "metadata": {
                "order_id": trade_order_id,
                "plan_id": "trial",
                "user_id": metadata_user_id or self.order_users[trade_order_id],
            },
            "product": {"id": product_id},
            "order": {
                "id": f"ord_{trade_order_id}",
                "transaction": f"tran_{trade_order_id}",
                "product": product_id,
                "amount": amount,
                "currency": "USD",
                "status": "paid",
            },
        }
        self.creem_checkouts[resolved_checkout_id] = provider_checkout
        webhook_checkout = {
            **provider_checkout,
            "order": {key: value for key, value in provider_checkout["order"].items() if key != "transaction"},
        }
        return json.dumps({
            "eventType": "checkout.completed",
            "object": webhook_checkout,
        }, separators=(",", ":")).encode()

    def post_creem(self, raw: bytes):
        signature = hmac.new(config.CREEM_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
        return self.client.post(
            "/api/billing/webhook/creem",
            data=raw,
            headers={"Content-Type": "application/json", "creem-signature": signature},
        )

    def test_creem_duplicate_callback_credits_once(self):
        trade_order_id = "CR-duplicate"
        user_id = self.create_order(trade_order_id)
        raw = self.creem_payload(trade_order_id)

        self.assertEqual(self.post_creem(raw).status_code, 200)
        self.assertEqual(self.post_creem(raw).status_code, 200)
        self.assertEqual(self.balance(user_id), 490)

    def test_creem_concurrent_callbacks_credit_once(self):
        trade_order_id = "CR-concurrent"
        user_id = self.create_order(trade_order_id)
        raw = self.creem_payload(trade_order_id)
        signature = hmac.new(config.CREEM_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()

        def post_callback(_):
            client = self.app.test_client()
            return client.post(
                "/api/billing/webhook/creem",
                data=raw,
                headers={"Content-Type": "application/json", "creem-signature": signature},
            ).status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(executor.map(post_callback, range(2)))

        self.assertEqual(statuses, [200, 200])
        self.assertEqual(self.balance(user_id), 490)

    def test_creem_amount_mismatch_is_rejected(self):
        trade_order_id = "CR-mismatch"
        user_id = self.create_order(trade_order_id)

        response = self.post_creem(self.creem_payload(trade_order_id, amount=250))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.balance(user_id), 0)

    def test_creem_product_mismatch_is_rejected(self):
        trade_order_id = "CR-product-mismatch"
        user_id = self.create_order(trade_order_id)

        response = self.post_creem(self.creem_payload(trade_order_id, product_id="prod_other"))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.balance(user_id), 0)

    def test_creem_checkout_mismatch_is_rejected(self):
        trade_order_id = "CR-checkout-mismatch"
        user_id = self.create_order(trade_order_id)

        response = self.post_creem(self.creem_payload(trade_order_id, checkout_id="ch_other"))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.balance(user_id), 0)

    def test_creem_user_mismatch_is_rejected(self):
        trade_order_id = "CR-user-mismatch"
        user_id = self.create_order(trade_order_id)

        response = self.post_creem(self.creem_payload(trade_order_id, metadata_user_id="other-user"))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.balance(user_id), 0)

    def test_creem_invalid_signature_is_rejected(self):
        trade_order_id = "CR-invalid-signature"
        user_id = self.create_order(trade_order_id)

        response = self.client.post(
            "/api/billing/webhook/creem",
            data=self.creem_payload(trade_order_id),
            headers={"Content-Type": "application/json", "creem-signature": "invalid"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.balance(user_id), 0)

    def test_creem_frozen_payment_amount_mismatch_is_rejected(self):
        trade_order_id = "CR-frozen-amount-mismatch"
        user_id = self.create_order(trade_order_id, amount_cents=1190, credit_cents=490)

        response = self.post_creem(self.creem_payload(trade_order_id, amount=499))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.balance(user_id), 0)

    def test_creem_legacy_checkout_credits_original_balance(self):
        trade_order_id = "CR-legacy"
        user_id = self.create_order(trade_order_id, amount_cents=490, credit_cents=490)

        response = self.post_creem(self.creem_payload(trade_order_id, amount=100))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.balance(user_id), 490)

    def test_creem_refund_revokes_credit_once(self):
        trade_order_id = "CR-refund"
        user_id = self.create_order(trade_order_id)
        self.assertEqual(self.post_creem(self.creem_payload(trade_order_id)).status_code, 200)

        raw = json.dumps({
            "eventType": "refund.created",
            "object": {
                "status": "succeeded",
                "transaction": {"id": f"tran_{trade_order_id}"},
            },
        }, separators=(",", ":")).encode()
        self.assertEqual(self.post_creem(raw).status_code, 200)
        self.assertEqual(self.post_creem(raw).status_code, 200)
        self.assertEqual(self.balance(user_id), 0)

        self.assertEqual(self.post_creem(self.creem_payload(trade_order_id)).status_code, 200)
        self.assertEqual(self.balance(user_id), 0)
        db = database.SessionLocal()
        order = db.query(Order).filter(Order.trade_order_id == trade_order_id).one()
        self.assertEqual(order.status, OrderStatus.REFUNDED)
        db.close()

    def test_creem_dispute_can_make_spent_balance_negative(self):
        trade_order_id = "CR-dispute"
        user_id = self.create_order(trade_order_id)
        self.assertEqual(self.post_creem(self.creem_payload(trade_order_id)).status_code, 200)
        db = database.SessionLocal()
        db.query(User).filter(User.id == user_id).update({User.balance_cents: 100})
        db.commit()
        db.close()

        raw = json.dumps({
            "eventType": "dispute.created",
            "object": {"transaction": {"id": f"tran_{trade_order_id}"}},
        }, separators=(",", ":")).encode()
        self.assertEqual(self.post_creem(raw).status_code, 200)
        self.assertEqual(self.balance(user_id), -390)

    def test_creem_return_refresh_credits_completed_checkout(self):
        trade_order_id = "CR-return-refresh"
        user_id = self.create_order(trade_order_id)
        db = database.SessionLocal()
        order = db.query(Order).filter(Order.trade_order_id == trade_order_id).first()
        order.idempotency_key = "ch_return_refresh"
        db.commit()
        db.close()
        self.creem_payload(trade_order_id, checkout_id="ch_return_refresh")
        result = payment_creem.refresh_creem_order(user_id, trade_order_id)

        self.assertEqual(result["status"], OrderStatus.CREDITED)
        self.assertEqual(self.balance(user_id), 490)

    def test_oauth_callback_escapes_script_terminators_in_return_url(self):
        return_url = "/account?next=</script><script>globalThis.oauthXss=1</script>"
        authorize = self.client.get(
            f"/api/auth/oauth/google/authorize?return_url={quote(return_url, safe='')}"
        )
        self.assertEqual(authorize.status_code, 200)
        state = parse_qs(urlsplit(authorize.get_json()["url"]).query)["state"][0]

        with patch.object(
            oauth,
            "_exchange_google",
            return_value={"email": "oauth-security@example.invalid", "name": "OAuth Security"},
        ):
            callback = self.client.get(
                f"/api/auth/oauth/google/callback?code=test-code&state={quote(state, safe='')}"
            )

        html = callback.get_data(as_text=True)
        self.assertEqual(callback.status_code, 200)
        self.assertNotIn("</script><script>globalThis.oauthXss", html)
        self.assertIn(r"\u003c/script\u003e", html)

    def test_xunhu_duplicate_callback_credits_once(self):
        trade_order_id = "RT-duplicate"
        user_id = self.create_order(trade_order_id, amount_cents=1190, credit_cents=490)
        params = {
            "trade_order_id": trade_order_id,
            "total_fee": "11.90",
            "status": "OD",
            "time": str(int(time.time())),
        }
        params["hash"] = payment_xunhu._sign(params, config.XUNHU_APPSECRET)

        self.assertEqual(self.client.post("/api/billing/callback/xunhu", data=params).status_code, 200)
        self.assertEqual(self.client.post("/api/billing/callback/xunhu", data=params).status_code, 200)
        self.assertEqual(self.balance(user_id), 490)

        params["status"] = "CD"
        params["time"] = str(int(time.time()))
        params["hash"] = payment_xunhu._sign(params, config.XUNHU_APPSECRET)
        self.assertEqual(self.client.post("/api/billing/callback/xunhu", data=params).status_code, 200)
        self.assertEqual(self.client.post("/api/billing/callback/xunhu", data=params).status_code, 200)
        self.assertEqual(self.balance(user_id), 0)

        params["status"] = "OD"
        params["time"] = str(int(time.time()))
        params["hash"] = payment_xunhu._sign(params, config.XUNHU_APPSECRET)
        self.assertEqual(self.client.post("/api/billing/callback/xunhu", data=params).status_code, 200)
        self.assertEqual(self.balance(user_id), 0)
        db = database.SessionLocal()
        order = db.query(Order).filter(Order.trade_order_id == trade_order_id).one()
        self.assertEqual(order.status, OrderStatus.REFUNDED)
        db.close()

    def test_owner_can_delete_unpaid_order(self):
        trade_order_id = "RT-delete"
        user_id = self.create_order(trade_order_id)
        self.authenticate_as(user_id)

        response = self.client.delete(f"/api/billing/orders/{trade_order_id}")
        self.assertEqual(response.status_code, 200)

        db = database.SessionLocal()
        order = db.query(Order).filter(Order.trade_order_id == trade_order_id).first()
        self.assertEqual(order.status, OrderStatus.CANCELED)
        db.close()

    def test_user_cannot_delete_another_users_order(self):
        trade_order_id = "RT-delete-other"
        self.create_order(trade_order_id)
        self.authenticate_as(new_uuid())

        response = self.client.delete(f"/api/billing/orders/{trade_order_id}")
        self.assertEqual(response.status_code, 404)

    def test_paid_callback_after_delete_still_credits_balance(self):
        trade_order_id = "RT-delete-then-pay"
        user_id = self.create_order(trade_order_id, amount_cents=1190, credit_cents=490)
        self.authenticate_as(user_id)
        self.assertEqual(self.client.delete(f"/api/billing/orders/{trade_order_id}").status_code, 200)

        params = {
            "trade_order_id": trade_order_id,
            "total_fee": "11.90",
            "status": "OD",
            "time": str(int(time.time())),
        }
        params["hash"] = payment_xunhu._sign(params, config.XUNHU_APPSECRET)
        self.assertEqual(self.client.post("/api/billing/callback/xunhu", data=params).status_code, 200)
        self.assertEqual(self.balance(user_id), 490)

    def test_xunhu_missing_payment_url_is_rejected(self):
        config.XUNHU_APPID = "xunhu-test-app"
        config.XUNHU_NOTIFY_URL = "https://example.invalid/callback"
        config.PUBLIC_SERVER_URL = "https://example.invalid"

        class Response:
            def json(self):
                return {"errcode": 0}

        original_post = payment_xunhu.requests.post
        payment_xunhu.requests.post = lambda *args, **kwargs: Response()
        try:
            result = payment_xunhu.create_payment_url(new_uuid(), "11.90", "4.90", "test")
        finally:
            payment_xunhu.requests.post = original_post

        self.assertEqual(result["error"], "微信支付未返回有效跳转地址，请稍后重试")

    def test_xunhu_rejects_non_official_payment_url(self):
        self.assertFalse(payment_xunhu._is_xunhu_payment_url("http://api.xunhupay.com/pay"))
        self.assertFalse(payment_xunhu._is_xunhu_payment_url("https://checkout.example.invalid/pay"))
        self.assertTrue(payment_xunhu._is_xunhu_payment_url("https://api.xunhupay.com/pay"))

    def test_creem_rejects_non_official_checkout_url(self):
        self.assertFalse(payment_creem._is_creem_checkout_url("http://www.creem.io/checkout"))
        self.assertFalse(payment_creem._is_creem_checkout_url("https://checkout.example.invalid/checkout"))
        self.assertTrue(payment_creem._is_creem_checkout_url("https://www.creem.io/checkout/test"))
        self.assertTrue(payment_creem._is_creem_checkout_url("https://checkout.creem.io/checkout/test"))

    def test_browser_registration_requires_valid_captcha(self):
        missing = self.client.post("/api/auth/register", json={
            "email": "browser-register@example.invalid",
            "password": "password123",
        })
        self.assertEqual(missing.status_code, 400)

        with patch.object(auth, "verify_image_captcha", return_value=(True, "ok")):
            response = self.client.post("/api/auth/register", json={
                "email": "browser-register@example.invalid",
                "password": "password123",
                "captcha_id": "captcha-test-id",
                "captcha_answer": "ABCD",
            })
        self.assertEqual(response.status_code, 201)

    def test_all_password_login_endpoints_require_captcha(self):
        email = "browser-login@example.invalid"
        password = "password123"
        db = database.SessionLocal()
        db.add(User(
            id=new_uuid(),
            email=email,
            password_hash=auth.bcrypt.hashpw(password.encode(), auth.bcrypt.gensalt()).decode(),
            balance_cents=100,
        ))
        db.commit()
        db.close()

        missing = self.client.post("/api/auth/browser-login", json={
            "email": email,
            "password": password,
        })
        self.assertEqual(missing.status_code, 400)

        with patch.object(auth, "verify_image_captcha", return_value=(True, "ok")):
            browser = self.client.post("/api/auth/browser-login", json={
                "email": email,
                "password": password,
                "captcha_id": "captcha-test-id",
                "captcha_answer": "ABCD",
            })
        self.assertEqual(browser.status_code, 200)

        plugin_missing = self.client.post("/api/auth/login", json={
            "email": email,
            "password": password,
        })
        self.assertEqual(plugin_missing.status_code, 400)

        with patch.object(auth, "verify_image_captcha", return_value=(True, "ok")):
            plugin = self.client.post("/api/auth/login", json={
                "email": email,
                "password": password,
                "captcha_id": "captcha-test-id",
                "captcha_answer": "ABCD",
            })
        self.assertEqual(plugin.status_code, 200)

    def test_oauth_only_user_can_set_initial_plugin_password_once(self):
        user_id = new_uuid()
        db = database.SessionLocal()
        db.add(User(
            id=user_id,
            email="oauth-only@example.invalid",
            password_hash=oauth.OAUTH_ONLY_PASSWORD,
            balance_cents=100,
        ))
        db.commit()
        db.close()
        token = auth._create_tokens(user_id)["token"]
        headers = {"Authorization": f"Bearer {token}"}

        before = self.client.get("/api/billing/me", headers=headers)
        self.assertFalse(before.get_json()["password_set"])
        response = self.client.post("/api/auth/password", headers=headers, json={
            "password": "new-password-123",
        })
        self.assertEqual(response.status_code, 200)
        again = self.client.post("/api/auth/password", headers=headers, json={
            "password": "another-password-123",
        })
        self.assertEqual(again.status_code, 409)
        after = self.client.get("/api/billing/me", headers=headers)
        self.assertTrue(after.get_json()["password_set"])

    def test_create_order_rejects_invalid_plan(self):
        original_require_auth = auth.require_auth
        auth.require_auth = lambda: ("test-user", None)
        try:
            response = self.client.post("/api/billing/create-order", json={
                "plan_id": "not-a-plan",
                "provider": "wechat",
            })
        finally:
            auth.require_auth = original_require_auth

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "Invalid plan")

    def test_pricing_uses_fixed_minutes_and_separate_credit(self):
        self.assertEqual(
            [
                (plan["amount_yuan"], plan["amount_usd"], plan["credit_yuan"], plan["minutes"])
                for plan in PLANS
            ],
            [
                ("11.90", "4.99", "4.90", 147),
                ("23.90", "8.99", "9.90", 297),
                ("72.90", "26.99", "29.90", 897),
            ],
        )

        response = self.client.get("/api/billing/plans")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [(plan["amount_yuan"], plan["amount_usd"], plan["minutes"]) for plan in response.get_json()["plans"]],
            [("11.90", "4.99", 147), ("23.90", "8.99", 297), ("72.90", "26.99", 897)],
        )
        self.assertNotIn("credit_yuan", response.get_data(as_text=True))

    def test_cloud_session_auto_routes_by_country_and_defaults_to_tencent(self):
        china_user = self.create_asr_user()
        self.authenticate_asr_as(china_user)
        china = self.client.post(
            "/api/asr/session",
            headers={"x-vercel-ip-country": "CN"},
            json={
                "client_session_id": "route-china-0001",
                "provider": "auto",
                "language": "zh-HK",
            },
        )
        self.assertEqual(china.status_code, 200)
        self.assertEqual(china.get_json()["provider"], "tencent")
        self.assertEqual(china.get_json()["engine_model"], "16k_yue")

        default_user = self.create_asr_user()
        self.authenticate_asr_as(default_user)
        default = self.client.post(
            "/api/asr/session",
            json={
                "client_session_id": "route-default-01",
                "provider": "auto",
                "language": "auto",
            },
        )
        self.assertEqual(default.status_code, 200)
        self.assertEqual(default.get_json()["provider"], "tencent")

        overseas_user = self.create_asr_user()
        self.authenticate_asr_as(overseas_user)
        overseas = self.client.post(
            "/api/asr/session",
            headers={"x-vercel-ip-country": "US"},
            json={
                "client_session_id": "route-overseas-1",
                "provider": "auto",
                "language": "auto",
            },
        )
        self.assertEqual(overseas.status_code, 200)
        self.assertEqual(overseas.get_json()["provider"], "deepgram")
        self.assertEqual(overseas.get_json()["auth_type"], "proxy")
        self.assertTrue(overseas.get_json()["websocket_url"].endswith("/api/asr/proxy"))
        self.assertNotIn("api.deepgram.com", overseas.get_json()["websocket_url"])
        self.assertTrue(overseas.get_json()["proxy_token"])

    def test_cloud_session_rejects_unavailable_manual_provider_without_precharge(self):
        user_id = self.create_asr_user()
        self.authenticate_asr_as(user_id)
        config.DEEPGRAM_API_KEY = ""

        response = self.client.post(
            "/api/asr/session",
            json={
                "client_session_id": "unavailable-dg-01",
                "provider": "deepgram",
                "language": "en",
            },
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.balance(user_id), 500)

    def test_cloud_session_rejects_insufficient_balance(self):
        user_id = self.create_asr_user(balance_cents=99)
        self.authenticate_asr_as(user_id)

        response = self.client.post(
            "/api/asr/session",
            json={
                "client_session_id": "insufficient-0001",
                "provider": "tencent",
                "language": "zh-CN",
            },
        )

        self.assertEqual(response.status_code, 402)
        self.assertEqual(self.balance(user_id), 99)

    def test_deepgram_grant_failure_refunds_precharge(self):
        user_id = self.create_asr_user()
        self.authenticate_asr_as(user_id)
        with patch.object(deepgram, "create_proxy_token", side_effect=deepgram.DeepgramProviderError()):
            response = self.client.post(
                "/api/asr/session",
                json={
                    "client_session_id": "grant-failure-001",
                    "provider": "deepgram",
                    "language": "en",
                },
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.balance(user_id), 500)
        db = database.SessionLocal()
        sign_req = db.query(SignRequest).filter(SignRequest.user_id == user_id).one()
        self.assertEqual((sign_req.settled, sign_req.actual_cost_cents), (1, 0))
        db.close()

    def test_deepgram_provider_failure_refunds_precharge(self):
        user_id = self.create_asr_user()
        session = self.create_deepgram_session(user_id, "provider-failure-01")
        request_id = "99999999-aaaa-4bbb-8ccc-dddddddddddd"
        failed = self.deepgram_usage_record(session["session_id"], request_id)
        failed["request"]["response"] = {"code": 401}

        with patch.object(deepgram.requests, "get", return_value=JsonResponse(200, failed)):
            response = self.client.post(
                "/api/billing/report",
                json={
                    "session_id": session["session_id"],
                    "provider_request_id": request_id,
                    "duration_seconds": 0,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["cost_cents"], 0)
        self.assertEqual(response.get_json()["refund_cents"], 100)
        self.assertEqual(self.balance(user_id), 500)

    def test_deepgram_client_session_cannot_issue_credentials_twice(self):
        user_id = self.create_asr_user()
        first = self.create_deepgram_session(user_id, "idempotent-session-1")
        with patch.object(deepgram, "create_proxy_token") as grant:
            second = self.client.post(
                "/api/asr/session",
                json={
                    "client_session_id": "idempotent-session-1",
                    "provider": "deepgram",
                    "language": "en",
                },
            )

        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.get_json()["session_id"], first["session_id"])
        grant.assert_not_called()
        self.assertEqual(self.balance(user_id), 400)
        db = database.SessionLocal()
        self.assertEqual(db.query(SignRequest).filter(SignRequest.user_id == user_id).count(), 1)
        db.close()

        blocked = self.client.post(
            "/api/asr/session",
            json={
                "client_session_id": "idempotent-session-2",
                "provider": "deepgram",
                "language": "en",
            },
        )
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(self.balance(user_id), 400)

    def test_deepgram_proxy_token_allows_only_one_upstream_connection(self):
        user_id = self.create_asr_user()
        session = self.create_deepgram_session(user_id, "single-proxy-session")
        token = session["proxy_token"]

        first = self.client.post("/api/asr/proxy/authorize", json={"token": token})
        second = self.client.post("/api/asr/proxy/authorize", json={"token": token})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.get_json()["max_seconds"], config.PRECHARGE_MINUTES * 60)
        self.assertEqual(second.status_code, 409)

        connected = self.client.post("/api/asr/proxy/connected", json={"token": token})
        self.assertEqual(connected.status_code, 200)
        repeated = self.client.post("/api/asr/proxy/connected", json={"token": token})
        self.assertEqual(repeated.status_code, 200)
        db = database.SessionLocal()
        sign_req = db.query(SignRequest).filter(SignRequest.id == session["session_id"]).one()
        self.assertEqual(sign_req.proxy_connected, 2)
        db.close()

    def test_deepgram_proxy_startup_failure_refunds_precharge(self):
        user_id = self.create_asr_user()
        session = self.create_deepgram_session(user_id, "proxy-startup-failure")
        token = session["proxy_token"]

        self.assertEqual(
            self.client.post("/api/asr/proxy/authorize", json={"token": token}).status_code,
            200,
        )
        self.assertEqual(
            self.client.post("/api/asr/proxy/failed", json={"token": token}).status_code,
            200,
        )
        self.assertEqual(self.balance(user_id), 500)

    def test_unconfirmed_deepgram_proxy_is_refunded_on_expiry(self):
        user_id = self.create_asr_user()
        session = self.create_deepgram_session(user_id, "proxy-expiry-refund")
        token = session["proxy_token"]
        self.assertEqual(
            self.client.post("/api/asr/proxy/authorize", json={"token": token}).status_code,
            200,
        )
        db = database.SessionLocal()
        sign_req = db.query(SignRequest).filter(SignRequest.id == session["session_id"]).one()
        sign_req.created_at = signing.utcnow() - timedelta(minutes=config.REPORT_TIMEOUT_MINUTES + 1)
        db.commit()
        db.close()

        self.assertEqual(billing.settle_expired_requests(user_id), 1)
        self.assertEqual(self.balance(user_id), 500)

    def test_deepgram_report_without_request_id_keeps_precharge_until_timeout(self):
        user_id = self.create_asr_user()
        session = self.create_deepgram_session(user_id, "abort-no-request-id")
        token = session["proxy_token"]
        self.assertEqual(
            self.client.post("/api/asr/proxy/authorize", json={"token": token}).status_code,
            200,
        )
        self.assertEqual(
            self.client.post("/api/asr/proxy/connected", json={"token": token}).status_code,
            200,
        )

        response = self.client.post(
            "/api/billing/report",
            json={
                "session_id": session["session_id"],
                "duration_seconds": 1,
            },
        )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.get_json()["message"], "Cloud usage record pending")
        self.assertEqual(self.balance(user_id), 400)

        db = database.SessionLocal()
        sign_req = db.query(SignRequest).filter(SignRequest.id == session["session_id"]).one()
        sign_req.created_at = signing.utcnow() - timedelta(minutes=config.REPORT_TIMEOUT_MINUTES + 1)
        db.commit()
        db.close()

        self.assertEqual(billing.settle_expired_requests(user_id), 1)
        self.assertEqual(self.balance(user_id), 400)

    def test_deepgram_report_uses_provider_duration_and_is_idempotent(self):
        user_id = self.create_asr_user()
        session = self.create_deepgram_session(user_id, "settlement-session-1")
        request_id = "11111111-2222-4333-8444-555555555555"
        record = self.deepgram_usage_record(session["session_id"], request_id)

        with patch.object(deepgram.requests, "get", return_value=JsonResponse(200, record)):
            response = self.client.post(
                "/api/billing/report",
                json={
                    "session_id": session["session_id"],
                    "provider_request_id": request_id,
                    "duration_seconds": 9999,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["cost_cents"], 1)
        self.assertEqual(response.get_json()["balance_cents"], 499)
        db = database.SessionLocal()
        sign_req = db.query(SignRequest).filter(SignRequest.id == session["session_id"]).one()
        usage = db.query(UsageRecord).filter(UsageRecord.sign_request_id == session["session_id"]).one()
        self.assertEqual(sign_req.duration_seconds, 13)
        self.assertEqual(sign_req.provider_cost_microusd, 990)
        self.assertEqual((usage.provider, usage.engine_model), ("deepgram", "nova-3"))
        db.close()

        duplicate = self.client.post(
            "/api/billing/report",
            json={
                "session_id": session["session_id"],
                "provider_request_id": request_id,
                "duration_seconds": 0,
            },
        )
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(duplicate.get_json()["cost_cents"], 1)
        self.assertEqual(self.balance(user_id), 499)

    def test_deepgram_report_calculates_provider_cost_when_request_omits_usd(self):
        user_id = self.create_asr_user()
        session = self.create_deepgram_session(user_id, "settlement-no-usd-1")
        request_id = "12121212-3434-4567-8787-909090909090"
        record = self.deepgram_usage_record(
            session["session_id"],
            request_id,
            duration=30,
        )
        del record["request"]["response"]["details"]["usd"]

        with patch.object(deepgram.requests, "get", return_value=JsonResponse(200, record)):
            response = self.client.post(
                "/api/billing/report",
                json={
                    "session_id": session["session_id"],
                    "provider_request_id": request_id,
                    "duration_seconds": 9999,
                },
            )

        self.assertEqual(response.status_code, 200)
        db = database.SessionLocal()
        sign_req = db.query(SignRequest).filter(SignRequest.id == session["session_id"]).one()
        self.assertEqual(sign_req.duration_seconds, 30)
        self.assertEqual(
            sign_req.provider_cost_microusd,
            round(30 * config.DEEPGRAM_NOVA3_MONOLINGUAL_USD_PER_MINUTE * 1_000_000 / 60),
        )
        db.close()

    def test_deepgram_pending_report_is_reconciled_on_balance_query(self):
        user_id = self.create_asr_user()
        session = self.create_deepgram_session(user_id, "pending-session-001")
        request_id = "22222222-3333-4444-8555-666666666666"

        with patch.object(deepgram.requests, "get", return_value=JsonResponse(404, {})):
            pending = self.client.post(
                "/api/billing/report",
                json={
                    "session_id": session["session_id"],
                    "provider_request_id": request_id,
                    "duration_seconds": 0,
                },
            )
        self.assertEqual(pending.status_code, 202)
        self.assertEqual(self.balance(user_id), 400)

        record = self.deepgram_usage_record(session["session_id"], request_id)
        with patch.object(deepgram.requests, "get", return_value=JsonResponse(200, record)):
            balance_response = self.client.get("/api/billing/balance")
        self.assertEqual(balance_response.status_code, 200)
        self.assertEqual(balance_response.get_json()["balance_cents"], 499)

    def test_deepgram_forged_session_metadata_is_rejected(self):
        user_id = self.create_asr_user()
        session = self.create_deepgram_session(user_id, "forged-session-0001")
        request_id = "33333333-4444-4555-8666-777777777777"
        forged = self.deepgram_usage_record(
            session["session_id"],
            request_id,
            extra_session_id="another-session-id",
        )

        with patch.object(deepgram.requests, "get", return_value=JsonResponse(200, forged)):
            response = self.client.post(
                "/api/billing/report",
                json={
                    "session_id": session["session_id"],
                    "provider_request_id": request_id,
                    "duration_seconds": 1,
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.balance(user_id), 400)
        db = database.SessionLocal()
        sign_req = db.query(SignRequest).filter(SignRequest.id == session["session_id"]).one()
        self.assertIsNone(sign_req.provider_request_id)
        self.assertEqual(sign_req.settled, 0)
        db.close()

    def test_deepgram_request_cannot_be_billed_to_two_sessions(self):
        first_user = self.create_asr_user()
        first = self.create_deepgram_session(first_user, "unique-request-first")
        request_id = "44444444-5555-4666-8777-888888888888"
        first_record = self.deepgram_usage_record(first["session_id"], request_id)
        with patch.object(deepgram.requests, "get", return_value=JsonResponse(200, first_record)):
            self.assertEqual(self.client.post(
                "/api/billing/report",
                json={"session_id": first["session_id"], "provider_request_id": request_id},
            ).status_code, 200)

        second_user = self.create_asr_user()
        second = self.create_deepgram_session(second_user, "unique-request-second")
        duplicate = self.client.post(
            "/api/billing/report",
            json={"session_id": second["session_id"], "provider_request_id": request_id},
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(self.balance(second_user), 400)

    def test_legacy_tencent_sign_and_report_remain_compatible(self):
        user_id = self.create_asr_user()
        self.authenticate_asr_as(user_id)
        sign_response = self.client.post(
            "/api/asr/sign",
            json={"engine_model": "16k_zh"},
        )
        self.assertEqual(sign_response.status_code, 200)
        sign_data = sign_response.get_json()
        self.assertTrue(sign_data["signed_url"].startswith("wss://asr.cloud.tencent.com/"))

        report = self.client.post(
            "/api/billing/report",
            json={
                "sign_request_id": sign_data["sign_request_id"],
                "duration_seconds": 1,
            },
        )
        self.assertEqual(report.status_code, 200)
        self.assertEqual(report.get_json()["balance_cents"], 499)


if __name__ == "__main__":
    unittest.main()
