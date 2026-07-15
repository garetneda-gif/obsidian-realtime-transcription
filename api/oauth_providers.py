# pyright: reportMissingImports=false
from http.server import BaseHTTPRequestHandler
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
BILLING_SERVER = ROOT / "billing-server"
sys.path.insert(0, str(BILLING_SERVER))

import config  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        providers = []
        if config.GOOGLE_CLIENT_ID and config.GOOGLE_CLIENT_SECRET:
            providers.append("google")
        if config.GITHUB_CLIENT_ID and config.GITHUB_CLIENT_SECRET:
            providers.append("github")
        body = json.dumps({"providers": providers}, separators=(",", ":")).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=300, s-maxage=86400")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
