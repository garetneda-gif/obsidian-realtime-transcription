"""计费模块：使用报告、结算、余额查询、用量统计"""
import math
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify

import config
from auth import require_auth
from database import SessionLocal
from models import User, SignRequest, UsageRecord, new_uuid, utcnow

billing_bp = Blueprint("billing", __name__, url_prefix="/api/billing")

PLANS = [
    {"id": "trial", "name": "体验包", "amount_yuan": "4.90"},
    {"id": "standard", "name": "常用包", "amount_yuan": "9.90"},
    {"id": "pro", "name": "高频包", "amount_yuan": "29.90"},
]


def plan_by_id(plan_id: str | None) -> dict | None:
    return next((plan for plan in PLANS if plan["id"] == plan_id), None)


def plan_minutes(amount_yuan: str) -> int:
    cents = round(float(amount_yuan) * 100)
    return round(cents / max(config.PRICE_PER_HOUR_CENTS, 1) * 60)


@billing_bp.route("/plans", methods=["GET"])
def get_plans():
    return jsonify({
        "providers": ["xunhu"],
        "default_provider": "xunhu",
        "plans": [{**plan, "minutes": plan_minutes(plan["amount_yuan"])} for plan in PLANS],
    }), 200


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
        return jsonify({"email": user.email, "balance_cents": user.balance_cents}), 200
    finally:
        db.close()


@billing_bp.route("/balance", methods=["GET"])
def get_balance():
    user_id, err = require_auth()
    if err:
        return err

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify({"balance_cents": user.balance_cents}), 200
    finally:
        db.close()


@billing_bp.route("/usage", methods=["GET"])
def get_usage():
    user_id, err = require_auth()
    if err:
        return err

    db = SessionLocal()
    try:
        records = (
            db.query(UsageRecord)
            .filter(UsageRecord.user_id == user_id)
            .order_by(UsageRecord.created_at.desc())
            .limit(50)
            .all()
        )
        total_seconds = sum(r.duration_seconds for r in records)
        total_cost = sum(r.cost_cents for r in records)

        return jsonify({
            "total_seconds": total_seconds,
            "total_cost_cents": total_cost,
            "records": [
                {
                    "id": r.id,
                    "duration_seconds": r.duration_seconds,
                    "cost_cents": r.cost_cents,
                    "engine_model": r.engine_model,
                    "created_at": r.created_at.isoformat(),
                }
                for r in records
            ],
        }), 200
    finally:
        db.close()


@billing_bp.route("/report", methods=["POST"])
def report_usage():
    """接收客户端使用报告，执行结算"""
    user_id, err = require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    sign_request_id = data.get("sign_request_id")
    duration_seconds = data.get("duration_seconds")

    if not sign_request_id or duration_seconds is None:
        return jsonify({"error": "sign_request_id and duration_seconds required"}), 400

    duration_seconds = max(0, int(duration_seconds))

    db = SessionLocal()
    try:
        sign_req = (
            db.query(SignRequest)
            .filter(SignRequest.id == sign_request_id, SignRequest.user_id == user_id)
            .with_for_update()
            .first()
        )
        if not sign_req:
            return jsonify({"error": "Sign request not found"}), 404

        # 幂等：已结算的请求直接返回成功
        if sign_req.settled:
            return jsonify({"message": "Already settled", "cost_cents": sign_req.actual_cost_cents}), 200

        # 验证：报告时长不超过从签名到现在的合理范围
        now = utcnow()
        elapsed = (now - sign_req.created_at).total_seconds()
        max_reasonable = elapsed + 30  # 允许 30 秒误差
        if duration_seconds > max_reasonable:
            duration_seconds = int(max_reasonable)

        # 异常检测：时长过短（< 预扣时长 × 0.1）
        precharge_seconds = config.PRECHARGE_MINUTES * 60
        anomaly = duration_seconds < precharge_seconds * 0.1 and duration_seconds > 0

        # 计算实际费用
        actual_cost = math.ceil(config.PRICE_PER_HOUR_CENTS * duration_seconds / 3600)
        actual_cost = min(actual_cost, sign_req.precharge_cents)  # 不超过预扣金额

        # 结算：释放差额
        refund = sign_req.precharge_cents - actual_cost
        user = db.query(User).filter(User.id == user_id).with_for_update().first()
        if user and refund > 0:
            user.balance_cents += refund

        sign_req.settled = 1
        sign_req.actual_cost_cents = actual_cost
        sign_req.duration_seconds = duration_seconds
        sign_req.settled_at = now
        sign_req.anomaly_flag = 1 if anomaly else 0

        # 创建用量记录
        usage = UsageRecord(
            id=new_uuid(),
            user_id=user_id,
            sign_request_id=sign_request_id,
            duration_seconds=duration_seconds,
            cost_cents=actual_cost,
            engine_model=sign_req.engine_model,
        )
        db.add(usage)
        db.commit()

        return jsonify({
            "cost_cents": actual_cost,
            "refund_cents": refund,
            "balance_cents": user.balance_cents if user else 0,
        }), 200
    finally:
        db.close()


def settle_expired_requests() -> int:
    """定时任务：结算超时未报告的签名请求"""
    cutoff = utcnow() - timedelta(minutes=config.REPORT_TIMEOUT_MINUTES)
    db = SessionLocal()
    settled_count = 0
    try:
        expired = (
            db.query(SignRequest)
            .filter(
                SignRequest.settled == 0,
                SignRequest.created_at < cutoff,
            )
            .all()
        )
        for sr in expired:
            sr.settled = 1
            sr.actual_cost_cents = sr.precharge_cents
            sr.duration_seconds = config.PRECHARGE_MINUTES * 60
            sr.settled_at = utcnow()

            usage = UsageRecord(
                id=new_uuid(),
                user_id=sr.user_id,
                sign_request_id=sr.id,
                duration_seconds=sr.duration_seconds,
                cost_cents=sr.actual_cost_cents,
                engine_model=sr.engine_model,
            )
            db.add(usage)
            settled_count += 1

        if settled_count:
            db.commit()
        return settled_count
    finally:
        db.close()
