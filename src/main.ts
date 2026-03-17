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
import { t, setLocale } from "./i18n";

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
  private flushSeq = 0;
  private committedPartialTexts: string[] = [];
  private summaryBuffer = "";
  private summaryInFlight = false;
  private metaSummaryTexts: string[] = [];
  private metaSummaryInFlight = false;
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
    this.addRibbonIcon("microphone", t("ribbon.tooltip"), () => {
      this.activateView();
    });

    // 注册命令
    this.addCommand({
      id: "open-transcription-panel",
      name: t("command.openPanel"),
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "toggle-recording",
      name: t("command.toggleRecording"),
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
        view.setConnectionStatus(false, `${t("status.reconnecting")} (${attempt})`);
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
    setLocale(this.settings.locale ?? "zh");

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
      new Notice(`${t("notice.recordingError")}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async toggleDisplayMode(): Promise<void> {
    this.settings.summary.displayMode =
      this.settings.summary.displayMode === "both" ? "summaryOnly" : "both";
    await this.saveSettings();

    const label = this.settings.summary.displayMode === "summaryOnly"
      ? t("notice.displayModeSummaryOnly")
      : t("notice.displayModeBoth");
    new Notice(`${t("notice.displayModeLabel")}: ${label}`);
  }

  private async startRecording(): Promise<void> {
    console.log("[Transcription] startRecording 开始");

    const view = this.getView();
    if (!view) {
      await this.activateView();
    }

    const currentView = this.getView();
    if (!currentView) {
      new Notice(t("notice.cannotOpenPanel"));
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
    this.committedPartialTexts = [];
    currentView.clearStreamingTranscript();

    // 1. 启动后端
    console.log("[Transcription] 正在启动后端...");
    currentView.setConnectionStatus(false, t("status.startingBackend"));
    const started = await this.backendManager.start();
    console.log("[Transcription] 后端启动结果:", started);
    if (!started) {
      currentView.setConnectionStatus(false, t("status.backendStartFailed"));
      return;
    }

    // 2. 连接 WebSocket
    console.log("[Transcription] 正在连接 WebSocket...");
    currentView.setConnectionStatus(false, t("status.connecting"));
    try {
      await this.connectBackendWithRetry(this.backendManager.activePort || this.settings.backendPort);
    } catch (err) {
      console.error("[Transcription] WebSocket 连接失败:", err);
      new Notice(t("notice.cannotConnectBackend"));
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
      new Notice(t("notice.micPermission"));
      this.wsClient.disconnect();
      return;
    }

    this.recording = true;
    this.syncViewControlStates(currentView);
    currentView.setListeningStatus(true);
    new Notice(t("notice.recordingStarted"));
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
    this.wsClient.disconnect();
    await this.backendManager.stop();
    this.recording = false;
    this.lastPartialText = "";
    this.lastStablePartialText = "";
    this.renderedPartialText = "";
    this.resetRollbackCandidate();
    this.lastPartialLanguage = "zh";
    this.lastPartialWallTime = null;
    this.committedPartialTexts = [];

    const view = this.getView();
    if (view) {
      view.clearStreamingTranscript();
      this.syncViewControlStates(view);
      view.setConnectionStatus(false);
    }

    new Notice(t("notice.recordingStopped"));
  }

  private async handleTranscriptionResult(result: TranscriptionResult): Promise<void> {
    const view = this.getView();
    if (!view) return;

    let text = result.text.trim();
    if (!text) return;
    const normalizedLanguage = this.normalizeLanguage(result.language, text);
    const resultType = result.type ?? "final";
    console.log(`[Transcription] recv ${resultType}: lang=${normalizedLanguage} "${text.slice(0, 60)}"`);

    // 前端文本去重：将同一 VAD 段内所有已 flush 的 partial 拼接，与新文本做重叠匹配
    if (this.committedPartialTexts.length > 0) {
      const committedJoined = this.committedPartialTexts.join("").replace(/\s+/g, "");
      const textNorm = text.replace(/\s+/g, "");
      if (textNorm.length > 0 && committedJoined.length > 0) {
        let overlapLen = 0;
        for (let k = 1; k <= committedJoined.length; k++) {
          if (textNorm.startsWith(committedJoined.slice(0, k))) overlapLen = k;
        }
        if (overlapLen >= committedJoined.length * 0.5) {
          const newNorm = textNorm.slice(overlapLen);
          if (!newNorm || newNorm.length < 2) {
            console.log(`[Transcription] ✗ ${resultType} 与已提交文本重复，跳过`);
            if (resultType === "final") {
              this.lastPartialText = "";
              this.lastStablePartialText = "";
              this.renderedPartialText = "";
              this.resetRollbackCandidate();
              this.lastPartialLanguage = "zh";
              this.lastPartialWallTime = null;
              this.committedPartialTexts = [];
            }
            return;
          }
          // 从原始 text 中定位重叠边界，保留空格格式
          let cutIdx = 0;
          let normIdx = 0;
          for (let ci = 0; ci < text.length && normIdx < overlapLen; ci++) {
            if (/\s/.test(text[ci])) continue;
            normIdx++;
            cutIdx = ci + 1;
          }
          text = text.slice(cutIdx).trim();
          if (!text) { this.committedPartialTexts = []; return; }
          console.log(`[Transcription] dedup: trimmed overlap, remaining="${text.slice(0, 60)}"`);
          this.committedPartialTexts = [];
        } else if (overlapLen < 3 && textNorm.length >= 4) {
          this.committedPartialTexts = [];
        }
      }
    }

    if (resultType === "partial") {
      const showStreaming = this.settings.aggregation.realtimePreview;

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
      let isNewPending = false;
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
        isNewPending = true;
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
      if (showStreaming) {
        console.log(`[Transcription] ✓ partial → upsert id=${this.pendingTranscript.id} "${stabilizedText}"`);
        view.upsertStreamingTranscript(
          this.pendingTranscript.id,
          stabilizedText,
          normalizedLanguage,
          this.pendingTranscript.wallTime,
        );
      } else {
        // realtimePreview 关闭：静默累积，仅在新建 pending 时启动定时器（不重置）
        console.log(`[Transcription] ✓ partial(静默) → pending id=${this.pendingTranscript.id} "${stabilizedText}"`);
        if (isNewPending) {
          this.scheduleFlush();
        }
      }
      return;
    }

    this.lastPartialText = "";
    this.lastStablePartialText = "";
    this.renderedPartialText = "";
    this.resetRollbackCandidate();
    this.lastPartialLanguage = "zh";
    this.lastPartialWallTime = null;
    this.committedPartialTexts = []; // final 意味着后端缓冲区已清空

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
      // 通知后端清空 realtime_buffer，带序列号过滤竞态中的过时 partial
      this.flushSeq++;
      this.wsClient.sendCommand({ type: "flush_partial", seq: this.flushSeq });
    }

    const mergedText = pending.texts.join(" ").trim();
    if (!mergedText) return;

    // 保存已提交的 partial 文本，用于前端去重（追加到数组，跟踪同一 VAD 段内所有 flush）
    if (pending.partialOnly) {
      this.committedPartialTexts.push(mergedText);
    }

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
    // 英文内容显著多于中文 → 即使模型标为中文也修正（防止混合文本误标）
    if (latinCount >= 6 && latinCount >= Math.floor(hanCount * 0.6)) return "en";
    if (language === "zh") return "zh";
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

      // 二次摘要：累积摘要文本
      this.enqueueMetaSummary(summaryText, wallTime);
    } catch (err) {
      console.error("AI 摘要失败:", err);
      const detail = err instanceof Error && err.message ? err.message : "未知错误";
      new Notice(`${t("notice.summaryFailed")}: ${detail}`);
      this.summaryBuffer = source;
      return;
    } finally {
      this.summaryInFlight = false;
    }

    if (this.summaryBuffer.trim().length >= threshold) {
      void this.maybeRunSummary(new Date());
    }
  }

  private enqueueMetaSummary(summaryText: string, wallTime: Date): void {
    if (!this.settings.metaSummary.enabled) return;
    if (!this.summaryService.isConfigured()) return;

    this.metaSummaryTexts.push(summaryText);
    const triggerCount = Math.max(2, this.settings.metaSummary.triggerCount);
    if (this.metaSummaryTexts.length >= triggerCount) {
      void this.maybeRunMetaSummary(wallTime);
    }
  }

  private async maybeRunMetaSummary(wallTime: Date = new Date()): Promise<void> {
    if (this.metaSummaryInFlight) return;
    if (this.metaSummaryTexts.length < 2) return;

    const texts = [...this.metaSummaryTexts];
    this.metaSummaryTexts = [];
    this.metaSummaryInFlight = true;

    try {
      const metaText = await this.summaryService.metaSummarize(texts);
      this.entryCounter++;
      const view = this.getView();
      if (!view) {
        this.metaSummaryTexts.push(...texts);
        return;
      }

      const entry: TranscriptEntry = {
        id: `entry-${this.entryCounter}`,
        result: {
          text: metaText,
          language: "meta-summary",
          timestamps: { start: 0, duration: 0 },
        },
        translation: null,
        formalText: null,
        wallTime,
      };
      view.addTranscript(entry);
      this.addEntry(entry);
    } catch (err) {
      console.error("二次摘要失败:", err);
      const detail = err instanceof Error && err.message ? err.message : "未知错误";
      new Notice(`${t("notice.metaSummaryFailed")}: ${detail}`);
      this.metaSummaryTexts.push(...texts);
    } finally {
      this.metaSummaryInFlight = false;
    }
  }

  private async formalizeEntry(entryId: string, text: string): Promise<string> {
    if (!this.formalizeService.canFormalize()) {
      throw new Error(t("notice.configureFormalizeApi"));
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
          ? t("notice.noSummaryToExport")
          : t("notice.noTranscriptToExport"),
      );
      return;
    }

    // 生成时间戳（默认值和 fallback）
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const timestampTitle = `${t("export.prefix")}${dateStr}-${timeStr}`;

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
          new Notice(t("notice.aiNamingNeedConfig"));
          title = timestampTitle;
          break;
        }
        try {
          new Notice(t("notice.generatingTitle"));
          const contentSnippet = entries
            .map((e) => e.result.text)
            .join("\n")
            .slice(0, 2000);
          const aiTitle = await this.summaryService.generateTitle(contentSnippet);
          title = this.sanitizeFileName(aiTitle) || timestampTitle;
        } catch (err) {
          console.error("[Transcription] AI 命名失败:", err);
          new Notice(t("notice.aiNamingFailed"));
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
        md += `> **${t("export.formalLabel")}**: ${entry.formalText}\n`;
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
      new Notice(`${t("notice.exportedTo")}: ${fileName}`);
      const file = this.app.vault.getAbstractFileByPath(fileName);
      if (file) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file as import("obsidian").TFile);
      }
    } catch {
      new Notice(t("notice.exportFailed"));
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
