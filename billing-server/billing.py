"""计费模块：使用报告、结算、余额查询、用量统计"""
# pyright: reportImplicitRelativeImport=false, reportMissingImports=false
import math
import re
from datetime import timedelta

from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError

import config
import deepgram
from auth import require_auth
from database import SessionLocal
from models import User, SignRequest, UsageRecord, adjust_balance, balance_payload, new_uuid, total_balance, utcnow

billing_bp = Blueprint("billing", __name__, url_prefix="/api/billing")
PROVIDER_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9-]{16,64}$")

PLANS = [
    {
        "id": "trial",
        "name": "体验包",
        "amount_yuan": "11.90",
        "amount_usd": "4.99",
        "credit_yuan": "4.90",
        "minutes": 147,
    },
    {
        "id": "standard",
        "name": "常用包",
        "amount_yuan": "23.90",
        "amount_usd": "8.99",
        "credit_yuan": "9.90",
        "minutes": 297,
    },
    {
        "id": "pro",
        "name": "高频包",
        "amount_yuan": "72.90",
        "amount_usd": "26.99",
        "credit_yuan": "29.90",
        "minutes": 897,
    },
]

for plan in PLANS:
    credited_minutes = round(float(str(plan["credit_yuan"])) * 100 / max(config.PRICE_PER_HOUR_CENTS, 1) * 60)
    if credited_minutes != plan["minutes"]:
        raise RuntimeError(f"Plan {plan['id']} minutes do not match the configured billing rate")


def plan_by_id(plan_id: str | None) -> dict[str, str | int] | None:
    return next((plan for plan in PLANS if plan["id"] == plan_id), None)


@billing_bp.route("/plans", methods=["GET"])
def get_plans():
    return jsonify({
        "providers": ["wechat", "card"],
        "default_provider": "wechat",
        "plans": [{key: value for key, value in plan.items() if key != "credit_yuan"} for plan in PLANS],
    }), 200


@billing_bp.route("/me", methods=["GET"])
def get_me():
    user_id, err = require_auth()
    if err:
        return err
    assert user_id is not None

    reconcile_user_requests(user_id)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify({
            "email": user.email,
            **balance_payload(user),
            "password_set": user.password_hash.startswith(("$2a$", "$2b$", "$2y$")),
        }), 200
    finally:
        db.close()


@billing_bp.route("/balance", methods=["GET"])
def get_balance():
    user_id, err = require_auth()
    if err:
        return err
    assert user_id is not None

    reconcile_user_requests(user_id)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify(balance_payload(user)), 200
    finally:
        db.close()


@billing_bp.route("/usage", methods=["GET"])
def get_usage():
    user_id, err = require_auth()
    if err:
        return err
    assert user_id is not None

    reconcile_user_requests(user_id)
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
                    "provider": r.provider,
                    "language": r.language,
                    "provider_cost_microusd": r.provider_cost_microusd,
                    "created_at": r.created_at.isoformat(),
                }
                for r in records
            ],
        }), 200
    finally:
        db.close()


@billing_bp.route("/report", methods=["POST"])
def report_usage():
    user_id, err = require_auth()
    if err:
        return err
    assert user_id is not None

    data = request.get_json(silent=True) or {}
    sign_request_id = data.get("session_id") or data.get("sign_request_id")
    provider_request_id = data.get("provider_request_id")
    duration_seconds = data.get("duration_seconds")

    if not sign_request_id:
        return jsonify({"error": "session_id required"}), 400

    db = SessionLocal()
    try:
        sign_req = (
            db.query(SignRequest)
            .filter(SignRequest.id == sign_request_id, SignRequest.user_id == user_id)
            .first()
        )
        if not sign_req:
            return jsonify({"error": "Sign request not found"}), 404
        provider = sign_req.provider
    finally:
        db.close()

    if provider == "deepgram":
        if not provider_request_id or not PROVIDER_REQUEST_ID_PATTERN.fullmatch(str(provider_request_id)):
            try:
                max(0.0, float(duration_seconds or 0))
            except (TypeError, ValueError):
                return jsonify({"error": "Invalid duration_seconds"}), 400
            return jsonify({
                "message": "Cloud usage record pending",
                "session_id": sign_request_id,
            }), 202
        payload, status = settle_deepgram_request(
            user_id,
            str(sign_request_id),
            str(provider_request_id),
        )
        return jsonify(payload), status

    if duration_seconds is None:
        return jsonify({"error": "duration_seconds required"}), 400
    try:
        reported_duration = max(0.0, float(duration_seconds))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid duration_seconds"}), 400
    payload, status = settle_tencent_request(user_id, str(sign_request_id), reported_duration)
    return jsonify(payload), status


