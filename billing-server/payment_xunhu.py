"""虎皮椒支付封装：签名、下单、回调验签"""
# pyright: reportImplicitRelativeImport=false, reportMissingImports=false
import hashlib
import hmac
import os
import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any
from urllib.parse import urlparse

import requests
from flask import Blueprint, request, jsonify
from sqlalchemy import update

import config
from billing import plan_by_id
from database import SessionLocal
from models import User, Order, OrderStatus, new_uuid
from payment_common import revoke_order_credit

payment_bp = Blueprint("payment", __name__, url_prefix="/api/billing")

XUNHU_PAY_URL = "https://api.xunhupay.com/payment/do.html"


def _amount_to_cents(amount_yuan: str) -> int:
    try:
        cents = (Decimal(str(amount_yuan)) * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        raise ValueError("Invalid amount")
    return int(cents)


def _sign(params: dict[str, Any], app_secret: str) -> str:
    """虎皮椒签名：按 key 排序拼接 + appsecret，取 MD5"""
    sorted_params = sorted(
        (k, str(v)) for k, v in params.items()
        if k != "hash" and v is not None and str(v) != ""
    )
    sign_str = "&".join(f"{k}={v}" for k, v in sorted_params)
    sign_str += app_secret
    return hashlib.md5(sign_str.encode()).hexdigest()


def _verify_sign(params: dict[str, Any], app_secret: str) -> bool:
    """验证虎皮椒回调签名（使用 hmac.compare_digest 防时序攻击）"""
    received_hash = params.get("hash", "")
    if not app_secret or not received_hash:
        return False
    expected_hash = _sign(params, app_secret)
    return hmac.compare_digest(received_hash, expected_hash)


def _is_xunhu_payment_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme == "https" and parsed.hostname == "api.xunhupay.com"


def create_payment_url(user_id: str, amount_yuan: str, credit_yuan: str, title: str) -> dict[str, Any]:
    """创建虎皮椒支付订单，返回支付链接"""
    if not (config.XUNHU_APPID and config.XUNHU_APPSECRET and config.XUNHU_NOTIFY_URL):
        return {"error": "微信支付暂未配置，请联系管理员"}
    trade_order_id = f"RT-{int(time.time())}-{os.urandom(4).hex()}"
    amount_cents = _amount_to_cents(amount_yuan)

    db = SessionLocal()
    try:
        order = Order(
            id=new_uuid(),
            user_id=user_id,
            trade_order_id=trade_order_id,
            amount_cents=amount_cents,
            credit_cents=_amount_to_cents(credit_yuan),
            status=OrderStatus.CREATED,
            idempotency_key=trade_order_id,
        )
        db.add(order)
        db.commit()
    finally:
        db.close()

    params = {
        "version": "1.1",
        "appid": config.XUNHU_APPID,
        "trade_order_id": trade_order_id,
        "total_fee": amount_yuan,
        "title": title,
        "time": str(int(time.time())),
        "notify_url": config.XUNHU_NOTIFY_URL,
        "return_url": f"{(config.PUBLIC_SERVER_URL.rstrip('/') or request.url_root.rstrip('/'))}/account?order={trade_order_id}",
        "nonce_str": os.urandom(16).hex(),
        "type": "WAP",
    }
    params["hash"] = _sign(params, config.XUNHU_APPSECRET)

    try:
        resp = requests.post(XUNHU_PAY_URL, data=params, timeout=10)
        result = resp.json()
        if result.get("errcode") == 0:
            payment_url = result.get("url")
            if not _is_xunhu_payment_url(payment_url):
                return {"error": "微信支付未返回有效跳转地址，请稍后重试"}
            return {"url": payment_url, "url_qrcode": result.get("url_qrcode"), "order_id": trade_order_id}
        return {"error": result.get("errmsg", "Payment creation failed")}
    except (requests.RequestException, ValueError):
        return {"error": "微信支付服务暂时不可用，请稍后重试"}


@payment_bp.route("/callback/xunhu", methods=["POST"])
def xunhu_callback():
    """虎皮椒支付回调"""
    params = request.form.to_dict()

    # 验签
    if not _verify_sign(params, config.XUNHU_APPSECRET):
        return "fail", 403

    # 时间戳新鲜度（< 300 秒）
    callback_time = int(params.get("time", "0"))
    if abs(int(time.time()) - callback_time) > 300:
        return "fail", 403

    status = params.get("status")
    if status not in {"OD", "CD"}:
        return "success"

    trade_order_id = params.get("trade_order_id", "")
    total_fee = params.get("total_fee", "0")

    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.trade_order_id == trade_order_id).first()
        if not order:
            return "fail", 404

        # 金额验证
        try:
            callback_cents = _amount_to_cents(total_fee)
        except ValueError:
            return "fail", 400
        if callback_cents != order.amount_cents:
            return "fail", 400

        if status == "CD":
            revoke_order_credit(db, order)
        else:
            credited = db.execute(
                update(Order)
                .where(
                    Order.id == order.id,
                    Order.status.in_((OrderStatus.CREATED, OrderStatus.CANCELED)),
                )
                .values(status=OrderStatus.CREDITED)
            )
            if credited.rowcount == 1:
                db.execute(
                    update(User)
                    .where(User.id == order.user_id)
                    .values(balance_cents=User.balance_cents + (order.credit_cents or order.amount_cents))
                )

        db.commit()
        return "success"
    finally:
        db.close()


