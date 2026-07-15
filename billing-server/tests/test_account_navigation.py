from pathlib import Path
import re
import json
import unittest


SERVER_DIR = Path(__file__).resolve().parents[1]
ACCOUNT_HTML = (SERVER_DIR / "account_center.html").read_text(encoding="utf-8")
HOME_HTML = (SERVER_DIR / "static" / "index.html").read_text(encoding="utf-8")
PUBLIC_HOME_HTML = (SERVER_DIR.parent / "public" / "index.html").read_text(encoding="utf-8")
SETTINGS_TS = (SERVER_DIR.parent / "src" / "settings.ts").read_text(encoding="utf-8")
ACCOUNT_ROUTE_PY = (SERVER_DIR / "account_center.py").read_text(encoding="utf-8")
VERCEL_CONFIG = json.loads((SERVER_DIR.parent / "vercel.json").read_text(encoding="utf-8"))


class AccountNavigationTests(unittest.TestCase):
    def test_landing_login_opens_auth_immediately_from_an_edge_cached_shell(self):
        for html in (HOME_HTML, PUBLIC_HOME_HTML):
            self.assertIn('href="/account?auth=login"', html)
            self.assertIn('rel="prefetch" href="/account?auth=login"', html)
        self.assertIn('if (queryAuth === "login" || queryAuth === "register")', ACCOUNT_HTML)
        self.assertIn('showLogin("");', ACCOUNT_HTML)
        self.assertIn("s-maxage=86400", ACCOUNT_ROUTE_PY)

    def test_login_background_uses_optimized_webp(self):
        asset = "imgs/zhuanwenzi2026/login-bg-light-gptimage2.webp"
        self.assertIn(f'url("static/{asset}")', ACCOUNT_HTML)
        self.assertNotIn("login-bg-light-gptimage2.png", ACCOUNT_HTML)
        for static_root in (SERVER_DIR / "static", SERVER_DIR.parent / "public" / "static"):
            image = static_root / asset
            self.assertTrue(image.is_file())
            self.assertLess(image.stat().st_size, 100_000)

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

    def test_public_landing_serves_every_local_asset_from_the_static_edge(self):
        public_root = SERVER_DIR.parent / "public"
        asset_urls = set(re.findall(r'(?:src|href)="(/static/[^"?]+)', PUBLIC_HOME_HTML))
        for asset_url in asset_urls:
            self.assertTrue((public_root / asset_url.removeprefix("/")).is_file(), asset_url)

        stylesheet = public_root / "static" / "css" / "newHomepage.css"
        css = stylesheet.read_text(encoding="utf-8")
        for relative_url in re.findall(r'url\(["\']?([^"\')?]+)', css):
            if relative_url.startswith("data:"):
                continue
            asset_path = (stylesheet.parent / relative_url.split("?", 1)[0]).resolve()
            self.assertTrue(asset_path.is_file(), relative_url)

    def test_below_fold_landing_images_are_lazy_loaded(self):
        lazy_assets = (
            "thinking-record-card-v2@2x.webp",
            "thinking-insight-card@2x.png",
            "thinking-asset-card-brand@2x.png",
            "tool-visual-multilang@2x.png",
            "tool-visual-ask-claudian@2x.png",
            "tool-visual-realtime-obsidian@2x.png",
            "tool-visual-summary-ai@2x.png",
            "footer-qr-qq.png",
            "footer-qr-discord.png",
        )
        for html in (HOME_HTML, PUBLIC_HOME_HTML):
            for asset in lazy_assets:
                tag = next(line for line in html.splitlines() if asset in line)
                self.assertIn('loading="lazy"', tag, asset)
                self.assertIn('decoding="async"', tag, asset)
            self.assertIn('fetchpriority="high"', html)

    def test_username_entry_still_targets_personal_center(self):
        self.assertIn('accountLink.href = "/account"', HOME_HTML)

    def test_plugin_account_entry_still_targets_personal_center(self):
        self.assertIn('this.openExternalUrl(svc.getAccountCenterUrl())', SETTINGS_TS)

    def test_account_bootstrap_checks_cookie_session_before_showing_login(self):
        self.assertIn("migrateLegacySession()\n        .then(loadAccount)", ACCOUNT_HTML)
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
        self.assertIn('if (queryAuth === "register") authMode = "register";', ACCOUNT_HTML)
        self.assertIn('login: "/api/auth/browser-login"', ACCOUNT_HTML)
        self.assertIn('/api/auth/captcha/image', ACCOUNT_HTML)
        self.assertIn('captcha_id: captchaId', ACCOUNT_HTML)
        self.assertIn('captcha_answer: captchaAnswer', ACCOUNT_HTML)

    def test_login_dependencies_use_lightweight_functions(self):
        rewrites = {
            rewrite["source"]: rewrite["destination"]
            for rewrite in VERCEL_CONFIG["rewrites"]
        }
        self.assertEqual(rewrites["/api/auth/captcha/image"], "/api/captcha")
        self.assertEqual(rewrites["/api/auth/oauth/providers"], "/api/oauth_providers")
        self.assertEqual(rewrites["/api/auth/browser-login"], "/api/browser_login")

    def test_login_submit_shows_progress_and_blocks_duplicate_requests(self):
        self.assertIn('let authSubmitting = false;', ACCOUNT_HTML)
        self.assertIn('? (isRegister ? "注册中..." : "登录中...")', ACCOUNT_HTML)
        self.assertIn('if (authSubmitting) return;', ACCOUNT_HTML)
        self.assertIn('status(authMode === "register" ? "正在注册..." : "正在登录...")', ACCOUNT_HTML)

    def test_captcha_placeholder_cannot_be_submitted_as_a_real_challenge(self):
        self.assertNotIn(">R7K4</text>", ACCOUNT_HTML)
        self.assertIn('let captchaLoading = true;', ACCOUNT_HTML)
        self.assertIn('$("captcha-answer").disabled = !captchaReady;', ACCOUNT_HTML)
        self.assertIn(
            '$("auth-submit-btn").disabled = authSubmitting || (authNeedsCaptcha() && !captchaReady);',
            ACCOUNT_HTML,
        )
        self.assertIn('图形验证码正在加载，请稍候', ACCOUNT_HTML)

    def test_topup_packages_and_balances_are_region_scoped(self):
        self.assertNotIn("主要面向海外用户", ACCOUNT_HTML)
        self.assertIn('id="domestic-balance"', ACCOUNT_HTML)
        self.assertIn('id="overseas-balance"', ACCOUNT_HTML)
        self.assertIn('data-provider="wechat" type="button">境内套餐</button>', ACCOUNT_HTML)
        self.assertIn('data-provider="card" type="button">境外套餐</button>', ACCOUNT_HTML)
        self.assertNotIn("境内套餐 · 微信支付", ACCOUNT_HTML)
        self.assertNotIn("境外套餐 · 银行卡", ACCOUNT_HTML)
        self.assertIn("境内额度仅限中国大陆网络使用", ACCOUNT_HTML)
        self.assertIn("境外额度仅限中国大陆以外网络使用", ACCOUNT_HTML)

    def test_account_can_change_email_and_password(self):
        self.assertIn('id="change-email-btn"', ACCOUNT_HTML)
        self.assertIn('id="email-panel"', ACCOUNT_HTML)
        self.assertIn('api("/api/auth/email"', ACCOUNT_HTML)
        self.assertIn('current_password: currentPassword', ACCOUNT_HTML)
        self.assertIn('id="set-password-btn"', ACCOUNT_HTML)
        self.assertIn('id="password-panel"', ACCOUNT_HTML)
        self.assertIn('api("/api/auth/password"', ACCOUNT_HTML)

    def test_account_dashboard_uses_existing_usage_records(self):
        self.assertIn('id="trend-chart"', ACCOUNT_HTML)
        self.assertIn('id="route-donut"', ACCOUNT_HTML)
        self.assertIn('renderDashboard(records)', ACCOUNT_HTML)
        self.assertIn('record.provider === "deepgram"', ACCOUNT_HTML)
        self.assertNotIn("腾讯云", ACCOUNT_HTML)

if __name__ == "__main__":
    unittest.main()
