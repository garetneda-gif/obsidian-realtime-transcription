"""配置：从环境变量读取，启动时验证必填项"""
import os

# 服务器
HOST = os.getenv("BS_HOST", "0.0.0.0")
PORT = int(os.getenv("BS_PORT", "8900"))
SECRET_KEY = os.getenv("BS_SECRET_KEY", "change-me-in-production")
ENV = os.getenv("BS_ENV", "development").lower()

if ENV in {"production", "prod"} and (
    not SECRET_KEY or SECRET_KEY == "change-me-in-production" or len(SECRET_KEY) < 32
):
    raise RuntimeError(
        "BS_SECRET_KEY is missing or too weak. "
        "Please set a strong, unpredictable value (>= 32 characters) in the environment."
    )


def is_production() -> bool:
    return ENV in {"production", "prod"}

# JWT
JWT_ACCESS_EXPIRE_DAYS = int(os.getenv("BS_JWT_ACCESS_DAYS", "7"))
JWT_REFRESH_EXPIRE_DAYS = int(os.getenv("BS_JWT_REFRESH_DAYS", "30"))

# 腾讯云 ASR
TENCENT_APP_ID = os.getenv("TENCENT_APP_ID", "")
TENCENT_SECRET_ID = os.getenv("TENCENT_SECRET_ID", "")
TENCENT_SECRET_KEY = os.getenv("TENCENT_SECRET_KEY", "")

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
DEEPGRAM_PROJECT_ID = os.getenv("DEEPGRAM_PROJECT_ID", "")
DEEPGRAM_TOKEN_TTL_SECONDS = min(30, max(1, int(os.getenv("DEEPGRAM_TOKEN_TTL_SECONDS", "15"))))
DEEPGRAM_HTTP_TIMEOUT_SECONDS = min(30, max(1, int(os.getenv("DEEPGRAM_HTTP_TIMEOUT_SECONDS", "8"))))
DEEPGRAM_NOVA3_MONOLINGUAL_USD_PER_MINUTE = float(
    os.getenv("DEEPGRAM_NOVA3_MONOLINGUAL_USD_PER_MINUTE", "0.0048")
)
DEEPGRAM_NOVA3_MULTILINGUAL_USD_PER_MINUTE = float(
    os.getenv("DEEPGRAM_NOVA3_MULTILINGUAL_USD_PER_MINUTE", "0.0058")
)

# 虎皮椒
XUNHU_APPID = os.getenv("AP_XUNHU_APPID", "")
XUNHU_APPSECRET = os.getenv("AP_XUNHU_APPSECRET", "")
XUNHU_NOTIFY_URL = os.getenv("AP_XUNHU_NOTIFY_URL", "")

CREEM_API_KEY = os.getenv("AP_CREEM_API_KEY", "")
CREEM_WEBHOOK_SECRET = os.getenv("AP_CREEM_WEBHOOK_SECRET", "")
CREEM_PRICE_VERSION = os.getenv("AP_CREEM_PRICE_VERSION", "")
CREEM_TEST_MODE = os.getenv("AP_CREEM_MODE", "").lower() == "test" or (
    not os.getenv("AP_CREEM_MODE") and ENV == "development"
)
if is_production() and CREEM_TEST_MODE:
    raise RuntimeError("AP_CREEM_MODE must be live in production")
CREEM_PRODUCTS = {
    key.strip(): value.strip()
    for pair in os.getenv("AP_CREEM_PRODUCTS", "").split(",")
    if ":" in pair
    for key, value in [pair.split(":", 1)]
}

# 计费
PRECHARGE_MINUTES = int(os.getenv("BS_PRECHARGE_MINUTES", "30"))
PRICE_PER_HOUR_CENTS = int(os.getenv("BS_PRICE_PER_HOUR_CENTS", "200"))  # ¥2.00/小时
INITIAL_BALANCE_CENTS = 0
REPORT_TIMEOUT_MINUTES = int(os.getenv("BS_REPORT_TIMEOUT_MINUTES", "10"))
CLOUD_SESSION_MAX_SECONDS = min(295, max(1, int(os.getenv("BS_CLOUD_SESSION_MAX_SECONDS", "295"))))
SIGN_VALID_MINUTES = int(os.getenv("BS_SIGN_VALID_MINUTES", "30"))

# 数据库
DATABASE_URL = os.getenv("BS_DATABASE_URL", "sqlite:///billing.db")

# Rate limiting
LOGIN_RATE_LIMIT_PER_MINUTE = int(os.getenv("BS_LOGIN_RATE_LIMIT", "5"))
AUTH_IP_RATE_LIMIT_PER_MINUTE = int(os.getenv("BS_AUTH_IP_RATE_LIMIT", "30"))
REGISTRATION_RATE_LIMIT_PER_HOUR = int(os.getenv("BS_REGISTRATION_RATE_LIMIT", "3"))
CAPTCHA_RATE_LIMIT_PER_MINUTE = int(os.getenv("BS_CAPTCHA_RATE_LIMIT", "20"))

PUBLIC_SERVER_URL = os.getenv("BS_PUBLIC_SERVER_URL", "")
GOOGLE_CLIENT_ID = os.getenv("BS_GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("BS_GOOGLE_CLIENT_SECRET", "")
GITHUB_CLIENT_ID = os.getenv("BS_GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("BS_GITHUB_CLIENT_SECRET", "")
