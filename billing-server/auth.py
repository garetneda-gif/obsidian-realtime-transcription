"""认证模块：注册、登录、JWT 刷新、rate limiting"""
# pyright: reportImplicitRelativeImport=false, reportMissingImports=false
import hashlib
import hmac
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from flask import Blueprint, request, jsonify, make_response
from sqlalchemy.exc import IntegrityError

import config
from captcha import generate_image_captcha, verify_image_captcha
from database import SessionLocal
from models import RateLimitEvent, User, new_uuid, total_balance, utcnow

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
ACCESS_COOKIE = "ort_access_token"
REFRESH_COOKIE = "ort_refresh_token"

def _request_fingerprint(value: str) -> str:
    payload = value.strip().lower().encode()
    return hmac.new(config.SECRET_KEY.encode(), payload, hashlib.sha256).hexdigest()


def _client_ip() -> str:
    forwarded = (
        request.headers.get("x-vercel-forwarded-for")
        or request.headers.get("x-forwarded-for")
        or request.remote_addr
        or "unknown"
    )
    return forwarded.split(",", 1)[0].strip()[:64] or "unknown"


def _check_rate_limit(scope: str, value: str, limit: int, window_seconds: int = 60) -> bool:
    if limit <= 0:
        return False
    now = utcnow()
    window_seconds = max(1, window_seconds)
    window = int(now.timestamp()) // window_seconds
    key_digest = _request_fingerprint(f"{scope}:{value}")
    db = SessionLocal()
    try:
        db.query(RateLimitEvent).filter(RateLimitEvent.created_at < now - timedelta(days=1)).delete(
            synchronize_session=False
        )
        db.commit()
        for slot in range(limit):
            event_id = _request_fingerprint(f"{scope}:{key_digest}:{window}:{slot}")[:36]
            db.add(RateLimitEvent(
                id=event_id,
                scope=scope,
                key_digest=key_digest,
                created_at=now,
            ))
            try:
                db.commit()
                return True
            except IntegrityError:
                db.rollback()
        return False
    finally:
        db.close()


def _check_rate_limit_in_session(db, scope: str, value: str, limit: int, window_seconds: int = 60) -> bool:
    if limit <= 0:
        return False
    now = utcnow()
    window_seconds = max(1, window_seconds)
    window = int(now.timestamp()) // window_seconds
    key_digest = _request_fingerprint(f"{scope}:{value}")
    db.query(RateLimitEvent).filter(RateLimitEvent.created_at < now - timedelta(days=1)).delete(
        synchronize_session=False
    )
    for slot in range(limit):
        event_id = _request_fingerprint(f"{scope}:{key_digest}:{window}:{slot}")[:36]
        try:
            with db.begin_nested():
                db.add(RateLimitEvent(
                    id=event_id,
                    scope=scope,
                    key_digest=key_digest,
                    created_at=now,
                ))
                db.flush()
            return True
        except IntegrityError:
            continue
    return False


def _check_login_limits(email: str) -> bool:
    return (
        _check_rate_limit("login-ip", _client_ip(), config.AUTH_IP_RATE_LIMIT_PER_MINUTE)
        and _check_rate_limit("login-account", email, config.LOGIN_RATE_LIMIT_PER_MINUTE)
    )


def _check_registration_limits(email: str) -> bool:
    return (
        _check_rate_limit(
            "register-ip",
            _client_ip(),
            config.REGISTRATION_RATE_LIMIT_PER_HOUR,
            window_seconds=3600,
        )
        and _check_rate_limit("register-account", email, config.LOGIN_RATE_LIMIT_PER_MINUTE)
    )


def _create_tokens(user_id: str) -> dict[str, str]:
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


