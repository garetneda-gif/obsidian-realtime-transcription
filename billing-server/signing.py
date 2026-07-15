"""签名模块：生成腾讯云 ASR 签名 URL + 预扣费"""
# pyright: reportImplicitRelativeImport=false, reportMissingImports=false
import hashlib
import hmac
import math
import time
import base64
import urllib.parse
import uuid
import re

from flask import Blueprint, request, jsonify
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

import config
import deepgram
from auth import require_auth
from database import SessionLocal
from models import (
    DOMESTIC_SCOPE,
    OVERSEAS_SCOPE,
    User,
    SignRequest,
    adjust_balance,
    scoped_balance,
    total_balance,
    new_uuid,
    utcnow,
)

signing_bp = Blueprint("signing", __name__, url_prefix="/api/asr")

VALID_PROVIDER_PREFERENCES = {"auto", "tencent", "deepgram"}
VALID_LANGUAGES = {"auto", "zh-CN", "zh-HK", "en", "ja", "ko"}
CLIENT_SESSION_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{8,64}$")
TENCENT_LANGUAGE_MODELS = {
    "auto": "16k_zh",
    "zh-CN": "16k_zh",
    "zh-HK": "16k_yue",
    "en": "16k_en",
    "ja": "16k_ja",
    "ko": "16k_ko",
}


def _generate_voice_id() -> str:
    return uuid.uuid4().hex[:16]


def _build_signed_url(voice_id: str, engine_model: str) -> str:
    """
    生成腾讯云 ASR 签名 URL

    签名流程（与 TencentASRClient.ts 一致）:
    1. 参数按 key 字典序排列
    2. 拼接为 host/path?key1=val1&key2=val2（无 GET 前缀）
    3. HMAC-SHA1(plaintext, secretKey) → Base64 → URL encode
    """
    app_id = config.TENCENT_APP_ID
    secret_id = config.TENCENT_SECRET_ID
    secret_key = config.TENCENT_SECRET_KEY

    now = int(time.time())
    params = {
        "secretid": secret_id,
        "timestamp": str(now),
        "expired": str(now + config.SIGN_VALID_MINUTES * 60),
        "nonce": str(round(time.time() * 10) % 100000),
        "engine_model_type": engine_model,
        "voice_id": voice_id,
        "voice_format": "1",
    }

    sorted_keys = sorted(params.keys())
    query_string = "&".join(f"{k}={params[k]}" for k in sorted_keys)
    sign_plaintext = f"asr.cloud.tencent.com/asr/v2/{app_id}?{query_string}"

    signature = base64.b64encode(
        hmac.new(secret_key.encode(), sign_plaintext.encode(), hashlib.sha1).digest()
    ).decode()
    encoded_sig = urllib.parse.quote(signature, safe="")

    return f"wss://asr.cloud.tencent.com/asr/v2/{app_id}?{query_string}&signature={encoded_sig}"


def _calculate_precharge_cents() -> int:
    """计算预扣费金额（分）"""
    minutes = config.PRECHARGE_MINUTES
    return math.ceil(config.PRICE_PER_HOUR_CENTS * minutes / 60)


def _billing_scope_for_country(country_code: str) -> str:
    return DOMESTIC_SCOPE if not country_code or country_code.upper() == "CN" else OVERSEAS_SCOPE


def _provider_for_scope(scope: str) -> str:
    return "deepgram" if scope == OVERSEAS_SCOPE else "tencent"


def _requested_scope(preference: str) -> str | None:
    if preference == "tencent":
        return DOMESTIC_SCOPE
    if preference == "deepgram":
        return OVERSEAS_SCOPE
    return None


def _resolve_provider(_preference: str, country_code: str) -> str:
    return _provider_for_scope(_billing_scope_for_country(country_code))


def _provider_is_configured(provider: str) -> bool:
    if provider == "tencent":
        return bool(config.TENCENT_APP_ID and config.TENCENT_SECRET_ID and config.TENCENT_SECRET_KEY)
    return deepgram.is_configured()


def _serialize_session(sign_req: SignRequest) -> dict[str, object]:
    return {
        "id": sign_req.id,
        "provider": sign_req.provider,
        "billing_scope": sign_req.billing_scope,
        "language": sign_req.language,
        "voice_id": sign_req.voice_id,
        "engine_model": sign_req.engine_model,
        "precharge_cents": sign_req.precharge_cents,
    }


