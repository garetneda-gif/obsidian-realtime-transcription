import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type RealtimeTranscriptionPlugin from "./main";
import { resolvePluginDir } from "./utils/pluginPaths";
import type { RealtimeProfile, RecognitionMode, ExportMode, ExportTitleMode, GpuProvider, AsrProvider } from "./types";
import { t, setLocale } from "./i18n";

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

    // ── Language / 语言 ──
    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("zh", "简体中文")
          .addOption("en", "English")
          .setValue(this.plugin.settings.locale)
          .onChange(async (value: "zh" | "en") => {
            this.plugin.settings.locale = value;
            setLocale(value);
            await this.plugin.saveSettings();
            this.display();
          });
      });

    // ── ASR 引擎选择 ──
    containerEl.createEl("h2", { text: "语音识别引擎" });

    new Setting(containerEl)
      .setName("ASR 提供方")
      .setDesc("选择语音识别引擎：本地模型（离线）或腾讯云（在线，需配置密钥）")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("local", "本地模型（SenseVoice）")
          .addOption("tencent", "腾讯云实时语音识别")
          .setValue(this.plugin.settings.asrProvider)
          .onChange(async (value: AsrProvider) => {
            this.plugin.settings.asrProvider = value;
            await this.plugin.saveSettings();
            // 重绘设置面板以显示/隐藏对应配置
            this.display();
          });
      });

    const isCloud = this.plugin.settings.asrProvider === "tencent";

    if (!isCloud) {
    // ── 后端设置 ──
    containerEl.createEl("h2", { text: t("settings.backend.title") });

    new Setting(containerEl)
      .setName(t("settings.backend.pythonPath.name"))
      .setDesc(t("settings.backend.pythonPath.desc"))
      .addText((text) => {
        const defaultPython = process.platform === "win32" ? "python" : "python3";
        text
          .setPlaceholder(defaultPython)
          .setValue(this.plugin.settings.pythonPath)
          .onChange(async (value) => {
            this.plugin.settings.pythonPath = value || defaultPython;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.backend.port.name"))
      .setDesc(t("settings.backend.port.desc"))
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
    containerEl.createEl("h2", { text: t("settings.model.title") });

    new Setting(containerEl)
      .setName(t("settings.model.dir.name"))
      .setDesc(t("settings.model.dir.desc"))
      .addText((text) =>
        text
          .setPlaceholder(process.platform === "win32" ? "C:\\path\\to\\models" : "/path/to/models")
          .setValue(this.plugin.settings.modelDir)
          .onChange(async (value) => {
            this.plugin.settings.modelDir = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.model.useInt8.name"))
      .setDesc(t("settings.model.useInt8.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useInt8)
          .onChange(async (value) => {
            this.plugin.settings.useInt8 = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.model.recognitionMode.name"))
      .setDesc(t("settings.model.recognitionMode.desc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("zh-en", t("settings.model.recognitionMode.zhEn"))
          .addOption("zh", t("settings.model.recognitionMode.zh"))
          .addOption("en", t("settings.model.recognitionMode.en"))
          .setValue(this.plugin.settings.recognitionMode)
          .onChange(async (value: RecognitionMode) => {
            this.plugin.settings.recognitionMode = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.model.gpu.name"))
      .setDesc(
        process.platform === "darwin"
          ? t("settings.model.gpu.desc.mac")
          : process.platform === "win32"
            ? t("settings.model.gpu.desc.win")
            : t("settings.model.gpu.desc.other"),
      )
      .addDropdown((dropdown) => {
        dropdown.addOption("cpu", t("settings.model.gpu.cpu"));
        if (process.platform === "darwin") {
          dropdown.addOption("coreml", t("settings.model.gpu.coreml"));
        } else if (process.platform === "win32") {
          dropdown.addOption("cuda", t("settings.model.gpu.cuda"));
        }
        dropdown
          .setValue(this.plugin.settings.gpuProvider)
          .onChange(async (value: GpuProvider) => {
            this.plugin.settings.gpuProvider = value;
            await this.plugin.saveSettings();
          });
      });

    // 环境检测按钮
    new Setting(containerEl)
      .setName(t("settings.model.envCheck.name"))
      .setDesc(t("settings.model.envCheck.desc"))
      .addButton((btn) =>
        btn.setButtonText(t("settings.model.envCheck.btn")).onClick(async () => {
          btn.setButtonText(t("settings.model.envCheck.checking"));
          btn.setDisabled(true);
          const pluginDir = this.getPluginDir();
          const { BackendManager } = await import("./services/BackendManager");
          const mgr = new BackendManager(pluginDir, this.plugin.settings);
          const ok = await mgr.checkEnvironment();
          if (ok) {
            new Notice(t("settings.model.envCheck.pass"));
          } else {
            const pipCmd = process.platform === "win32" ? "pip" : "pip3";
            new Notice(
              `${t("settings.model.envCheck.fail")}\n${pipCmd} install sherpa-onnx websockets numpy`,
            );
          }
          btn.setButtonText(t("settings.model.envCheck.btn"));
          btn.setDisabled(false);
        }),
      );

    // 下载模型按钮
    new Setting(containerEl)
      .setName(t("settings.model.download.name"))
      .setDesc(t("settings.model.download.desc"))
      .addButton((btn) =>
        btn.setButtonText(t("settings.model.download.btn")).onClick(async () => {
          const modelDir = this.plugin.settings.modelDir;
          if (!modelDir) {
            new Notice(t("settings.model.download.noDir"));
            return;
          }
          btn.setButtonText(t("settings.model.download.downloading"));
          btn.setDisabled(true);
          new Notice(t("settings.model.download.start"));

          const pluginDir = this.getPluginDir();
          const { BackendManager } = await import("./services/BackendManager");
          const mgr = new BackendManager(pluginDir, this.plugin.settings);
          const ok = await mgr.downloadModel(modelDir);

          if (ok) {
            new Notice(t("settings.model.download.done"));
          } else {
            new Notice(t("settings.model.download.fail"));
          }
          btn.setButtonText(t("settings.model.download.btn"));
          btn.setDisabled(false);
        }),
      );
    } // end if (!isCloud)

    if (isCloud) {
      // ── 腾讯云 ASR 设置 ──
      containerEl.createEl("h2", { text: "腾讯云语音识别" });

      const tencentDesc = containerEl.createEl("p", {
        text: "前往腾讯云控制台开通「语音识别」服务，获取 AppID 和 API 密钥。",
      });
      tencentDesc.style.color = "var(--text-muted)";
      tencentDesc.style.fontSize = "0.85em";
      tencentDesc.style.marginTop = "-0.5em";

      new Setting(containerEl)
        .setName("AppID")
        .setDesc("腾讯云账号 AppID（在控制台首页可见）")
        .addText((text) =>
          text
            .setPlaceholder("125xxxxxxx")
            .setValue(this.plugin.settings.tencentASR.appId)
            .onChange(async (value) => {
              this.plugin.settings.tencentASR.appId = value.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("SecretID")
        .setDesc("API 密钥的 SecretID")
        .addText((text) => {
          text
            .setPlaceholder("AKIDxxxxxxxx")
            .setValue(this.plugin.settings.tencentASR.secretId)
            .onChange(async (value) => {
              this.plugin.settings.tencentASR.secretId = value.trim();
              await this.plugin.saveSettings();
            });
          text.inputEl.type = "password";
        });

      new Setting(containerEl)
        .setName("SecretKey")
        .setDesc("API 密钥的 SecretKey")
        .addText((text) => {
          text
            .setPlaceholder("xxxxxxxxxxxxxxxx")
            .setValue(this.plugin.settings.tencentASR.secretKey)
            .onChange(async (value) => {
              this.plugin.settings.tencentASR.secretKey = value.trim();
              await this.plugin.saveSettings();
            });
          text.inputEl.type = "password";
        });

      new Setting(containerEl)
        .setName("引擎模型")
        .setDesc("选择识别引擎，大模型精度更高但延迟略增")
        .addDropdown((dropdown) => {
          dropdown
            .addOption("16k_zh", "中文 (16k_zh)")
            .addOption("16k_zh_large", "中文大模型 (16k_zh_large)")
            .addOption("16k_en", "英文 (16k_en)")
            .addOption("16k_zh_en", "中英混合 (16k_zh_en)")
            .setValue(this.plugin.settings.tencentASR.engineModelType)
            .onChange(async (value) => {
              this.plugin.settings.tencentASR.engineModelType = value;
              await this.plugin.saveSettings();
            });
        });
    }

    // ── 翻译设置 ──
    containerEl.createEl("h2", { text: t("settings.translation.title") });

    new Setting(containerEl)
      .setName(t("settings.translation.enabled.name"))
      .setDesc(t("settings.translation.enabled.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.translation.enabled)
          .onChange(async (value) => {
            this.plugin.settings.translation.enabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.translation.apiUrl.name"))
      .setDesc(t("settings.translation.apiUrl.desc"))
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
      .setName(t("settings.translation.apiKey.name"))
      .setDesc(t("settings.translation.apiKey.desc"))
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
      .setName(t("settings.translation.model.name"))
      .setDesc(t("settings.translation.model.desc"))
      .addText((text) =>
        text
          .setPlaceholder("gpt-4o-mini")
          .setValue(this.plugin.settings.translation.model)
          .onChange(async (value) => {
            this.plugin.settings.translation.model = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    // ── 润色设置 ──
    containerEl.createEl("h2", { text: t("settings.formalize.title") });

    new Setting(containerEl)
      .setName(t("settings.formalize.apiUrl.name"))
      .setDesc(t("settings.formalize.apiUrl.desc"))
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com/v1/chat/completions")
          .setValue(this.plugin.settings.formalize.apiUrl)
          .onChange(async (value) => {
            this.plugin.settings.formalize.apiUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.formalize.apiKey.name"))
      .setDesc(t("settings.formalize.apiKey.desc"))
      .addText((text) => {
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.formalize.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.formalize.apiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      });

    new Setting(containerEl)
      .setName(t("settings.formalize.model.name"))
      .setDesc(t("settings.formalize.model.desc"))
      .addText((text) =>
        text
          .setPlaceholder("gpt-4o-mini")
          .setValue(this.plugin.settings.formalize.model)
          .onChange(async (value) => {
            this.plugin.settings.formalize.model = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    // ── AI 摘要设置 ──
    containerEl.createEl("h2", { text: t("settings.summary.title") });

    new Setting(containerEl)
      .setName(t("settings.summary.enabled.name"))
      .setDesc(t("settings.summary.enabled.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.summary.enabled)
          .onChange(async (value) => {
            this.plugin.settings.summary.enabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.summary.apiUrl.name"))
      .setDesc(t("settings.summary.apiUrl.desc"))
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
      .setName(t("settings.summary.apiKey.name"))
      .setDesc(t("settings.summary.apiKey.desc"))
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
      .setName(t("settings.summary.model.name"))
      .setDesc(t("settings.summary.model.desc"))
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
      .setName(t("settings.summary.threshold.name"))
      .setDesc(t("settings.summary.threshold.desc"))
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

    // ── 二次摘要设置 ──
    containerEl.createEl("h2", { text: t("settings.metaSummary.title") });

    new Setting(containerEl)
      .setName(t("settings.metaSummary.enabled.name"))
      .setDesc(t("settings.metaSummary.enabled.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.metaSummary.enabled)
          .onChange(async (value) => {
            this.plugin.settings.metaSummary.enabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.metaSummary.triggerCount.name"))
      .setDesc(t("settings.metaSummary.triggerCount.desc"))
      .addSlider((slider) =>
        slider
          .setLimits(2, 10, 1)
          .setValue(this.plugin.settings.metaSummary.triggerCount)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.metaSummary.triggerCount = value;
            await this.plugin.saveSettings();
          }),
      );

    // ── 导出设置 ──
    containerEl.createEl("h2", { text: t("settings.export.title") });

    new Setting(containerEl)
      .setName(t("settings.export.mode.name"))
      .setDesc(t("settings.export.mode.desc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("full", t("settings.export.mode.full"))
          .addOption("summaryOnly", t("settings.export.mode.summaryOnly"))
          .setValue(this.plugin.settings.exportMode)
          .onChange(async (value: ExportMode) => {
            this.plugin.settings.exportMode = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.export.titleMode.name"))
      .setDesc(t("settings.export.titleMode.desc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("timestamp", t("settings.export.titleMode.timestamp"))
          .addOption("ai", t("settings.export.titleMode.ai"))
          .addOption("manual", t("settings.export.titleMode.manual"))
          .setValue(this.plugin.settings.exportTitleMode ?? "timestamp")
          .onChange(async (value: ExportTitleMode) => {
            this.plugin.settings.exportTitleMode = value;
            await this.plugin.saveSettings();
          });
      });

    // ── 高级设置 ──
    containerEl.createEl("h2", { text: t("settings.advanced.title") });

    new Setting(containerEl)
      .setName(t("settings.advanced.profile.name"))
      .setDesc(t("settings.advanced.profile.desc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("stable", t("settings.advanced.profile.stable"))
          .addOption("fast", t("settings.advanced.profile.fast"))
          .setValue(this.plugin.settings.realtimeProfile)
          .onChange(async (value: RealtimeProfile) => {
            this.applyRealtimePreset(value);
            await this.plugin.saveSettings();
            new Notice(value === "stable"
              ? t("settings.advanced.profile.switchedStable")
              : t("settings.advanced.profile.switchedFast"));
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.advanced.realtimePreview.name"))
      .setDesc(t("settings.advanced.realtimePreview.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.aggregation.realtimePreview)
          .onChange(async (value) => {
            this.plugin.settings.aggregation.realtimePreview = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.advanced.vadSilence.name"))
      .setDesc(t("settings.advanced.vadSilence.desc"))
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
      .setName(t("settings.advanced.flushWindow.name"))
      .setDesc(t("settings.advanced.flushWindow.desc"))
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
      .setName(t("settings.advanced.maxChars.name"))
      .setDesc(t("settings.advanced.maxChars.desc"))
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

  private applyRealtimePreset(profile: RealtimeProfile): void {
    this.plugin.settings.realtimeProfile = profile;
    if (profile === "stable") {
      this.plugin.settings.vad.minSilenceDuration = 1.6;
      this.plugin.settings.aggregation.flushWindowSec = 6;
      this.plugin.settings.aggregation.maxChars = 520;
      this.plugin.settings.aggregation.realtimePreview = true;
      return;
    }

    this.plugin.settings.vad.minSilenceDuration = 0.9;
    this.plugin.settings.aggregation.flushWindowSec = 3;
    this.plugin.settings.aggregation.maxChars = 260;
    this.plugin.settings.aggregation.realtimePreview = true;
  }
}
