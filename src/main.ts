import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_TRANSCRIPTION } from "./constants";
import { TranscriptionView } from "./views/TranscriptionView";
import { BackendManager } from "./services/BackendManager";
import { WebSocketClient } from "./services/WebSocketClient";
import { AudioCapture } from "./services/AudioCapture";
import { TranslationService } from "./services/TranslationService";
import { SummaryService } from "./services/SummaryService";
import { FormalizeService } from "./services/FormalizeService";
import { TranscriptionSettingTab } from "./settings";
import { DEFAULT_SETTINGS, PluginSettings, TranscriptEntry, TranscriptionResult, SerializedTranscriptEntry } from "./types";
import { resolvePluginDir } from "./utils/pluginPaths";
import { serializeEntry, deserializeEntry } from "./utils/entrySerializer";
import { TitleInputModal } from "./views/TitleInputModal";

interface PendingTranscript {
  id: string;
  language: string;
  texts: string[];
  wallTime: Date;
  lastUpdatedAt: number;
  partialOnly: boolean;
}

export default class RealtimeTranscriptionPlugin extends Plugin {
  settings!: PluginSettings;
  private backendManager!: BackendManager;
  private wsClient!: WebSocketClient;
  private audioCapture!: AudioCapture;
  private translationService!: TranslationService;
  private summaryService!: SummaryService;
  private formalizeService!: FormalizeService;
  private recording = false;
  private entryCounter = 0;
  private pendingTranscript: PendingTranscript | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private summaryBuffer = "";
  private summaryInFlight = false;
  private lastPartialText = "";
  private lastStablePartialText = "";
  private renderedPartialText = "";
  private rollbackCandidateText = "";
  private rollbackCandidateCount = 0;
  private rollbackCandidateAt = 0;
  private lastPartialLanguage = "zh";
  private lastPartialWallTime: Date | null = null;
  private transcriptEntries: TranscriptEntry[] = [];
  private saveEntriesTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly ENTRIES_FILE = "transcript-entries.json";

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.loadEntries();

    // 注册侧边栏视图
    this.registerView(VIEW_TYPE_TRANSCRIPTION, (leaf) => {
      const view = new TranscriptionView(leaf);
      this.bindViewCallbacks(view);
      return view;
    });

    await this.refreshLegacyTranscriptionViews();

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
    this.formalizeService = new FormalizeService(this.settings.formalize);

    // WebSocket 结果回调
    this.wsClient.setOnResult((result) => this.handleTranscriptionResult(result));
    this.wsClient.setOnStatusChange((connected) => {
      const view = this.getView();
      if (view) {
        if (connected && this.recording) {
          view.setListeningStatus(true);
        } else {
          view.setConnectionStatus(connected);
        }
      }
    });
    this.wsClient.setOnReconnecting((attempt) => {
      const view = this.getView();
      if (view) {
        view.setConnectionStatus(false, `重连中... (${attempt})`);
      }
    });

    // 设置面板
    this.addSettingTab(new TranscriptionSettingTab(this.app, this));

