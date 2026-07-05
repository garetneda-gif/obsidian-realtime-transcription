const translations = {
  zh: {
    title: "Obsidian Realtime Transcription - 云端实时转写",
    description: "Obsidian 实时语音转写插件：本地免费，云端付费零配置，支持会议、课堂、访谈和长音频笔记。",
    entries: {
      ".brand span:first-of-type": "Realtime Transcription",
      ".version": "Cloud · preview",
      '.nav-links a[href="#features"]': "功能",
      '.nav-links a[href="#pricing"]': "价格",
      '.nav-links a[href="#faq"]': "FAQ",
      ".ghost-link": "开始充值",
      ".hero-badges span:nth-child(1)": "Obsidian 原生插件",
      ".hero-badges span:nth-child(2)": "本地 + 云端双引擎",
      ".hero-badges span:nth-child(3)": "中英日韩粤",
      ".hero-section h1": "把每一次对话变成可检索的 Obsidian 笔记",
      ".hero-copy": "本地模型免费跑，云端模式零配置。会议、课堂、访谈和灵感记录，边说边进库。",
      ".hero-section .primary-button": "查看云端方案",
      ".hero-section .secondary-button": "继续使用本地免费版 →",
      ".feature-tabs .section-kicker": "Daily capture system",
      "#features-title": "录音、识别、整理，一条链路完成",
      '[data-tab="capture"] span': "实时转写",
      '[data-tab="capture"] small': "边说边显示，自动分段",
      '[data-tab="cloud"] span': "云端零配置",
      '[data-tab="cloud"] small': "登录后直接使用腾讯云 ASR",
      '[data-tab="notes"] span': "笔记工作流",
      '[data-tab="notes"] small': "摘要、润色、导出到 vault",
      '[data-panel="capture"] h3': "实时字幕不是终点，结构化笔记才是",
      '[data-panel="capture"] p': "16kHz 单声道采集、partial 稳定过滤、final 聚合输出，减少重复和回滚，让长时间录音保持可读。",
      '[data-panel="cloud"] h3': "不想装 Python，也能马上开始",
      '[data-panel="cloud"] p': "云端付费模式免模型、免密钥、免后端进程管理。按实际使用时长结算，余额不足时自动提示充值。",
      '[data-panel="notes"] h3': "从原始语音到可复习资料",
      '[data-panel="notes"] p': "自动翻译、AI 摘要、二次摘要和手动/AI 命名导出，适合课堂、访谈、会议纪要和资料整理。",
      ".pillars-section .section-kicker": "File over app, but for audio",
      ".pillars-section h2": "语音数据留在你的工作流里",
      ".pillar-grid article:nth-child(1) h3": "本地优先",
      ".pillar-grid article:nth-child(1) p": "SenseVoice-Small + sherpa-onnx 可离线运行。敏感会议、私密笔记和低延迟场景继续走本机。",
      ".pillar-grid article:nth-child(2) h3": "按量云端",
      ".pillar-grid article:nth-child(2) p": "不需要长期订阅，云端 ASR 按小时计费。注册送体验额度，之后按余额扣费。",
      ".pillar-grid article:nth-child(3) h3": "OpenAI 兼容后处理",
      ".pillar-grid article:nth-child(3) p": "翻译、润色、摘要都使用 OpenAI 兼容接口，DeepSeek、通义等模型可以直接接入。",
      ".pillar-grid article:nth-child(4) h3": "Obsidian 原生",
      ".pillar-grid article:nth-child(4) p": "历史记录、转写卡片、导出文件和设置面板都在 Obsidian 内完成，不额外维护另一个知识库。",
      ".testimonials-section h2": "为真实知识工作场景准备",
      ".testimonials-section > p": "课堂、采访、会议、播客草稿、个人复盘，一套插件覆盖从录音到整理的日常链路。",
      ".quote-row article:nth-child(1) b": "课堂复习",
      ".quote-row article:nth-child(1) span": "录完即得分段文本，导出后直接进入课程笔记。",
      ".quote-row article:nth-child(2) b": "会议纪要",
      ".quote-row article:nth-child(2) span": "长会议用云端稳定跑，结束后生成摘要和行动项。",
      ".quote-row article:nth-child(3) b": "访谈整理",
      ".quote-row article:nth-child(3) span": "中英混杂识别，后续润色成更适合发布的材料。",
      ".pricing-section .section-kicker": "The stack you choose",
      ".pricing-copy h2": "免费本地版继续保留，云端按需付费",
      ".pricing-copy p": "你可以一直使用本地模型。付费只用于零配置云端 ASR 和托管识别成本。",
      ".price-card:nth-child(1) p": "本地模型、BYOK 翻译/摘要、完整 Obsidian 工作流。",
      ".price-card:nth-child(1) a": "使用本地版",
      ".price-card:nth-child(2) h3": "¥2 / 小时",
      ".price-card:nth-child(2) p": "云端实时识别，注册送 ¥1 体验额度，余额按实际识别时长扣减。",
      ".price-card:nth-child(2) a": "在插件设置中充值",
      ".price-card:nth-child(3) p": "摘要、翻译和润色继续使用你自己的 OpenAI 兼容 API Key。",
      ".price-card:nth-child(3) a": "查看说明",
      ".install-section h2": "从 Obsidian 设置页开始",
      ".install-section p": "安装插件后打开设置，选择“云端付费（零配置）”，注册或登录账户，再点击充值。支付完成后余额会在插件中显示。",
      ".install-section .primary-button": "常见问题",
      ".install-section .secondary-button": "服务状态 →",
      ".faq-section h2": "Frequently Asked Questions",
      ".faq-item:nth-child(1) span": "本地模式还免费吗？",
      ".faq-item:nth-child(1) p": "免费。本地 SenseVoice-Small 模式、导出和基础文本处理继续保留，不依赖付费账户。",
      ".faq-item:nth-child(2) span": "为什么云端模式要收费？",
      ".faq-item:nth-child(2) p": "云端模式使用托管 ASR 服务，费用覆盖实时识别、签名服务和结算成本，按实际使用时长扣费。",
      ".faq-item:nth-child(3) span": "录音内容会被保存到服务器吗？",
      ".faq-item:nth-child(3) p": "计费服务保存账户、订单和用量记录；转写历史保存在你的 Obsidian vault。云端 ASR 的传输取决于所选提供方。",
      ".faq-item:nth-child(4) span": "余额不足会怎样？",
      ".faq-item:nth-child(4) p": "插件会提示余额不足并停止新的云端签名请求。充值后即可继续使用。",
      ".faq-item:nth-child(5) span": "可以继续使用自己的腾讯云密钥吗？",
      ".faq-item:nth-child(5) p": "可以。ASR 提供方里仍有腾讯云 BYOK 模式，适合已有腾讯云账号和密钥的用户。",
      ".site-footer > span": "Copyright © 2026 Realtime Transcription.",
      '.site-footer a[href="#features"]': "功能",
      '.site-footer a[href="#pricing"]': "价格",
      '.site-footer a[href="#faq"]': "FAQ",
    },
  },
  en: {
    title: "Obsidian Realtime Transcription - Cloud ASR",
    description: "Realtime transcription for Obsidian: free local mode, zero-config paid cloud ASR, and note-ready AI workflows.",
    entries: {
      ".brand span:first-of-type": "Realtime Transcription",
      ".version": "Cloud · preview",
      '.nav-links a[href="#features"]': "Features",
      '.nav-links a[href="#pricing"]': "Pricing",
      '.nav-links a[href="#faq"]': "FAQ",
      ".ghost-link": "Top up",
      ".hero-badges span:nth-child(1)": "Native Obsidian plugin",
      ".hero-badges span:nth-child(2)": "Local + cloud engines",
      ".hero-badges span:nth-child(3)": "ZH · EN · JA · KO · Cantonese",
      ".hero-section h1": "Turn every conversation into searchable Obsidian notes",
      ".hero-copy": "Run local models for free, or use zero-config cloud ASR. Meetings, classes, interviews, and ideas land directly in your vault.",
      ".hero-section .primary-button": "View cloud plan",
      ".hero-section .secondary-button": "Keep using local free mode →",
      ".feature-tabs .section-kicker": "Daily capture system",
      "#features-title": "Record, transcribe, and organize in one flow",
      '[data-tab="capture"] span': "Live transcription",
      '[data-tab="capture"] small': "Streaming text with automatic segments",
      '[data-tab="cloud"] span': "Zero-config cloud",
      '[data-tab="cloud"] small': "Log in and use Tencent Cloud ASR directly",
      '[data-tab="notes"] span': "Note workflow",
      '[data-tab="notes"] small': "Summarize, polish, and export to your vault",
      '[data-panel="capture"] h3': "Captions are not the finish line. Structured notes are.",
      '[data-panel="capture"] p': "16kHz mono capture, partial stability filtering, and final aggregation reduce duplicates and rollbacks during long recordings.",
      '[data-panel="cloud"] h3': "Start without installing Python",
      '[data-panel="cloud"] p': "Paid cloud mode removes models, keys, and backend process management. Billing follows actual recognition time.",
      '[data-panel="notes"] h3': "From raw speech to review-ready material",
      '[data-panel="notes"] p': "Auto translation, AI summaries, meta summaries, and manual or AI naming fit classes, interviews, meeting notes, and research workflows.",
      ".pillars-section .section-kicker": "File over app, but for audio",
      ".pillars-section h2": "Keep voice data inside your workflow",
      ".pillar-grid article:nth-child(1) h3": "Local first",
      ".pillar-grid article:nth-child(1) p": "SenseVoice-Small and sherpa-onnx can run offline for sensitive meetings, private notes, and low-latency capture.",
      ".pillar-grid article:nth-child(2) h3": "Usage-based cloud",
      ".pillar-grid article:nth-child(2) p": "No long subscription. Cloud ASR is billed hourly with a free starter balance, then charged from your account balance.",
      ".pillar-grid article:nth-child(3) h3": "OpenAI-compatible post-processing",
      ".pillar-grid article:nth-child(3) p": "Translation, polishing, and summaries use OpenAI-compatible APIs, including DeepSeek, Qwen, and similar providers.",
      ".pillar-grid article:nth-child(4) h3": "Obsidian native",
      ".pillar-grid article:nth-child(4) p": "History, transcript items, exports, and settings all stay inside Obsidian. No second knowledge base to maintain.",
      ".testimonials-section h2": "Built for real knowledge work",
      ".testimonials-section > p": "Classes, interviews, meetings, podcast drafts, and personal reviews share one path from audio to organized notes.",
      ".quote-row article:nth-child(1) b": "Class review",
      ".quote-row article:nth-child(1) span": "Capture segmented text and export it directly into course notes.",
      ".quote-row article:nth-child(2) b": "Meeting notes",
      ".quote-row article:nth-child(2) span": "Run long meetings through cloud ASR, then generate summaries and action items.",
      ".quote-row article:nth-child(3) b": "Interview cleanup",
      ".quote-row article:nth-child(3) span": "Handle mixed Chinese and English speech, then polish it into publishable material.",
      ".pricing-section .section-kicker": "The stack you choose",
      ".pricing-copy h2": "Free local mode stays. Cloud is pay as you go.",
      ".pricing-copy p": "You can always use the local model. Paid usage only covers zero-config hosted ASR and recognition cost.",
      ".price-card:nth-child(1) p": "Local models, BYOK translation and summaries, and the full Obsidian workflow.",
      ".price-card:nth-child(1) a": "Use local mode",
      ".price-card:nth-child(2) h3": "¥2 / hour",
      ".price-card:nth-child(2) p": "Cloud realtime ASR with ¥1 starter balance. Charges are based on actual recognition time.",
      ".price-card:nth-child(2) a": "Top up in plugin settings",
      ".price-card:nth-child(3) p": "Summaries, translation, and polishing keep using your own OpenAI-compatible API key.",
      ".price-card:nth-child(3) a": "Read details",
      ".install-section h2": "Start from Obsidian settings",
      ".install-section p": "After installing the plugin, open settings, choose paid cloud mode, register or log in, then top up. The balance appears inside the plugin.",
      ".install-section .primary-button": "FAQ",
      ".install-section .secondary-button": "Service status →",
      ".faq-section h2": "Frequently Asked Questions",
      ".faq-item:nth-child(1) span": "Is local mode still free?",
      ".faq-item:nth-child(1) p": "Yes. Local SenseVoice-Small mode, exports, and basic text processing remain free and do not require a paid account.",
      ".faq-item:nth-child(2) span": "Why does cloud mode cost money?",
      ".faq-item:nth-child(2) p": "Cloud mode uses hosted ASR. The fee covers realtime recognition, signing service, and billing cost based on actual duration.",
      ".faq-item:nth-child(3) span": "Is recorded audio stored on the server?",
      ".faq-item:nth-child(3) p": "The billing service stores accounts, orders, and usage records. Transcript history stays in your Obsidian vault. Cloud ASR transport depends on the selected provider.",
      ".faq-item:nth-child(4) span": "What happens when my balance is low?",
      ".faq-item:nth-child(4) p": "The plugin shows an insufficient balance notice and stops new cloud signing requests. Top up to continue.",
      ".faq-item:nth-child(5) span": "Can I still use my own Tencent Cloud keys?",
      ".faq-item:nth-child(5) p": "Yes. Tencent Cloud BYOK mode remains available for users who already have their own account and keys.",
      ".site-footer > span": "Copyright © 2026 Realtime Transcription.",
      '.site-footer a[href="#features"]': "Features",
      '.site-footer a[href="#pricing"]': "Pricing",
      '.site-footer a[href="#faq"]': "FAQ",
    },
  },
};

