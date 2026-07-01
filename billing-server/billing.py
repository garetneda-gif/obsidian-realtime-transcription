"""计费模块：使用报告、结算、余额查询、用量统计"""
import math
from datetime import timedelta

from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError

import config
from auth import require_auth
from database import SessionLocal
from models import User, SignRequest, UsageRecord, new_uuid, utcnow

billing_bp = Blueprint("billing", __name__, url_prefix="/api/billing")


def _calculate_cost_cents(duration_seconds: int, precharge_cents: int) -> int:
    actual_cost = math.ceil(config.PRICE_PER_HOUR_CENTS * duration_seconds / 3600)
    return min(actual_cost, precharge_cents)


def _parse_duration_seconds(value) -> tuple[int | None, str | None]:
    try:
        duration = float(value)
    except (TypeError, ValueError):
        return None, "duration_seconds must be a number"
    if not math.isfinite(duration):
        return None, "duration_seconds must be finite"
    if duration < 0:
        return None, "duration_seconds cannot be negative"
    return int(round(duration)), None


def _usage_for_sign_request(db, sign_request_id: str) -> UsageRecord | None:
    return db.query(UsageRecord).filter(UsageRecord.sign_request_id == sign_request_id).first()


def _elapsed_seconds_since(created_at, now) -> float:
    if created_at.tzinfo is None and now.tzinfo is not None:
        now = now.replace(tzinfo=None)
    return (now - created_at).total_seconds()


def _serialize_account(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "balance_cents": user.balance_cents,
        "created_at": user.created_at.isoformat(),
    }


def _settled_usage_response(db, sign_req: SignRequest, user: User):
    usage = _usage_for_sign_request(db, sign_req.id)
    return jsonify({
        "message": "Already settled",
        "cost_cents": sign_req.actual_cost_cents or 0,
        "refund_cents": 0,
        "balance_cents": user.balance_cents,
        "usage_record_id": usage.id if usage else None,
    }), 200


@billing_bp.route("/me", methods=["GET"])
def get_account():
    user_id, err = require_auth()
    if err:
        return err

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify(_serialize_account(user)), 200
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

    parsed_duration, duration_error = _parse_duration_seconds(duration_seconds)
    if duration_error:
        return jsonify({"error": duration_error}), 400
    duration_seconds = parsed_duration

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

        user = db.query(User).filter(User.id == user_id).with_for_update().first()
        if not user:
            return jsonify({"error": "User not found"}), 404

        if sign_req.settled:
            return _settled_usage_response(db, sign_req, user)

        # 验证：报告时长不超过从签名到现在的合理范围
        now = utcnow()
        elapsed = _elapsed_seconds_since(sign_req.created_at, now)
        max_reasonable = elapsed + 30  # 允许 30 秒误差
        if duration_seconds > max_reasonable:
            duration_seconds = int(max_reasonable)

        # 异常检测：时长过短（< 预扣时长 × 0.1）
        precharge_seconds = config.PRECHARGE_MINUTES * 60
        anomaly = duration_seconds < precharge_seconds * 0.1 and duration_seconds > 0

        actual_cost = _calculate_cost_cents(duration_seconds, sign_req.precharge_cents)

        # 结算：释放差额
        refund = sign_req.precharge_cents - actual_cost
        if refund > 0:
            user.balance_cents += refund

        sign_req.settled = 1
        sign_req.actual_cost_cents = actual_cost
        sign_req.duration_seconds = duration_seconds
        sign_req.settled_at = now
        sign_req.anomaly_flag = 1 if anomaly else 0

        usage = _usage_for_sign_request(db, sign_req.id)
        if usage:
            db.rollback()
            sign_req = (
                db.query(SignRequest)
                .filter(SignRequest.id == sign_request_id, SignRequest.user_id == user_id)
                .first()
            )
            user = db.query(User).filter(User.id == user_id).first()
            if sign_req and user:
                return _settled_usage_response(db, sign_req, user)
            return jsonify({"error": "Usage settlement conflict"}), 409

        usage = UsageRecord(
            id=new_uuid(),
            user_id=user_id,
            sign_request_id=sign_request_id,
            duration_seconds=duration_seconds,
            cost_cents=actual_cost,
            engine_model=sign_req.engine_model,
        )
        db.add(usage)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            sign_req = (
                db.query(SignRequest)
                .filter(SignRequest.id == sign_request_id, SignRequest.user_id == user_id)
                .first()
            )
            user = db.query(User).filter(User.id == user_id).first()
            if sign_req and user:
                return _settled_usage_response(db, sign_req, user)
            return jsonify({"error": "Usage settlement conflict"}), 409

        return jsonify({
            "cost_cents": actual_cost,
            "refund_cents": refund,
            "balance_cents": user.balance_cents,
            "usage_record_id": usage.id,
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
            if _usage_for_sign_request(db, sr.id):
                sr.settled = 1
                settled_count += 1
                continue

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
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                return settle_expired_requests()
        return settled_count
    finally:
        db.close()
