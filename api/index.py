# pyright: reportMissingImports=false
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
BILLING_SERVER = ROOT / "billing-server"
sys.path.insert(0, str(BILLING_SERVER))

from app import create_app  # noqa: E402
from database import init_db  # noqa: E402


init_db()
app = create_app()
