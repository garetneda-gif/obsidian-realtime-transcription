from __future__ import annotations

from flask import Blueprint, render_template_string, request


SUPPORT_EMAIL = "support@songrong.org"
SITE_URL = "https://transcribe.songrong.org"


PAGE_COPY = {
    "zh-CN": {
        "terms": {
            "title": "使用协议",
            "subtitle": "使用 Obsidian RealTime Transcriber 前，请阅读并理解以下条款。",
            "page_title": "使用协议 - Obsidian RealTime Transcriber",
            "updated": "生效日期：2026 年 7 月 18 日",
            "sections": [
                ("服务说明", [
                    "Obsidian RealTime Transcriber 提供本地与托管云端语音转写功能，并可将转写结果整理到 Obsidian 中。",
                    "我们可根据设备、地区、可用性和服务质量分配合适的云端处理线路，不保证所有功能在所有地区永久可用。",
                ]),
                ("账户与安全", [
                    "您应提供真实、有效的账户信息，并妥善保管登录凭据。您需对账户下的活动负责。",
                    "如发现未授权使用、安全事件或信息错误，请立即通过支持邮箱联系我们。",
                ]),
                ("充值、余额与计费", [
                    "云端转写采用预付余额，按页面公示的实际云端转写时长和费率扣费。余额不代表银行存款，不可转让、交易或提现。",
                    "不同地区套餐可能只能用于指定线路。最终价格、税费和支付币种以收银台显示为准。",
                    "支付可由授权的记录商户和支付服务商处理，我们不直接存储完整银行卡号。",
                ]),
                ("退款与订单问题", [
                    "如遇到重复扣款、未到账或其他订单问题，请附上订单号联系我们。",
                    "已使用的云端转写额度通常不可退款；未使用部分将依适用法律、支付商政策及订单情况处理。",
                ]),
                ("允许使用", [
                    "您不得使用本服务侵害他人隐私、知识产权或其他合法权益，不得上传违法内容，不得绕过计费、限额或安全控制。",
                    "在录音或转写他人内容前，您应自行取得必要授权并遵守当地法律。",
                ]),
                ("内容与知识产权", [
                    "您保留对自己输入的音频、文本和生成结果依法享有的权利。您授权我们在提供、保护和改进服务所必要的范围内处理这些内容。",
                    "本网站、插件代码、品牌和界面中归属我们或合法授权方的内容，受适用的知识产权法保护。",
                ]),
                ("可用性与责任限制", [
                    "语音识别结果可能因发音、环境、网络和语言而出现错误。请在医疗、法律、金融或其他高风险场景中人工复核。",
                    "在适用法律允许的最大范围内，我们不对间接、附带、特殊或惩罚性损失负责。",
                ]),
                ("变更、终止与联系", [
                    "我们可因法律、安全或产品变化更新本协议，并在页面标注新的生效日期。继续使用表示您接受更新后的协议。",
                    f"如对本协议有疑问，请联系 {SUPPORT_EMAIL}。",
                ]),
            ],
        },
        "privacy": {
            "title": "隐私政策",
            "subtitle": "了解我们如何收集、使用和保护您的信息。",
            "page_title": "隐私政策 - Obsidian RealTime Transcriber",
            "updated": "生效日期：2026 年 7 月 18 日",
            "sections": [
                ("适用范围", [
                    "本政策适用于 Obsidian RealTime Transcriber 网站、账户与托管云端转写服务。本地转写模式的音频在您的设备上处理。",
                ]),
                ("我们收集的信息", [
                    "账户信息：邮箱、账户标识、登录方式和安全验证记录。",
                    "交易与用量信息：订单号、套餐、金额、币种、付款状态、余额、转写时长和费用记录。",
                    "技术信息：IP 地址、设备和浏览器类型、日志、错误与安全事件信息。",
                    "云端转写数据：您选择云端模式时传输的音频流和生成的转写结果。",
                ]),
                ("使用目的与法律依据", [
                    "我们用于创建和保护账户、处理支付、提供转写、计算余额、客服支持、防止欺诈及遵守法律义务。",
                    "处理依据包括履行与您的服务合同、履行法律义务、保护合法权益以及在适用时获得您的同意。",
                ]),
                ("音频和转写内容", [
                    "在托管云端模式下，音频会发送给云端处理服务以返回实时文本。我们默认不在自有服务器上持久保存原始音频。",
                    "转写正文通常保存在您的 Obsidian 库中。我们会保存计费所需的会话标识、时长、状态和费用，但不将转写正文作为账户用量记录的必需字段。",
                ]),
                ("共享与跨境处理", [
                    "我们可与云基础设施、身份验证、支付、分析、安全和语音处理服务商共享履行服务所需的最少信息。",
                    "为提供全球服务，数据可能在您所在国家或地区之外处理。我们会使用适用的合同和安全措施保护这些数据。",
                    "我们不出售您的个人信息。",
                ]),
                ("保留与安全", [
                    "我们仅在提供服务、处理争议、保护安全和遵守法律所需期间保留数据。交易记录可能因税务和财务规则保留更长时间。",
                    "我们使用访问控制、传输加密、密钥管理和监控等措施，但任何系统都无法保证绝对安全。",
                ]),
                ("您的权利", [
                    "在适用法律范围内，您可以请求访问、更正、删除或导出个人信息，也可以对特定处理提出异议或撤回同意。",
                    f"要行使这些权利，请使用账户邮箱联系 {SUPPORT_EMAIL}。为保护账户，我们可能需要核实身份。",
                ]),
                ("未成年人与政策更新", [
                    "本服务不面向未达当地数字服务同意年龄的儿童。如您认为我们误收集了儿童信息，请联系我们。",
                    "我们可更新本政策并修改顶部生效日期。如变更对您的权利有重大影响，我们会以合理方式通知。",
                ]),
            ],
        },
        "contact": {
            "title": "联系与支持",
            "subtitle": "账户、订单、充值和云端转写问题，请通过邮件联系我们。",
            "page_title": "联系与支持 - Obsidian RealTime Transcriber",
            "updated": "通常在 2 个工作日内回复",
            "sections": [
                ("客户支持", [
                    f"支持邮箱：{SUPPORT_EMAIL}",
                    "为便于快速处理，请在邮件中说明账户邮箱、问题发生时间，以及订单号或会话编号（如有）。请不要发送密码或完整支付卡号。",
                ]),
                ("开源与社区", [
                    "插件的问题和功能建议也可以在 GitHub 仓库提交。安全、隐私、账户或支付问题请优先使用邮箱。",
                ]),
            ],
        },
        "nav": {"home": "首页", "pricing": "定价", "terms": "使用协议", "privacy": "隐私政策", "contact": "联系支持"},
        "email": "发送邮件",
    },
    "en-US": {
        "terms": {
            "title": "Terms of Use",
            "subtitle": "Please read these terms before using Obsidian RealTime Transcriber.",
            "page_title": "Terms of Use - Obsidian RealTime Transcriber",
            "updated": "Effective July 18, 2026",
            "sections": [
                ("Service", [
                    "Obsidian RealTime Transcriber provides local and hosted cloud speech transcription and can organize results inside Obsidian.",
                    "We may route hosted requests according to device, region, availability, and service quality. We do not promise that every feature will remain available in every region.",
                ]),
                ("Accounts and security", [
                    "You must provide accurate account information, protect your credentials, and remain responsible for activity under your account.",
                    "Contact support promptly if you discover unauthorized access, a security incident, or inaccurate account information.",
                ]),
                ("Top-ups, balances, and billing", [
                    "Hosted transcription uses prepaid balance and is charged according to the actual cloud transcription duration and rates displayed on the pricing page. Balance is not a bank deposit and cannot be transferred, traded, or withdrawn.",
                    "Regional packages may be limited to their designated route. Final prices, taxes, and currencies are shown at checkout. Payments may be processed by an authorized merchant of record and payment providers; we do not store complete card numbers.",
                ]),
                ("Refunds and order issues", [
                    "For duplicate charges, missing balance, or another order issue, contact us with the order number.",
                    "Consumed cloud transcription balance is generally non-refundable. Unused amounts are handled according to applicable law, payment-provider policy, and the circumstances of the order.",
                ]),
                ("Acceptable use", [
                    "You may not violate privacy, intellectual-property, or other legal rights; upload unlawful content; or bypass billing, limits, or security controls.",
                    "Before recording or transcribing another person, you are responsible for obtaining required permission and complying with local law.",
                ]),
                ("Content and intellectual property", [
                    "You retain the rights you lawfully hold in your audio, text, and generated results. You authorize the processing necessary to provide, secure, and improve the service.",
                    "The website, plugin code, brand, and interface materials owned by us or our licensors remain protected by applicable intellectual-property law.",
                ]),
                ("Availability and liability", [
                    "Speech recognition can be inaccurate because of pronunciation, environment, network conditions, or language. Human review is required for medical, legal, financial, or other high-risk uses.",
                    "To the maximum extent allowed by law, we are not liable for indirect, incidental, special, or punitive damages.",
                ]),
                ("Changes, termination, and contact", [
                    "We may update these terms for legal, security, or product changes and will update the effective date. Continued use means acceptance of the updated terms.",
                    f"Questions about these terms can be sent to {SUPPORT_EMAIL}.",
                ]),
            ],
        },
        "privacy": {
            "title": "Privacy Policy",
            "subtitle": "How we collect, use, and protect your information.",
            "page_title": "Privacy Policy - Obsidian RealTime Transcriber",
            "updated": "Effective July 18, 2026",
            "sections": [
                ("Scope", [
                    "This policy covers the Obsidian RealTime Transcriber website, account system, and hosted cloud transcription service. Audio in local transcription mode is processed on your device.",
                ]),
                ("Information we collect", [
                    "Account data includes email, account identifiers, login method, and security-verification records.",
                    "Transaction and usage data includes order ID, package, amount, currency, payment status, balance, transcription duration, and charge records.",
                    "Technical data includes IP address, device and browser type, logs, errors, and security-event data.",
                    "Hosted transcription data includes audio streams submitted in cloud mode and the resulting transcript.",
                ]),
                ("Purposes and legal bases", [
                    "We use data to create and secure accounts, process payments, provide transcription, calculate balances, support customers, prevent fraud, and comply with law.",
                    "Our legal bases include performing our service contract, complying with legal duties, protecting legitimate interests, and obtaining consent where required.",
                ]),
                ("Audio and transcripts", [
                    "In hosted cloud mode, audio is sent to cloud processing services to return real-time text. We do not persist raw audio on our own servers by default.",
                    "Transcript text is normally stored in your Obsidian vault. We retain session identifiers, duration, status, and cost required for billing, but transcript text is not a required field in account usage records.",
                ]),
                ("Sharing and international processing", [
                    "We share the minimum necessary information with infrastructure, identity, payment, analytics, security, and speech-processing providers that help operate the service.",
                    "Data may be processed outside your country or region. We use appropriate contractual and security safeguards. We do not sell personal information.",
                ]),
                ("Retention and security", [
                    "We retain data only as needed to provide the service, resolve disputes, protect security, and comply with law. Transaction records may be kept longer for tax and accounting rules.",
                    "We use access controls, encryption in transit, key management, and monitoring, but no system can guarantee absolute security.",
                ]),
                ("Your rights", [
                    "Where applicable, you may request access, correction, deletion, or export of personal information, and may object to certain processing or withdraw consent.",
                    f"Use your account email to contact {SUPPORT_EMAIL}. We may verify identity before completing a request.",
                ]),
                ("Children and updates", [
                    "The service is not intended for children below the local age of digital consent. Contact us if you believe a child submitted information.",
                    "We may update this policy and will revise the effective date. Material changes will be communicated in a reasonable manner.",
                ]),
            ],
        },
        "contact": {
            "title": "Contact and support",
            "subtitle": "Email us about accounts, orders, top-ups, or hosted transcription.",
            "page_title": "Contact and support - Obsidian RealTime Transcriber",
            "updated": "We normally reply within two business days",
            "sections": [
                ("Customer support", [
                    f"Support email: {SUPPORT_EMAIL}",
                    "Include your account email, the time of the issue, and any order or session ID. Never send a password or full payment-card number.",
                ]),
                ("Open source and community", [
                    "Plugin issues and feature suggestions can also be submitted through the GitHub repository. Use email first for security, privacy, account, or payment questions.",
                ]),
            ],
        },
        "nav": {"home": "Home", "pricing": "Pricing", "terms": "Terms", "privacy": "Privacy", "contact": "Support"},
        "email": "Email support",
    },
}


