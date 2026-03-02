import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type RealtimeTranscriptionPlugin from "./main";
import { resolvePluginDir } from "./utils/pluginPaths";

export class TranscriptionSettingTab extends PluginSettingTab {
  plugin: RealtimeTranscriptionPlugin;

  constructor(app: App, plugin: RealtimeTranscriptionPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private getPluginDir(): string {
    return resolvePluginDir(this.app, this.plugin.manifest);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── 后端设置 ──
    containerEl.createEl("h2", { text: "后端设置" });

    new Setting(containerEl)
      .setName("Python 路径")
      .setDesc("Python 可执行文件路径，确保已安装 sherpa-onnx")
      .addText((text) =>
        text
          .setPlaceholder("python3")
          .setValue(this.plugin.settings.pythonPath)
          .onChange(async (value) => {
            this.plugin.settings.pythonPath = value || "python3";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("后端端口")
      .setDesc("WebSocket 服务端口")
      .addText((text) =>
        text
          .setPlaceholder("18888")
          .setValue(String(this.plugin.settings.backendPort))
          .onChange(async (value) => {
            const port = parseInt(value, 10);
            if (port > 0 && port < 65536) {
              this.plugin.settings.backendPort = port;
              await this.plugin.saveSettings();
            }
          }),
      );

    // ── 模型设置 ──
    containerEl.createEl("h2", { text: "模型设置" });

    new Setting(containerEl)
      .setName("模型目录")
      .setDesc("包含 model.int8.onnx、tokens.txt、silero_vad.onnx 的目录路径")
      .addText((text) =>
        text
          .setPlaceholder("/path/to/models")
          .setValue(this.plugin.settings.modelDir)
          .onChange(async (value) => {
            this.plugin.settings.modelDir = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("使用 Int8 量化模型")
      .setDesc("使用更小的量化模型 (229MB vs 895MB)，推荐开启")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useInt8)
          .onChange(async (value) => {
            this.plugin.settings.useInt8 = value;
            await this.plugin.saveSettings();
          }),
      );

    // 环境检测按钮
    new Setting(containerEl)
      .setName("环境检测")
      .setDesc("检查 Python 和 sherpa-onnx 是否正确安装")
      .addButton((btn) =>
        btn.setButtonText("检测环境").onClick(async () => {
          btn.setButtonText("检测中...");
          btn.setDisabled(true);
          const pluginDir = this.getPluginDir();
          const { BackendManager } = await import("./services/BackendManager");
          const mgr = new BackendManager(pluginDir, this.plugin.settings);
          const ok = await mgr.checkEnvironment();
          if (ok) {
            new Notice("环境检测通过：Python + sherpa-onnx 可用");
          } else {
            new Notice(
              "环境检测失败，请执行:\npip3 install sherpa-onnx websockets numpy",
            );
          }
          btn.setButtonText("检测环境");
          btn.setDisabled(false);
        }),
      );

    // 下载模型按钮
    new Setting(containerEl)
      .setName("下载模型")
      .setDesc("从 GitHub 下载 SenseVoice-Small + Silero VAD 模型文件（约 240MB）")
      .addButton((btn) =>
        btn.setButtonText("下载模型").onClick(async () => {
          const modelDir = this.plugin.settings.modelDir;
          if (!modelDir) {
            new Notice("请先设置模型目录路径");
            return;
          }
          btn.setButtonText("下载中...");
          btn.setDisabled(true);
          new Notice("开始下载模型，请耐心等待...");

          const pluginDir = this.getPluginDir();
          const { BackendManager } = await import("./services/BackendManager");
          const mgr = new BackendManager(pluginDir, this.plugin.settings);
          const ok = await mgr.downloadModel(modelDir);

          if (ok) {
            new Notice("模型下载完成！");
          } else {
            new Notice("模型下载失败，请检查网络连接或手动下载");
          }
          btn.setButtonText("下载模型");
          btn.setDisabled(false);
        }),
      );

    // ── 翻译设置 ──
    containerEl.createEl("h2", { text: "翻译设置" });

    new Setting(containerEl)
      .setName("启用自动翻译")
      .setDesc("识别到非中文内容时自动翻译为简体中文")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.translation.enabled)
          .onChange(async (value) => {
            this.plugin.settings.translation.enabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("API 端点")
      .setDesc("OpenAI 兼容 API 的完整 URL（支持 DeepSeek、通义千问等）")
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com/v1/chat/completions")
          .setValue(this.plugin.settings.translation.apiUrl)
          .onChange(async (value) => {
            this.plugin.settings.translation.apiUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("翻译服务的 API 密钥")
      .addText((text) => {
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.translation.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.translation.apiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      });

    new Setting(containerEl)
      .setName("模型名称")
      .setDesc("用于翻译的模型 ID")
      .addText((text) =>
        text
          .setPlaceholder("gpt-4o-mini")
          .setValue(this.plugin.settings.translation.model)
          .onChange(async (value) => {
            this.plugin.settings.translation.model = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    // ── AI 摘要设置 ──
    containerEl.createEl("h2", { text: "AI 摘要设置" });

    new Setting(containerEl)
      .setName("启用自动 AI 摘要")
      .setDesc("录音过程中按字数阈值自动生成摘要")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.summary.enabled)
          .onChange(async (value) => {
            this.plugin.settings.summary.enabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("摘要 API 端点")
      .setDesc("用于 AI 摘要的独立 API URL（不与翻译共用）")
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com/v1/chat/completions")
          .setValue(this.plugin.settings.summary.apiUrl)
          .onChange(async (value) => {
            this.plugin.settings.summary.apiUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("摘要 API Key")
      .setDesc("用于 AI 摘要服务的 API 密钥")
      .addText((text) => {
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.summary.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.summary.apiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      });

    new Setting(containerEl)
      .setName("摘要模型名称")
      .setDesc("用于 AI 摘要的模型 ID")
      .addText((text) =>
        text
          .setPlaceholder("gpt-4o-mini")
          .setValue(this.plugin.settings.summary.model)
          .onChange(async (value) => {
            this.plugin.settings.summary.model = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("摘要触发字数")
      .setDesc("累计到该字数后自动执行一次摘要")
      .addSlider((slider) =>
        slider
          .setLimits(1000, 10000, 100)
          .setValue(this.plugin.settings.summary.thresholdChars)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.summary.thresholdChars = value;
            await this.plugin.saveSettings();
          }),
      );

    // ── VAD 设置 ──
    containerEl.createEl("h2", { text: "高级设置" });

    new Setting(containerEl)
      .setName("VAD 静音阈值")
      .setDesc("语音活动检测的静音持续时间（秒），越大分句越少")
      .addSlider((slider) =>
        slider
          .setLimits(0.2, 4.0, 0.1)
          .setValue(this.plugin.settings.vad.minSilenceDuration)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.vad.minSilenceDuration = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("聚合输出窗口")
      .setDesc("同语种短句会在该时长内合并后再输出，越大段落越长（同时有少量延迟）")
      .addSlider((slider) =>
        slider
          .setLimits(1, 12, 1)
          .setValue(this.plugin.settings.aggregation.flushWindowSec)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.aggregation.flushWindowSec = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("单段最大字数")
      .setDesc("达到该长度会提前换段，避免单条过长")
      .addSlider((slider) =>
        slider
          .setLimits(120, 1200, 20)
          .setValue(this.plugin.settings.aggregation.maxChars)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.aggregation.maxChars = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
