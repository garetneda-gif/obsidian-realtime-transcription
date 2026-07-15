# pyright: reportImplicitRelativeImport=false, reportMissingImports=false
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError

import config
from captcha_token import (
    CAPTCHA_CHARSET,
    CAPTCHA_LENGTH,
    CAPTCHA_TTL_SECONDS,
    parse_stateless_captcha,
    render_png_data_url,
    stateless_answer_matches,
)
from database import SessionLocal
from models import CaptchaChallenge, new_uuid, utcnow

_MAX_FAILS = 5
_WHITESPACE_RE = re.compile(r"\s+")


def _answer_digest(captcha_id: str, answer: str) -> str:
    payload = f"{captcha_id}:{answer.upper()}".encode("utf-8")
    return hmac.new(config.SECRET_KEY.encode("utf-8"), payload, hashlib.sha256).hexdigest()


_render_png_data_url = render_png_data_url


def generate_image_captcha(db=None, *, commit: bool = True) -> dict[str, str]:
    answer = "".join(secrets.choice(CAPTCHA_CHARSET) for _ in range(CAPTCHA_LENGTH))
    captcha_id = new_uuid()
    now = utcnow()
    owns_session = db is None
    if owns_session:
        db = SessionLocal()
    try:
        db.query(CaptchaChallenge).filter(CaptchaChallenge.expires_at < now).delete(
            synchronize_session=False
        )
        db.add(CaptchaChallenge(
            id=captcha_id,
            answer_digest=_answer_digest(captcha_id, answer),
            expires_at=now + timedelta(seconds=CAPTCHA_TTL_SECONDS),
            fail_count=0,
        ))
        if commit:
            db.commit()
    finally:
        if owns_session:
            db.close()
    return {"captcha_id": captcha_id, "image": _render_png_data_url(answer)}


def verify_image_captcha(captcha_id: str, answer: str) -> tuple[bool, str]:
    normalized = _WHITESPACE_RE.sub("", answer or "").upper()
    if not captcha_id:
        return False, "empty_id"
    if not normalized:
        return False, "empty_answer"
    if captcha_id.startswith("v1."):
        return _verify_stateless_image_captcha(captcha_id, normalized)

    db = SessionLocal()
    try:
        challenge = (
            db.query(CaptchaChallenge)
            .filter(CaptchaChallenge.id == captcha_id)
            .with_for_update()
            .first()
        )
        if not challenge:
            return False, "not_found"
        if challenge.expires_at.replace(tzinfo=utcnow().tzinfo) < utcnow():
            db.delete(challenge)
            db.commit()
            return False, "expired"

        actual_digest = _answer_digest(captcha_id, normalized)
        if hmac.compare_digest(actual_digest, challenge.answer_digest):
            db.delete(challenge)
            db.commit()
            return True, "ok"

        challenge.fail_count += 1
        if challenge.fail_count >= _MAX_FAILS:
            db.delete(challenge)
            reason = "destroyed"
        else:
            reason = "mismatch"
        db.commit()
        return False, reason
    finally:
        db.close()


def _verify_stateless_image_captcha(captcha_id: str, answer: str) -> tuple[bool, str]:
    payload = parse_stateless_captcha(captcha_id)
    if not payload:
        return False, "invalid_token"

    nonce = str(payload["n"])
    expires_at = datetime.fromtimestamp(int(payload["e"]), tz=timezone.utc)
    answer_digest = str(payload["d"])
    matches = stateless_answer_matches(payload, answer)
    now = utcnow()
    db = SessionLocal()
    try:
        db.query(CaptchaChallenge).filter(CaptchaChallenge.expires_at < now).delete(
            synchronize_session=False
        )
        challenge = (
            db.query(CaptchaChallenge)
            .filter(CaptchaChallenge.id == nonce)
            .with_for_update()
            .first()
        )
        if challenge and (
            challenge.answer_digest != answer_digest
            or challenge.fail_count >= _MAX_FAILS
        ):
            return False, "used"

        if challenge is None:
            challenge = CaptchaChallenge(
                id=nonce,
                answer_digest=answer_digest,
                expires_at=expires_at,
                fail_count=0,
            )
            db.add(challenge)

        if matches:
            challenge.fail_count = _MAX_FAILS
            reason = "ok"
        else:
            challenge.fail_count += 1
            reason = "destroyed" if challenge.fail_count >= _MAX_FAILS else "mismatch"
        db.commit()
        return matches, reason
    except IntegrityError:
        db.rollback()
        return False, "used" if matches else "mismatch"
    finally:
        db.close()