PAGE_TEMPLATE = """<!doctype html>
<html lang="{{ html_lang }}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ page.page_title }}</title>
  <meta name="description" content="{{ page.subtitle }}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="{{ canonical_url }}">
  <link rel="icon" type="image/png" sizes="256x256" href="/static/imgs/zhuanwenzi2026/brand-recording-icon.png?v=20260712-1">
  <style>
    * { box-sizing: border-box; }
    :root { --blue: #246bfe; --ink: #121826; --muted: #667085; --line: #dce5f3; --soft: #f4f7fc; }
    html { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif; color: var(--ink); background: #fff; }
    body { margin: 0; min-height: 100vh; line-height: 1.7; letter-spacing: 0; }
    a { color: inherit; }
    .topbar { height: 72px; border-bottom: 1px solid var(--line); background: #fff; }
    .topbar-inner { width: min(1120px, calc(100% - 32px)); height: 100%; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); font-size: 16px; font-weight: 750; text-decoration: none; }
    .brand img { width: 22px; height: 22px; }
    .nav { display: flex; align-items: center; gap: 20px; color: var(--muted); font-size: 14px; }
    .nav a { text-decoration: none; }
    .nav a:hover, .nav a[aria-current="page"] { color: var(--blue); }
    .lang { display: inline-flex; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
    .lang a { min-width: 42px; padding: 5px 9px; text-align: center; }
    .lang a.active { color: #fff; background: var(--blue); }
    .hero { width: min(760px, calc(100% - 32px)); margin: 0 auto; padding: 88px 0 48px; }
    .eyebrow { display: block; margin-bottom: 14px; color: var(--blue); font-size: 13px; font-weight: 750; }
    h1 { margin: 0 0 16px; font-size: clamp(38px, 7vw, 64px); line-height: 1.08; font-weight: 760; }
    .subtitle { max-width: 680px; margin: 0; color: var(--muted); font-size: 18px; }
    .updated { margin-top: 26px; color: #8a94a6; font-size: 13px; }
    main { width: min(760px, calc(100% - 32px)); margin: 0 auto; padding: 0 0 100px; }
    .section { padding: 36px 0; border-top: 1px solid var(--line); }
    .section h2 { margin: 0 0 16px; font-size: 24px; line-height: 1.3; }
    .section p { margin: 0 0 12px; color: #344054; font-size: 16px; }
    .section p:last-child { margin-bottom: 0; }
    .contact-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
    .button { display: inline-flex; min-height: 46px; align-items: center; justify-content: center; padding: 0 20px; border: 1px solid var(--blue); border-radius: 7px; color: #fff; background: var(--blue); font-weight: 700; text-decoration: none; }
    .button.secondary { color: var(--blue); background: #fff; }
    .legal-footer { padding: 28px 0 44px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
    .legal-footer-inner { width: min(1120px, calc(100% - 32px)); margin: 0 auto; display: flex; justify-content: space-between; gap: 18px; }
    .legal-footer-links { display: flex; flex-wrap: wrap; gap: 16px; }
    @media (max-width: 760px) {
      .topbar { height: auto; }
      .topbar-inner { min-height: 64px; flex-wrap: wrap; padding: 12px 0; }
      .brand span { display: none; }
      .nav { gap: 12px; font-size: 13px; }
      .nav .pricing-link { display: none; }
      .hero { padding-top: 58px; }
      h1 { font-size: 42px; }
      .legal-footer-inner { flex-direction: column; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/{{ query_suffix }}">
        <img src="/static/imgs/zhuanwenzi2026/brand-recording-icon.png?v=20260712-1" alt="">
        <span>Obsidian RealTime Transcriber</span>
      </a>
      <nav class="nav" aria-label="Primary navigation">
        <a class="pricing-link" href="/pricing{{ lang_query }}">{{ copy.nav.pricing }}</a>
        <a href="/terms{{ lang_query }}"{% if current_page == 'terms' %} aria-current="page"{% endif %}>{{ copy.nav.terms }}</a>
        <a href="/privacy{{ lang_query }}"{% if current_page == 'privacy' %} aria-current="page"{% endif %}>{{ copy.nav.privacy }}</a>
        <a href="/contact{{ lang_query }}"{% if current_page == 'contact' %} aria-current="page"{% endif %}>{{ copy.nav.contact }}</a>
        <span class="lang" aria-label="Language">
          <a href="/{{ current_page }}" class="{% if lang == 'zh-CN' %}active{% endif %}">中</a>
          <a href="/{{ current_page }}?lang=en-US" class="{% if lang == 'en-US' %}active{% endif %}">EN</a>
        </span>
      </nav>
    </div>
  </header>
  <header class="hero">
    <span class="eyebrow">Obsidian RealTime Transcriber</span>
    <h1>{{ page.title }}</h1>
    <p class="subtitle">{{ page.subtitle }}</p>
    <div class="updated">{{ page.updated }}</div>
  </header>
  <main>
    {% for heading, paragraphs in page.sections %}
      <section class="section">
        <h2>{{ heading }}</h2>
        {% for paragraph in paragraphs %}<p>{{ paragraph }}</p>{% endfor %}
      </section>
    {% endfor %}
    {% if current_page == 'contact' %}
      <div class="contact-actions">
        <a class="button" href="mailto:{{ support_email }}">{{ copy.email }}</a>
        <a class="button secondary" href="https://github.com/garetneda-gif/obsidian-realtime-transcription" target="_blank" rel="noopener noreferrer">GitHub</a>
      </div>
    {% endif %}
  </main>
  <footer class="legal-footer">
    <div class="legal-footer-inner">
      <span>© 2026 Obsidian RealTime Transcriber</span>
      <div class="legal-footer-links">
        <a href="/terms{{ lang_query }}">{{ copy.nav.terms }}</a>
        <a href="/privacy{{ lang_query }}">{{ copy.nav.privacy }}</a>
        <a href="mailto:{{ support_email }}">{{ support_email }}</a>
      </div>
    </div>
  </footer>
</body>
</html>"""


