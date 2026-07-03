import importlib
import sys

import pytest


def _reload_config(monkeypatch, **env):
    for key in [
        "BS_ENV",
        "BS_SECRET_KEY",
        "BS_PUBLIC_SERVER_URL",
        "BS_PORT",
        "TENCENT_APP_ID",
        "TENCENT_SECRET_ID",
        "TENCENT_SECRET_KEY",
        "AP_XUNHU_APPID",
        "AP_XUNHU_APPSECRET",
        "AP_XUNHU_NOTIFY_URL",
        "AP_XUNHU_QUERY_URL",
        "BS_PRECHARGE_MINUTES",
        "BS_PRICE_PER_HOUR_CENTS",
        "BS_INITIAL_BALANCE_CENTS",
        "BS_REPORT_TIMEOUT_MINUTES",
        "BS_SIGN_VALID_MINUTES",
        "BS_LOGIN_RATE_LIMIT",
    ]:
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    sys.modules.pop("config", None)
    return importlib.import_module("config")


def test_production_requires_non_default_secret(monkeypatch):
    config = _reload_config(
        monkeypatch,
        BS_ENV="production",
        BS_SECRET_KEY="change-me-in-production",
        TENCENT_APP_ID="appid",
        TENCENT_SECRET_ID="secret-id",
        TENCENT_SECRET_KEY="secret-key",
        AP_XUNHU_APPID="xunhu-appid",
        AP_XUNHU_APPSECRET="xunhu-secret",
        AP_XUNHU_NOTIFY_URL="https://billing.example.com/api/billing/callback/xunhu",
        BS_PUBLIC_SERVER_URL="https://billing.example.com",
    )

    with pytest.raises(config.ConfigError) as exc:
        config.validate_config()
    assert "BS_SECRET_KEY" in str(exc.value)


def test_development_config_does_not_fail_fast(monkeypatch):
    config = _reload_config(
        monkeypatch,
        BS_ENV="development",
        BS_SECRET_KEY="change-me-in-production",
        BS_PORT="not-a-number",
        BS_PRECHARGE_MINUTES="-1",
    )

    config.validate_config()
    assert config.PORT == 8900


def test_production_requires_public_server_url(monkeypatch):
    config = _reload_config(
        monkeypatch,
        BS_ENV="production",
        BS_SECRET_KEY="production-secret-with-at-least-32-chars",
        TENCENT_APP_ID="appid",
        TENCENT_SECRET_ID="secret-id",
        TENCENT_SECRET_KEY="secret-key",
        AP_XUNHU_APPID="xunhu-appid",
        AP_XUNHU_APPSECRET="xunhu-secret",
        AP_XUNHU_NOTIFY_URL="https://billing.example.com/api/billing/callback/xunhu",
    )

    with pytest.raises(config.ConfigError) as exc:
        config.validate_config()
    assert "BS_PUBLIC_SERVER_URL" in str(exc.value)


def test_production_rejects_http_public_server_url(monkeypatch):
    config = _reload_config(
        monkeypatch,
        BS_ENV="production",
        BS_SECRET_KEY="production-secret-with-at-least-32-chars",
        TENCENT_APP_ID="appid",
        TENCENT_SECRET_ID="secret-id",
        TENCENT_SECRET_KEY="secret-key",
        AP_XUNHU_APPID="xunhu-appid",
        AP_XUNHU_APPSECRET="xunhu-secret",
        AP_XUNHU_NOTIFY_URL="https://billing.example.com/api/billing/callback/xunhu",
        BS_PUBLIC_SERVER_URL="http://billing.example.com",
    )

    with pytest.raises(config.ConfigError) as exc:
        config.validate_config()
    assert "BS_PUBLIC_SERVER_URL must use https" in str(exc.value)


def test_health_and_readyz_return_ok(client):
    health = client.get("/healthz")
    assert health.status_code == 200
    assert health.get_json()["status"] == "ok"

    ready = client.get("/readyz")
    assert ready.status_code == 200
    assert ready.get_json()["database"] == "ok"
