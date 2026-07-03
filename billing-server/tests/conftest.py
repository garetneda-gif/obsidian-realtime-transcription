import importlib
import os
import sys
from pathlib import Path

import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))


@pytest.fixture()
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("BS_DATABASE_URL", f"sqlite:///{tmp_path}/billing.db")
    monkeypatch.setenv("BS_SECRET_KEY", "test-secret-with-at-least-32-characters")
    monkeypatch.setenv("BS_DISABLE_SETTLEMENT_LOOP", "1")

    for name in [
        "config",
        "models",
        "database",
        "auth",
        "billing",
        "signing",
        "payment_xunhu",
        "account_center",
        "app",
    ]:
        sys.modules.pop(name, None)

    app_module = importlib.import_module("app")
    database = importlib.import_module("database")
    database.init_db()
    return app_module.create_app()


@pytest.fixture()
def client(app):
    return app.test_client()


def register_and_login(client, email="paid@example.com", password="password123"):
    reg = client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201, reg.get_data(as_text=True)
    return reg.get_json()