def _json_with_cookies(payload: Mapping[str, object], status: int = 200):
    resp = make_response(jsonify(payload), status)
    resp.set_cookie(ACCESS_COOKIE, str(payload["token"]), max_age=config.JWT_ACCESS_EXPIRE_DAYS * 86400, httponly=True, secure=_secure_cookie(), samesite="Lax")
    resp.set_cookie(REFRESH_COOKIE, str(payload["refresh_token"]), max_age=config.JWT_REFRESH_EXPIRE_DAYS * 86400, httponly=True, secure=_secure_cookie(), samesite="Lax")
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
    captcha_id = str(data.get("captcha_id") or "")
    captcha_answer = str(data.get("captcha_answer") or "")

    if not email or "@" not in email:
        return jsonify({"error": "Invalid email"}), 400
    if not _check_registration_limits(email):
        return jsonify({"error": "Too many registration attempts, try again later"}), 429
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    captcha_ok, _ = verify_image_captcha(captcha_id, captcha_answer)
    if not captcha_ok:
        return jsonify({"error": "Invalid or expired captcha"}), 400

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

        tokens = {**_create_tokens(user.id), "balance_cents": total_balance(user)}
        return _json_with_cookies(tokens, 201)
    finally:
        db.close()


@auth_bp.route("/login", methods=["POST"])
def login():
    return _password_login()


@auth_bp.route("/browser-login", methods=["POST"])
def browser_login():
    return _password_login()


def _password_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
    if not _check_login_limits(email):
        return jsonify({"error": "Too many login attempts, try again later"}), 429
    captcha_ok, _ = verify_image_captcha(
        str(data.get("captcha_id") or ""),
        str(data.get("captcha_answer") or ""),
    )
    if not captcha_ok:
        return jsonify({"error": "Invalid or expired captcha"}), 400

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if (
            not user
            or not user.password_hash.startswith(("$2a$", "$2b$", "$2y$"))
            or not bcrypt.checkpw(password.encode(), user.password_hash.encode())
        ):
            return jsonify({"error": "Invalid email or password"}), 401

        tokens = {**_create_tokens(user.id), "balance_cents": total_balance(user)}
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


@auth_bp.route("/password", methods=["POST"])
def set_password():
    user_id, err = require_auth()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    password = str(data.get("password") or "")
    current_password = str(data.get("current_password") or "")
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).with_for_update().first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        if user.password_hash.startswith(("$2a$", "$2b$", "$2y$")):
            if not current_password:
                return jsonify({"error": "Current password required"}), 400
            if not bcrypt.checkpw(current_password.encode(), user.password_hash.encode()):
                return jsonify({"error": "Current password is incorrect"}), 401
        user.password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        db.commit()
        return jsonify({"ok": True}), 200
    finally:
        db.close()


@auth_bp.route("/email", methods=["PATCH"])
def change_email():
    user_id, err = require_auth()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    email = str(data.get("email") or "").strip().lower()
    current_password = str(data.get("current_password") or "")
    if not email or "@" not in email:
        return jsonify({"error": "Invalid email"}), 400
    if not current_password:
        return jsonify({"error": "Current password required"}), 400
    if not _check_rate_limit("change-email", user_id or "", config.LOGIN_RATE_LIMIT_PER_MINUTE):
        return jsonify({"error": "Too many email change attempts, try again later"}), 429

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).with_for_update().first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        if not user.password_hash.startswith(("$2a$", "$2b$", "$2y$")):
            return jsonify({"error": "Set a password before changing email"}), 409
        if not bcrypt.checkpw(current_password.encode(), user.password_hash.encode()):
            return jsonify({"error": "Current password is incorrect"}), 401
        if user.email == email:
            return jsonify({"email": user.email}), 200
        if db.query(User).filter(User.email == email).first():
            return jsonify({"error": "Email already registered"}), 409
        user.email = email
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return jsonify({"error": "Email already registered"}), 409
        return jsonify({"email": user.email}), 200
    finally:
        db.close()


@auth_bp.route("/captcha/image", methods=["POST"])
def captcha_image():
    db = SessionLocal()
    try:
        if not _check_rate_limit_in_session(
            db,
            "captcha-ip",
            _client_ip(),
            config.CAPTCHA_RATE_LIMIT_PER_MINUTE,
        ):
            db.rollback()
            return jsonify({"error": "Too many captcha requests, try again later"}), 429
        payload = generate_image_captcha(db, commit=False)
        db.commit()
        return jsonify(payload), 200
    finally:
        db.close()
