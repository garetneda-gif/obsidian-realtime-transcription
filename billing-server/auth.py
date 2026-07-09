"""认证模块：注册、登录、JWT 刷新、rate limiting"""
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from flask import Blueprint, request, jsonify, make_response

import config
from database import SessionLocal
from models import User, new_uuid, utcnow

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
ACCESS_COOKIE = "ort_access_token"
REFRESH_COOKIE = "ort_refresh_token"

# 简易 IP rate limiter（单 worker 内存级，MVP 足够）
_login_attempts: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(ip: str) -> bool:
    """返回 True 表示允许，False 表示限流"""
    now = time.time()
    window = 60.0
    attempts = _login_attempts[ip]
    # 清理过期记录
    _login_attempts[ip] = [t for t in attempts if now - t < window]
    if len(_login_attempts[ip]) >= config.LOGIN_RATE_LIMIT_PER_MINUTE:
        return False
    _login_attempts[ip].append(now)
    return True


def _create_tokens(user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    access_payload = {
        "sub": user_id,
        "exp": now + timedelta(days=config.JWT_ACCESS_EXPIRE_DAYS),
        "iat": now,
        "type": "access",
    }
    refresh_payload = {
        "sub": user_id,
        "exp": now + timedelta(days=config.JWT_REFRESH_EXPIRE_DAYS),
        "iat": now,
        "type": "refresh",
    }
    access_token = jwt.encode(access_payload, config.SECRET_KEY, algorithm="HS256")
    refresh_token = jwt.encode(refresh_payload, config.SECRET_KEY, algorithm="HS256")
    return {
        "token": access_token,
        "refresh_token": refresh_token,
        "expires_at": (now + timedelta(days=config.JWT_ACCESS_EXPIRE_DAYS)).isoformat(),
    }


def _secure_cookie() -> bool:
    return config.is_production() or request.is_secure or request.headers.get("X-Forwarded-Proto", "") == "https"


def _json_with_cookies(payload: dict, status: int = 200):
    resp = make_response(jsonify(payload), status)
    resp.set_cookie(ACCESS_COOKIE, payload["token"], max_age=config.JWT_ACCESS_EXPIRE_DAYS * 86400, httponly=True, secure=_secure_cookie(), samesite="Lax")
    resp.set_cookie(REFRESH_COOKIE, payload["refresh_token"], max_age=config.JWT_REFRESH_EXPIRE_DAYS * 86400, httponly=True, secure=_secure_cookie(), samesite="Lax")
    return resp


def decode_token(token: str, expected_type: str = "access") -> str | None:
    """解码 JWT，返回 user_id 或 None"""
    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != expected_type:
            return None
        return payload.get("sub")
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def require_auth():
    """从 Authorization header 解析 user_id，失败返回 401 响应"""
    auth_header = request.headers.get("Authorization", "")
    token = request.cookies.get(ACCESS_COOKIE, "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        return None, (jsonify({"error": "Missing or invalid Authorization header"}), 401)
    user_id = decode_token(token)
    if not user_id:
        return None, (jsonify({"error": "Token expired or invalid"}), 401)
    return user_id, None


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or "@" not in email:
        return jsonify({"error": "Invalid email"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            return jsonify({"error": "Email already registered"}), 409

        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        user = User(
            id=new_uuid(),
            email=email,
            password_hash=password_hash,
            balance_cents=config.INITIAL_BALANCE_CENTS,
        )
        db.add(user)
        db.commit()

        tokens = {**_create_tokens(user.id), "balance_cents": user.balance_cents}
        return _json_with_cookies(tokens, 201)
    finally:
        db.close()


@auth_bp.route("/login", methods=["POST"])
def login():
    ip = request.remote_addr or "unknown"
    if not _check_rate_limit(ip):
        return jsonify({"error": "Too many login attempts, try again later"}), 429

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user or not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
            return jsonify({"error": "Invalid email or password"}), 401

        tokens = {**_create_tokens(user.id), "balance_cents": user.balance_cents}
        return _json_with_cookies(tokens)
    finally:
        db.close()


@auth_bp.route("/refresh", methods=["POST"])
def refresh():
    data = request.get_json(silent=True) or {}
    refresh_token = data.get("refresh_token") or request.cookies.get(REFRESH_COOKIE, "")

    user_id = decode_token(refresh_token, expected_type="refresh")
    if not user_id:
        return jsonify({"error": "Invalid or expired refresh token"}), 401

    tokens = _create_tokens(user_id)
    return _json_with_cookies(tokens)


@auth_bp.route("/logout", methods=["POST"])
def logout():
    resp = make_response(jsonify({"ok": True}), 200)
    resp.delete_cookie(ACCESS_COOKIE)
    resp.delete_cookie(REFRESH_COOKIE)
    return resp


@auth_bp.route("/oauth/providers", methods=["GET"])
def oauth_providers():
    return jsonify({"providers": []}), 200


@auth_bp.route("/captcha/image", methods=["POST"])
def captcha_image():
    return jsonify({"captcha_id": "", "image": ""}), 200
