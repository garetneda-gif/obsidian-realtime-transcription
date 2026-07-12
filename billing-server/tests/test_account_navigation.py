from pathlib import Path
import unittest


SERVER_DIR = Path(__file__).resolve().parents[1]
ACCOUNT_HTML = (SERVER_DIR / "account_center.html").read_text(encoding="utf-8")
HOME_HTML = (SERVER_DIR / "static" / "index.html").read_text(encoding="utf-8")
SETTINGS_TS = (SERVER_DIR.parent / "src" / "settings.ts").read_text(encoding="utf-8")


class AccountNavigationTests(unittest.TestCase):
    def test_recharge_entries_use_topup_deep_link(self):
        self.assertIn('id="ort-recharge-link" href="/account?topup=1"', HOME_HTML)
        self.assertIn('topupFrame.src = "/account?topup=embed"', HOME_HTML)
        self.assertIn('id="ort-topup-layer" hidden', HOME_HTML)

    def test_username_entry_still_targets_personal_center(self):
        self.assertIn('accountLink.href = "/account"', HOME_HTML)

    def test_plugin_account_entry_still_targets_personal_center(self):
        self.assertIn('this.openExternalUrl(svc.getAccountCenterUrl())', SETTINGS_TS)

    def test_account_bootstrap_checks_cookie_session_before_showing_login(self):
        self.assertIn("migrateLegacySession()\n      .then(loadAccount)", ACCOUNT_HTML)
        self.assertNotIn(
            "if (localStorage.getItem(sessionKey) || localStorage.getItem(tokenKey))",
            ACCOUNT_HTML,
        )
        self.assertIn('if (queryTopup || queryEmbed) showPlans()', ACCOUNT_HTML)

    def test_embedded_topup_hides_account_background(self):
        self.assertIn('queryParams.get("topup") === "embed"', ACCOUNT_HTML)
        self.assertIn('document.documentElement.classList.add("is-topup-embed")', ACCOUNT_HTML)
        self.assertIn('body.is-topup-embed #recharge-panel', ACCOUNT_HTML)
        self.assertIn('event.data?.type === "ort-topup-close"', HOME_HTML)

    def test_pending_order_and_usage_cards_share_full_width_rule(self):
        self.assertIn(
            "body:not(.is-auth) #order-panel,\n    body:not(.is-auth) #usage-panel",
            ACCOUNT_HTML,
        )

    def test_pending_order_has_delete_action(self):
        self.assertIn('id="order-delete-btn"', ACCOUNT_HTML)
        self.assertIn('method: "DELETE"', ACCOUNT_HTML)
        self.assertIn('status("订单已删除")', ACCOUNT_HTML)

    def test_registration_shows_security_captcha(self):
        self.assertIn('id="captcha-field"', ACCOUNT_HTML)
        self.assertIn('return true;', ACCOUNT_HTML)
        self.assertIn('if (queryParams.get("auth") === "register") authMode = "register";', ACCOUNT_HTML)
        self.assertIn('login: "/api/auth/browser-login"', ACCOUNT_HTML)
        self.assertIn('/api/auth/captcha/image', ACCOUNT_HTML)
        self.assertIn('captcha_id: captchaId', ACCOUNT_HTML)
        self.assertIn('captcha_answer: captchaAnswer', ACCOUNT_HTML)

    def test_card_payment_has_no_overseas_subtitle(self):
        self.assertNotIn("主要面向海外用户", ACCOUNT_HTML)

    def test_oauth_account_can_set_plugin_password(self):
        self.assertIn('id="set-password-btn"', ACCOUNT_HTML)
        self.assertIn('id="password-panel"', ACCOUNT_HTML)
        self.assertIn('api("/api/auth/password"', ACCOUNT_HTML)

if __name__ == "__main__":
    unittest.main()
