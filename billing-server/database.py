"""数据库初始化和会话管理"""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

import config
from models import Base

database_url = config.DATABASE_URL
is_postgresql = database_url.startswith("postgresql://") or database_url.startswith("postgresql+psycopg://")
if database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(
    database_url,
    connect_args={"prepare_threshold": None} if is_postgresql else {"check_same_thread": False},
    poolclass=NullPool if is_postgresql else None,
    echo=False,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    order_migrations = {
        "credit_cents": "INTEGER",
        "provider_product_id": "VARCHAR(64)",
        "provider_transaction_id": "VARCHAR(64)",
    }
    sign_request_migrations = {
        "provider": "VARCHAR(16) NOT NULL DEFAULT 'tencent'",
        "language": "VARCHAR(16) NOT NULL DEFAULT 'auto'",
        "client_session_id": "VARCHAR(64)",
        "provider_request_id": "VARCHAR(64)",
        "provider_cost_microusd": "INTEGER",
        "provider_verified": "INTEGER NOT NULL DEFAULT 1",
        "proxy_connected": "INTEGER NOT NULL DEFAULT 0",
    }
    usage_record_migrations = {
        "provider": "VARCHAR(16) NOT NULL DEFAULT 'tencent'",
        "language": "VARCHAR(16) NOT NULL DEFAULT 'auto'",
        "provider_cost_microusd": "INTEGER",
    }

    _add_missing_columns("orders", order_migrations)
    _add_missing_columns("sign_requests", sign_request_migrations)
    _add_missing_columns("usage_records", usage_record_migrations)

    with engine.begin() as connection:
        connection.execute(text("UPDATE orders SET credit_cents = amount_cents WHERE credit_cents IS NULL"))
        connection.execute(text("UPDATE sign_requests SET provider = 'tencent' WHERE provider IS NULL"))
        connection.execute(text("UPDATE sign_requests SET language = 'auto' WHERE language IS NULL"))
        connection.execute(text("UPDATE sign_requests SET provider_verified = 1 WHERE provider_verified IS NULL"))
        connection.execute(text("UPDATE sign_requests SET proxy_connected = 0 WHERE proxy_connected IS NULL"))
        connection.execute(text("UPDATE usage_records SET provider = 'tencent' WHERE provider IS NULL"))
        connection.execute(text("UPDATE usage_records SET language = 'auto' WHERE language IS NULL"))
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_sign_user_client_session "
            "ON sign_requests(user_id, client_session_id)"
        ))
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_sign_provider_request "
            "ON sign_requests(provider_request_id)"
        ))


def _add_missing_columns(table_name: str, migrations: dict[str, str]) -> None:
    columns = {column["name"] for column in inspect(engine).get_columns(table_name)}
    for column_name, column_type in migrations.items():
        if column_name in columns:
            continue
        with engine.begin() as connection:
            if engine.dialect.name == "postgresql":
                connection.execute(text(
                    f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {column_name} {column_type}"
                ))
            else:
                connection.execute(text(
                    f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
                ))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