def _reconcile_user_sessions(user_id: str) -> None:
    from billing import reconcile_user_requests

    reconcile_user_requests(user_id)


def _prepare_session(
    user_id: str,
    requested_provider: str,
    resolved_provider: str,
    billing_scope: str,
    language: str,
    client_session_id: str,
    engine_model: str,
    voice_id: str,
):
    _reconcile_user_sessions(user_id)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).with_for_update().first()
        if not user:
            return None, 0, False, (jsonify({"error": "User not found"}), 404)

        existing = (
            db.query(SignRequest)
            .filter(
                SignRequest.user_id == user_id,
                SignRequest.client_session_id == client_session_id,
            )
            .first()
        )
        if existing:
            if existing.settled:
                return None, total_balance(user), False, (
                    jsonify({"error": "Client session already settled"}),
                    409,
                )
            if requested_provider != "auto" and existing.provider != resolved_provider:
                return None, total_balance(user), False, (
                    jsonify({"error": "Client session provider mismatch"}),
                    409,
                )
            if existing.billing_scope != billing_scope:
                return None, total_balance(user), False, (
                    jsonify({"error": "Client session billing region mismatch"}),
                    409,
                )
            if existing.language != language:
                return None, total_balance(user), False, (
                    jsonify({"error": "Client session language mismatch"}),
                    409,
                )
            return _serialize_session(existing), total_balance(user), False, None

        active = (
            db.query(SignRequest)
            .filter(SignRequest.user_id == user_id, SignRequest.settled == 0)
            .first()
        )
        if active:
            return None, total_balance(user), False, (
                jsonify({"error": "Another cloud ASR session is pending"}),
                409,
            )

        precharge = _calculate_precharge_cents()
        available_balance = scoped_balance(user, billing_scope)
        if available_balance < precharge:
            return None, total_balance(user), False, (jsonify({
                "error": "Insufficient balance for current region",
                "billing_scope": billing_scope,
                "scope_balance_cents": available_balance,
                "balance_cents": total_balance(user),
                "required_cents": precharge,
            }), 402)

        adjust_balance(user, billing_scope, -precharge)
        sign_req = SignRequest(
            id=new_uuid(),
            user_id=user_id,
            voice_id=voice_id,
            engine_model=engine_model,
            provider=resolved_provider,
            billing_scope=billing_scope,
            language=language,
            client_session_id=client_session_id,
            provider_verified=0 if resolved_provider == "deepgram" else 1,
            precharge_cents=precharge,
        )
        db.add(sign_req)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            duplicate = (
                db.query(SignRequest)
                .filter(
                    SignRequest.user_id == user_id,
                    SignRequest.client_session_id == client_session_id,
                )
                .first()
            )
            if duplicate and not duplicate.settled:
                fresh_user = db.query(User).filter(User.id == user_id).first()
                balance = total_balance(fresh_user) if fresh_user else 0
                return _serialize_session(duplicate), balance, False, None
            return None, 0, False, (jsonify({"error": "Session conflict"}), 409)
        return _serialize_session(sign_req), total_balance(user), True, None
    finally:
        db.close()


def _refund_failed_session(session_id: str, user_id: str) -> None:
    db = SessionLocal()
    try:
        sign_req = (
            db.query(SignRequest)
            .filter(SignRequest.id == session_id, SignRequest.user_id == user_id)
            .with_for_update()
            .first()
        )
        if not sign_req or sign_req.settled or sign_req.provider_request_id:
            return
        user = db.query(User).filter(User.id == user_id).with_for_update().first()
        if user:
            adjust_balance(user, sign_req.billing_scope, sign_req.precharge_cents)
        sign_req.settled = 1
        sign_req.actual_cost_cents = 0
        sign_req.duration_seconds = 0
        sign_req.provider_verified = 1
        sign_req.anomaly_flag = 1
        sign_req.settled_at = utcnow()
        db.commit()
    finally:
        db.close()


