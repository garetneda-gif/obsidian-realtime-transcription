"""虎皮椒支付封装：签名、下单、回调验签"""
import hashlib
import hmac
import os
import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

import requests
from flask import Blueprint, request, jsonify

import config
from database import SessionLocal
from models import User, Order, OrderStatus, new_uuid

payment_bp = Blueprint("payment", __name__, url_prefix="/api/billing")

XUNHU_PAY_URL = "https://api.xunhupay.com/payment/do.html"
MIN_RECHARGE_YUAN = Decimal("1.00")
MAX_RECHARGE_YUAN = Decimal("500.00")


def _yuan_to_cents(amount: str) -> int:
    try:
        yuan = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        raise ValueError("Invalid amount")
    if yuan < MIN_RECHARGE_YUAN or yuan > MAX_RECHARGE_YUAN:
        raise ValueError("Amount must be between ¥1.00 and ¥500.00")
    return int(yuan * 100)


def _cents_to_yuan(cents: int) -> str:
    return f"{Decimal(cents) / Decimal(100):.2f}"


def _payment_configured() -> bool:
    return bool(config.XUNHU_APPID and config.XUNHU_APPSECRET and config.XUNHU_NOTIFY_URL)


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
    expected_hash = _sign(params, app_secret)
    return hmac.compare_digest(received_hash, expected_hash)


def create_payment_url(user_id: str, amount_yuan: str, title: str, return_url: str) -> dict[str, Any]:
    """创建虎皮椒支付订单，返回支付链接"""
    if not _payment_configured():
        return {"error": "Payment service not configured"}

    trade_order_id = f"RT-{int(time.time())}-{os.urandom(4).hex()}"
    try:
        amount_cents = _yuan_to_cents(amount_yuan)
    except ValueError as e:
        return {"error": str(e)}

    db = SessionLocal()
    try:
        order = Order(
            id=new_uuid(),
            user_id=user_id,
            trade_order_id=trade_order_id,
            amount_cents=amount_cents,
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
        "total_fee": _cents_to_yuan(amount_cents),
        "title": title,
        "time": str(int(time.time())),
        "notify_url": config.XUNHU_NOTIFY_URL,
        "return_url": return_url,
        "nonce_str": os.urandom(16).hex(),
        "type": "WAP",
    }
    params["hash"] = _sign(params, config.XUNHU_APPSECRET)

    try:
        resp = requests.post(XUNHU_PAY_URL, data=params, timeout=10)
        result = resp.json()
        if result.get("errcode") == 0:
            return {"url": result.get("url"), "url_qrcode": result.get("url_qrcode"), "order_id": trade_order_id}
        return {"error": result.get("errmsg", "Payment creation failed")}
    except Exception as e:
        return {"error": str(e)}


@payment_bp.route("/callback/xunhu", methods=["POST"])
def xunhu_callback():
    """虎皮椒支付回调"""
    if not _payment_configured():
        return "fail", 503

    params = request.form.to_dict()

    # 验签
    if not _verify_sign(params, config.XUNHU_APPSECRET):
        return "fail", 403

    # 时间戳新鲜度（< 300 秒）
    callback_time = int(params.get("time", "0"))
    if abs(int(time.time()) - callback_time) > 300:
        return "fail", 403

    # 状态检查：只处理已支付的回调
    if params.get("status") != "OD":
        return "success"

    trade_order_id = params.get("trade_order_id", "")
    total_fee = params.get("total_fee", "0")

    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.trade_order_id == trade_order_id).first()
        if not order:
            return "fail", 404

        # 幂等：已处理的订单直接返回成功
        if order.status in (OrderStatus.CREDITED, OrderStatus.PAID):
            return "success"

        # 金额验证
        try:
            callback_cents = _yuan_to_cents(total_fee)
        except ValueError:
            return "fail", 400
        if callback_cents != order.amount_cents:
            return "fail", 400

        # 更新订单状态 + 加余额
        order.status = OrderStatus.CREDITED
        user = db.query(User).filter(User.id == order.user_id).with_for_update().first()
        if user:
            user.balance_cents += order.amount_cents

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
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    amount = data.get("amount", "9.90")
    return_url = data.get("return_url", "")

    result = create_payment_url(
        user_id=user_id,
        amount_yuan=str(amount),
        title="Obsidian 云端转写充值",
        return_url=return_url,
    )

    if "error" in result:
        status = 503 if result["error"] == "Payment service not configured" else 400
        return jsonify({"error": result["error"]}), status

    return jsonify(result), 200
