# pyright: reportImplicitRelativeImport=false, reportMissingImports=false
import hashlib
import hmac
import json
import os
import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import requests
from flask import Blueprint, jsonify, request
from sqlalchemy import update

import config
from billing import plan_by_id
from database import SessionLocal
from models import Order, OrderStatus, User, new_uuid
from payment_common import revoke_order_credit

creem_bp = Blueprint("creem", __name__, url_prefix="/api/billing")


def _base_url() -> str:
    return "https://test-api.creem.io/v1" if config.CREEM_TEST_MODE else "https://api.creem.io/v1"


def _configured_product(plan_id: str) -> str:
    return config.CREEM_PRODUCTS.get(plan_id, "")


def _is_creem_checkout_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme == "https" and parsed.hostname in {"creem.io", "www.creem.io", "checkout.creem.io"}


def _amount_to_cents(amount_yuan: str) -> int:
    try:
        value = (Decimal(str(amount_yuan)) * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("Invalid amount") from exc
    return int(value)


def _normalize_success_url(return_url: str) -> str:
    parsed = urlparse(return_url)
    if parsed.hostname != "127.0.0.1":
        return return_url
    netloc = "localhost"
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    return urlunparse(parsed._replace(netloc=netloc))


def _order_success_url(return_url: str, trade_order_id: str) -> str:
    parsed = urlparse(_normalize_success_url(return_url))
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["order"] = trade_order_id
    return urlunparse(parsed._replace(query=urlencode(query)))


def create_creem_checkout(user_id: str, plan_id: str, return_url: str) -> dict[str, Any]:
    if config.CREEM_PRICE_VERSION != "20260711-crossborder":
        return {"error": "银行卡支付价格更新中，请稍后重试"}
    plan = plan_by_id(plan_id)
    product_id = _configured_product(plan_id)
    if not (config.CREEM_API_KEY and config.CREEM_WEBHOOK_SECRET and plan and product_id):
        return {"error": "银行卡支付暂未配置，请先使用微信支付"}

    trade_order_id = f"CR-{int(time.time())}-{os.urandom(4).hex()}"
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        order = Order(
            id=new_uuid(),
            user_id=user_id,
            trade_order_id=trade_order_id,
            amount_cents=_amount_to_cents(str(plan["amount_usd"])),
            credit_cents=_amount_to_cents(str(plan["credit_yuan"])),
            provider_product_id=product_id,
            status=OrderStatus.CREATED,
            idempotency_key=trade_order_id,
        )
        db.add(order)
        db.commit()
        customer_email = user.email if user else None
    finally:
        db.close()

    payload: dict[str, Any] = {
        "product_id": product_id,
        "request_id": trade_order_id,
        "success_url": _order_success_url(return_url, trade_order_id),
        "metadata": {"user_id": user_id, "plan_id": plan_id, "order_id": trade_order_id},
    }
    if customer_email:
        payload["customer"] = {"email": customer_email}

    try:
        response = requests.post(
            f"{_base_url()}/checkouts",
            headers={"x-api-key": config.CREEM_API_KEY, "Content-Type": "application/json"},
            json=payload,
            timeout=10,
        )
        result = response.json()
        if response.ok and _is_creem_checkout_url(result.get("checkout_url")):
            checkout_id = str(result.get("id") or "")
            if checkout_id:
                db = SessionLocal()
                try:
                    db.query(Order).filter(Order.trade_order_id == trade_order_id).update({
                        Order.idempotency_key: checkout_id,
                    })
                    db.commit()
                finally:
                    db.close()
            return {
                "url": result["checkout_url"],
                "order_id": trade_order_id,
                "provider": "card",
                "checkout_id": checkout_id,
            }
        return {"error": result.get("message") or result.get("error") or "Creem checkout creation failed"}
    except (requests.RequestException, ValueError):
        return {"error": "银行卡支付服务暂时不可用，请稍后重试"}


def _valid_signature(raw_body: bytes, signature: str) -> bool:
    if not config.CREEM_WEBHOOK_SECRET or not signature:
        return False
    expected = hmac.new(config.CREEM_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _get_checkout(checkout_id: str) -> tuple[dict[str, Any] | None, str]:
    if not checkout_id.startswith("ch_"):
        return None, "mismatch"
    try:
        response = requests.get(
            f"{_base_url()}/checkouts",
            headers={"x-api-key": config.CREEM_API_KEY},
            params={"checkout_id": checkout_id},
            timeout=10,
        )
        result = response.json()
    except (requests.RequestException, ValueError):
        return None, "unavailable"
    if not response.ok:
        return None, "unavailable"
    if not isinstance(result, dict) or result.get("id") != checkout_id:
        return None, "mismatch"
    return result, "success"


def _credit_completed_checkout(db, order: Order, checkout: dict[str, Any]) -> tuple[bool, str]:
    if checkout.get("status") != "completed":
        return False, "pending"

    metadata = checkout.get("metadata") or {}
    plan_id = str(metadata.get("plan_id") or "")
    plan = plan_by_id(plan_id)
    paid_order = checkout.get("order") or {}
    checkout_product = checkout.get("product") or {}
    reported_product_id = paid_order.get("product")
    if not reported_product_id and isinstance(checkout_product, dict):
        reported_product_id = checkout_product.get("id")
    expected_credit_cents = _amount_to_cents(plan["credit_yuan"]) if plan else -1
    legacy_usd_cents = {"trial": 100, "standard": 139, "pro": 419}.get(plan_id, -1)
    is_legacy_order = order.credit_cents == order.amount_cents
    expected_order_amount = legacy_usd_cents if is_legacy_order else order.amount_cents
    checkout_id = str(checkout.get("id") or "")
    expected_checkout_id = str(order.idempotency_key or "")
    expected_product_id = order.provider_product_id
    provider_order_id = str(paid_order.get("id") or "")
    transaction_id = str(paid_order.get("transaction") or "")
    if not (
        plan
        and checkout_id.startswith("ch_")
        and checkout_id == expected_checkout_id
        and provider_order_id.startswith("ord_")
        and transaction_id.startswith(("tran_", "tx_", "txn_"))
        and metadata.get("order_id") == order.trade_order_id
        and metadata.get("user_id") == order.user_id
        and (not expected_product_id or reported_product_id == expected_product_id)
        and paid_order.get("status") == "paid"
        and paid_order.get("currency") == "USD"
        and paid_order.get("amount") == expected_order_amount
        and (order.credit_cents or order.amount_cents) == expected_credit_cents
    ):
        return False, "mismatch"

    credited = db.execute(
        update(Order)
        .where(
            Order.id == order.id,
            Order.status.in_((OrderStatus.CREATED, OrderStatus.CANCELED)),
        )
        .values(status=OrderStatus.CREDITED, provider_transaction_id=transaction_id)
    )
    if credited.rowcount == 1:
        db.execute(
            update(User)
            .where(User.id == order.user_id)
            .values(balance_cents=User.balance_cents + (order.credit_cents or order.amount_cents))
        )
    db.commit()
    return True, "success"


def refresh_creem_order(user_id: str, trade_order_id: str) -> dict[str, Any]:
    db = SessionLocal()
    try:
        order = db.query(Order).filter(
            Order.trade_order_id == trade_order_id,
            Order.user_id == user_id,
        ).first()
        if not order:
            return {"error": "Order not found"}
        if order.status in (OrderStatus.CREDITED, OrderStatus.PAID):
            return {"status": order.status}
        checkout_id = order.idempotency_key or ""
        if not checkout_id.startswith("ch_"):
            return {"status": order.status}
        result, lookup_reason = _get_checkout(checkout_id)
        if not result:
            if lookup_reason == "mismatch":
                return {"error": "payment details mismatch"}
            return {"error": "Creem checkout lookup failed"}
        credited, reason = _credit_completed_checkout(db, order, result)
        if not credited and reason == "mismatch":
            return {"error": "payment details mismatch"}
        return {"status": OrderStatus.CREDITED if credited else order.status}
    except (requests.RequestException, ValueError):
        return {"error": "银行卡支付状态查询失败，请稍后重试"}
    finally:
        db.close()


@creem_bp.route("/callback/creem", methods=["POST"])
@creem_bp.route("/webhook/creem", methods=["POST"])
def creem_callback():
    raw_body = request.get_data()
    if not _valid_signature(raw_body, request.headers.get("creem-signature", "")):
        return jsonify({"error": "invalid signature"}), 403

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError:
        return jsonify({"error": "invalid payload"}), 400
    event_type = payload.get("eventType")
    if event_type in {"refund.created", "dispute.created"}:
        event = payload.get("object") or {}
        transaction_id = str((event.get("transaction") or {}).get("id") or "")
        if not transaction_id:
            return jsonify({"error": "missing transaction"}), 400
        if event_type == "refund.created" and event.get("status") != "succeeded":
            return jsonify({"status": "ignored"}), 200
        db = SessionLocal()
        try:
            order = db.query(Order).filter(Order.provider_transaction_id == transaction_id).first()
            if not order:
                return jsonify({"error": "order not found"}), 404
            revoke_order_credit(db, order)
            db.commit()
            return jsonify({"status": "success"}), 200
        finally:
            db.close()

    if event_type != "checkout.completed":
        return jsonify({"status": "ignored"}), 200

    webhook_checkout = payload.get("object") or {}
    metadata = webhook_checkout.get("metadata") or {}
    trade_order_id = webhook_checkout.get("request_id") or metadata.get("order_id") or ""
    if not trade_order_id:
        return jsonify({"status": "ignored", "reason": "missing request_id"}), 200

    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.trade_order_id == trade_order_id).first()
        if not order:
            return jsonify({"status": "ignored", "reason": "order not found"}), 200

        checkout_id = str(webhook_checkout.get("id") or "")
        if checkout_id != str(order.idempotency_key or ""):
            return jsonify({"error": "payment details mismatch"}), 400
        checkout, lookup_reason = _get_checkout(checkout_id)
        if not checkout:
            status = 400 if lookup_reason == "mismatch" else 503
            return jsonify({"error": "payment details mismatch" if status == 400 else "payment provider unavailable"}), status
        credited, reason = _credit_completed_checkout(db, order, checkout)
        if reason == "mismatch":
            return jsonify({"error": "payment details mismatch"}), 400
        return jsonify({"status": "success" if credited else "ignored"}), 200
    finally:
        db.close()


if __name__ == "__main__":
    raw = b'{"eventType":"checkout.completed"}'
    secret = "secret"
    config.CREEM_WEBHOOK_SECRET = secret
    sig = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    assert _valid_signature(raw, sig)
