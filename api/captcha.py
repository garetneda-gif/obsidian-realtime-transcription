# pyright: reportMissingImports=false
from http.server import BaseHTTPRequestHandler
import json
from pathlib import Path
import sys
import threading
import time


ROOT = Path(__file__).resolve().parents[1]
BILLING_SERVER = ROOT / "billing-server"
sys.path.insert(0, str(BILLING_SERVER))

import config  # noqa: E402
from captcha_token import generate_stateless_image_captcha  # noqa: E402


_rate_lock = threading.Lock()
_rate_counts: dict[tuple[str, int], int] = {}


def _allow_request(client_ip: str) -> bool:
    window = int(time.time()) // 60
    key = (client_ip, window)
    with _rate_lock:
        for stale_key in [item for item in _rate_counts if item[1] < window]:
            del _rate_counts[stale_key]
        count = _rate_counts.get(key, 0)
        if count >= config.CAPTCHA_RATE_LIMIT_PER_MINUTE:
            return False
        _rate_counts[key] = count + 1
        return True


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        forwarded = self.headers.get("x-vercel-forwarded-for") or self.headers.get("x-forwarded-for")
        client_ip = (forwarded or self.client_address[0] or "unknown").split(",", 1)[0].strip()[:64]
        if not _allow_request(client_ip):
            self._send_json(429, {"error": "Too many captcha requests, try again later"})
            return
        self._send_json(200, generate_stateless_image_captcha())

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Allow", "POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