def settle_tencent_request(user_id: str, session_id: str, reported_duration: float):
    db = SessionLocal()
    try:
        sign_req = (
            db.query(SignRequest)
            .filter(SignRequest.id == session_id, SignRequest.user_id == user_id)
            .with_for_update()
            .first()
        )
        if not sign_req:
            return {"error": "Sign request not found"}, 404
        if sign_req.provider != "tencent":
            return {"error": "ASR provider mismatch"}, 409

        if sign_req.settled:
            return _already_settled_payload(db, sign_req), 200

        now = utcnow()
        created_at = sign_req.created_at
        comparable_now = now if created_at.tzinfo else now.replace(tzinfo=None)
        elapsed = max(0.0, (comparable_now - created_at).total_seconds())
        duration_seconds = min(reported_duration, elapsed + 30)

        precharge_seconds = config.PRECHARGE_MINUTES * 60
        anomaly = duration_seconds < precharge_seconds * 0.1 and duration_seconds > 0
        payload = _settle_locked(
            db,
            sign_req,
            duration_seconds=duration_seconds,
            provider_cost_microusd=None,
            provider_verified=1,
            anomaly=anomaly,
        )
        return payload, 200
    finally:
        db.close()


def settle_deepgram_request(user_id: str, session_id: str, provider_request_id: str):
    associated, status = _associate_provider_request_id(
        user_id,
        session_id,
        provider_request_id,
    )
    if status != 200:
        return associated, status
    if associated.get("provider_verified"):
        db = SessionLocal()
        try:
            sign_req = (
                db.query(SignRequest)
                .filter(SignRequest.id == session_id, SignRequest.user_id == user_id)
                .first()
            )
            if not sign_req:
                return {"error": "Sign request not found"}, 404
            return _already_settled_payload(db, sign_req), 200
        finally:
            db.close()

    language = str(associated["language"])
    try:
        usage = deepgram.fetch_verified_usage(session_id, language, provider_request_id)
    except deepgram.DeepgramPendingError:
        return {
            "message": "Cloud usage record pending",
            "session_id": session_id,
        }, 202
    except deepgram.DeepgramProviderError:
        return {"error": "Cloud usage verification is unavailable"}, 503
    except deepgram.DeepgramRequestFailedError:
        return _settle_failed_deepgram_request(user_id, session_id, provider_request_id)
    except deepgram.DeepgramVerificationError:
        _clear_provider_request_id(user_id, session_id, provider_request_id)
        return {"error": "Cloud usage verification failed"}, 400

    db = SessionLocal()
    try:
        sign_req = (
            db.query(SignRequest)
            .filter(SignRequest.id == session_id, SignRequest.user_id == user_id)
            .with_for_update()
            .first()
        )
        if not sign_req:
            return {"error": "Sign request not found"}, 404
        if sign_req.provider_request_id != provider_request_id:
            return {"error": "Cloud request association changed"}, 409
        if sign_req.provider_verified:
            return _already_settled_payload(db, sign_req), 200
        payload = _settle_locked(
            db,
            sign_req,
            duration_seconds=usage.duration_seconds,
            provider_cost_microusd=usage.provider_cost_microusd,
            provider_verified=1,
            anomaly=False,
        )
        return payload, 200
    finally:
        db.close()


def _settle_failed_deepgram_request(user_id: str, session_id: str, provider_request_id: str):
    db = SessionLocal()
    try:
        sign_req = (
            db.query(SignRequest)
            .filter(SignRequest.id == session_id, SignRequest.user_id == user_id)
            .with_for_update()
            .first()
        )
        if not sign_req:
            return {"error": "Sign request not found"}, 404
        if sign_req.provider_request_id != provider_request_id:
            return {"error": "Cloud request association changed"}, 409
        if sign_req.provider_verified:
            return _already_settled_payload(db, sign_req), 200
        payload = _settle_locked(
            db,
            sign_req,
            duration_seconds=0,
            provider_cost_microusd=0,
            provider_verified=1,
            anomaly=True,
        )
        return payload, 200
    finally:
        db.close()


def _associate_provider_request_id(
    user_id: str,
    session_id: str,
    provider_request_id: str,
):
    db = SessionLocal()
    try:
        sign_req = (
            db.query(SignRequest)
            .filter(SignRequest.id == session_id, SignRequest.user_id == user_id)
            .with_for_update()
            .first()
        )
        if not sign_req:
            return {"error": "Sign request not found"}, 404
        if sign_req.provider != "deepgram":
            return {"error": "ASR provider mismatch"}, 409
        if sign_req.provider_request_id and sign_req.provider_request_id != provider_request_id:
            return {"error": "Cloud request ID mismatch"}, 409

        duplicate = (
            db.query(SignRequest)
            .filter(
                SignRequest.provider_request_id == provider_request_id,
                SignRequest.id != session_id,
            )
            .first()
        )
        if duplicate:
            return {"error": "Cloud request already billed"}, 409

        if not sign_req.provider_request_id:
            sign_req.provider_request_id = provider_request_id
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                return {"error": "Cloud request already billed"}, 409
        return {
            "language": sign_req.language,
            "provider_verified": bool(sign_req.provider_verified),
        }, 200
    finally:
        db.close()


