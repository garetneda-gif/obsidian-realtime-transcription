import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_TRANSCRIPTION } from "./constants";
import { TranscriptionView } from "./views/TranscriptionView";
import { BackendManager } from "./services/BackendManager";
import { WebSocketClient } from "./services/WebSocketClient";
import { AudioCapture } from "./services/AudioCapture";
import { TranslationService } from "./services/TranslationService";
import { SummaryService } from "./services/SummaryService";
import { TranscriptionSettingTab } from "./settings";
import { DEFAULT_SETTINGS, PluginSettings, TranscriptEntry, TranscriptionResult } from "./types";
import { resolvePluginDir } from "./utils/pluginPaths";

interface PendingTranscript {
  id: string;
  language: string;
  texts: string[];
  wallTime: Date;
  lastUpdatedAt: number;
}

export default class RealtimeTranscriptionPlugin extends Plugin {
  settings!: PluginSettings;
  private backendManager!: BackendManager;
  private wsClient!: WebSocketClient;
  private audioCapture!: AudioCapture;
  private translationService!: TranslationService;
  private summaryService!: SummaryService;
  private recording = false;
  private entryCounter = 0;
  private pendingTranscript: PendingTranscript | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private summaryBuffer = "";
  private summaryInFlight = false;
  private lastPartialText = "";
  private lastPartialLanguage = "zh";
  private lastPartialWallTime: Date | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    // 注册侧边栏视图
    this.registerView(VIEW_TYPE_TRANSCRIPTION, (leaf) => {
      const view = new TranscriptionView(leaf);
      view.onToggleRecording = () => this.toggleRecording();
      view.onToggleSummary = () => this.toggleSummary();
      view.onExport = () => this.exportToNote();
      view.onFormalize = (entryId, text) => this.formalizeEntry(entryId, text);
      return view;
    });

    // 添加 Ribbon 图标
    this.addRibbonIcon("microphone", "实时语音转写", () => {
      this.activateView();
    });

    // 注册命令
    this.addCommand({
      id: "open-transcription-panel",
      name: "打开实时语音转写面板",
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "toggle-recording",
      name: "开始/停止录制",
      callback: () => this.toggleRecording(),
    });

    // 初始化服务
    const pluginDir = resolvePluginDir(this.app, this.manifest);
    this.backendManager = new BackendManager(pluginDir, this.settings);
    this.wsClient = new WebSocketClient();
    this.audioCapture = new AudioCapture();
    this.translationService = new TranslationService(this.settings.translation);
    this.summaryService = new SummaryService(this.settings.summary);

    // WebSocket 结果回调
    this.wsClient.setOnResult((result) => this.handleTranscriptionResult(result));
    this.wsClient.setOnStatusChange((connected) => {
      const view = this.getView();
      if (view) {
        view.setConnectionStatus(connected);
      }
    });

    // 设置面板
    this.addSettingTab(new TranscriptionSettingTab(this.app, this));

