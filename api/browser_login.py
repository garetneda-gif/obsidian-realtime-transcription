# pyright: reportMissingImports=false
from pathlib import Path
import sys

from flask import Flask


ROOT = Path(__file__).resolve().parents[1]
BILLING_SERVER = ROOT / "billing-server"
sys.path.insert(0, str(BILLING_SERVER))

from auth import _password_login  # noqa: E402


app = Flask(__name__, static_folder=None)


@app.post("/api/browser_login")
@app.post("/api/auth/browser-login")
def browser_login():
    return _password_login()
