# pyright: reportImplicitRelativeImport=false, reportMissingImports=false
import json
import os
import secrets
import time
from typing import Any
from urllib.parse import urlencode, urlparse

import jwt
import requests
from flask import Blueprint, jsonify, make_response, request

import config
from auth import ACCESS_COOKIE, REFRESH_COOKIE, _create_tokens, _secure_cookie
from database import SessionLocal
from models import User, new_uuid

oauth_bp = Blueprint("oauth", __name__, url_prefix="/api/auth/oauth")
OAUTH_ONLY_PASSWORD = "!oauth-only!"
OAUTH_STATE_TTL_SECONDS = int(os.getenv("BS_OAUTH_STATE_TTL_SECONDS", "7200"))


def _providers() -> dict[str, bool]:
    return {
        "google": bool(config.GOOGLE_CLIENT_ID and config.GOOGLE_CLIENT_SECRET),
        "github": bool(config.GITHUB_CLIENT_ID and config.GITHUB_CLIENT_SECRET),
    }


def _external_base_url() -> str:
    if config.PUBLIC_SERVER_URL:
        return config.PUBLIC_SERVER_URL.rstrip("/")
    proto = request.headers.get("X-Forwarded-Proto", request.scheme).split(",", 1)[0].strip()
    host = request.headers.get("X-Forwarded-Host", request.host).split(",", 1)[0].strip()
    return f"{proto}://{host}".rstrip("/")


def _redirect_uri(provider: str) -> str:
    return f"{_external_base_url()}/api/auth/oauth/{provider}/callback"


def _safe_return_url(value: str | None) -> str:
    if not value:
        return "/account"
    parsed = urlparse(value)
    base = urlparse(_external_base_url())
    if parsed.scheme or parsed.netloc:
        if (parsed.scheme, parsed.netloc, parsed.path) != (base.scheme, base.netloc, "/account"):
            return "/account"
    elif not value.startswith("/") or value.startswith("//") or parsed.path != "/account":
        return "/account"
    return f"/account?{parsed.query}" if parsed.query else "/account"


def _nonce_cookie(provider: str) -> str:
    return f"ort_oauth_nonce_{provider}"


def _state(provider: str, return_url: str, nonce: str) -> str:
    return jwt.encode(
        {
            "type": "oauth_state",
            "provider": provider,
            "return_url": return_url,
            "nonce": nonce,
            "exp": int(time.time()) + OAUTH_STATE_TTL_SECONDS,
        },
        config.SECRET_KEY,
        algorithm="HS256",
    )


