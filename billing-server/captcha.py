from __future__ import annotations
# pyright: reportImplicitRelativeImport=false

import base64
import hashlib
import hmac
import io
import random
import re
import secrets
import string
from datetime import timedelta

from PIL import Image, ImageDraw, ImageFilter, ImageFont

import config
from database import SessionLocal
from models import CaptchaChallenge, new_uuid, utcnow

_CHARSET = "".join(c for c in string.ascii_uppercase + string.digits if c not in "OI10L")
_CAPTCHA_LEN = 4
_TTL_SECONDS = 300
_MAX_FAILS = 5
_WHITESPACE_RE = re.compile(r"\s+")


def _answer_digest(captcha_id: str, answer: str) -> str:
    payload = f"{captcha_id}:{answer.upper()}".encode("utf-8")
    return hmac.new(config.SECRET_KEY.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf", size)
    except OSError:
        return ImageFont.load_default(size=size)


def _render_png_data_url(answer: str) -> str:
    width, height = 200, 70
    image = Image.new("RGB", (width, height), (245, 249, 255))
    draw = ImageDraw.Draw(image)

    for _ in range(9):
        points = [
            (random.randint(-10, 30), random.randint(4, height - 4)),
            (random.randint(45, 90), random.randint(0, height)),
            (random.randint(105, 155), random.randint(0, height)),
            (random.randint(170, width + 10), random.randint(4, height - 4)),
        ]
        draw.line(points, fill=random.choice([(123, 164, 255), (160, 174, 200), (244, 151, 123)]), width=1)

    for _ in range(260):
        x, y = random.randrange(width), random.randrange(height)
        color = random.choice([(37, 99, 235), (100, 116, 139), (196, 93, 62)])
        draw.point((x, y), fill=color)

    font = _font(36)
    for index, char in enumerate(answer):
        glyph = Image.new("RGBA", (48, 58), (0, 0, 0, 0))
        glyph_draw = ImageDraw.Draw(glyph)
        bbox = glyph_draw.textbbox((0, 0), char, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        color = random.choice([(17, 24, 39, 255), (29, 78, 216, 255), (51, 65, 85, 255)])
        glyph_draw.text(
            ((48 - text_width) / 2 - bbox[0], (58 - text_height) / 2 - bbox[1]),
            char,
            font=font,
            fill=color,
            stroke_width=1,
            stroke_fill=(255, 255, 255, 170),
        )
        glyph = glyph.rotate(random.randint(-18, 18), resample=Image.Resampling.BICUBIC, expand=False)
        image.paste(glyph, (12 + index * 44 + random.randint(-2, 2), 6 + random.randint(-3, 3)), glyph)

    image = image.filter(ImageFilter.GaussianBlur(radius=0.35))
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def generate_image_captcha(db=None, *, commit: bool = True) -> dict[str, str]:
    answer = "".join(secrets.choice(_CHARSET) for _ in range(_CAPTCHA_LEN))
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
            expires_at=now + timedelta(seconds=_TTL_SECONDS),
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
