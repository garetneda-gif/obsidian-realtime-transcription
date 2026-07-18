from __future__ import annotations

from flask import render_template_string, request

from billing import PLANS


SITE_URL = "https://transcribe.songrong.org"

COPY = {
    "zh-CN": {
        "page_title": "定价 - RealTime Transcriber",
        "eyebrow": "简单、透明的一次性充值",
        "title": "按需购买云端转写时长",
        "subtitle": "无需订阅。余额不会过期，可在 Obsidian 插件内用于托管云端转写。",
        "minutes": "分钟云端转写",
        "one_time": "一次性付款",
        "card": "银行卡 / 国际支付",
        "wechat": "登录后也可使用微信支付 ¥{amount}",
        "buy": "查看购买方式",
        "tax": "页面价格为套餐价格；适用税费和最终付款总额以安全收银台显示为准。",
        "scope": "跨境银行卡购买的余额用于海外云端线路；微信购买的余额用于国内线路。余额不可提现或转让。",
        "trial": "适合短会和首次体验",
        "standard": "适合日常课程与会议",
        "pro": "适合高频、长时间转写",
        "plan_names": {"trial": "体验包", "standard": "常用包", "pro": "高频包"},
        "default_plan_desc": "按需购买的云端转写套餐",
        "popular": "最常用",
        "disclaimer": "RealTime Transcriber 是独立社区插件，与 Obsidian 无隶属、认可或官方合作关系。",
        "nav": {"home": "首页", "terms": "使用协议", "privacy": "隐私政策", "contact": "联系支持"},
    },
    "en-US": {
        "page_title": "Pricing - RealTime Transcriber",
        "eyebrow": "Simple one-time top-ups",
        "title": "Buy hosted transcription minutes as needed",
        "subtitle": "No subscription. Your balance does not expire and can be used for hosted transcription in the Obsidian plugin.",
        "minutes": "hosted transcription minutes",
        "one_time": "one-time payment",
        "card": "Card / international payment",
        "wechat": "WeChat Pay is also available after sign-in: ¥{amount}",
        "buy": "View purchase options",
        "tax": "Listed amounts are package prices. Applicable tax and the final total are shown at secure checkout.",
        "scope": "Card purchases fund the overseas hosted route; WeChat purchases fund the mainland route. Balance cannot be withdrawn or transferred.",
        "trial": "For short meetings and trying the service",
        "standard": "For regular classes and meetings",
        "pro": "For frequent, long-form transcription",
        "plan_names": {"trial": "Starter", "standard": "Standard", "pro": "Pro"},
        "default_plan_desc": "A pay-as-you-go hosted transcription package",
        "popular": "Most popular",
        "disclaimer": "RealTime Transcriber is an independent community plugin and is not affiliated with or endorsed by Obsidian.",
        "nav": {"home": "Home", "terms": "Terms", "privacy": "Privacy", "contact": "Support"},
    },
}