def _clear_provider_request_id(user_id: str, session_id: str, provider_request_id: str) -> None:
    db = SessionLocal()
    try:
        sign_req = (
            db.query(SignRequest)
            .filter(SignRequest.id == session_id, SignRequest.user_id == user_id)
            .with_for_update()
            .first()
        )
        if sign_req and not sign_req.provider_verified and sign_req.provider_request_id == provider_request_id:
            sign_req.provider_request_id = None
            db.commit()
    finally:
        db.close()


def _settle_locked(
    db,
    sign_req: SignRequest,
    duration_seconds: float,
    provider_cost_microusd: int | None,
    provider_verified: int,
    anomaly: bool,
) -> dict[str, int]:
    duration_seconds = max(0.0, duration_seconds)
    stored_duration = math.ceil(duration_seconds)
    actual_cost = math.ceil(config.PRICE_PER_HOUR_CENTS * duration_seconds / 3600)
    previous_cost = (
        sign_req.actual_cost_cents
        if sign_req.settled and sign_req.actual_cost_cents is not None
        else sign_req.precharge_cents
    )
    balance_adjustment = previous_cost - actual_cost

    user = db.query(User).filter(User.id == sign_req.user_id).with_for_update().first()
    if user and balance_adjustment:
        adjust_balance(user, sign_req.billing_scope, balance_adjustment)

    sign_req.settled = 1
    sign_req.actual_cost_cents = actual_cost
    sign_req.duration_seconds = stored_duration
    sign_req.provider_cost_microusd = provider_cost_microusd
    sign_req.provider_verified = provider_verified
    sign_req.settled_at = utcnow()
    sign_req.anomaly_flag = 1 if anomaly else 0

    usage = (
        db.query(UsageRecord)
        .filter(UsageRecord.sign_request_id == sign_req.id)
        .first()
    )
    if not usage:
        usage = UsageRecord(
            id=new_uuid(),
            user_id=sign_req.user_id,
            sign_request_id=sign_req.id,
            duration_seconds=stored_duration,
            cost_cents=actual_cost,
            engine_model=sign_req.engine_model,
            provider=sign_req.provider,
            language=sign_req.language,
            provider_cost_microusd=provider_cost_microusd,
        )
        db.add(usage)
    else:
        usage.duration_seconds = stored_duration
        usage.cost_cents = actual_cost
        usage.engine_model = sign_req.engine_model
        usage.provider = sign_req.provider
        usage.language = sign_req.language
        usage.provider_cost_microusd = provider_cost_microusd
    db.commit()

    return {
        "cost_cents": actual_cost,
        "refund_cents": max(0, balance_adjustment),
        "additional_charge_cents": max(0, -balance_adjustment),
        "balance_cents": total_balance(user) if user else 0,
    }


def _already_settled_payload(db, sign_req: SignRequest) -> dict[str, int | str]:
    user = db.query(User).filter(User.id == sign_req.user_id).first()
    return {
        "message": "Already settled",
        "cost_cents": sign_req.actual_cost_cents or 0,
        "balance_cents": total_balance(user) if user else 0,
    }


def reconcile_user_requests(user_id: str) -> int:
    db = SessionLocal()
    try:
        candidates = (
            db.query(SignRequest.id, SignRequest.provider_request_id)
            .filter(
                SignRequest.user_id == user_id,
                SignRequest.provider == "deepgram",
                SignRequest.provider_verified == 0,
                SignRequest.provider_request_id.is_not(None),
            )
            .order_by(SignRequest.created_at.asc())
            .limit(10)
            .all()
        )
    finally:
        db.close()

    reconciled = 0
    for session_id, provider_request_id in candidates:
        payload, status = settle_deepgram_request(user_id, session_id, provider_request_id)
        if status == 200 and "error" not in payload:
            reconciled += 1
    settle_expired_requests(user_id)
    return reconciled


def settle_expired_requests(user_id: str | None = None) -> int:
    cutoff = utcnow() - timedelta(minutes=config.REPORT_TIMEOUT_MINUTES)
    db = SessionLocal()
    settled_count = 0
    try:
        query = db.query(SignRequest).filter(
            SignRequest.settled == 0,
            SignRequest.created_at < cutoff,
        )
        if user_id:
            query = query.filter(SignRequest.user_id == user_id)
        expired = query.all()
        for sr in expired:
            never_connected = sr.provider == "deepgram" and sr.proxy_connected != 2
            _settle_locked(
                db,
                sr,
                duration_seconds=0 if never_connected else config.PRECHARGE_MINUTES * 60,
                provider_cost_microusd=sr.provider_cost_microusd,
                provider_verified=1 if never_connected else (0 if sr.provider == "deepgram" else 1),
                anomaly=True,
            )
            settled_count += 1
        return settled_count
    finally:
        db.close()
