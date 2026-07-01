"""Billing Server 主应用"""
import threading
import time

from flask import Flask
from sqlalchemy import text
from flask_cors import CORS

import config
from database import SessionLocal, init_db
from auth import auth_bp
from signing import signing_bp
from billing import billing_bp, settle_expired_requests
from payment_xunhu import payment_bp


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app, origins=config.CORS_ORIGINS)

    app.register_blueprint(auth_bp)
    app.register_blueprint(signing_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(payment_bp)

    @app.route("/health")
    @app.route("/healthz")
    def health():
        return {"status": "ok"}, 200

    @app.route("/readyz")
    def ready():
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            return {"status": "ready", "database": "ok"}, 200
        except Exception as e:
            return {"status": "not_ready", "database": "error", "error": str(e)}, 503
        finally:
            db.close()

    return app


def _settlement_loop():
    """后台线程：定期结算超时的签名请求"""
    while True:
        try:
            count = settle_expired_requests()
            if count:
                print(f"[Settlement] Settled {count} expired sign requests")
        except Exception as e:
            print(f"[Settlement] Error: {e}")
        time.sleep(60)


def main():
    config.validate_config()
    init_db()
    print(f"[BillingServer] Starting on {config.HOST}:{config.PORT}")

    if not config.DISABLE_SETTLEMENT_LOOP:
        t = threading.Thread(target=_settlement_loop, daemon=True)
        t.start()

    app = create_app()
    app.run(host=config.HOST, port=config.PORT, debug=False)


if __name__ == "__main__":
    main()