def _issue_credentials(session: dict[str, object], user_id: str) -> dict[str, object]:
    provider = str(session["provider"])
    if provider == "tencent":
        signed_url = _build_signed_url(
            str(session["voice_id"]),
            str(session["engine_model"]),
        )
        return {
            "auth_type": "signed_url",
            "signed_url": signed_url,
            "valid_seconds": config.SIGN_VALID_MINUTES * 60,
        }

    token, expires_in = deepgram.create_proxy_token(
        str(session["id"]), user_id, str(session["language"]),
    )
    proxy_url = (config.PUBLIC_SERVER_URL or request.host_url).rstrip("/") + "/api/asr/proxy"
    proxy_url = proxy_url.replace("https://", "wss://", 1).replace("http://", "ws://", 1)
    return {
        "auth_type": "proxy",
        "proxy_token": token,
        "expires_in": expires_in,
        "websocket_url": proxy_url,
        "valid_seconds": expires_in,
    }


def _proxy_session(token: str) -> tuple[dict[str, str] | None, SignRequest | None]:
    claims = deepgram.decode_proxy_token(token)
    if not claims:
        return None, None
    db = SessionLocal()
    try:
        sign_req = db.query(SignRequest).filter(
            SignRequest.id == claims["sid"],
            SignRequest.user_id == claims["sub"],
            SignRequest.provider == "deepgram",
            SignRequest.language == claims["language"],
            SignRequest.settled == 0,
        ).first()
        if not sign_req:
            return claims, None
        db.expunge(sign_req)
        return claims, sign_req
    finally:
        db.close()


@signing_bp.route("/proxy/authorize", methods=["POST"])
def authorize_proxy():
    token = str((request.get_json(silent=True) or {}).get("token") or "")
    claims, sign_req = _proxy_session(token)
    if not claims or not sign_req:
        return jsonify({"error": "Invalid or expired proxy session"}), 401
    db = SessionLocal()
    try:
        result = db.execute(
            update(SignRequest)
            .where(
                SignRequest.id == sign_req.id,
                SignRequest.proxy_connected == 0,
                SignRequest.settled == 0,
            )
            .values(proxy_connected=1)
        )
        db.commit()
        if result.rowcount != 1:
            return jsonify({"error": "Proxy session already used"}), 409
    finally:
        db.close()
    return jsonify({
        "session_id": sign_req.id,
        "language": sign_req.language,
        "max_seconds": config.CLOUD_SESSION_MAX_SECONDS,
    }), 200


@signing_bp.route("/proxy/connected", methods=["POST"])
def confirm_proxy_connected():
    token = str((request.get_json(silent=True) or {}).get("token") or "")
    claims, sign_req = _proxy_session(token)
    if not claims or not sign_req:
        return jsonify({"error": "Invalid or expired proxy session"}), 401
    db = SessionLocal()
    try:
        current = db.query(SignRequest.proxy_connected).filter(SignRequest.id == sign_req.id).scalar()
        if current == 2:
            return jsonify({"ok": True}), 200
        result = db.execute(
            update(SignRequest)
            .where(SignRequest.id == sign_req.id, SignRequest.proxy_connected == 1)
            .values(proxy_connected=2)
        )
        db.commit()
        if result.rowcount != 1:
            return jsonify({"error": "Proxy session state conflict"}), 409
    finally:
        db.close()
    return jsonify({"ok": True}), 200


@signing_bp.route("/proxy/failed", methods=["POST"])
def proxy_failed():
    token = str((request.get_json(silent=True) or {}).get("token") or "")
    claims, sign_req = _proxy_session(token)
    if not claims or not sign_req or sign_req.proxy_connected != 1:
        return jsonify({"error": "Invalid proxy failure state"}), 409
    _refund_failed_session(sign_req.id, claims["sub"])
    return jsonify({"ok": True}), 200