function getInitialLanguage() {
  const saved = localStorage.getItem("paid-site-language");
  if (saved === "zh" || saved === "en") return saved;
  return location.pathname === "/en" ? "en" : "zh";
}

function applyLanguage(language) {
  const current = translations[language] || translations.zh;
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.title = current.title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", current.description);

  for (const [selector, text] of Object.entries(current.entries)) {
    const element = document.querySelector(selector);
    if (element) element.textContent = text;
  }

  const toggle = document.querySelector("[data-language-toggle]");
  if (toggle) {
    toggle.textContent = language === "zh" ? "EN" : "中";
    toggle.setAttribute("aria-label", language === "zh" ? "Switch to English" : "切换到中文");
  }

  localStorage.setItem("paid-site-language", language);
}

let activeLanguage = getInitialLanguage();
applyLanguage(activeLanguage);

document.querySelector("[data-language-toggle]")?.addEventListener("click", () => {
  activeLanguage = activeLanguage === "zh" ? "en" : "zh";
  applyLanguage(activeLanguage);
});

const tabButtons = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    const target = button.dataset.tab;
    for (const tabButton of tabButtons) {
      const active = tabButton === button;
      tabButton.classList.toggle("is-active", active);
      tabButton.setAttribute("aria-selected", String(active));
    }
    for (const panel of tabPanels) {
      panel.classList.toggle("is-active", panel.dataset.panel === target);
    }
  });
}

for (const item of document.querySelectorAll(".faq-item")) {
  item.addEventListener("click", () => {
    item.setAttribute("aria-expanded", String(item.getAttribute("aria-expanded") !== "true"));
  });
}
