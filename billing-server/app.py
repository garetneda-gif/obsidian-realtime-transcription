"""Billing Server 主应用"""
import threading
import time

from flask import Flask
from flask_cors import CORS

import config
from database import init_db
from auth import auth_bp
from signing import signing_bp
from billing import billing_bp, settle_expired_requests
from payment_xunhu import payment_bp


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app, origins=["app://obsidian.md"])  # Obsidian 桌面端的 origin

    app.register_blueprint(auth_bp)
    app.register_blueprint(signing_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(payment_bp)

    @app.route("/health")
    def health():
        return {"status": "ok"}, 200

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
    init_db()
    print(f"[BillingServer] Starting on {config.HOST}:{config.PORT}")

    # 启动结算后台线程
    t = threading.Thread(target=_settlement_loop, daemon=True)
    t.start()

    app = create_app()
    app.run(host=config.HOST, port=config.PORT, debug=False)


if __name__ == "__main__":
    main()
