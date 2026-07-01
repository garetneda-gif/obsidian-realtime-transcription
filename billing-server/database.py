"""数据库初始化和会话管理"""
from sqlalchemy import create_engine
from sqlalchemy import event
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

import config
from models import Base

engine = create_engine(
    config.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in config.DATABASE_URL else {},
    echo=False,
)


if engine.url.get_backend_name() == "sqlite":
    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_usage_sign_request_unique_index()


def _ensure_usage_sign_request_unique_index() -> None:
    index_name = "ux_usage_records_sign_request_id"
    with engine.begin() as conn:
        if engine.url.get_backend_name() == "sqlite":
            duplicates = conn.execute(text("""
                SELECT sign_request_id
                FROM usage_records
                GROUP BY sign_request_id
                HAVING COUNT(*) > 1
                LIMIT 1
            """)).first()
            if duplicates:
                raise RuntimeError(
                    "usage_records contains duplicate sign_request_id values; "
                    "deduplicate before starting billing server"
                )
            conn.execute(text(
                f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} "
                "ON usage_records (sign_request_id)"
            ))
        else:
            conn.execute(text(
                f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} "
                "ON usage_records (sign_request_id)"
            ))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