@signing_bp.route("/session", methods=["POST"])
def create_session():
    user_id, err = require_auth()
    if err:
        return err
    assert user_id is not None

    data = request.get_json(silent=True) or {}
    provider_preference = str(data.get("provider", "auto"))
    language = str(data.get("language", "auto"))
    client_session_id = str(data.get("client_session_id", ""))
    if provider_preference not in VALID_PROVIDER_PREFERENCES:
        return jsonify({"error": "Unsupported cloud provider preference"}), 400
    if language not in VALID_LANGUAGES:
        return jsonify({"error": "Unsupported recognition language"}), 400
    if not CLIENT_SESSION_PATTERN.fullmatch(client_session_id):
        return jsonify({"error": "Invalid client_session_id"}), 400

    country_code = request.headers.get("x-vercel-ip-country", "")
    billing_scope = _billing_scope_for_country(country_code)
    requested_scope = _requested_scope(provider_preference)
    if requested_scope and requested_scope != billing_scope:
        return jsonify({
            "error": "Selected cloud region does not match current network location",
            "billing_scope": billing_scope,
        }), 409
    resolved_provider = _resolve_provider(provider_preference, country_code)
    if not _provider_is_configured(resolved_provider):
        return jsonify({"error": f"{resolved_provider.capitalize()} ASR is not configured"}), 503

    engine_model = (
        TENCENT_LANGUAGE_MODELS[language]
        if resolved_provider == "tencent"
        else "nova-3"
    )
    session, balance_cents, created, prepare_error = _prepare_session(
        user_id=user_id,
        requested_provider=provider_preference,
        resolved_provider=resolved_provider,
        billing_scope=billing_scope,
        language=language,
        client_session_id=client_session_id,
        engine_model=engine_model,
        voice_id=_generate_voice_id(),
    )
    if prepare_error:
        return prepare_error
    if not session:
        return jsonify({"error": "Unable to create ASR session"}), 503

    if not created and session["provider"] == "deepgram":
        return jsonify({
            "error": "Cloud ASR session credentials were already issued",
            "session_id": session["id"],
            "balance_cents": balance_cents,
        }), 409

    try:
        credentials = _issue_credentials(session, user_id)
    except deepgram.DeepgramProviderError:
        if created:
            _refund_failed_session(str(session["id"]), user_id)
        return jsonify({"error": "Cloud ASR authorization is unavailable"}), 503
    except Exception:
        if created:
            _refund_failed_session(str(session["id"]), user_id)
        return jsonify({"error": "ASR authorization failed"}), 503

    return jsonify({
        "session_id": session["id"],
        "provider": session["provider"],
        "billing_scope": session["billing_scope"],
        "language": session["language"],
        "engine_model": session["engine_model"],
        "voice_id": session["voice_id"],
        "precharge_cents": session["precharge_cents"],
        "balance_cents": balance_cents,
        **credentials,
    }), 200


@signing_bp.route("/sign", methods=["POST"])
def sign():
    user_id, err = require_auth()
    if err:
        return err
    assert user_id is not None

    data = request.get_json(silent=True) or {}
    engine_model = str(data.get("engine_model", "16k_zh"))
    voice_id = str(data.get("voice_id") or _generate_voice_id())

    if _billing_scope_for_country(request.headers.get("x-vercel-ip-country", "")) != DOMESTIC_SCOPE:
        return jsonify({"error": "Legacy Tencent cloud sessions are only available in mainland China"}), 409

    if not config.TENCENT_APP_ID or not config.TENCENT_SECRET_ID or not config.TENCENT_SECRET_KEY:
        return jsonify({"error": "ASR service not configured"}), 503

    language = next(
        (key for key, value in TENCENT_LANGUAGE_MODELS.items() if value == engine_model),
        "auto",
    )
    session, balance_cents, created, prepare_error = _prepare_session(
        user_id=user_id,
        requested_provider="tencent",
        resolved_provider="tencent",
        billing_scope=DOMESTIC_SCOPE,
        language=language,
        client_session_id=f"legacy-{uuid.uuid4().hex}",
        engine_model=engine_model,
        voice_id=voice_id,
    )
    if prepare_error:
        return prepare_error
    if not session:
        return jsonify({"error": "Unable to create sign request"}), 503

    try:
        credentials = _issue_credentials(session, user_id)
    except Exception:
        if created:
            _refund_failed_session(str(session["id"]), user_id)
        return jsonify({"error": "Signing failed"}), 503

    return jsonify({
        "signed_url": credentials["signed_url"],
        "sign_request_id": session["id"],
        "voice_id": session["voice_id"],
        "precharge_cents": session["precharge_cents"],
        "balance_cents": balance_cents,
        "valid_minutes": config.SIGN_VALID_MINUTES,
    }), 200
