from pathlib import Path
import unittest


SERVER_DIR = Path(__file__).resolve().parents[1]
ACCOUNT_HTML = (SERVER_DIR / "account_center.html").read_text(encoding="utf-8")
HOME_HTML = (SERVER_DIR / "static" / "index.html").read_text(encoding="utf-8")
PUBLIC_HOME_HTML = (SERVER_DIR.parent / "public" / "index.html").read_text(encoding="utf-8")
SETTINGS_TS = (SERVER_DIR.parent / "src" / "settings.ts").read_text(encoding="utf-8")


class AccountNavigationTests(unittest.TestCase):
    def test_recharge_entries_use_topup_deep_link(self):
        self.assertIn('id="ort-recharge-link" href="/account?topup=1"', HOME_HTML)
        self.assertIn('topupFrame.src = "/account?topup=embed"', HOME_HTML)
        self.assertIn('id="ort-topup-layer" hidden', HOME_HTML)

    def test_public_landing_keeps_repository_and_group_footer(self):
        for html in (HOME_HTML, PUBLIC_HOME_HTML):
            self.assertIn("https://github.com/garetneda-gif/obsidian-realtime-transcription", html)
            self.assertIn("footer-qr-qq.png", html)
            self.assertIn("footer-qr-discord.png", html)
            self.assertIn('class="ort-footer__inner"', html)
        public_assets = SERVER_DIR.parent / "public" / "static" / "imgs" / "zhuanwenzi2026"
        self.assertTrue((public_assets / "footer-qr-qq.png").is_file())
        self.assertTrue((public_assets / "footer-qr-discord.png").is_file())

    def test_landing_pages_keep_full_language_switcher(self):
        for html in (HOME_HTML, PUBLIC_HOME_HTML):
            self.assertIn('class="ort-language J-language-switcher"', html)
            self.assertIn('data-lang="zh-CN"', html)
            self.assertIn('data-lang="en-US"', html)
            self.assertIn('data-zwz-text="heroTitle"', html)
            self.assertIn('/static/js/i18n/language-switcher.js', html)
        language_script = SERVER_DIR / "static" / "static" / "js" / "i18n" / "language-switcher.js"
        script = language_script.read_text(encoding="utf-8")
        self.assertIn("Every conversation<br>recorded, transcribed, refined", script)
        self.assertIn("recharge: 'Top up'", script)

    def test_landing_pages_use_the_waveform_brand_icon(self):
        icon_path = "/static/imgs/zhuanwenzi2026/brand-recording-icon.png?v=20260712-1"
        for html in (HOME_HTML, PUBLIC_HOME_HTML):
            self.assertIn(f'rel="icon" type="image/png" sizes="256x256" href="{icon_path}"', html)
            self.assertIn(f'<img src="{icon_path}" alt="">', html)
            self.assertNotIn("brand-recording-icon.svg", html)

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

    def test_captcha_placeholder_cannot_be_submitted_as_a_real_challenge(self):
        self.assertNotIn(">R7K4</text>", ACCOUNT_HTML)
        self.assertIn('let captchaLoading = true;', ACCOUNT_HTML)
        self.assertIn('$("captcha-answer").disabled = !captchaReady;', ACCOUNT_HTML)
        self.assertIn('$("auth-submit-btn").disabled = authNeedsCaptcha() && !captchaReady;', ACCOUNT_HTML)
        self.assertIn('图形验证码正在加载，请稍候', ACCOUNT_HTML)

    def test_card_payment_has_no_overseas_subtitle(self):
        self.assertNotIn("主要面向海外用户", ACCOUNT_HTML)

    def test_oauth_account_can_set_plugin_password(self):
        self.assertIn('id="set-password-btn"', ACCOUNT_HTML)
        self.assertIn('id="password-panel"', ACCOUNT_HTML)
        self.assertIn('api("/api/auth/password"', ACCOUNT_HTML)

if __name__ == "__main__":
    unittest.main()
