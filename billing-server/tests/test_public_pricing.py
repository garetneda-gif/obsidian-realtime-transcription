from pathlib import Path
import sys
import unittest
from unittest.mock import patch

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))

from app import create_app
from billing import PLANS
import public_pricing


class PublicPricingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = create_app().test_client()

    def test_pricing_is_public_and_lists_every_usd_package(self):
        response = self.client.get("/pricing", headers={"Accept-Language": "zh-CN"})

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        for plan in PLANS:
            self.assertIn(str(plan["amount_usd"]), html)
            self.assertIn(str(plan["minutes"]), html)
        self.assertNotIn('type="password"', html)
        self.assertIn("/account?topup=1", html)
        self.assertIn("查看购买方式", html)
        self.assertNotIn("登录并购买", html)
        self.assertIn("余额不会过期", html)
        self.assertIn("海外云端线路", html)
        self.assertIn("适用税费", html)
        self.assertIn("/terms", html)
        self.assertIn("/privacy", html)
        self.assertIn("/contact", html)

        for legal_path in ("/terms", "/privacy", "/contact"):
            with self.subTest(legal_path=legal_path):
                self.assertEqual(self.client.get(legal_path).status_code, 200)

    def test_english_copy_is_available_by_query_parameter(self):
        response = self.client.get("/pricing?lang=en-US")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("Buy hosted transcription minutes as needed", html)
        self.assertIn("No subscription", html)
        self.assertIn("does not expire", html)
        self.assertIn("overseas hosted route", html)
        self.assertIn("Applicable tax", html)
        self.assertIn("View purchase options", html)
        self.assertNotIn("Sign in to purchase", html)
        self.assertIn("https://transcribe.songrong.org/pricing?lang=en-US", html)

    def test_pricing_follows_plan_source_and_handles_new_plan_ids(self):
        custom_plan = {
            "id": "custom",
            "name": "Custom package",
            "amount_yuan": "88.00",
            "amount_usd": "12.34",
            "minutes": 456,
        }

        with patch.object(public_pricing, "PLANS", [custom_plan]):
            response = self.client.get("/pricing?lang=en-US")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("Custom package", html)
        self.assertIn("12.34", html)
        self.assertIn("456", html)
        self.assertIn("A pay-as-you-go hosted transcription package", html)


if __name__ == "__main__":
    unittest.main()
