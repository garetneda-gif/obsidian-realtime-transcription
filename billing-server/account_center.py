from pathlib import Path

from flask import Blueprint, send_file


account_bp = Blueprint("account_center", __name__)
ACCOUNT_CENTER_PATH = Path(__file__).with_name("account_center.html")
ACCOUNT_CENTER_VERSION = "payment-navigation-20260711"


@account_bp.route("/account")
def account_center():
    response = send_file(ACCOUNT_CENTER_PATH)
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["X-Account-Center-Version"] = ACCOUNT_CENTER_VERSION
    return response