def _read_state(value: str, provider: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(value, config.SECRET_KEY, algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None
    if payload.get("type") != "oauth_state" or payload.get("provider") != provider:
        return None
    nonce = payload.get("nonce")
    cookie_nonce = request.cookies.get(_nonce_cookie(provider), "")
    if not isinstance(nonce, str) or not cookie_nonce or not secrets.compare_digest(nonce, cookie_nonce):
        return None
    return payload


def _exchange_google(code: str, redirect_uri: str) -> dict[str, str]:
    token = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": config.GOOGLE_CLIENT_ID,
            "client_secret": config.GOOGLE_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    token.raise_for_status()
    access_token = token.json()["access_token"]
    user = requests.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    user.raise_for_status()
    data = user.json()
    if not data.get("email") or data.get("email_verified") is False:
        raise ValueError("Google email is not verified")
    return {"email": data["email"].lower(), "name": data.get("name") or data["email"]}


def _exchange_github(code: str, redirect_uri: str) -> dict[str, str]:
    token = requests.post(
        "https://github.com/login/oauth/access_token",
        data={
            "client_id": config.GITHUB_CLIENT_ID,
            "client_secret": config.GITHUB_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
        },
        headers={"Accept": "application/json"},
        timeout=10,
    )
    token.raise_for_status()
    access_token = token.json()["access_token"]
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}
    user = requests.get("https://api.github.com/user", headers=headers, timeout=10)
    user.raise_for_status()
    user_data = user.json()
    email = (user_data.get("email") or "").lower()
    if not email:
        emails = requests.get("https://api.github.com/user/emails", headers=headers, timeout=10)
        emails.raise_for_status()
        for item in emails.json():
            if item.get("primary") and item.get("verified") and item.get("email"):
                email = item["email"].lower()
                break
    if not email:
        raise ValueError("GitHub account has no verified email")
    return {"email": email, "name": user_data.get("name") or user_data.get("login") or email}


def _get_or_create_user(email: str) -> User:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                id=new_uuid(),
                email=email,
                password_hash=OAUTH_ONLY_PASSWORD,
                balance_cents=config.INITIAL_BALANCE_CENTS,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        return user
    finally:
        db.close()


def _callback_response(tokens: dict[str, str], return_url: str, provider: str):
    return_url_json = _script_json(return_url)
    html = f"""<!doctype html><meta charset="utf-8"><script>
localStorage.setItem("ort.billing.browserSession.v2", "1");
window.location.replace({return_url_json});
</script>"""
    resp = make_response(html)
    resp.set_cookie(ACCESS_COOKIE, tokens["token"], max_age=config.JWT_ACCESS_EXPIRE_DAYS * 86400, httponly=True, secure=_secure_cookie(), samesite="Lax")
    resp.set_cookie(REFRESH_COOKIE, tokens["refresh_token"], max_age=config.JWT_REFRESH_EXPIRE_DAYS * 86400, httponly=True, secure=_secure_cookie(), samesite="Lax")
    resp.delete_cookie(_nonce_cookie(provider))
    return resp


def _callback_error_response(message: str, return_url: str = "/account", provider: str = ""):
    message_json = _script_json(message)
    return_url_json = _script_json(return_url)
    html = f"""<!doctype html><meta charset="utf-8"><script>
sessionStorage.setItem("ort.billing.oauthError", {message_json});
window.location.replace({return_url_json});
</script>"""
    resp = make_response(html, 400)
    if provider:
        resp.delete_cookie(_nonce_cookie(provider))
    return resp


def _script_json(value: str) -> str:
    return (
        json.dumps(value)
        .replace("&", "\\u0026")
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


@oauth_bp.route("/providers", methods=["GET"])
def oauth_providers():
    return jsonify({"providers": [name for name, enabled in _providers().items() if enabled]})


@oauth_bp.route("/<provider>/authorize", methods=["GET"])
def oauth_authorize(provider: str):
    if not _providers().get(provider):
        return jsonify({"error": f"{provider} login is not configured"}), 400
    return_url = _safe_return_url(request.args.get("return_url"))
    redirect_uri = _redirect_uri(provider)
    nonce = secrets.token_urlsafe(32)
    state = _state(provider, return_url, nonce)
    if provider == "google":
        params = {
            "client_id": config.GOOGLE_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
        url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    else:
        params = {
            "client_id": config.GITHUB_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "scope": "user:email",
            "state": state,
        }
        url = f"https://github.com/login/oauth/authorize?{urlencode(params)}"
    resp = jsonify({"url": url})
    resp.set_cookie(_nonce_cookie(provider), nonce, max_age=OAUTH_STATE_TTL_SECONDS, httponly=True, secure=_secure_cookie(), samesite="Lax")
    return resp


@oauth_bp.route("/<provider>/callback", methods=["GET"])
def oauth_callback(provider: str):
    payload = _read_state(request.args.get("state", ""), provider)
    if not payload:
        return _callback_error_response("登录已过期，请重新点击 Google 或 GitHub 登录。", provider=provider)
    code = request.args.get("code", "")
    if request.args.get("error") or not code:
        return _callback_error_response("登录已取消，请重新选择登录方式。", payload.get("return_url") or "/account", provider)
    info = _exchange_google(code, _redirect_uri(provider)) if provider == "google" else _exchange_github(code, _redirect_uri(provider))
    user = _get_or_create_user(info["email"])
    return _callback_response(_create_tokens(user.id), payload.get("return_url") or "/account", provider)
