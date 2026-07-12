import { App, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type RealtimeTranscriptionPlugin from "./main";
import { resolvePluginDir } from "./utils/pluginPaths";
import type { RealtimeProfile, RecognitionMode, ExportMode, ExportTitleMode, ExportTextMode, GpuProvider, AsrProvider, CopyContentMode, CopyRangeMode, AiBackendProvider, AiBackendProfileRole, AiBackendProfileSettings, CloudLanguage, CloudProviderPreference } from "./types";
import { DEFAULT_SETTINGS, HOSTED_CLOUD_ENABLED, isHostedCloud, normalizeAiBackendSettings } from "./types";
import { t, setLocale } from "./i18n";
import { CloudAuthService } from "./services/CloudAuthService";
import { getDefaultAiBackendModelOptions, isAiBackendCliPathCompatible } from "./services/AgentBackendService";
import { CloudLoginCaptchaModal } from "./views/CloudLoginCaptchaModal";

type SettingsSection = "general" | "recognition" | "ai" | "output";

interface SettingsSectionConfig {
  id: SettingsSection;
  icon: string;
  label: string;
}

export class TranscriptionSettingTab extends PluginSettingTab {
  plugin: RealtimeTranscriptionPlugin;
  private activeSettingsSection: SettingsSection = "recognition";
  private cleanupHeaderScroll: (() => void) | null = null;
  private aiBackendTestRunning: Partial<Record<AiBackendProfileRole, boolean>> = {};

  constructor(app: App, plugin: RealtimeTranscriptionPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private getPluginDir(): string {
    return resolvePluginDir(this.app, this.plugin.manifest);
  }

  display(): void {
    this.cleanupHeaderScroll?.();
    this.cleanupHeaderScroll = null;
    this.plugin.settings.aiBackend = normalizeAiBackendSettings(this.plugin.settings.aiBackend);

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
          .onChange(async (value) => {
            const locale = value as "zh" | "en";
            this.plugin.settings.locale = locale;
            setLocale(locale);
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.feedback.name"))
      .setDesc(t("settings.feedback.desc"))
      .addButton((btn) =>
        btn.setButtonText(t("settings.feedback.bug")).onClick(() => {
          this.openExternalUrl("https://github.com/garetneda-gif/obsidian-realtime-transcription/issues/new?labels=bug&title=%5BBug%5D%20");
        }),
      )
      .addButton((btn) =>
        btn.setButtonText(t("settings.feedback.feature")).onClick(() => {
          this.openExternalUrl("https://github.com/garetneda-gif/obsidian-realtime-transcription/issues/new?labels=enhancement&title=%5BFeature%5D%20");
        }),
      );

    // ── ASR 引擎选择 ──
    containerEl.createEl("h2", { text: t("settings.asr.title") });

    new Setting(containerEl)
      .setName(t("settings.asr.provider.name"))
      .setDesc(t("settings.asr.provider.desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("local", t("settings.asr.provider.local"));
        if (HOSTED_CLOUD_ENABLED) {
          dropdown.addOption("cloud", t("settings.asr.provider.cloud"));
        }
        dropdown
          .setValue(this.plugin.settings.asrProvider)
          .onChange(async (value) => {
            this.plugin.settings.asrProvider = value as AsrProvider;
            this.display();
            await this.plugin.saveSettings();
          });
      });

    const provider = this.plugin.settings.asrProvider;

    if (provider === "local") {
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
          .onChange(async (value) => {
            this.plugin.settings.recognitionMode = value as RecognitionMode;
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
          .onChange(async (value) => {
            this.plugin.settings.gpuProvider = value as GpuProvider;
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
    } // end if (provider === "local")

    if (provider === "tencent") {
      // ── 腾讯云 BYOK 设置 ──
      containerEl.createEl("h2", { text: t("settings.tencent.title") });

      containerEl.createEl("p", {
        cls: "realtime-settings-note",
        text: t("settings.tencent.desc"),
      });

      new Setting(containerEl)
        .setName(t("settings.tencent.appId.name"))
        .setDesc(t("settings.tencent.appId.desc"))
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
        .setName(t("settings.tencent.secretId.name"))
        .setDesc(t("settings.tencent.secretId.desc"))
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
        .setName(t("settings.tencent.secretKey.name"))
        .setDesc(t("settings.tencent.secretKey.desc"))
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
        .setName(t("settings.tencent.engine.name"))
        .setDesc(t("settings.tencent.engine.desc"))
        .addDropdown((dropdown) => {
          dropdown
            .addOption("16k_zh", t("settings.tencent.engine.zh"))
            .addOption("16k_zh_large", t("settings.tencent.engine.zhLarge"))
            .addOption("16k_en", t("settings.tencent.engine.en"))
            .addOption("16k_zh_en", t("settings.tencent.engine.zhEn"))
            .setValue(this.plugin.settings.tencentASR.engineModelType)
            .onChange(async (value) => {
              this.plugin.settings.tencentASR.engineModelType = value;
              await this.plugin.saveSettings();
            });
        });
    }

    if (HOSTED_CLOUD_ENABLED && isHostedCloud(provider)) {
      // ── 云端付费账户设置 ──
      containerEl.createEl("h2", { text: t("settings.cloud.title") });

      const cloudAuth = this.plugin.settings.cloudAuth;
      const isLoggedIn = Boolean(cloudAuth.token && cloudAuth.serverUrl);

      new Setting(containerEl)
        .setName(t("settings.cloud.accountCenter.name"))
        .setDesc(t("settings.cloud.accountCenter.desc"))
        .addButton((btn) =>
          btn.setButtonText(t("settings.cloud.accountCenter.btn")).setCta().onClick(() => {
            try {
              this.ensureCloudServerUrl();
              const svc = this.createCloudAuthService();
              this.openExternalUrl(svc.getAccountCenterUrl());
            } catch (e) {
              new Notice(this.errorMessage(e));
            }
          }),
        );

      new Setting(containerEl)
        .setName(t("settings.cloud.provider.name"))
        .setDesc(t("settings.cloud.provider.desc"))
        .addDropdown((dropdown) => {
          dropdown.selectEl.setAttribute("aria-label", t("settings.cloud.provider.name"));
          dropdown
            .addOption("auto", t("settings.cloud.provider.auto"))
            .addOption("tencent", t("settings.cloud.provider.tencent"))
            .addOption("deepgram", t("settings.cloud.provider.deepgram"))
            .setValue(this.plugin.settings.cloudProvider)
            .onChange(async (value) => {
              this.plugin.settings.cloudProvider = value as CloudProviderPreference;
              await this.plugin.saveSettings();
            });
        })
        .addDropdown((dropdown) => {
          dropdown.selectEl.setAttribute("aria-label", t("settings.cloud.language.name"));
          dropdown
            .addOption("auto", t("settings.cloud.language.auto"))
            .addOption("zh-CN", t("settings.cloud.language.zhCN"))
            .addOption("zh-HK", t("settings.cloud.language.zhHK"))
            .addOption("en", t("settings.cloud.language.en"))
            .addOption("ja", t("settings.cloud.language.ja"))
            .addOption("ko", t("settings.cloud.language.ko"))
            .setValue(this.plugin.settings.cloudLanguage)
            .onChange(async (value) => {
              this.plugin.settings.cloudLanguage = value as CloudLanguage;
              await this.plugin.saveSettings();
            });
        });

      if (isLoggedIn) {
        const balanceYuan = (cloudAuth.balanceCents / 100).toFixed(2);
        new Setting(containerEl)
          .setName(t("settings.cloud.account.name"))
          .setDesc(`${t("settings.cloud.balance")}: ¥${balanceYuan}`)
          .addButton((btn) =>
            btn.setButtonText(t("settings.cloud.refreshBalance.btn")).onClick(async () => {
              try {
                btn.setDisabled(true);
                btn.setButtonText(t("settings.cloud.refreshBalance.loading"));
                const svc = this.createCloudAuthService();
                await svc.getAccount();
                await this.plugin.saveSettings();
                new Notice(t("settings.cloud.balanceRefreshed"));
                this.display();
              } catch (e) {
                new Notice(`${t("settings.cloud.refreshBalance.failed")}: ${this.errorMessage(e)}`);
              } finally {
                btn.setDisabled(false);
                btn.setButtonText(t("settings.cloud.refreshBalance.btn"));
              }
            }),
          )
          .addButton((btn) =>
            btn.setButtonText(t("settings.cloud.logout.btn")).onClick(async () => {
              const svc = this.createCloudAuthService();
              svc.logout();
              await this.plugin.saveSettings();
              this.display();
            }),
          );
      } else {
        let emailValue = "";
        let passwordValue = "";

        new Setting(containerEl)
          .setName(t("settings.cloud.email"))
          .addText((text) => {
            text.setPlaceholder("user@example.com").onChange((v) => { emailValue = v.trim(); });
          });

        new Setting(containerEl)
          .setName(t("settings.cloud.password"))
          .addText((text) => {
            text.inputEl.type = "password";
            text.setPlaceholder("********").onChange((v) => { passwordValue = v; });
          });

        new Setting(containerEl)
          .addButton((btn) =>
            btn.setButtonText(t("settings.cloud.login.btn")).setCta().onClick(async () => {
              try {
                this.ensureCloudServerUrl();
                btn.setDisabled(true);
                const svc = this.createCloudAuthService();
                const captcha = await new CloudLoginCaptchaModal(this.app, svc).waitForAnswer();
                if (!captcha) return;
                await svc.login(emailValue, passwordValue, captcha.captchaId, captcha.answer);
                await svc.getAccount();
                await this.plugin.saveSettings();
                new Notice(t("settings.cloud.loginSuccess"));
                this.display();
              } catch (e) {
                new Notice(`${t("settings.cloud.loginFailed")}: ${this.errorMessage(e)}`);
              } finally {
                btn.setDisabled(false);
              }
            }),
          )
          .addButton((btn) =>
            btn.setButtonText(t("settings.cloud.register.btn")).onClick(async () => {
              try {
                this.ensureCloudServerUrl();
                const svc = this.createCloudAuthService();
                this.openExternalUrl(`${svc.getAccountCenterUrl()}?auth=register`);
              } catch (e) {
                new Notice(`${t("settings.cloud.registerFailed")}: ${this.errorMessage(e)}`);
              }
            }),
          );
      }

    }

    containerEl.createEl("h2", { text: t("settings.aiBackend.title") });
    this.renderAiBackendProfileSettings(containerEl, "fast");
    this.renderAiBackendProfileSettings(containerEl, "smart");

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
          .onChange(async (value) => {
            this.plugin.settings.exportMode = value as ExportMode;
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
          .onChange(async (value) => {
            this.plugin.settings.exportTitleMode = value as ExportTitleMode;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.export.textMode.name"))
      .setDesc(t("settings.export.textMode.desc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("original", t("settings.export.textMode.original"))
          .addOption("formalized", t("settings.export.textMode.formalized"))
          .setValue(this.plugin.settings.exportTextMode ?? DEFAULT_SETTINGS.exportTextMode)
          .onChange(async (value) => {
            this.plugin.settings.exportTextMode = value as ExportTextMode;
            await this.plugin.saveSettings();
          });
      });

    containerEl.createEl("h2", { text: t("settings.copyHandoff.title") });

    new Setting(containerEl)
      .setName(t("settings.copy.content.name"))
      .setDesc(t("settings.copy.content.desc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("full", t("settings.copy.content.full"))
          .addOption("summaryOnly", t("settings.copy.content.summaryOnly"))
          .setValue(this.plugin.settings.copyContentMode ?? DEFAULT_SETTINGS.copyContentMode)
          .onChange(async (value) => {
            this.plugin.settings.copyContentMode = value as CopyContentMode;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.copy.range.name"))
      .setDesc(t("settings.copy.range.desc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("all", t("settings.copy.range.all"))
          .addOption("latest", t("settings.copy.range.latest"))
          .setValue(this.plugin.settings.copyRangeMode ?? DEFAULT_SETTINGS.copyRangeMode)
          .onChange(async (value) => {
            this.plugin.settings.copyRangeMode = value as CopyRangeMode;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.claudian.prompt.name"))
      .setDesc(t("settings.claudian.prompt.desc"))
      .addTextArea((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.claudianPrompt)
          .setValue(this.plugin.settings.claudianPrompt ?? DEFAULT_SETTINGS.claudianPrompt)
          .onChange(async (value) => {
            this.plugin.settings.claudianPrompt = value.trim() || DEFAULT_SETTINGS.claudianPrompt;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 3;
        text.inputEl.addClass("realtime-transcription-claudian-prompt");
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
          .onChange(async (value) => {
            const profile = value as RealtimeProfile;
            this.applyRealtimePreset(profile);
            await this.plugin.saveSettings();
            new Notice(profile === "stable"
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

    this.enhanceSettingsLayout(containerEl);
  }

  private enhanceSettingsLayout(containerEl: HTMLElement): void {
    const originalNodes = Array.from(containerEl.childNodes);
    const sections = this.buildSectionContainers();
    const titleSections = this.buildTitleSectionMap();
    let currentSection: SettingsSection = "general";

    for (const node of originalNodes) {
      if (node instanceof HTMLElement && node.tagName === "H2") {
        currentSection = titleSections.get(node.textContent?.trim() ?? "") ?? currentSection;
      }
      sections.get(currentSection)?.appendChild(node);
    }

    if (!sections.get(this.activeSettingsSection)?.hasChildNodes()) {
      this.activeSettingsSection = "general";
    }

    const scrollEl = this.findScrollParent(this.containerEl);
    const compactHeader = scrollEl.scrollTop > 4;

    containerEl.empty();
    containerEl.addClass("realtime-settings-root");

    const header = document.createElement("div");
    header.addClass("realtime-settings-header");
    if (compactHeader) header.addClass("is-compact");
    containerEl.appendChild(header);
    const headerIcon = header.createDiv("realtime-settings-header-icon");
    setIcon(headerIcon, "mic");
    const headerText = header.createDiv("realtime-settings-header-text");
    const titleRow = headerText.createDiv("realtime-settings-title-row");
    titleRow.createEl("span", { cls: "realtime-settings-title", text: "Realtime-Transcription" });
    titleRow.createEl("span", { cls: "realtime-settings-version", text: `v${this.plugin.manifest.version}` });

    const layout = containerEl.createDiv("realtime-settings-layout");
    const nav = layout.createDiv("realtime-settings-nav");
    const content = layout.createDiv("realtime-settings-content");

    const configs = this.getSectionConfigs();
    this.renderSectionNav(nav, configs);

    const activeContent = sections.get(this.activeSettingsSection);
    if (activeContent) content.appendChild(activeContent);

    this.bindHeaderCollapse(header, scrollEl);
  }

  private bindHeaderCollapse(header: HTMLElement, scrollEl = this.findScrollParent(this.containerEl)): void {
    const update = () => {
      header.classList.toggle("is-compact", scrollEl.scrollTop > 4);
    };

    update();
    scrollEl.addEventListener("scroll", update, { passive: true });
    this.cleanupHeaderScroll = () => scrollEl.removeEventListener("scroll", update);
  }

  private findScrollParent(start: HTMLElement): HTMLElement {
    let el: HTMLElement | null = start;
    while (el) {
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`) && el.scrollHeight > el.clientHeight) {
        return el;
      }
      el = el.parentElement;
    }
    return start;
  }

  private buildSectionContainers(): Map<SettingsSection, HTMLElement> {
    const sections = new Map<SettingsSection, HTMLElement>();
    for (const config of this.getSectionConfigs()) {
      const sectionEl = document.createElement("div");
      sectionEl.addClass("realtime-settings-section");
      sectionEl.setAttr("data-section", config.id);
      sections.set(config.id, sectionEl);
    }
    return sections;
  }

  private buildTitleSectionMap(): Map<string, SettingsSection> {
    return new Map<string, SettingsSection>([
      [t("settings.asr.title"), "recognition"],
      [t("settings.backend.title"), "recognition"],
      [t("settings.model.title"), "recognition"],
      [t("settings.tencent.title"), "recognition"],
      [t("settings.cloud.title"), "recognition"],
      [t("settings.aiBackend.title"), "ai"],
      [t("settings.translation.title"), "ai"],
      [t("settings.formalize.title"), "ai"],
      [t("settings.summary.title"), "ai"],
      [t("settings.metaSummary.title"), "ai"],
      [t("settings.export.title"), "output"],
      [t("settings.copyHandoff.title"), "output"],
      [t("settings.advanced.title"), "general"],
    ]);
  }

  private getSectionConfigs(): SettingsSectionConfig[] {
    return [
      { id: "general", icon: "sliders-horizontal", label: t("settings.nav.general") },
      { id: "recognition", icon: "radio-tower", label: t("settings.nav.recognition") },
      { id: "ai", icon: "sparkles", label: t("settings.nav.ai") },
      { id: "output", icon: "send", label: t("settings.nav.output") },
    ];
  }

  private renderSectionNav(nav: HTMLElement, configs: SettingsSectionConfig[]): void {
    for (const config of configs) {
      const button = nav.createEl("button", {
        cls: `realtime-settings-nav-item${this.activeSettingsSection === config.id ? " is-active" : ""}`,
        attr: { type: "button", "aria-label": config.label },
      });
      const iconEl = button.createSpan("realtime-settings-nav-icon");
      setIcon(iconEl, config.icon);
      button.createSpan({ cls: "realtime-settings-nav-label", text: config.label });
      button.addEventListener("click", () => {
        this.activeSettingsSection = config.id;
        this.display();
      });
    }
  }

  private renderAiBackendProfileSettings(containerEl: HTMLElement, role: AiBackendProfileRole): void {
    const profile = this.plugin.settings.aiBackend[role];
    const header = containerEl.createDiv("realtime-ai-profile-header");
    header.createSpan({
      text: t(`settings.aiBackend.${role}.title`),
      cls: "realtime-ai-profile-title",
    });
    header.createDiv({
      text: t(`settings.aiBackend.${role}.desc`),
      cls: "realtime-ai-profile-desc",
    });

    new Setting(containerEl)
      .setName(t("settings.aiBackend.provider.name"))
      .setDesc(t("settings.aiBackend.provider.desc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("openai-compatible", t("settings.aiBackend.provider.openai"))
          .addOption("claude", t("settings.aiBackend.provider.claude"))
          .addOption("codex", t("settings.aiBackend.provider.codex"))
          .addOption("opencode", t("settings.aiBackend.provider.opencode"))
          .setValue(profile.provider)
          .onChange(async (value) => {
            const provider = value as AiBackendProvider;
            profile.provider = provider;
            if (provider !== "openai-compatible") {
              const detected = this.plugin.detectAiBackendCliPath(provider, role);
              const compatible = isAiBackendCliPathCompatible(profile);
              if (!compatible && detected) {
                profile.cliPath = detected;
              } else if (!profile.cliPath.trim() && detected) {
                profile.cliPath = detected;
              } else if (!compatible) {
                profile.cliPath = "";
              }
            }
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (profile.provider === "openai-compatible") {
      this.renderAiBackendApiSettings(containerEl, profile);
    } else {
      this.renderAiBackendCliSettings(containerEl, role, profile);
    }

    new Setting(containerEl)
      .setName(t("settings.aiBackend.test.name"))
      .setDesc(t("settings.aiBackend.test.desc"))
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.aiBackend.test.button"))
          .onClick(async () => {
            if (this.aiBackendTestRunning[role]) return;
            try {
              this.aiBackendTestRunning[role] = true;
              btn.setDisabled(true);
              btn.setButtonText(t("settings.aiBackend.test.testing"));
              const result = await this.plugin.testAiBackendConnection(role);
              new Notice(`${t(`settings.aiBackend.${role}.title`)} ${t("settings.aiBackend.test.success")}: ${result}`);
            } catch (e) {
              new Notice(`${t(`settings.aiBackend.${role}.title`)} ${t("settings.aiBackend.test.failed")}: ${this.errorMessage(e)}`);
            } finally {
              this.aiBackendTestRunning[role] = false;
              btn.setDisabled(false);
              btn.setButtonText(t("settings.aiBackend.test.button"));
            }
          }),
      );
  }

  private renderAiBackendApiSettings(containerEl: HTMLElement, profile: AiBackendProfileSettings): void {
    new Setting(containerEl)
      .setName(t("settings.aiBackend.apiUrl.name"))
      .setDesc(t("settings.aiBackend.apiUrl.desc"))
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com/v1/chat/completions")
          .setValue(profile.apiUrl)
          .onChange(async (value) => {
            profile.apiUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.aiBackend.apiKey.name"))
      .setDesc(t("settings.aiBackend.apiKey.desc"))
      .addText((text) => {
        text
          .setPlaceholder("sk-...")
          .setValue(profile.apiKey)
          .onChange(async (value) => {
            profile.apiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      });

    new Setting(containerEl)
      .setName(t("settings.aiBackend.model.name"))
      .setDesc(t("settings.aiBackend.model.apiDesc"))
      .addText((text) =>
        text
          .setPlaceholder("gpt-4o-mini")
          .setValue(profile.model)
          .onChange(async (value) => {
            profile.model = value.trim();
            await this.plugin.saveSettings();
          }),
      );
  }

  private renderAiBackendCliSettings(
    containerEl: HTMLElement,
    role: AiBackendProfileRole,
    profile: AiBackendProfileSettings,
  ): void {
    new Setting(containerEl)
      .setName(t("settings.aiBackend.cliPath.name"))
      .setDesc(t("settings.aiBackend.cliPath.desc"))
      .addText((text) =>
        text
          .setPlaceholder(this.defaultAiBackendCommand(profile.provider))
          .setValue(profile.cliPath)
          .onChange(async (value) => {
            profile.cliPath = value.trim();
            await this.plugin.saveSettings();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText(t("settings.aiBackend.cliPath.detect")).onClick(async () => {
          const detected = this.plugin.detectAiBackendCliPath(profile.provider, role);
          if (!detected) {
            new Notice(t("settings.aiBackend.cliPath.notFound"));
            return;
          }
          profile.cliPath = detected;
          await this.plugin.saveSettings();
          new Notice(`${t("settings.aiBackend.cliPath.detected")}: ${detected}`);
          this.display();
        }),
      );

    this.renderAiBackendCliModelSetting(containerEl, profile);

    new Setting(containerEl)
      .setName(t("settings.aiBackend.timeout.name"))
      .setDesc(t("settings.aiBackend.timeout.desc"))
      .addSlider((slider) =>
        slider
          .setLimits(10, 300, 5)
          .setValue(profile.timeoutSec)
          .setDynamicTooltip()
          .onChange(async (value) => {
            profile.timeoutSec = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.aiBackend.extraArgs.name"))
      .setDesc(t("settings.aiBackend.extraArgs.desc"))
      .addText((text) =>
        text
          .setPlaceholder(t("settings.aiBackend.extraArgs.placeholder"))
          .setValue(profile.extraArgs)
          .onChange(async (value) => {
            profile.extraArgs = value.trim();
            await this.plugin.saveSettings();
          }),
      );
  }

  private renderAiBackendCliModelSetting(containerEl: HTMLElement, profile: AiBackendProfileSettings): void {
    const customValue = "__custom__";
    const currentModel = profile.model.trim();
    const options = uniqueStrings(getDefaultAiBackendModelOptions(profile.provider));
    const isCustomModel = !currentModel || !options.includes(currentModel);

    const setting = new Setting(containerEl)
      .setName(t("settings.aiBackend.model.name"))
      .setDesc(t("settings.aiBackend.model.desc"));

    setting.addDropdown((dropdown) => {
      for (const option of options) {
        dropdown.addOption(option, option);
      }
      dropdown.addOption(customValue, t("settings.aiBackend.model.custom"));
      dropdown.setValue(isCustomModel ? customValue : currentModel).onChange(async (value) => {
        profile.model = value === customValue ? "" : value.trim();
        await this.plugin.saveSettings();
        this.display();
      });
    });

    if (isCustomModel) {
      setting.addText((text) =>
        text
          .setPlaceholder(t("settings.aiBackend.model.placeholder"))
          .setValue(profile.model)
          .onChange(async (value) => {
            profile.model = value.trim();
            await this.plugin.saveSettings();
          }),
      );
    }
  }

  private createCloudAuthService(): CloudAuthService {
    const svc = new CloudAuthService(this.plugin.settings.cloudAuth);
    svc.setOnSettingsChanged((settings) => {
      this.plugin.settings.cloudAuth = { ...settings };
    });
    return svc;
  }

  private defaultAiBackendCommand(provider: AiBackendProvider): string {
    switch (provider) {
      case "claude":
        return "claude";
      case "codex":
        return "codex";
      case "opencode":
        return "opencode";
      case "openai-compatible":
      default:
        return "";
    }
  }

  private openExternalUrl(url: string): void {
    window.open(url, "_blank", "noopener");
  }

  private ensureCloudServerUrl(): void {
    const serverUrl = CloudAuthService.normalizeServerUrl(DEFAULT_SETTINGS.cloudAuth.serverUrl);
    if (!serverUrl) throw new Error(t("settings.cloud.serverRequired"));
    this.plugin.settings.cloudAuth.serverUrl = serverUrl;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
