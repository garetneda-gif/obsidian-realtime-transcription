# pyright: reportImplicitRelativeImport=false, reportMissingImports=false
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import io
import json
import random
import secrets
import string
import time

from PIL import Image, ImageDraw, ImageFilter, ImageFont

import config

CAPTCHA_CHARSET = "".join(c for c in string.ascii_uppercase + string.digits if c not in "OI10L")
CAPTCHA_LENGTH = 4
CAPTCHA_TTL_SECONDS = 300
TOKEN_PREFIX = "v1"


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf", size)
    except OSError:
        return ImageFont.load_default(size=size)


def render_png_data_url(answer: str) -> str:
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


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _answer_digest(nonce: str, expires_at: int, answer: str) -> str:
    message = f"captcha:{nonce}:{expires_at}:{answer.upper()}".encode("utf-8")
    return hmac.new(config.SECRET_KEY.encode("utf-8"), message, hashlib.sha256).hexdigest()


def generate_stateless_image_captcha(answer: str | None = None, *, now: int | None = None) -> dict[str, str]:
    challenge_answer = answer or "".join(secrets.choice(CAPTCHA_CHARSET) for _ in range(CAPTCHA_LENGTH))
    issued_at = int(time.time()) if now is None else now
    expires_at = issued_at + CAPTCHA_TTL_SECONDS
    nonce = secrets.token_hex(16)
    payload = {
        "d": _answer_digest(nonce, expires_at, challenge_answer),
        "e": expires_at,
        "n": nonce,
    }
    encoded_payload = _b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = _b64encode(hmac.new(
        config.SECRET_KEY.encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).digest())
    return {
        "captcha_id": f"{TOKEN_PREFIX}.{encoded_payload}.{signature}",
        "image": render_png_data_url(challenge_answer),
    }


def parse_stateless_captcha(captcha_id: str, *, now: int | None = None) -> dict[str, str | int] | None:
    try:
        prefix, encoded_payload, encoded_signature = captcha_id.split(".", 2)
        if prefix != TOKEN_PREFIX:
            return None
        expected_signature = hmac.new(
            config.SECRET_KEY.encode("utf-8"),
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(expected_signature, _b64decode(encoded_signature)):
            return None
        payload = json.loads(_b64decode(encoded_payload))
        nonce = str(payload["n"])
        expires_at = int(payload["e"])
        answer_digest = str(payload["d"])
        current_time = int(time.time()) if now is None else now
        if len(nonce) != 32 or len(answer_digest) != 64 or expires_at < current_time:
            return None
        return {"n": nonce, "e": expires_at, "d": answer_digest}
    except (binascii.Error, KeyError, TypeError, UnicodeDecodeError, ValueError, json.JSONDecodeError):
        return None


def stateless_answer_matches(payload: dict[str, str | int], answer: str) -> bool:
    expected = _answer_digest(str(payload["n"]), int(payload["e"]), answer)
    return hmac.compare_digest(expected, str(payload["d"]))
