"""配置：从环境变量读取，启动时验证必填项"""
import os
from urllib.parse import urlparse


class ConfigError(RuntimeError):
    """Raised when production configuration is incomplete or unsafe."""


DEFAULT_SECRET_KEY = "change-me-in-production"
ENV = os.getenv("BS_ENV", "development").lower()

_INT_ENV_ERRORS: list[str] = []


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        _INT_ENV_ERRORS.append(f"{name} must be an integer")
        return default


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]

# 服务器
HOST = os.getenv("BS_HOST", "0.0.0.0")
PORT = _env_int("BS_PORT", 8900)
SECRET_KEY = os.getenv("BS_SECRET_KEY", DEFAULT_SECRET_KEY)
PUBLIC_SERVER_URL = os.getenv("BS_PUBLIC_SERVER_URL", "")
CORS_ORIGINS = _env_list("BS_CORS_ORIGINS", "app://obsidian.md")
DISABLE_SETTLEMENT_LOOP = _env_bool("BS_DISABLE_SETTLEMENT_LOOP", False)

# JWT
JWT_ACCESS_EXPIRE_DAYS = _env_int("BS_JWT_ACCESS_DAYS", 7)
JWT_REFRESH_EXPIRE_DAYS = _env_int("BS_JWT_REFRESH_DAYS", 30)

# 腾讯云 ASR
TENCENT_APP_ID = os.getenv("TENCENT_APP_ID", "")
TENCENT_SECRET_ID = os.getenv("TENCENT_SECRET_ID", "")
TENCENT_SECRET_KEY = os.getenv("TENCENT_SECRET_KEY", "")

# 虎皮椒
XUNHU_APPID = os.getenv("AP_XUNHU_APPID", "")
XUNHU_APPSECRET = os.getenv("AP_XUNHU_APPSECRET", "")
XUNHU_NOTIFY_URL = os.getenv("AP_XUNHU_NOTIFY_URL", "")
XUNHU_QUERY_URL = os.getenv("AP_XUNHU_QUERY_URL", "https://api.xunhupay.com/payment/query.html")

# 计费
PRECHARGE_MINUTES = _env_int("BS_PRECHARGE_MINUTES", 30)
PRICE_PER_HOUR_CENTS = _env_int("BS_PRICE_PER_HOUR_CENTS", 200)  # ¥2.00/小时
INITIAL_BALANCE_CENTS = _env_int("BS_INITIAL_BALANCE_CENTS", 100)  # 注册送 ¥1.00 (约30分钟)
REPORT_TIMEOUT_MINUTES = _env_int("BS_REPORT_TIMEOUT_MINUTES", 10)
SIGN_VALID_MINUTES = _env_int("BS_SIGN_VALID_MINUTES", 30)

# 数据库
DATABASE_URL = os.getenv("BS_DATABASE_URL", "sqlite:///billing.db")

# Rate limiting
LOGIN_RATE_LIMIT_PER_MINUTE = _env_int("BS_LOGIN_RATE_LIMIT", 5)


def _valid_url(value: str, *, allow_app_scheme: bool = False) -> bool:
    if not value:
        return False
    parsed = urlparse(value)
    schemes = {"http", "https"}
    if allow_app_scheme:
        schemes.add("app")
    return parsed.scheme in schemes and bool(parsed.netloc)


def _check_range(errors: list[str], name: str, value: int, minimum: int, maximum: int) -> None:
    if value < minimum or value > maximum:
        errors.append(f"{name} must be between {minimum} and {maximum}")


def validate_config() -> None:
    """Validate deployment-critical settings.

    Development and test environments stay permissive so local tests can patch
    only the values they need. Production fails fast before the server starts.
    """
    if ENV not in {"production", "prod"}:
        return

    errors = list(_INT_ENV_ERRORS)

    if SECRET_KEY == DEFAULT_SECRET_KEY or len(SECRET_KEY) < 32:
        errors.append("BS_SECRET_KEY must be changed and at least 32 characters in production")

    required = {
        "TENCENT_APP_ID": TENCENT_APP_ID,
        "TENCENT_SECRET_ID": TENCENT_SECRET_ID,
        "TENCENT_SECRET_KEY": TENCENT_SECRET_KEY,
        "AP_XUNHU_APPID": XUNHU_APPID,
        "AP_XUNHU_APPSECRET": XUNHU_APPSECRET,
        "AP_XUNHU_NOTIFY_URL": XUNHU_NOTIFY_URL,
    }
    for name, value in required.items():
        if not value:
            errors.append(f"{name} is required in production")

    if XUNHU_NOTIFY_URL and not _valid_url(XUNHU_NOTIFY_URL):
        errors.append("AP_XUNHU_NOTIFY_URL must be a valid http(s) URL")
    if XUNHU_QUERY_URL and not _valid_url(XUNHU_QUERY_URL):
        errors.append("AP_XUNHU_QUERY_URL must be a valid http(s) URL")
    if PUBLIC_SERVER_URL and not _valid_url(PUBLIC_SERVER_URL):
        errors.append("BS_PUBLIC_SERVER_URL must be a valid http(s) URL")

    for origin in CORS_ORIGINS:
        if not _valid_url(origin, allow_app_scheme=True):
            errors.append(f"BS_CORS_ORIGINS contains invalid origin: {origin}")

    _check_range(errors, "BS_PORT", PORT, 1, 65535)
    _check_range(errors, "BS_JWT_ACCESS_DAYS", JWT_ACCESS_EXPIRE_DAYS, 1, 365)
    _check_range(errors, "BS_JWT_REFRESH_DAYS", JWT_REFRESH_EXPIRE_DAYS, 1, 365)
    _check_range(errors, "BS_PRECHARGE_MINUTES", PRECHARGE_MINUTES, 1, 24 * 60)
    _check_range(errors, "BS_PRICE_PER_HOUR_CENTS", PRICE_PER_HOUR_CENTS, 1, 100_000)
    _check_range(errors, "BS_INITIAL_BALANCE_CENTS", INITIAL_BALANCE_CENTS, 0, 1_000_000)
    _check_range(errors, "BS_REPORT_TIMEOUT_MINUTES", REPORT_TIMEOUT_MINUTES, 1, 24 * 60)
    _check_range(errors, "BS_SIGN_VALID_MINUTES", SIGN_VALID_MINUTES, 1, 24 * 60)
    _check_range(errors, "BS_LOGIN_RATE_LIMIT", LOGIN_RATE_LIMIT_PER_MINUTE, 1, 1_000)

    if errors:
        raise ConfigError("Invalid billing server configuration: " + "; ".join(errors))