PRICING_TEMPLATE = """<!doctype html>
<html lang="{{ html_lang }}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ copy.page_title }}</title>
  <meta name="description" content="{{ copy.subtitle }}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="{{ canonical_url }}">
  <link rel="icon" type="image/png" sizes="256x256" href="/static/imgs/zhuanwenzi2026/brand-recording-icon.png?v=20260712-1">
  <style>
    * { box-sizing: border-box; }
    :root { --blue: #246bfe; --ink: #121826; --muted: #667085; --line: #dce5f3; --soft: #f4f7fc; }
    html { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif; color: var(--ink); background: #fff; }
    body { margin: 0; min-height: 100vh; line-height: 1.6; }
    a { color: inherit; }
    .topbar { min-height: 72px; border-bottom: 1px solid var(--line); background: #fff; }
    .topbar-inner { width: min(1120px, calc(100% - 32px)); min-height: 72px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); font-size: 16px; font-weight: 750; text-decoration: none; }
    .brand img { width: 22px; height: 22px; }
    .nav { display: flex; align-items: center; gap: 20px; color: var(--muted); font-size: 14px; }
    .nav a { text-decoration: none; }
    .nav a:hover { color: var(--blue); }
    .lang { display: inline-flex; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
    .lang a { min-width: 42px; padding: 5px 9px; text-align: center; }
    .lang a.active { color: #fff; background: var(--blue); }
    .hero { width: min(940px, calc(100% - 32px)); margin: 0 auto; padding: 82px 0 46px; text-align: center; }
    .eyebrow { display: block; margin-bottom: 14px; color: var(--blue); font-size: 13px; font-weight: 760; letter-spacing: .04em; text-transform: uppercase; }
    h1 { max-width: 850px; margin: 0 auto 18px; font-size: clamp(38px, 6vw, 64px); line-height: 1.08; font-weight: 770; }
    .subtitle { max-width: 700px; margin: 0 auto; color: var(--muted); font-size: 18px; }
    main { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding-bottom: 92px; }
    .plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: stretch; }
    .plan { position: relative; display: flex; flex-direction: column; min-height: 430px; padding: 30px; border: 1px solid var(--line); border-radius: 18px; background: #fff; box-shadow: 0 16px 40px rgba(26, 50, 90, .07); }
    .plan.popular { border: 2px solid var(--blue); padding: 29px; }
    .badge { position: absolute; top: 18px; right: 18px; padding: 4px 9px; border-radius: 999px; color: #fff; background: var(--blue); font-size: 12px; font-weight: 700; }
    .plan h2 { margin: 0 0 8px; font-size: 22px; }
    .plan-desc { min-height: 50px; margin: 0 0 26px; color: var(--muted); font-size: 14px; }
    .price { display: flex; align-items: flex-start; gap: 3px; margin-bottom: 2px; }
    .currency { padding-top: 8px; font-size: 22px; font-weight: 720; }
    .amount { font-size: 52px; line-height: 1; font-weight: 780; letter-spacing: -.04em; }
    .one-time { margin-bottom: 24px; color: var(--muted); font-size: 13px; }
    .minutes { margin: 0 0 9px; font-size: 17px; font-weight: 720; }
    .payment { margin: 0 0 6px; color: #344054; font-size: 14px; }
    .wechat { margin: 0 0 24px; color: var(--muted); font-size: 13px; }
    .button { display: inline-flex; min-height: 48px; align-items: center; justify-content: center; margin-top: auto; padding: 0 18px; border-radius: 9px; color: #fff; background: var(--blue); font-weight: 730; text-decoration: none; }
    .notes { max-width: 860px; margin: 38px auto 0; padding: 24px 28px; border-radius: 14px; background: var(--soft); color: #475467; font-size: 14px; }
    .notes p { margin: 0 0 8px; }
    .notes p:last-child { margin-bottom: 0; }
    footer { padding: 28px 0 44px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
    .footer-inner { width: min(1120px, calc(100% - 32px)); margin: 0 auto; display: flex; justify-content: space-between; gap: 18px; }
    .footer-links { display: flex; flex-wrap: wrap; gap: 16px; }
    @media (max-width: 840px) { .plans { grid-template-columns: 1fr; } .plan { min-height: 390px; } }
    @media (max-width: 680px) {
      .topbar-inner { flex-wrap: wrap; padding: 12px 0; }
      .brand span { display: none; }
      .nav { gap: 11px; font-size: 13px; }
      .hero { padding-top: 58px; }
      .footer-inner { flex-direction: column; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/{{ lang_query }}">
        <img src="/static/imgs/zhuanwenzi2026/brand-recording-icon.png?v=20260712-1" alt="">
        <span>RealTime Transcriber</span>
      </a>
      <nav class="nav" aria-label="Primary navigation">
        <a href="/{{ lang_query }}">{{ copy.nav.home }}</a>
        <a href="/terms{{ lang_suffix }}">{{ copy.nav.terms }}</a>
        <a href="/privacy{{ lang_suffix }}">{{ copy.nav.privacy }}</a>
        <a href="/contact{{ lang_suffix }}">{{ copy.nav.contact }}</a>
        <span class="lang" aria-label="Language">
          <a href="/pricing" class="{% if lang == 'zh-CN' %}active{% endif %}">中</a>
          <a href="/pricing?lang=en-US" class="{% if lang == 'en-US' %}active{% endif %}">EN</a>
        </span>
      </nav>
    </div>
  </header>
  <header class="hero">
    <span class="eyebrow">{{ copy.eyebrow }}</span>
    <h1>{{ copy.title }}</h1>
    <p class="subtitle">{{ copy.subtitle }}</p>
  </header>
  <main>
    <section class="plans" aria-label="Pricing plans">
      {% for plan in plans %}
        <article class="plan{% if plan.id == 'standard' %} popular{% endif %}">
          {% if plan.id == 'standard' %}<span class="badge">{{ copy.popular }}</span>{% endif %}
          <h2>{{ plan.display_name }}</h2>
          <p class="plan-desc">{{ plan.description }}</p>
          <div class="price"><span class="currency">$</span><span class="amount">{{ plan.amount_usd }}</span></div>
          <div class="one-time">USD · {{ copy.one_time }}</div>
          <p class="minutes">{{ plan.minutes }} {{ copy.minutes }}</p>
          <p class="payment">{{ copy.card }}</p>
          <p class="wechat">{{ copy.wechat.format(amount=plan.amount_yuan) }}</p>
          <a class="button" href="/account?topup=1">{{ copy.buy }}</a>
        </article>
      {% endfor %}
    </section>
    <section class="notes" aria-label="Pricing notes">
      <p>{{ copy.tax }}</p>
      <p>{{ copy.scope }}</p>
    </section>
  </main>
  <footer>
    <div class="footer-inner">
      <span>© 2026 RealTime Transcriber · {{ copy.disclaimer }}</span>
      <div class="footer-links">
        <a href="/terms{{ lang_suffix }}">{{ copy.nav.terms }}</a>
        <a href="/privacy{{ lang_suffix }}">{{ copy.nav.privacy }}</a>
        <a href="/contact{{ lang_suffix }}">{{ copy.nav.contact }}</a>
      </div>
    </div>
  </footer>
</body>
</html>"""


def _language() -> str:
    requested = request.args.get("lang", "").strip().lower()
    if requested in {"en", "en-us"}:
        return "en-US"
    if requested in {"zh", "zh-cn", "zh-tw"}:
        return "zh-CN"
    return "en-US" if request.accept_languages.best_match(["en", "zh"]) == "en" else "zh-CN"


def public_pricing_page() -> str:
    language = _language()
    copy = COPY[language]
    lang_suffix = "?lang=en-US" if language == "en-US" else ""
    plans = [
        {
            "id": str(plan["id"]),
            "display_name": copy["plan_names"].get(str(plan["id"]), str(plan["name"])),
            "description": copy.get(str(plan["id"]), copy["default_plan_desc"]),
            "amount_yuan": str(plan["amount_yuan"]),
            "amount_usd": str(plan["amount_usd"]),
            "minutes": int(plan["minutes"]),
        }
        for plan in PLANS
    ]
    return render_template_string(
        PRICING_TEMPLATE,
        canonical_url=f"{SITE_URL}/pricing{lang_suffix}",
        copy=copy,
        html_lang=language,
        lang=language,
        lang_query=lang_suffix,
        lang_suffix=lang_suffix,
        plans=plans,
    )


__all__ = ["public_pricing_page"]
