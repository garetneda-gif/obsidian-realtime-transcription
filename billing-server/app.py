"""Billing Server 主应用"""
# pyright: reportImplicitRelativeImport=false, reportMissingImports=false, reportMissingModuleSource=false
import os
import threading
import time
from pathlib import Path

from flask import Flask, abort, send_from_directory
from flask_cors import CORS

import config
from database import init_db
from auth import auth_bp
from oauth import oauth_bp
from signing import signing_bp
from billing import billing_bp, settle_expired_requests
from payment_xunhu import payment_bp
from payment_creem import creem_bp
from account_center import account_bp
from legal_pages import legal_bp
from public_pricing import public_pricing_page

STATIC_DIR = Path(__file__).with_name("static")
STATIC_FILES = {
    "favicon.ico",
}
ASSET_ROOTS = {
    "bat.bing.com",
    "idatalogconf.iflysec.com",
    "logconf.iflytek.com",
    "static.iflyrec.com",
    "xfkfapi.iflytek.com",
}


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    CORS(app, origins=["app://obsidian.md"])  # Obsidian 桌面端的 origin

    app.register_blueprint(auth_bp)
    app.register_blueprint(oauth_bp)
    app.register_blueprint(signing_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(payment_bp)
    app.register_blueprint(creem_bp)
    app.register_blueprint(account_bp)
    app.register_blueprint(legal_bp)

    @app.route("/health")
    def health():
        return {
            "status": "ok",
            "revision": os.getenv("VERCEL_GIT_COMMIT_SHA", "local")[:12],
        }, 200

    @app.route("/")
    @app.route("/en")
    def landing_page():
        return send_from_directory(STATIC_DIR, "index.html")

    @app.route("/pricing")
    def pricing_page():
        return public_pricing_page()

    @app.route("/static/<path:filename>")
    def cloned_static_asset(filename: str):
        return send_from_directory(STATIC_DIR / "static", filename)

    @app.route("/<path:filename>")
    def landing_asset(filename: str):
        if filename not in STATIC_FILES:
            abort(404)
        return send_from_directory(STATIC_DIR, filename)

    @app.route("/iflyrec/<path:filename>")
    def iflyrec_asset(filename: str):
        return send_from_directory(STATIC_DIR / "iflyrec", filename)

    @app.route("/<asset_root>/<path:filename>")
    def cloned_remote_asset(asset_root: str, filename: str):
        if asset_root not in ASSET_ROOTS:
            abort(404)
        return send_from_directory(STATIC_DIR / asset_root, filename)

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
