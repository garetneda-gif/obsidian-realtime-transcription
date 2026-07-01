"""数据模型：User, Order, UsageRecord, SignRequest"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Index
from sqlalchemy.orm import DeclarativeBase


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
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class OrderStatus:
    CREATED = "CREATED"
    PAID = "PAID"
    CREDITED = "CREDITED"
    REFUNDED = "REFUNDED"


class Order(Base):
    __tablename__ = "orders"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    trade_order_id = Column(String(64), unique=True, nullable=False)
    amount_cents = Column(Integer, nullable=False)
    status = Column(String(16), nullable=False, default=OrderStatus.CREATED)
    idempotency_key = Column(String(64), unique=True, nullable=True)
    provider = Column(String(32), nullable=False, default="xunhu")
    provider_order_id = Column(String(128), nullable=True)
    payment_url = Column(String(2048), nullable=True)
    credited_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class SignRequest(Base):
    """每次签名请求的记录，用于预扣费和结算"""
    __tablename__ = "sign_requests"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    voice_id = Column(String(32), nullable=False)
    engine_model = Column(String(32), nullable=False)
    precharge_cents = Column(Integer, nullable=False)
    actual_cost_cents = Column(Integer, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    settled = Column(Integer, nullable=False, default=0)  # 0=pending, 1=settled
    anomaly_flag = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    settled_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_sign_pending", "settled", "created_at"),
    )


class UsageRecord(Base):
    __tablename__ = "usage_records"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    sign_request_id = Column(String(36), ForeignKey("sign_requests.id"), nullable=False, unique=True)
    duration_seconds = Column(Integer, nullable=False)
    cost_cents = Column(Integer, nullable=False)
    engine_model = Column(String(32), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