    const view = this.getView();
    if (view) {
      this.bindViewCallbacks(view);
      this.syncViewControlStates(view);
      view.restoreEntries(this.transcriptEntries);
    }
  }

  async onunload(): Promise<void> {
    await this.flushPendingTranscript();
    this.clearFlushTimer();
    if (this.saveEntriesTimer) {
      clearTimeout(this.saveEntriesTimer);
    }
    await this.saveEntriesToDisk();
    this.audioCapture.stop();
    this.wsClient.disconnect();
    await this.backendManager.stop();
  }

  async loadSettings(): Promise<void> {
    const raw = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);

    // 兼容旧配置：未拆分润色接口前，沿用翻译配置作为润色默认值
    const hasFormalizeConfig = Boolean(
      raw &&
      typeof raw === "object" &&
      Object.prototype.hasOwnProperty.call(raw as Record<string, unknown>, "formalize"),
    );
    if (!hasFormalizeConfig) {
      this.settings.formalize = {
        apiUrl: this.settings.translation.apiUrl,
        apiKey: this.settings.translation.apiKey,
        model: this.settings.translation.model,
      };
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.backendManager?.updateSettings(this.settings);
    this.translationService?.updateSettings(this.settings.translation);
    this.summaryService?.updateSettings(this.settings.summary);
    this.formalizeService?.updateSettings(this.settings.formalize);
    const view = this.getView();
    if (view) {
      view.setDisplayMode(this.settings.summary.displayMode);
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
        this.bindViewCallbacks(view);
        this.syncViewControlStates(view);
        view.restoreEntries(this.transcriptEntries);
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

  async toggleDisplayMode(): Promise<void> {
    this.settings.summary.displayMode =
      this.settings.summary.displayMode === "both" ? "summaryOnly" : "both";
    await this.saveSettings();

    const label = this.settings.summary.displayMode === "summaryOnly"
      ? "仅显示摘要"
      : "摘要 + 转录";
    new Notice(`显示模式: ${label}`);
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
    this.lastStablePartialText = "";
    this.renderedPartialText = "";
    this.resetRollbackCandidate();
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
      await this.connectBackendWithRetry(this.backendManager.activePort || this.settings.backendPort);
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
    const fallbackPartial =
      this.lastStablePartialText.trim() ||
      this.renderedPartialText.trim() ||
      this.lastPartialText.trim();
    if (!this.pendingTranscript && fallbackPartial) {
      this.entryCounter++;
      this.pendingTranscript = {
        id: `entry-${this.entryCounter}`,
        language: this.lastPartialLanguage,
        texts: [fallbackPartial],
        wallTime: this.lastPartialWallTime ?? new Date(),
        lastUpdatedAt: Date.now(),
        partialOnly: false,
      };
    }
    await this.flushPendingTranscript();
    this.clearFlushTimer();
    this.recording = false;
    this.lastPartialText = "";
    this.lastStablePartialText = "";
    this.renderedPartialText = "";
    this.resetRollbackCandidate();
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
    console.log(`[Transcription] recv ${resultType}: lang=${normalizedLanguage} "${text.slice(0, 60)}"`);

    if (resultType === "partial") {
      // 关闭实时预览时忽略 partial 结果
      if (!this.settings.aggregation.realtimePreview) {
        console.log("[Transcription] ✗ realtimePreview 已关闭，丢弃 partial");
        return;
      }

      const now = new Date();
      const stabilizedText = this.stabilizePartialText(text);
      this.lastPartialText = text;
      this.lastPartialLanguage = normalizedLanguage;
      this.lastPartialWallTime = now;
      if (!stabilizedText) {
        console.log(`[Transcription] ✗ stabilize 拒绝: prev="${this.renderedPartialText}" cur="${text}"`);
        return;
      }
      if (stabilizedText === this.renderedPartialText) {
        console.log("[Transcription] ✗ 与上次相同，跳过");
        return;
      }
      this.renderedPartialText = stabilizedText;
      this.lastStablePartialText = stabilizedText;
      if (!this.pendingTranscript) {
        this.entryCounter++;
        this.pendingTranscript = {
          id: `entry-${this.entryCounter}`,
          language: normalizedLanguage,
          texts: [stabilizedText],
          wallTime: now,
          lastUpdatedAt: Date.now(),
          partialOnly: true,
        };
      } else if (this.pendingTranscript.partialOnly) {
        // 同一 VAD 段的后续 partial：覆盖而非追加
        if (this.pendingTranscript.texts[0] === stabilizedText) return;
        this.pendingTranscript.texts = [stabilizedText];
        this.pendingTranscript.language = normalizedLanguage;
        this.pendingTranscript.lastUpdatedAt = Date.now();
      } else {
        this.pendingTranscript.language = normalizedLanguage;
        this.pendingTranscript.wallTime = this.pendingTranscript.wallTime ?? now;
        this.pendingTranscript.lastUpdatedAt = Date.now();
      }
      console.log(`[Transcription] ✓ partial → upsert id=${this.pendingTranscript.id} "${stabilizedText}"`);
      view.upsertStreamingTranscript(
        this.pendingTranscript.id,
        stabilizedText,
        normalizedLanguage,
        this.pendingTranscript.wallTime,
      );
      return;
    }

    this.lastPartialText = "";
    this.lastStablePartialText = "";
    this.renderedPartialText = "";
    this.resetRollbackCandidate();
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
        partialOnly: false,
      };
      console.log(`[Transcription] ✓ final(new) → upsert id=${this.pendingTranscript.id} "${text.slice(0, 40)}"`);
      view.upsertStreamingTranscript(
        this.pendingTranscript.id,
        text,
        normalizedLanguage,
        this.pendingTranscript.wallTime,
      );
      this.scheduleFlush();
      return;
    }

    // partial 创建的 pending：final 覆盖 partial 文本（同一段音频）
    if (this.pendingTranscript.partialOnly) {
      this.pendingTranscript.texts = [text];
      this.pendingTranscript.language = normalizedLanguage;
      this.pendingTranscript.lastUpdatedAt = now;
      this.pendingTranscript.partialOnly = false;
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
        partialOnly: false,
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

    // partialOnly 的 pending 由 timer flush 时，final 从未来过，
    // renderedPartialText 残留旧值，会导致下一段 partial 被 stabilize 全部拒绝
    if (pending.partialOnly) {
      this.renderedPartialText = "";
      this.lastStablePartialText = "";
      this.lastPartialText = "";
      this.resetRollbackCandidate();
    }

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
        partialOnly: false,
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
    this.addEntry(entry);
    this.enqueueSummaryText(entry.result.text, entry.wallTime);

    if (this.translationService.shouldTranslate(entry.result.language)) {
      try {
        const translation = await this.translationService.translate(
          entry.result.text,
          entry.result.language,
        );
        entry.translation = translation;
        view.updateTranslation(entry.id, translation);
        this.updateEntry(entry.id, { translation });
      } catch (err) {
        console.error("翻译失败:", err);
        const detail = err instanceof Error && err.message ? err.message : "未知错误";
        view.updateTranslation(entry.id, `[翻译失败] ${detail}`);
      }
    }
  }

  private normalizeLanguage(rawLanguage: string, text: string): string {
    const mode = this.settings.recognitionMode ?? "zh-en";
    if (mode === "zh") return "zh";
    if (mode === "en") return "en";

    const language = (rawLanguage || "zh").toLowerCase();

    const hanCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
    const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;

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

    // 无汉字且英文字母足够多 → 修正模型将纯英文误标为中文的情况
    if (hanCount === 0 && latinCount >= 6) return "en";
    if (language === "zh") return "zh";
    if (latinCount >= 6 && latinCount >= Math.floor(hanCount * 0.6)) return "en";
    if (hanCount > 0) return "zh";

    return "zh";
  }

  private stabilizePartialText(currentRaw: string): string | null {
    const current = currentRaw.replace(/\s+/g, " ").trim();
    if (!current) return null;

    const profile = this.settings.realtimeProfile ?? "stable";
    const previousDisplay = this.renderedPartialText.trim();
    const hanCount = (current.match(/[\u3400-\u9fff]/g) ?? []).length;
    const latinCount = (current.match(/[A-Za-z]/g) ?? []).length;
    const minLen = hanCount > 0
      ? profile === "fast" ? 3 : 4
      : latinCount > 0
        ? profile === "fast" ? 6 : 8
        : profile === "fast" ? 5 : 6;
    const endsSentence = /[。！？.!?]$/.test(current);

    if (!previousDisplay) {
      this.resetRollbackCandidate();
      // 首个 partial 降低门槛（2 字即显示），避免用户长时间看不到任何内容
      if (current.length >= 2 || endsSentence) return current;
      return null;
    }

    if (current === previousDisplay) return null;

    const lcp = this.longestCommonPrefixLength(previousDisplay, current);

    // 最稳定情况：只在尾部增长，立即放行，保证低延迟。
    if (current.startsWith(previousDisplay)) {
      this.resetRollbackCandidate();
      const grew = current.length - previousDisplay.length;
      if (grew >= 1 || endsSentence) return current;
      return null;
    }

    // 允许受控回滚：只在短回滚且高前缀一致时，并采用“候选二次确认”。
    if (current.length < previousDisplay.length) {
      const shrink = previousDisplay.length - current.length;
      const maxRollback = hanCount > 0
        ? (profile === "fast" ? 8 : 6)
        : (profile === "fast" ? 14 : 12);
      const prefixNeed = Math.max(
        4,
        Math.floor(previousDisplay.length * (profile === "fast" ? 0.62 : 0.72)),
      );
      if (lcp < prefixNeed || shrink > maxRollback) {
        this.resetRollbackCandidate();
        return null;
      }
      if (!this.shouldAcceptRollbackCandidate(current, endsSentence, shrink, profile)) {
        return null;
      }
      return current;
    }

    // 同长改写：句尾时允许一次修正，否则容易抖动。
    if (current.length === previousDisplay.length) {
      const sameLenAnchor = Math.max(
        4,
        Math.floor(previousDisplay.length * (profile === "fast" ? 0.65 : 0.75)),
      );
      if (endsSentence && lcp >= sameLenAnchor) {
        this.resetRollbackCandidate();
        return current;
      }
      return null;
    }

    // 增长但带改写：保护前缀，仅允许在尾部窗口内修正。
    this.resetRollbackCandidate();
    const revisionWindow = hanCount > 0
      ? (profile === "fast" ? 12 : 8)
      : (profile === "fast" ? 18 : 14);
    const protectedPrefix = Math.max(3, previousDisplay.length - revisionWindow);
    if (lcp < protectedPrefix && !endsSentence) {
      return null;
    }

    if (!endsSentence && current.length < minLen) return null;
    return current;
  }

  private longestCommonPrefixLength(a: string, b: string): number {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) {
      i += 1;
    }
    return i;
  }

  private shouldAcceptRollbackCandidate(
    candidate: string,
    endsSentence: boolean,
    shrink: number,
    profile: "stable" | "fast",
  ): boolean {
    // 极小回滚（常见错尾修正）立即放行。
    if (shrink <= (profile === "fast" ? 3 : 2)) {
      this.resetRollbackCandidate();
      return true;
    }

    const now = Date.now();
    if (this.rollbackCandidateText === candidate && now - this.rollbackCandidateAt <= 1800) {
      this.rollbackCandidateCount += 1;
      this.rollbackCandidateAt = now;
    } else {
      this.rollbackCandidateText = candidate;
      this.rollbackCandidateCount = 1;
      this.rollbackCandidateAt = now;
    }

    // 句尾优先一次确认，其它情况需要连续两次命中才回滚。
    if (endsSentence) {
      this.resetRollbackCandidate();
      return true;
    }
    const confirmHits = profile === "fast" ? 1 : 2;
    if (this.rollbackCandidateCount >= confirmHits) {
      this.resetRollbackCandidate();
      return true;
    }
    return false;
  }

  private resetRollbackCandidate(): void {
    this.rollbackCandidateText = "";
    this.rollbackCandidateCount = 0;
    this.rollbackCandidateAt = 0;
  }

  private async connectBackendWithRetry(port: number): Promise<void> {
    const maxAttempts = 4;
    let lastError: unknown = null;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.wsClient.connect(port);
        return;
      } catch (err) {
        lastError = err;
        if (i === maxAttempts - 1) break;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("WebSocket 连接失败");
  }

  private syncViewControlStates(view: TranscriptionView): void {
    view.setRecordingState(this.recording);
    view.setDisplayMode(this.settings.summary.displayMode);
  }

  private bindViewCallbacks(view: TranscriptionView): void {
    view.onToggleRecording = () => this.toggleRecording();
    view.onToggleDisplayMode = () => this.toggleDisplayMode();
    view.onExport = () => this.exportToNote();
    view.onFormalize = (entryId, text) => this.formalizeEntry(entryId, text);
    view.onClearTranscripts = () => this.clearEntries();
  }

  private async refreshLegacyTranscriptionViews(): Promise<void> {
    const leaves = [...this.app.workspace.getLeavesOfType(VIEW_TYPE_TRANSCRIPTION)];
    if (leaves.length === 0) return;

    for (const leaf of leaves) {
      if (leaf.view instanceof TranscriptionView) continue;
      const wasActive = this.app.workspace.getMostRecentLeaf() === leaf;
      leaf.detach();
      const targetLeaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(false);
      if (!targetLeaf) continue;
      await targetLeaf.setViewState({
        type: VIEW_TYPE_TRANSCRIPTION,
        active: wasActive,
      });
      if (wasActive) {
        this.app.workspace.revealLeaf(targetLeaf);
      }
    }
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
      this.entryCounter++;
      const view = this.getView();
      if (!view) {
        this.summaryBuffer = source;
        return;
      }

      const entry: TranscriptEntry = {
        id: `entry-${this.entryCounter}`,
        result: {
          text: summaryText,
          language: "summary",
          timestamps: { start: 0, duration: 0 },
        },
        translation: null,
        formalText: null,
        wallTime,
      };
      view.addTranscript(entry);
      this.addEntry(entry);
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
    if (!this.formalizeService.canFormalize()) {
      throw new Error("请先在设置中配置润色 API");
    }
    const result = await this.formalizeService.formalize(text);
    const view = this.getView();
    if (view) {
      view.updateFormalText(entryId, result);
    }
    this.updateEntry(entryId, { formalText: result });
    return result;
  }

  private async exportToNote(): Promise<void> {
    const view = this.getView();
    if (!view) return;

    const allEntries = view.getEntries();
    const entries = this.settings.exportMode === "summaryOnly"
      ? allEntries.filter((e) => e.result.language === "summary")
      : allEntries;
    if (entries.length === 0) {
      new Notice(
        this.settings.exportMode === "summaryOnly"
          ? "没有可导出的摘要记录"
          : "没有可导出的转写记录",
      );
      return;
    }

    // 生成时间戳（默认值和 fallback）
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const timestampTitle = `语音转写-${dateStr}-${timeStr}`;

    // 根据 exportTitleMode 决定文件名
    let title: string;
    const mode = this.settings.exportTitleMode ?? "timestamp";

    switch (mode) {
      case "manual": {
        const modal = new TitleInputModal(this.app, timestampTitle);
        const userInput = await modal.waitForInput();
        if (userInput === null) return;
        title = this.sanitizeFileName(userInput) || timestampTitle;
        break;
      }
      case "ai": {
        if (!this.summaryService.isConfigured()) {
          new Notice("AI 命名需要先配置摘要 API");
          title = timestampTitle;
          break;
        }
        try {
          new Notice("正在生成标题...");
          const contentSnippet = entries
            .map((e) => e.result.text)
            .join("\n")
            .slice(0, 2000);
          const aiTitle = await this.summaryService.generateTitle(contentSnippet);
          title = this.sanitizeFileName(aiTitle) || timestampTitle;
        } catch (err) {
          console.error("[Transcription] AI 命名失败:", err);
          new Notice("AI 命名失败，使用时间戳命名");
          title = timestampTitle;
        }
        break;
      }
      case "timestamp":
      default:
        title = timestampTitle;
        break;
    }

    // 生成 Markdown 内容
    let md = `# ${title}\n\n`;

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
    const fileName = `${title}.md`;
    try {
      await this.app.vault.create(fileName, md);
      new Notice(`已导出到: ${fileName}`);
      const file = this.app.vault.getAbstractFileByPath(fileName);
      if (file) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file as import("obsidian").TFile);
      }
    } catch {
      new Notice("导出失败，文件可能已存在");
    }
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);
  }

  // ── entries 持久化 ──

  private getEntriesFilePath(): string {
    const dir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    return `${dir}/${this.ENTRIES_FILE}`;
  }

  private async loadEntries(): Promise<void> {
    const path = this.getEntriesFilePath();
    try {
      const exists = await this.app.vault.adapter.exists(path);
      if (!exists) {
        this.transcriptEntries = [];
        return;
      }
      const raw = await this.app.vault.adapter.read(path);
      const parsed: SerializedTranscriptEntry[] = JSON.parse(raw);
      this.transcriptEntries = parsed.map(deserializeEntry);
      // 恢复 entryCounter 以避免 ID 冲突
      for (const e of this.transcriptEntries) {
        const num = parseInt(e.id.replace("entry-", ""), 10);
        if (!isNaN(num) && num > this.entryCounter) {
          this.entryCounter = num;
        }
      }
    } catch (err) {
      console.error("[Transcription] 加载历史记录失败:", err);
      this.transcriptEntries = [];
    }
  }

  private debouncedSaveEntries(): void {
    if (this.saveEntriesTimer) {
      clearTimeout(this.saveEntriesTimer);
    }
    this.saveEntriesTimer = setTimeout(() => {
      void this.saveEntriesToDisk();
    }, 1000);
  }

  private async saveEntriesToDisk(): Promise<void> {
    const path = this.getEntriesFilePath();
    try {
      const serialized = this.transcriptEntries.map(serializeEntry);
      await this.app.vault.adapter.write(path, JSON.stringify(serialized));
    } catch (err) {
      console.error("[Transcription] 保存历史记录失败:", err);
    }
  }

  private addEntry(entry: TranscriptEntry): void {
    const idx = this.transcriptEntries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) {
      this.transcriptEntries[idx] = entry;
    } else {
      this.transcriptEntries.push(entry);
    }
    this.debouncedSaveEntries();
  }

  private updateEntry(entryId: string, updates: Partial<Pick<TranscriptEntry, "translation" | "formalText">>): void {
    const entry = this.transcriptEntries.find((e) => e.id === entryId);
    if (entry) {
      Object.assign(entry, updates);
      this.debouncedSaveEntries();
    }
  }

  private async clearEntries(): Promise<void> {
    this.transcriptEntries = [];
    const path = this.getEntriesFilePath();
    try {
      const exists = await this.app.vault.adapter.exists(path);
      if (exists) {
        await this.app.vault.adapter.remove(path);
      }
    } catch (err) {
      console.error("[Transcription] 删除历史记录失败:", err);
    }
  }

  private formatTime(date: Date): string {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
}
