from pathlib import Path
import unittest


PUBLIC_HOME_HTML = (
    Path(__file__).resolve().parents[2] / "public" / "index.html"
).read_text(encoding="utf-8")


class LandingHeaderAccountTests(unittest.TestCase):
    def test_logged_in_account_replaces_login_with_username(self):
        self.assertIn('id="ort-account-label"', PUBLIC_HOME_HTML)
        self.assertIn(
            'accountLabel.textContent = email.split("@", 1)[0] || email',
            PUBLIC_HOME_HTML,
        )
        self.assertIn('accountLink.href = "/account"', PUBLIC_HOME_HTML)


if __name__ == "__main__":
    unittest.main()