legal_bp = Blueprint("legal", __name__)


def _resolve_language() -> str:
    requested = request.args.get("lang", "").strip().lower()
    if requested in {"en", "en-us"}:
        return "en-US"
    if requested in {"zh", "zh-cn", "zh-tw"}:
        return "zh-CN"
    return "en-US" if request.accept_languages.best_match(["en", "zh"]) == "en" else "zh-CN"


def _render_page(page_name: str) -> str:
    language = _resolve_language()
    copy = PAGE_COPY[language]
    lang_query = "?lang=en-US" if language == "en-US" else ""
    canonical_url = f"{SITE_URL}/{page_name}{lang_query}"
    return render_template_string(
        PAGE_TEMPLATE,
        canonical_url=canonical_url,
        copy=copy,
        current_page=page_name,
        html_lang=language,
        lang=language,
        lang_query=lang_query,
        page=copy[page_name],
        query_suffix=lang_query,
        support_email=SUPPORT_EMAIL,
    )


@legal_bp.route("/terms")
@legal_bp.route("/terms/")
def terms_page() -> str:
    return _render_page("terms")


@legal_bp.route("/privacy")
@legal_bp.route("/privacy/")
def privacy_page() -> str:
    return _render_page("privacy")


@legal_bp.route("/contact")
@legal_bp.route("/contact/")
def contact_page() -> str:
    return _render_page("contact")


__all__ = ["legal_bp"]