    const view = this.getView();
    if (view) {
      this.syncViewControlStates(view);
    }
  }

  async onunload(): Promise<void> {
    await this.flushPendingTranscript();
    this.clearFlushTimer();
    this.audioCapture.stop();
    this.wsClient.disconnect();
    await this.backendManager.stop();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.backendManager?.updateSettings(this.settings);
    this.translationService?.updateSettings(this.settings.translation);
    this.summaryService?.updateSettings(this.settings.summary);
    const view = this.getView();
    if (view) {
      view.setSummaryState(this.settings.summary.enabled);
    }
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_TRANSCRIPTION);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: VIEW_TYPE_TRANSCRIPTION,
          active: true,
        });
        leaf = rightLeaf;
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
      const view = this.getView();
      if (view) {
        this.syncViewControlStates(view);
      }
    }
  }

  private getView(): TranscriptionView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TRANSCRIPTION);
    if (leaves.length > 0) {
      return leaves[0].view as TranscriptionView;
    }
    return null;
  }

  async toggleRecording(): Promise<void> {
    try {
      if (this.recording) {
        await this.stopRecording();
      } else {
        await this.startRecording();
      }
    } catch (err) {
      console.error("[Transcription] toggleRecording 错误:", err);
      new Notice(`录制出错: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async toggleSummary(): Promise<void> {
    this.settings.summary.enabled = !this.settings.summary.enabled;
    await this.saveSettings();

    if (!this.settings.summary.enabled) {
      this.summaryBuffer = "";
      new Notice("自动 AI 摘要已关闭");
      return;
    }

    new Notice("自动 AI 摘要已开启");
    void this.maybeRunSummary();
  }

  private async startRecording(): Promise<void> {
    console.log("[Transcription] startRecording 开始");

    const view = this.getView();
    if (!view) {
      await this.activateView();
    }

    const currentView = this.getView();
    if (!currentView) {
      new Notice("无法打开转写面板");
      return;
    }
    this.pendingTranscript = null;
    this.clearFlushTimer();
    this.lastPartialText = "";
    this.lastPartialLanguage = "zh";
    this.lastPartialWallTime = null;
    currentView.clearStreamingTranscript();

    // 1. 启动后端
    console.log("[Transcription] 正在启动后端...");
    currentView.setConnectionStatus(false, "启动后端...");
    const started = await this.backendManager.start();
    console.log("[Transcription] 后端启动结果:", started);
    if (!started) {
      currentView.setConnectionStatus(false, "后端启动失败");
      return;
    }

    // 2. 连接 WebSocket
    console.log("[Transcription] 正在连接 WebSocket...");
    currentView.setConnectionStatus(false, "连接中...");
    try {
      await this.wsClient.connect(this.settings.backendPort);
    } catch (err) {
      console.error("[Transcription] WebSocket 连接失败:", err);
      new Notice("无法连接到转写后端");
      return;
    }

    // 3. 重置 VAD 状态
    this.wsClient.sendCommand({ type: "reset" });

    // 4. 开始音频采集
    console.log("[Transcription] 正在启动麦克风...");
    try {
      await this.audioCapture.start((data) => {
        this.wsClient.sendAudio(data);
      });
    } catch (err) {
      console.error("[Transcription] 麦克风启动失败:", err);
      new Notice("无法访问麦克风，请检查权限设置");
      this.wsClient.disconnect();
      return;
    }

    this.recording = true;
    this.syncViewControlStates(currentView);
    currentView.setListeningStatus(true);
    new Notice("开始录制");
    console.log("[Transcription] 录制已开始");
  }

  private async stopRecording(): Promise<void> {
    this.audioCapture.stop();
    if (!this.pendingTranscript && this.lastPartialText.trim()) {
      this.entryCounter++;
      this.pendingTranscript = {
        id: `entry-${this.entryCounter}`,
        language: this.lastPartialLanguage,
        texts: [this.lastPartialText.trim()],
        wallTime: this.lastPartialWallTime ?? new Date(),
        lastUpdatedAt: Date.now(),
      };
    }
    await this.flushPendingTranscript();
    this.clearFlushTimer();
    this.recording = false;
    this.lastPartialText = "";
    this.lastPartialLanguage = "zh";
    this.lastPartialWallTime = null;

    const view = this.getView();
    if (view) {
      view.clearStreamingTranscript();
      this.syncViewControlStates(view);
      view.setConnectionStatus(this.wsClient.isConnected);
    }

    new Notice("录制已停止");
  }

  private async handleTranscriptionResult(result: TranscriptionResult): Promise<void> {
    const view = this.getView();
    if (!view) return;

    const text = result.text.trim();
    if (!text) return;
    const normalizedLanguage = this.normalizeLanguage(result.language, text);
    const resultType = result.type ?? "final";

    if (resultType === "partial") {
      // 关闭实时预览时忽略 partial 结果
      if (!this.settings.aggregation.realtimePreview) return;

      const now = new Date();
      this.lastPartialText = text;
      this.lastPartialLanguage = normalizedLanguage;
      this.lastPartialWallTime = now;
      if (!this.pendingTranscript) {
        this.entryCounter++;
        this.pendingTranscript = {
          id: `entry-${this.entryCounter}`,
          language: normalizedLanguage,
          texts: [text],
          wallTime: now,
          lastUpdatedAt: Date.now(),
        };
      } else {
        this.pendingTranscript.language = normalizedLanguage;
        this.pendingTranscript.wallTime = this.pendingTranscript.wallTime ?? now;
        this.pendingTranscript.lastUpdatedAt = Date.now();
      }
      view.upsertStreamingTranscript(
        this.pendingTranscript.id,
        text,
        normalizedLanguage,
        this.pendingTranscript.wallTime,
      );
      return;
    }

    this.lastPartialText = "";
    this.lastPartialLanguage = "zh";
    this.lastPartialWallTime = null;

    const now = Date.now();
    const flushWindowMs = Math.max(1, this.settings.aggregation.flushWindowSec) * 1000;
    const maxChars = Math.max(80, this.settings.aggregation.maxChars);

    if (!this.pendingTranscript) {
      this.entryCounter++;
      this.pendingTranscript = {
        id: `entry-${this.entryCounter}`,
        language: normalizedLanguage,
        texts: [text],
        wallTime: new Date(),
        lastUpdatedAt: now,
      };
      view.upsertStreamingTranscript(
        this.pendingTranscript.id,
        text,
        normalizedLanguage,
        this.pendingTranscript.wallTime,
      );
      this.scheduleFlush();
      return;
    }

    const pendingText = this.pendingTranscript.texts.join(" ");
    const mergedTextLength = pendingText.length + 1 + text.length;
    const canMerge =
      this.pendingTranscript.language === normalizedLanguage &&
      now - this.pendingTranscript.lastUpdatedAt <= flushWindowMs &&
      mergedTextLength <= maxChars;

    if (!canMerge) {
      await this.flushPendingTranscript();
      this.entryCounter++;
      this.pendingTranscript = {
        id: `entry-${this.entryCounter}`,
        language: normalizedLanguage,
        texts: [text],
        wallTime: new Date(),
        lastUpdatedAt: now,
      };
      view.upsertStreamingTranscript(
        this.pendingTranscript.id,
        text,
        normalizedLanguage,
        this.pendingTranscript.wallTime,
      );
      this.scheduleFlush();
      return;
    }

    this.pendingTranscript.texts.push(text);
    this.pendingTranscript.lastUpdatedAt = now;
    view.upsertStreamingTranscript(
      this.pendingTranscript.id,
      this.pendingTranscript.texts.join(" ").trim(),
      this.pendingTranscript.language,
      this.pendingTranscript.wallTime,
    );
    this.scheduleFlush();
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private scheduleFlush(): void {
    this.clearFlushTimer();
    const delayMs = Math.max(1, this.settings.aggregation.flushWindowSec) * 1000;
    this.flushTimer = setTimeout(() => {
      void this.flushPendingTranscript();
    }, delayMs);
  }

  private async flushPendingTranscript(): Promise<void> {
    const pending = this.pendingTranscript;
    if (!pending) return;

    this.pendingTranscript = null;
    this.clearFlushTimer();

    const mergedText = pending.texts.join(" ").trim();
    if (!mergedText) return;

    const view = this.getView();
    if (!view) {
      this.pendingTranscript = {
        id: pending.id,
        language: pending.language,
        texts: [mergedText],
        wallTime: pending.wallTime,
        lastUpdatedAt: Date.now(),
      };
      this.scheduleFlush();
      return;
    }

    const entry: TranscriptEntry = {
      id: pending.id,
      result: {
        text: mergedText,
        language: pending.language,
        timestamps: { start: 0, duration: 0 },
      },
      translation: null,
      formalText: null,
      wallTime: pending.wallTime,
    };

    view.commitStreamingTranscript(entry);
    this.enqueueSummaryText(entry.result.text, entry.wallTime);

    if (this.translationService.shouldTranslate(entry.result.language)) {
      try {
        const translation = await this.translationService.translate(
          entry.result.text,
          entry.result.language,
        );
        entry.translation = translation;
        view.updateTranslation(entry.id, translation);
      } catch (err) {
        console.error("翻译失败:", err);
        const detail = err instanceof Error && err.message ? err.message : "未知错误";
        view.updateTranslation(entry.id, `[翻译失败] ${detail}`);
      }
    }
  }

  private normalizeLanguage(rawLanguage: string, text: string): string {
    const language = (rawLanguage || "zh").toLowerCase();
    if (language === "yue") return "yue";

    const hanCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
    const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;
    const kanaCount = (text.match(/[\u3040-\u30ff]/g) ?? []).length;
    const hangulCount = (text.match(/[\uac00-\ud7af]/g) ?? []).length;

    if (kanaCount > 0) return "ja";
    if (hangulCount > 0) return "ko";

    // 中文主导且仅包含少量英文术语，保留中文标签，避免误触发翻译
    if (hanCount > 0 && latinCount <= Math.max(3, Math.floor(hanCount * 0.25))) {
      return "zh";
    }

    if (language === "en") {
      if (hanCount > 0 && latinCount < Math.max(6, Math.floor(hanCount * 0.6))) {
        return "zh";
      }
      return "en";
    }

    if (language === "ja" || language === "ko") {
      return language;
    }

    if (language === "zh") return "zh";
    if (latinCount >= 6 && latinCount >= Math.floor(hanCount * 0.6)) return "en";
    if (hanCount > 0) return "zh";

    return language || "zh";
  }

  private syncViewControlStates(view: TranscriptionView): void {
    view.setRecordingState(this.recording);
    view.setSummaryState(this.settings.summary.enabled);
  }

  private enqueueSummaryText(text: string, wallTime: Date): void {
    if (!this.settings.summary.enabled) return;
    if (!this.summaryService.isConfigured()) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    this.summaryBuffer = this.summaryBuffer
      ? `${this.summaryBuffer}\n${trimmed}`
      : trimmed;

    const threshold = Math.max(500, this.settings.summary.thresholdChars);
    if (this.summaryBuffer.length >= threshold) {
      void this.maybeRunSummary(wallTime);
    }
  }

  private async maybeRunSummary(wallTime: Date = new Date()): Promise<void> {
    if (!this.settings.summary.enabled) return;
    if (!this.summaryService.isConfigured()) return;
    if (this.summaryInFlight) return;

    const threshold = Math.max(500, this.settings.summary.thresholdChars);
    if (this.summaryBuffer.trim().length < threshold) return;

    const source = this.summaryBuffer.trim();
    this.summaryBuffer = "";
    this.summaryInFlight = true;

    try {
      const summaryText = await this.summaryService.summarize(source);
      const sourceChars = source.length;
      this.entryCounter++;
      const view = this.getView();
      if (!view) {
        this.summaryBuffer = source;
        return;
      }

      const entry: TranscriptEntry = {
        id: `entry-${this.entryCounter}`,
        result: {
          text: `来源文本约 ${sourceChars} 字\n${summaryText}`,
          language: "summary",
          timestamps: { start: 0, duration: 0 },
        },
        translation: null,
        formalText: null,
        wallTime,
      };
      view.addTranscript(entry);
    } catch (err) {
      console.error("AI 摘要失败:", err);
      const detail = err instanceof Error && err.message ? err.message : "未知错误";
      new Notice(`AI 摘要失败: ${detail}`);
      this.summaryBuffer = source;
    } finally {
      this.summaryInFlight = false;
    }

    if (this.summaryBuffer.trim().length >= threshold) {
      void this.maybeRunSummary(new Date());
    }
  }

  private async formalizeEntry(entryId: string, text: string): Promise<string> {
    if (!this.translationService.canFormalize()) {
      throw new Error("请先在设置中配置翻译 API");
    }
    const result = await this.translationService.formalize(text);
    const view = this.getView();
    if (view) {
      view.updateFormalText(entryId, result);
    }
    return result;
  }

  private async exportToNote(): Promise<void> {
    const view = this.getView();
    if (!view) return;

    const entries = view.getEntries();
    if (entries.length === 0) {
      new Notice("没有可导出的转写记录");
      return;
    }

    // 生成 Markdown 内容
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

    let md = `# 语音转写记录 ${dateStr} ${timeStr}\n\n`;

    for (const entry of entries) {
      const time = this.formatTime(entry.wallTime);
      const lang = entry.result.language.toUpperCase();
      md += `**[${time}]** \`${lang}\`\n`;
      md += `${entry.result.text}\n`;
      if (entry.formalText) {
        md += `> **润色**: ${entry.formalText}\n`;
      }
      if (entry.translation) {
        md += `> ${entry.translation}\n`;
      }
      md += `\n`;
    }

    // 创建笔记文件
    const fileName = `语音转写-${dateStr}-${timeStr}.md`;
    try {
      await this.app.vault.create(fileName, md);
      new Notice(`已导出到: ${fileName}`);
      // 打开新笔记
      const file = this.app.vault.getAbstractFileByPath(fileName);
      if (file) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file as import("obsidian").TFile);
      }
    } catch {
      new Notice("导出失败，文件可能已存在");
    }
  }

  private formatTime(date: Date): string {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
}
