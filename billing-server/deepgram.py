# pyright: reportImplicitRelativeImport=false
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit

import jwt
import requests

import config


DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen"
DEEPGRAM_API_URL = "https://api.deepgram.com/v1"
SUPPORTED_LANGUAGES = {"auto", "zh-CN", "zh-HK", "en", "ja", "ko"}


class DeepgramProviderError(RuntimeError):
    pass


class DeepgramPendingError(RuntimeError):
    pass


class DeepgramVerificationError(RuntimeError):
    pass


class DeepgramRequestFailedError(RuntimeError):
    pass


@dataclass(frozen=True)
class DeepgramUsage:
    duration_seconds: float
    provider_cost_microusd: int


def is_configured() -> bool:
    return bool(config.DEEPGRAM_API_KEY and config.DEEPGRAM_PROJECT_ID)


def create_proxy_token(session_id: str, user_id: str, language: str) -> tuple[str, int]:
    from datetime import datetime, timezone

    ttl_seconds = 60
    now = int(datetime.now(timezone.utc).timestamp())
    token = jwt.encode({
        "sub": user_id,
        "sid": session_id,
        "language": language,
        "type": "asr_proxy",
        "iat": now,
        "exp": now + ttl_seconds,
    }, config.SECRET_KEY, algorithm="HS256")
    return token, ttl_seconds


def decode_proxy_token(token: str) -> dict[str, str] | None:
    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None
    if payload.get("type") != "asr_proxy":
        return None
    required = ("sub", "sid", "language")
    if not all(isinstance(payload.get(key), str) and payload[key] for key in required):
        return None
    return {key: str(payload[key]) for key in required}


def build_websocket_url(session_id: str, language: str) -> str:
    if language not in SUPPORTED_LANGUAGES:
        raise ValueError("Unsupported Deepgram language")

    params = {
        "model": "nova-3",
        "encoding": "linear16",
        "sample_rate": "16000",
        "channels": "1",
        "interim_results": "true",
        "endpointing": "500",
        "smart_format": "true",
        "punctuate": "true",
        "vad_events": "true",
        "utterance_end_ms": "1000",
        "mip_opt_out": "true",
        "tag": "obsidian-paid",
        "extra": f"ort_session:{session_id}",
    }
    if language == "auto":
        params["language"] = "multi"
    else:
        params["language"] = language
    return f"{DEEPGRAM_LISTEN_URL}?{urlencode(params)}"


def fetch_verified_usage(session_id: str, language: str, request_id: str) -> DeepgramUsage:
    if not is_configured():
        raise DeepgramProviderError("Deepgram is not configured")

    try:
        response = requests.get(
            f"{DEEPGRAM_API_URL}/projects/{config.DEEPGRAM_PROJECT_ID}/requests/{request_id}",
            headers={
                "Authorization": f"Token {config.DEEPGRAM_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=config.DEEPGRAM_HTTP_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise DeepgramPendingError("Deepgram usage lookup is temporarily unavailable") from exc

    if response.status_code in {202, 404, 408, 409, 425, 429} or response.status_code >= 500:
        raise DeepgramPendingError("Deepgram usage record is not ready")
    if response.status_code in {401, 403}:
        raise DeepgramProviderError("Deepgram management access was rejected")
    if response.status_code != 200:
        raise DeepgramVerificationError("Deepgram request lookup failed")

    try:
        payload = response.json()
    except ValueError as exc:
        raise DeepgramPendingError("Deepgram usage record is not ready") from exc

    raw_record = payload.get("request", payload) if isinstance(payload, dict) else None
    if not isinstance(raw_record, dict):
        raise DeepgramPendingError("Deepgram usage record is not ready")
    return verify_usage_record(raw_record, session_id, language, request_id)


def verify_usage_record(
    record: dict[str, Any],
    session_id: str,
    language: str,
    request_id: str,
) -> DeepgramUsage:
    if str(record.get("request_id", "")) != request_id:
        raise DeepgramVerificationError("Deepgram request ID mismatch")
    if str(record.get("project_uuid", "")) != config.DEEPGRAM_PROJECT_ID:
        raise DeepgramVerificationError("Deepgram project mismatch")

    request_path = str(record.get("path", ""))
    parsed_path = urlsplit(request_path)
    if parsed_path.path.rstrip("/") != "/v1/listen":
        raise DeepgramVerificationError("Deepgram endpoint mismatch")
    query = parse_qs(parsed_path.query, keep_blank_values=True)

    required_query = {
        "model": "nova-3",
        "encoding": "linear16",
        "sample_rate": "16000",
        "channels": "1",
        "interim_results": "true",
        "endpointing": "500",
        "smart_format": "true",
        "punctuate": "true",
        "vad_events": "true",
        "utterance_end_ms": "1000",
        "mip_opt_out": "true",
    }
    for key, expected in required_query.items():
        if expected not in query.get(key, []):
            raise DeepgramVerificationError(f"Deepgram option mismatch: {key}")
    if "obsidian-paid" not in query.get("tag", []):
        raise DeepgramVerificationError("Deepgram tag mismatch")
    if f"ort_session:{session_id}" not in query.get("extra", []):
        raise DeepgramVerificationError("Deepgram session mismatch")

    if language == "auto":
        if "multi" not in query.get("language", []):
            raise DeepgramVerificationError("Deepgram language mode mismatch")
    elif language not in query.get("language", []):
        raise DeepgramVerificationError("Deepgram language mismatch")

    response = record.get("response")
    if not isinstance(response, dict) or not response:
        raise DeepgramPendingError("Deepgram usage record is not ready")
    code = response.get("code", record.get("code"))
    try:
        status_code = int(code)
    except (TypeError, ValueError) as exc:
        raise DeepgramPendingError("Deepgram request status is not ready") from exc
    if status_code >= 400:
        raise DeepgramRequestFailedError(f"Deepgram request failed with status {status_code}")

    details = response.get("details")
    if not isinstance(details, dict) or not details:
        raise DeepgramPendingError("Deepgram billing details are not ready")
    if str(details.get("method", "")) != "streaming":
        raise DeepgramVerificationError("Deepgram processing method mismatch")
    tier = str(details.get("tier", ""))
    if tier and tier != "nova-3":
        raise DeepgramVerificationError("Deepgram model mismatch")

    duration = _first_number(
        details.get("duration"),
        details.get("billable_duration"),
        response.get("duration"),
        _nested_value(response, "metadata", "duration"),
    )
    usd = _first_number(details.get("usd"))
    if duration is None:
        raise DeepgramPendingError("Deepgram usage totals are not ready")
    if duration < 0 or (usd is not None and usd < 0):
        raise DeepgramVerificationError("Deepgram usage totals are invalid")
    if usd is None:
        rate = (
            config.DEEPGRAM_NOVA3_MULTILINGUAL_USD_PER_MINUTE
            if language == "auto"
            else config.DEEPGRAM_NOVA3_MONOLINGUAL_USD_PER_MINUTE
        )
        usd = duration * rate / 60

    return DeepgramUsage(
        duration_seconds=duration,
        provider_cost_microusd=round(usd * 1_000_000),
    )


def _first_number(*values: object) -> float | None:
    for value in values:
        if isinstance(value, bool) or value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def _nested_value(value: object, *keys: str) -> object | None:
    current = value
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current
