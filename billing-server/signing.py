"""签名模块：生成腾讯云 ASR 签名 URL + 预扣费"""
import hashlib
import hmac
import math
import time
import base64
import urllib.parse
import uuid

from flask import Blueprint, request, jsonify

import config
from auth import require_auth
from database import SessionLocal
from models import User, SignRequest, new_uuid

signing_bp = Blueprint("signing", __name__, url_prefix="/api/asr")

ALLOWED_ENGINE_MODELS = {"16k_zh", "16k_en", "16k_zh-PY", "16k_zh_medical", "16k_zh_large", "16k_zh_en"}


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
    encoded_sig = urllib.parse.quote(signature)

    return f"wss://asr.cloud.tencent.com/asr/v2/{app_id}?{query_string}&signature={encoded_sig}"


def _calculate_precharge_cents() -> int:
    """计算预扣费金额（分）"""
    minutes = config.PRECHARGE_MINUTES
    return math.ceil(config.PRICE_PER_HOUR_CENTS * minutes / 60)


@signing_bp.route("/sign", methods=["POST"])
def sign():
    user_id, err = require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    engine_model = str(data.get("engine_model") or "16k_zh")
    if engine_model not in ALLOWED_ENGINE_MODELS:
        return jsonify({
            "error": "Unsupported engine model",
            "allowed_models": sorted(ALLOWED_ENGINE_MODELS),
        }), 400

    # 可选：客户端传入已有 voice_id（用于续签保持同一会话）
    voice_id = str(data.get("voice_id") or _generate_voice_id())

    if not config.TENCENT_APP_ID or not config.TENCENT_SECRET_ID or not config.TENCENT_SECRET_KEY:
        return jsonify({"error": "ASR service not configured"}), 503

    precharge = _calculate_precharge_cents()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).with_for_update().first()
        if not user:
            return jsonify({"error": "User not found"}), 404

        if user.balance_cents < precharge:
            return jsonify({
                "error": "Insufficient balance",
                "balance_cents": user.balance_cents,
                "required_cents": precharge,
            }), 402

        user.balance_cents -= precharge

        sign_req = SignRequest(
            id=new_uuid(),
            user_id=user_id,
            voice_id=voice_id,
            engine_model=engine_model,
            precharge_cents=precharge,
        )
        db.add(sign_req)

        try:
            signed_url = _build_signed_url(voice_id, engine_model)
        except Exception as e:
            db.rollback()
            return jsonify({"error": f"Signing failed: {e}"}), 503

        db.commit()

        return jsonify({
            "signed_url": signed_url,
            "sign_request_id": sign_req.id,
            "voice_id": voice_id,
            "precharge_cents": precharge,
            "balance_cents": user.balance_cents,
            "valid_minutes": config.SIGN_VALID_MINUTES,
        }), 200
    finally:
        db.close()
