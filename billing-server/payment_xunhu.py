"""虎皮椒支付封装：签名、下单、回调验签"""
import hashlib
import hmac
import os
import time
from typing import Any

import requests
from flask import Blueprint, request, jsonify

import config
from database import SessionLocal
from money import cents_to_yuan, yuan_to_cents
from models import User, Order, OrderStatus, new_uuid, utcnow

payment_bp = Blueprint("payment", __name__, url_prefix="/api/billing")

XUNHU_PAY_URL = "https://api.xunhupay.com/payment/do.html"
XUNHU_QUERY_URL = "https://api.xunhupay.com/payment/query.html"


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


def _create_xunhu_order(
    trade_order_id: str,
    amount_cents: int,
    title: str,
    return_url: str,
) -> dict[str, Any]:
    """调用虎皮椒创建支付订单，返回 provider 结果。"""
    params = {
        "version": "1.1",
        "appid": config.XUNHU_APPID,
        "trade_order_id": trade_order_id,
        "total_fee": cents_to_yuan(amount_cents),
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
            payment_url = result.get("url")
            if not payment_url:
                return {"error": "Payment provider returned no payment URL", "status": 502}
            return {
                "url": payment_url,
                "url_qrcode": result.get("url_qrcode"),
                "open_order_id": result.get("open_order_id"),
            }
        return {"error": result.get("errmsg", "Payment creation failed"), "status": 502}
    except Exception as e:
        return {"error": str(e), "status": 502}


def query_payment_status(trade_order_id: str) -> dict[str, Any]:
    """查询虎皮椒订单状态，使用本地商户订单号 out_trade_order。"""
    params = {
        "appid": config.XUNHU_APPID,
        "out_trade_order": trade_order_id,
        "time": str(int(time.time())),
        "nonce_str": os.urandom(16).hex(),
    }
    params["hash"] = _sign(params, config.XUNHU_APPSECRET)

    resp = requests.post(XUNHU_QUERY_URL, data=params, timeout=10)
    return resp.json()


def credit_paid_order(db, order: Order, paid_amount_cents: int) -> bool:
    """Credit a paid order exactly once. Returns True when balance changed."""
    if order.status == OrderStatus.CREDITED:
        return False
    if paid_amount_cents != order.amount_cents:
        raise ValueError("Payment amount mismatch")

    user = db.query(User).filter(User.id == order.user_id).with_for_update().first()
    if not user:
        raise ValueError("Order user not found")

    user.balance_cents += order.amount_cents
    order.status = OrderStatus.CREDITED
    order.credited_at = utcnow()
    return True


def create_payment_url(user_id: str, amount_yuan: str, title: str, return_url: str) -> dict[str, Any]:
    """创建虎皮椒支付订单，返回支付链接"""
    if not _payment_configured():
        return {"error": "Payment service not configured", "status": 503}

    try:
        amount_cents = yuan_to_cents(amount_yuan)
    except ValueError as e:
        return {"error": str(e), "status": 400}

    trade_order_id = f"RT-{int(time.time())}-{os.urandom(4).hex()}"
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

    return {
        "url": provider_result["url"],
        "url_qrcode": provider_result.get("url_qrcode"),
        "order_id": trade_order_id,
    }


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

        # 金额验证
        try:
            callback_cents = yuan_to_cents(total_fee)
        except ValueError:
            return "fail", 400
        if callback_cents != order.amount_cents:
            return "fail", 400

        try:
            credit_paid_order(db, order, callback_cents)
        except ValueError:
            return "fail", 400

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
        return jsonify({"error": result["error"]}), result.get("status", 400)

    return jsonify(result), 200


@payment_bp.route("/orders/<trade_order_id>", methods=["GET"])
def get_order(trade_order_id: str):
    """查询当前用户的充值订单状态"""
    from auth import require_auth
    user_id, err = require_auth()
    if err:
        return err

    db = SessionLocal()
    try:
        order = db.query(Order).filter(
            Order.user_id == user_id,
            Order.trade_order_id == trade_order_id,
        ).first()
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


@payment_bp.route("/orders/<trade_order_id>/refresh", methods=["POST"])
def refresh_order(trade_order_id: str):
    """主动查询支付渠道并同步当前用户的充值订单状态。"""
    from auth import require_auth
    user_id, err = require_auth()
    if err:
        return err

    db = SessionLocal()
    try:
        order = db.query(Order).filter(
            Order.user_id == user_id,
            Order.trade_order_id == trade_order_id,
        ).with_for_update().first()
        if not order:
            return jsonify({"error": "Order not found"}), 404

        result = query_payment_status(trade_order_id)
        if result.get("errcode") != 0:
            return jsonify({"error": result.get("errmsg", "Payment query failed")}), 502

        data = result.get("data") or {}
        if data.get("status") == "OD":
            try:
                paid_amount_cents = yuan_to_cents(
                    str(data.get("total_fee", cents_to_yuan(order.amount_cents)))
                )
                credit_paid_order(db, order, paid_amount_cents)
            except ValueError as e:
                return jsonify({"error": str(e)}), 400
            db.commit()

        balance_cents = db.query(User).filter(User.id == user_id).one().balance_cents
        return jsonify({
            "order_id": order.trade_order_id,
            "amount_cents": order.amount_cents,
            "status": order.status,
            "balance_cents": balance_cents,
        }), 200
    finally:
        db.close()
