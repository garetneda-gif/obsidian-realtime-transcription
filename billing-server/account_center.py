from pathlib import Path

from flask import Blueprint, send_file


account_bp = Blueprint("account_center", __name__)
ACCOUNT_CENTER_PATH = Path(__file__).with_name("account_center.html")


@account_bp.route("/")
@account_bp.route("/account")
def account_center():
    return send_file(ACCOUNT_CENTER_PATH)