@payment_bp.route("/create-order", methods=["POST"])
def create_order():
    """创建充值订单（插件调用）"""
    from auth import require_auth
    user_id, err = require_auth()
    if err:
        return err
    assert user_id is not None

    data = request.get_json(silent=True) or {}
    plan = plan_by_id(data.get("plan_id"))
    if not plan:
        return jsonify({"error": "Invalid plan"}), 400
    provider = data.get("provider") or "wechat"
    if provider not in {"wechat", "card"}:
        return jsonify({"error": "Unsupported payment provider"}), 400
    if provider == "card":
        from payment_creem import create_creem_checkout

        base_url = config.PUBLIC_SERVER_URL.rstrip("/") or request.url_root.rstrip("/")
        result = create_creem_checkout(
            user_id=user_id,
            plan_id=str(plan["id"]),
            return_url=f"{base_url}/account?payment=success",
        )
        if "error" in result:
            return jsonify({"error": result["error"]}), 500
        return jsonify(result), 200
    amount = plan["amount_yuan"]
    result = create_payment_url(
        user_id=user_id,
        amount_yuan=str(amount),
        credit_yuan=str(plan["credit_yuan"]),
        title=f"Obsidian 云端转写充值 - {plan['name']}",
    )

    if "error" in result:
        return jsonify({"error": result["error"]}), 500

    return jsonify(result), 200


@payment_bp.route("/orders/<trade_order_id>/refresh", methods=["POST"])
def refresh_order(trade_order_id: str):
    from auth import require_auth
    user_id, err = require_auth()
    if err:
        return err

    if trade_order_id.startswith("CR-"):
        from payment_creem import refresh_creem_order

        result = refresh_creem_order(str(user_id), trade_order_id)
        if "error" in result:
            status = 404 if result["error"] == "Order not found" else 502
            return jsonify({"error": result["error"]}), status

    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.trade_order_id == trade_order_id, Order.user_id == user_id).first()
        if not order:
            return jsonify({"error": "Order not found"}), 404
        user = db.query(User).filter(User.id == user_id).first()
        return jsonify({
            "order_id": order.trade_order_id,
            "status": order.status,
            "balance_cents": user.balance_cents if user else 0,
        }), 200
    finally:
        db.close()


@payment_bp.route("/orders/<trade_order_id>", methods=["DELETE"])
def cancel_order(trade_order_id: str):
    from auth import require_auth
    user_id, err = require_auth()
    if err:
        return err

    db = SessionLocal()
    try:
        order = db.query(Order).filter(
            Order.trade_order_id == trade_order_id,
            Order.user_id == user_id,
        ).first()
        if not order:
            return jsonify({"error": "Order not found"}), 404
        if order.status == OrderStatus.CANCELED:
            return jsonify({"order_id": trade_order_id, "status": OrderStatus.CANCELED}), 200
        if order.status != OrderStatus.CREATED:
            return jsonify({"error": "Only unpaid orders can be deleted"}), 409

        order.status = OrderStatus.CANCELED
        db.commit()
        return jsonify({"order_id": trade_order_id, "status": OrderStatus.CANCELED}), 200
    finally:
        db.close()
