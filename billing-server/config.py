"""配置：从环境变量读取，启动时验证必填项"""
import os

# 服务器
HOST = os.getenv("BS_HOST", "0.0.0.0")
PORT = int(os.getenv("BS_PORT", "8900"))
SECRET_KEY = os.getenv("BS_SECRET_KEY", "change-me-in-production")

# JWT
JWT_ACCESS_EXPIRE_DAYS = int(os.getenv("BS_JWT_ACCESS_DAYS", "7"))
JWT_REFRESH_EXPIRE_DAYS = int(os.getenv("BS_JWT_REFRESH_DAYS", "30"))

# 腾讯云 ASR
TENCENT_APP_ID = os.getenv("TENCENT_APP_ID", "")
TENCENT_SECRET_ID = os.getenv("TENCENT_SECRET_ID", "")
TENCENT_SECRET_KEY = os.getenv("TENCENT_SECRET_KEY", "")

# 虎皮椒
XUNHU_APPID = os.getenv("AP_XUNHU_APPID", "")
XUNHU_APPSECRET = os.getenv("AP_XUNHU_APPSECRET", "")
XUNHU_NOTIFY_URL = os.getenv("AP_XUNHU_NOTIFY_URL", "")

# 计费
PRECHARGE_MINUTES = int(os.getenv("BS_PRECHARGE_MINUTES", "30"))
PRICE_PER_HOUR_CENTS = int(os.getenv("BS_PRICE_PER_HOUR_CENTS", "200"))  # ¥2.00/小时
INITIAL_BALANCE_CENTS = int(os.getenv("BS_INITIAL_BALANCE_CENTS", "100"))  # 注册送 ¥1.00 (约30分钟)
REPORT_TIMEOUT_MINUTES = int(os.getenv("BS_REPORT_TIMEOUT_MINUTES", "10"))
SIGN_VALID_MINUTES = int(os.getenv("BS_SIGN_VALID_MINUTES", "30"))

# 数据库
DATABASE_URL = os.getenv("BS_DATABASE_URL", "sqlite:///billing.db")

# Rate limiting
LOGIN_RATE_LIMIT_PER_MINUTE = int(os.getenv("BS_LOGIN_RATE_LIMIT", "5"))
