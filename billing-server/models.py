"""数据模型：User, Order, UsageRecord, SignRequest"""
# pyright: reportMissingImports=false
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Index, Enum as SAEnum
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=new_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    balance_cents = Column(Integer, nullable=False, default=0)
    overseas_balance_cents = Column(Integer, nullable=False, default=0)
    balance_scope_migrated = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class OrderStatus:
    CREATED = "CREATED"
    CANCELED = "CANCELED"
    PAID = "PAID"
    CREDITED = "CREDITED"
    REFUNDED = "REFUNDED"


class Order(Base):
    __tablename__ = "orders"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    trade_order_id = Column(String(64), unique=True, nullable=False)
    amount_cents = Column(Integer, nullable=False)
    credit_cents = Column(Integer, nullable=True)
    credit_scope = Column(String(16), nullable=False, default="domestic")
    provider_product_id = Column(String(64), nullable=True)
    provider_transaction_id = Column(String(64), unique=True, nullable=True)
    status = Column(String(16), nullable=False, default=OrderStatus.CREATED)
    idempotency_key = Column(String(64), unique=True, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class SignRequest(Base):
    """每次签名请求的记录，用于预扣费和结算"""
    __tablename__ = "sign_requests"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    voice_id = Column(String(32), nullable=False)
    engine_model = Column(String(32), nullable=False)
    provider = Column(String(16), nullable=False, default="tencent")
    billing_scope = Column(String(16), nullable=False, default="domestic")
    language = Column(String(16), nullable=False, default="auto")
    client_session_id = Column(String(64), nullable=True)
    provider_request_id = Column(String(64), nullable=True)
    provider_cost_microusd = Column(Integer, nullable=True)
    provider_verified = Column(Integer, nullable=False, default=1)
    proxy_connected = Column(Integer, nullable=False, default=0)
    precharge_cents = Column(Integer, nullable=False)
    actual_cost_cents = Column(Integer, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    settled = Column(Integer, nullable=False, default=0)  # 0=pending, 1=settled
    anomaly_flag = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    settled_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_sign_pending", "settled", "created_at"),
        Index("ix_sign_user_client_session", "user_id", "client_session_id", unique=True),
        Index("ix_sign_provider_request", "provider_request_id", unique=True),
    )


class UsageRecord(Base):
    __tablename__ = "usage_records"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    sign_request_id = Column(String(36), ForeignKey("sign_requests.id"), nullable=False)
    duration_seconds = Column(Integer, nullable=False)
    cost_cents = Column(Integer, nullable=False)
    engine_model = Column(String(32), nullable=False)
    provider = Column(String(16), nullable=False, default="tencent")
    language = Column(String(16), nullable=False, default="auto")
    provider_cost_microusd = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class CaptchaChallenge(Base):
    __tablename__ = "captcha_challenges"

    id = Column(String(36), primary_key=True)
    answer_digest = Column(String(64), nullable=False)
    fail_count = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class RateLimitEvent(Base):
    __tablename__ = "rate_limit_events"

    id = Column(String(36), primary_key=True, default=new_uuid)
    scope = Column(String(32), nullable=False)
    key_digest = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (
        Index("ix_rate_limit_scope_key_created", "scope", "key_digest", "created_at"),
    )


DOMESTIC_SCOPE = "domestic"
OVERSEAS_SCOPE = "overseas"


def normalize_credit_scope(scope: str | None) -> str:
    return OVERSEAS_SCOPE if scope == OVERSEAS_SCOPE else DOMESTIC_SCOPE


def balance_column(scope: str | None):
    if normalize_credit_scope(scope) == OVERSEAS_SCOPE:
        return User.overseas_balance_cents
    return User.balance_cents


def scoped_balance(user: User, scope: str | None) -> int:
    if normalize_credit_scope(scope) == OVERSEAS_SCOPE:
        return int(getattr(user, "overseas_balance_cents", 0) or 0)
    return int(user.balance_cents or 0)


def total_balance(user: User) -> int:
    return int(user.balance_cents or 0) + int(getattr(user, "overseas_balance_cents", 0) or 0)


def balance_payload(user: User) -> dict[str, int]:
    return {
        "balance_cents": total_balance(user),
        "domestic_balance_cents": scoped_balance(user, DOMESTIC_SCOPE),
        "overseas_balance_cents": scoped_balance(user, OVERSEAS_SCOPE),
    }


def adjust_balance(user: User, scope: str | None, amount_cents: int) -> None:
    if normalize_credit_scope(scope) == OVERSEAS_SCOPE:
        user.overseas_balance_cents = int(user.overseas_balance_cents or 0) + amount_cents
    else:
        user.balance_cents = int(user.balance_cents or 0) + amount_cents
