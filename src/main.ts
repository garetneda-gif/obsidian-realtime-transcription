import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_TRANSCRIPTION } from "./constants";
import { TranscriptionView } from "./views/TranscriptionView";
import { BackendManager } from "./services/BackendManager";
import { WebSocketClient } from "./services/WebSocketClient";
import { TencentASRClient } from "./services/TencentASRClient";
import { AudioCapture } from "./services/AudioCapture";
import { TranslationService } from "./services/TranslationService";
import { SummaryService } from "./services/SummaryService";
import { FormalizeService } from "./services/FormalizeService";
import { TranscriptionSettingTab } from "./settings";
import { DEFAULT_SETTINGS, isCloudASR, isHostedCloud } from "./types";
import type { AiOutputLanguage, PanelSettingsValues, PluginSettings, SerializedTranscriptEntry, TranscriptEntry, TranscriptionResult } from "./types";
import { CloudAuthService } from "./services/CloudAuthService";
import { resolvePluginDir } from "./utils/pluginPaths";
import { serializeEntry, deserializeEntry } from "./utils/entrySerializer";
import { formatTranscriptEntriesAsMarkdown } from "./utils/transcriptFormatter";
import {
  buildClaudianContextMarkdown,
  CLAUDIAN_CONTEXT_FILE,
  CLAUDIAN_CONTEXT_FOLDER,
} from "./utils/claudianContext";
import { executeObsidianCommand } from "./utils/obsidianCommands";
import {
  comparableLength,
  comparableStartsWith,
  longestComparablePrefixLength,
  shouldResetNoisyPartial,
} from "./utils/partialStability";
import { isStalePartialResult, trimCommittedPrefix } from "./utils/transcriptDedup";
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
  private tencentClient: TencentASRClient | null = null;
  private cloudAuthService: CloudAuthService | null = null;
  private activeSignRequestId: string | null = null;
  private recordingStartTime: number = 0;
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
  private transcriptSessionVersion = 0;
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
    this.cloudAuthService = new CloudAuthService(this.settings.cloudAuth);
    this.cloudAuthService.setOnSettingsChanged((newSettings) => {
      this.settings.cloudAuth = newSettings;
      this.saveData(this.settings);
    });

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
    this.tencentClient?.disconnect();
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

    // 兼容旧配置：asrProvider / tencentASR 不存在时使用默认值
    if (!this.settings.asrProvider) {
      this.settings.asrProvider = "local";
    }
    // 深合并 tencentASR（应对部分保存的情况，确保所有字段都有默认值）
    this.settings.tencentASR = { ...DEFAULT_SETTINGS.tencentASR, ...this.settings.tencentASR };
    // 深合并 cloudAuth
    this.settings.cloudAuth = { ...DEFAULT_SETTINGS.cloudAuth, ...this.settings.cloudAuth };
    if (!["auto", "zh", "en"].includes(this.settings.aiOutputLanguage)) {
      this.settings.aiOutputLanguage = DEFAULT_SETTINGS.aiOutputLanguage;
    }
    this.settings.transcriptFontSize = clampFontSize(this.settings.transcriptFontSize);
    if (typeof this.settings.autoFormalize !== "boolean") {
      this.settings.autoFormalize = DEFAULT_SETTINGS.autoFormalize;
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    setLocale(this.settings.locale ?? "zh");
    this.backendManager?.updateSettings(this.settings);
    this.translationService?.updateSettings(this.settings.translation);
    this.summaryService?.updateSettings(this.settings.summary);
    this.formalizeService?.updateSettings(this.settings.formalize);
    this.tencentClient?.updateSettings(this.settings.tencentASR);
    this.cloudAuthService?.updateSettings(this.settings.cloudAuth);
    const view = this.getView();
    if (view) {
      view.setDisplayMode(this.settings.summary.displayMode);
      view.setPanelSettings(this.getPanelSettingsValues());
      view.refreshLocale();
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

    const provider = this.settings.asrProvider;

    if (isHostedCloud(provider)) {
      // [CLOUD 付费] 签名委托模式：服务端签名，客户端直连腾讯云
      console.log("[Transcription] 云端付费模式（签名委托）");
      currentView.setConnectionStatus(false, t("status.connecting"));

      if (!this.cloudAuthService || !this.cloudAuthService.isLoggedIn) {
        new Notice(t("notice.cloudLoginRequired"));
        currentView.setConnectionStatus(false);
        return;
      }

      this.ensureTencentClient();
      if (this.tencentClient!.isConnected) {
        this.tencentClient!.disconnect();
      }

      try {
        const engineModel = this.settings.tencentASR.engineModelType || "16k_zh";
        const signResult = await this.cloudAuthService.getSignedUrl(engineModel);
        this.activeSignRequestId = signResult.sign_request_id;
        this.recordingStartTime = Date.now();
        await this.tencentClient!.connectWithSignedUrl(signResult.signed_url);
      } catch (err) {
        console.error("[Transcription] 云端付费连接失败:", err);
        this.tencentClient?.disconnect();
        new Notice(`${t("notice.cannotConnectBackend")}: ${err instanceof Error ? err.message : String(err)}`);
        currentView.setConnectionStatus(false, t("status.backendStartFailed"));
        return;
      }
    } else if (isCloudASR(provider)) {
      // [TENCENT BYOK] 腾讯云自带密钥模式
      console.log("[Transcription] 云端 BYOK 模式（腾讯云 ASR）");
      currentView.setConnectionStatus(false, t("status.connecting"));

      this.ensureTencentClient();
      this.tencentClient!.updateSettings(this.settings.tencentASR);

      if (this.tencentClient!.isConnected) {
        this.tencentClient!.disconnect();
      }

      try {
        await this.tencentClient!.connect();
      } catch (err) {
        console.error("[Transcription] 腾讯云 ASR 连接失败:", err);
        this.tencentClient?.disconnect();
        new Notice(`${t("notice.cannotConnectBackend")}: ${err instanceof Error ? err.message : String(err)}`);
        currentView.setConnectionStatus(false, t("status.backendStartFailed"));
        return;
      }
    } else {
      // [LOCAL] 本地模式：启动后端 + 连接 WebSocket
      console.log("[Transcription] 正在启动后端...");
      currentView.setConnectionStatus(false, t("status.startingBackend"));
      const started = await this.backendManager.start();
      console.log("[Transcription] 后端启动结果:", started);
      if (!started) {
        currentView.setConnectionStatus(false, t("status.backendStartFailed"));
        return;
      }

      console.log("[Transcription] 正在连接 WebSocket...");
      currentView.setConnectionStatus(false, t("status.connecting"));
      try {
        await this.connectBackendWithRetry(this.backendManager.activePort || this.settings.backendPort);
      } catch (err) {
        console.error("[Transcription] WebSocket 连接失败:", err);
        new Notice(t("notice.cannotConnectBackend"));
        return;
      }

      // 重置 VAD 状态
      this.wsClient.sendCommand({ type: "reset" });
    }

    // 开始音频采集（两种模式共用）
    const client = this.getActiveASRClient();
    console.log("[Transcription] 正在启动麦克风...");
    try {
      await this.audioCapture.start((data) => {
        client.sendAudio(data);
      });
    } catch (err) {
      console.error("[Transcription] 麦克风启动失败:", err);
      new Notice(t("notice.micPermission"));
      client.disconnect();
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
    if (isCloudASR(this.settings.asrProvider) && this.tencentClient) {
      // cloud 付费模式：报告使用时长
      if (isHostedCloud(this.settings.asrProvider) && this.activeSignRequestId && this.cloudAuthService) {
        const durationSec = (Date.now() - this.recordingStartTime) / 1000;
        this.cloudAuthService.reportUsage(this.activeSignRequestId, durationSec);
        this.activeSignRequestId = null;
      }
      this.tencentClient.disconnect();
    } else {
      this.wsClient.disconnect();
      await this.backendManager.stop();
    }
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

    if (isStalePartialResult(result, this.flushSeq)) {
      console.log(`[Transcription] ✗ 丢弃过时 partial: seq=${result.flush_seq} < current=${this.flushSeq}`);
      return;
    }

    let text = result.text.trim();
    if (!text) return;
    const normalizedLanguage = this.normalizeLanguage(result.language, text);
    const resultType = result.type ?? "final";
    console.log(`[Transcription] recv ${resultType}: lang=${normalizedLanguage} "${text.slice(0, 60)}"`);

    // 前端文本去重：将同一 VAD 段内所有已 flush 的 partial 拼接，与新文本做重叠匹配
    // 云端模式跳过：云端 ASR 每个 partial 都是累积式完整句子文本，前缀去重会截成碎片
    const cloudProvider = isCloudASR(this.settings.asrProvider);
    if (!cloudProvider && this.committedPartialTexts.length > 0) {
      const dedupResult = trimCommittedPrefix(this.committedPartialTexts, text);
      if (dedupResult.hasOverlap) {
        if (dedupResult.isDuplicate) {
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

        text = dedupResult.trimmedText;
        if (!text) return;
        console.log(`[Transcription] dedup: trimmed overlap, remaining="${text.slice(0, 60)}"`);
        if (resultType === "final") {
          this.committedPartialTexts = [];
        }
      } else if (dedupResult.shouldResetCommitted) {
        this.committedPartialTexts = [];
      }
    }

    if (resultType === "partial") {
      const showStreaming = this.settings.aggregation.realtimePreview;
      const cloudMode = isCloudASR(this.settings.asrProvider);

      const now = new Date();
      // 云端模式跳过 stabilize：云端 ASR 已自行管理文本稳定性，
      // 且插入标点会导致 stabilize 误判为回滚而拒绝更新
      const stabilizedText = cloudMode ? text : this.stabilizePartialText(text);
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

    // 云端模式 + partialOnly：句子尚未结束（final 未到），不提交。
    // 刷新流式卡片让用户看到当前文本，然后重新等待 final。
    const cloudFlush = isCloudASR(this.settings.asrProvider);
    if (pending.partialOnly && cloudFlush) {
      const view = this.getView();
      if (view) {
        const text = pending.texts.join(" ").trim();
        view.upsertStreamingTranscript(pending.id, text, pending.language, pending.wallTime);
      }
      this.clearFlushTimer();
      this.scheduleFlush();
      return;
    }

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
      this.getActiveASRClient().sendCommand({ type: "flush_partial", seq: this.flushSeq });
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
    this.maybeAutoFormalizeEntry(entry);

    const targetLanguage = this.resolveAiOutputLanguageCode();
    if (this.translationService.shouldTranslate(entry.result.language, targetLanguage)) {
      try {
        const translation = await this.translationService.translate(
          entry.result.text,
          entry.result.language,
          outputLanguageName(targetLanguage),
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
    const language = (rawLanguage || "auto").toLowerCase();

    const hanCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
    const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;
    const latinWordCount = (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []).length;
    const kanaCount = (text.match(/[\u3040-\u30ff]/g) ?? []).length;
    const hangulCount = (text.match(/[\uac00-\ud7af]/g) ?? []).length;

    if (kanaCount > 0) return "ja";
    if (hangulCount > 0) return "ko";

    if (latinWordCount >= 3 && latinCount >= Math.max(8, hanCount * 2)) {
      return "en";
    }
    if (hanCount === 0 && latinCount >= 3) return "en";

    if (hanCount >= 2) {
      return language === "yue" ? "yue" : "zh";
    }

    if (hanCount === 1) {
      if (latinCount >= 8) return "en";
      return language === "yue" ? "yue" : "zh";
    }

    if (mode === "zh") return "zh";
    if (mode === "en") return "en";

    if (language === "ja" || language === "ko" || language === "yue" || language === "en") {
      return language;
    }
    if (language === "zh") return "zh";

    return "zh";
  }

  private stabilizePartialText(currentRaw: string): string | null {
    const current = currentRaw.replace(/\s+/g, " ").trim();
    if (!current) return null;

    const profile = this.settings.realtimeProfile ?? "stable";
    const previousDisplay = this.renderedPartialText.trim();
    const currentComparableLength = comparableLength(current);
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

    if (shouldResetNoisyPartial(previousDisplay, current)) {
      this.resetRollbackCandidate();
      return current;
    }

    const previousComparableLength = comparableLength(previousDisplay);
    const lcp = longestComparablePrefixLength(previousDisplay, current);

    // 最稳定情况：只在尾部增长，立即放行，保证低延迟。
    if (comparableStartsWith(current, previousDisplay)) {
      this.resetRollbackCandidate();
      const grew = currentComparableLength - previousComparableLength;
      if (grew >= 1 || endsSentence) return current;
      return null;
    }

    // 允许受控回滚：只在短回滚且高前缀一致时，并采用“候选二次确认”。
    if (currentComparableLength < previousComparableLength) {
      const shrink = previousComparableLength - currentComparableLength;
      const maxRollback = hanCount > 0
        ? (profile === "fast" ? 8 : 6)
        : (profile === "fast" ? 14 : 12);
      const prefixNeed = Math.max(
        4,
        Math.floor(previousComparableLength * (profile === "fast" ? 0.62 : 0.72)),
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
    if (currentComparableLength === previousComparableLength) {
      const sameLenAnchor = Math.max(
        4,
        Math.floor(previousComparableLength * (profile === "fast" ? 0.65 : 0.75)),
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
    const protectedPrefix = Math.max(3, previousComparableLength - revisionWindow);
    if (lcp < protectedPrefix && !endsSentence) {
      return null;
    }

    if (!endsSentence && currentComparableLength < minLen) return null;
    return current;
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

  /**
   * 返回当前活跃的 ASR 客户端（本地 WebSocketClient 或腾讯云 TencentASRClient）
   * 两者共享相同的方法签名：sendAudio / sendCommand / disconnect / setOnResult 等
   */
  private getActiveASRClient(): WebSocketClient | TencentASRClient {
    if (isCloudASR(this.settings.asrProvider) && this.tencentClient) {
      return this.tencentClient;
    }
    return this.wsClient;
  }

  /**
   * 创建/复用 TencentASRClient 实例（tencent BYOK 和 cloud 付费共用）
   */
  private ensureTencentClient(): void {
    if (this.tencentClient) return;
    this.tencentClient = new TencentASRClient(this.settings.tencentASR);
    this.tencentClient.setOnResult((result) => this.handleTranscriptionResult(result));
    this.tencentClient.setOnStatusChange((connected) => {
      const v = this.getView();
      if (v) {
        if (connected && this.recording) {
          v.setListeningStatus(true);
        } else {
          v.setConnectionStatus(connected);
        }
      }
    });
    this.tencentClient.setOnReconnecting((attempt) => {
      const v = this.getView();
      if (v) {
        v.setConnectionStatus(false, `${t("status.reconnecting")} (${attempt})`);
      }
    });
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
    view.setPanelSettings(this.getPanelSettingsValues());
  }

  private bindViewCallbacks(view: TranscriptionView): void {
    view.onToggleRecording = () => this.toggleRecording();
    view.onToggleDisplayMode = () => this.toggleDisplayMode();
    view.onExport = () => this.exportToNote();
    view.onCopyTranscripts = () => this.copyTranscriptsToClipboard();
    view.onSendToClaudian = () => this.sendToClaudian();
    view.onFormalize = (entryId, text) => this.formalizeEntry(entryId, text);
    view.onTranslate = (entryId, text, language) => this.translateEntry(entryId, text, language);
    view.onClearTranscripts = () => this.clearEntries();
    view.onSavePanelSettings = (values) => this.savePanelSettings(values);
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
    const sessionVersion = this.transcriptSessionVersion;
    this.summaryBuffer = "";
    this.summaryInFlight = true;

    try {
      const summaryText = await this.summaryService.summarize(source, this.outputLanguageName());
      if (sessionVersion !== this.transcriptSessionVersion) return;
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
      if (sessionVersion !== this.transcriptSessionVersion) return;
      console.error("AI 摘要失败:", err);
      const detail = err instanceof Error && err.message ? err.message : "未知错误";
      new Notice(`${t("notice.summaryFailed")}: ${detail}`);
      this.summaryBuffer = source;
      return;
    } finally {
      this.summaryInFlight = false;
      if (this.summaryBuffer.trim().length >= threshold) {
        void this.maybeRunSummary(new Date());
      }
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
    const sessionVersion = this.transcriptSessionVersion;
    this.metaSummaryTexts = [];
    this.metaSummaryInFlight = true;

    try {
      const metaText = await this.summaryService.metaSummarize(texts, this.outputLanguageName());
      if (sessionVersion !== this.transcriptSessionVersion) return;
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
      if (sessionVersion !== this.transcriptSessionVersion) return;
      console.error("二次摘要失败:", err);
      const detail = err instanceof Error && err.message ? err.message : "未知错误";
      new Notice(`${t("notice.metaSummaryFailed")}: ${detail}`);
      this.metaSummaryTexts.push(...texts);
    } finally {
      this.metaSummaryInFlight = false;
      const triggerCount = Math.max(2, this.settings.metaSummary.triggerCount);
      if (this.metaSummaryTexts.length >= triggerCount) {
        void this.maybeRunMetaSummary(new Date());
      }
    }
  }

  private async formalizeEntry(entryId: string, text: string): Promise<string> {
    if (!this.formalizeService.canFormalize()) {
      throw new Error(t("notice.configureFormalizeApi"));
    }
    const result = await this.formalizeService.formalize(text, this.outputLanguageName());
    const view = this.getView();
    if (view) {
      view.updateFormalText(entryId, result);
    }
    this.updateEntry(entryId, { formalText: result });
    return result;
  }

  private async translateEntry(entryId: string, text: string, language: string): Promise<string> {
    if (!this.translationService.isConfigured()) {
      throw new Error(t("notice.configureTranslationApi"));
    }
    const result = await this.translationService.translate(text, language, this.outputLanguageName());
    const view = this.getView();
    if (view) {
      view.updateTranslation(entryId, result);
    }
    this.updateEntry(entryId, { translation: result });
    return result;
  }

  private maybeAutoFormalizeEntry(entry: TranscriptEntry): void {
    if (!this.settings.autoFormalize) return;
    if (!this.formalizeService.canFormalize()) return;

    void this.formalizeEntry(entry.id, entry.result.text).catch((err) => {
      console.error("自动润色失败:", err);
      const detail = err instanceof Error && err.message ? err.message : "未知错误";
      new Notice(`${t("view.formalizeFailed")}: ${detail}`);
    });
  }

  private getPanelSettingsValues(): PanelSettingsValues {
    return {
      aiOutputLanguage: this.settings.aiOutputLanguage,
      transcriptFontSize: this.settings.transcriptFontSize,
      autoTranslate: this.settings.translation.enabled,
      autoFormalize: this.settings.autoFormalize,
    };
  }

  private async savePanelSettings(values: PanelSettingsValues): Promise<void> {
    this.settings.aiOutputLanguage = isAiOutputLanguage(values.aiOutputLanguage)
      ? values.aiOutputLanguage
      : DEFAULT_SETTINGS.aiOutputLanguage;
    this.settings.transcriptFontSize = clampFontSize(values.transcriptFontSize);
    this.settings.translation.enabled = Boolean(values.autoTranslate);
    this.settings.autoFormalize = Boolean(values.autoFormalize);
    await this.saveSettings();
  }

  private resolveAiOutputLanguageCode(): "zh" | "en" {
    if (this.settings.aiOutputLanguage === "zh" || this.settings.aiOutputLanguage === "en") {
      return this.settings.aiOutputLanguage;
    }
    return this.settings.locale === "en" ? "en" : "zh";
  }

  private outputLanguageName(): string {
    return outputLanguageName(this.resolveAiOutputLanguageCode());
  }

  private async copyTranscriptsToClipboard(): Promise<void> {
    const view = this.getView();
    if (!view) return;

    const entries = this.getCopyTranscriptEntries(view.getEntries());
    if (entries.length === 0) {
      new Notice(t("notice.noTranscriptToCopy"));
      return;
    }

    try {
      const text = formatTranscriptEntriesAsMarkdown(entries, t("export.formalLabel"));
      await writeTextToClipboard(text);
      new Notice(t("notice.copiedTranscripts"));
    } catch (err) {
      console.error("[Transcription] 复制记录失败:", err);
      new Notice(t("notice.copyFailed"));
    }
  }

  private getCopyTranscriptEntries(entries: TranscriptEntry[]): TranscriptEntry[] {
    const scopedEntries = this.settings.copyContentMode === "summaryOnly"
      ? entries.filter((entry) => entry.result.language === "summary" || entry.result.language === "meta-summary")
      : entries;
    return this.settings.copyRangeMode === "latest"
      ? scopedEntries.slice(-1)
      : scopedEntries;
  }

  private async sendToClaudian(): Promise<void> {
    const view = this.getView();
    if (!view) return;

    const entries = view.getEntries();
    if (entries.length === 0) {
      new Notice(t("notice.noTranscriptToClaudian"));
      return;
    }

    const markdown = formatTranscriptEntriesAsMarkdown(entries, t("export.formalLabel"));
    const body = buildClaudianContextMarkdown(markdown, entries.length);

    try {
      await ensureVaultFolder(this.app, CLAUDIAN_CONTEXT_FOLDER);
      await this.app.vault.adapter.write(CLAUDIAN_CONTEXT_FILE, body);
      executeObsidianCommand(this.app, "realclaudian:open-view");

      const contextDir = getVaultAbsolutePath(this.app, CLAUDIAN_CONTEXT_FOLDER);
      const selector = await this.waitForClaudianExternalContextSelector();
      const result = contextDir && selector ? selector.addExternalContext(contextDir) : null;
      const contextReady = result?.success || result?.error?.toLowerCase().includes("already added");
      const inputSeeded = seedClaudianInput(this.app, CLAUDIAN_CONTEXT_FILE, this.settings.claudianPrompt);
      if (contextReady || inputSeeded) {
        new Notice(t("notice.claudianContextReady"));
        return;
      }

      await writeTextToClipboard(markdown);
      new Notice(t("notice.claudianContextFallbackCopied"));
    } catch (err) {
      console.error("[Transcription] 交给 Claudian 失败:", err);
      new Notice(t("notice.claudianContextFailed"));
    }
  }

  private async waitForClaudianExternalContextSelector(): Promise<ClaudianExternalContextSelector | null> {
    for (let i = 0; i < 30; i++) {
      const selector = getClaudianExternalContextSelector(this.app);
      if (selector) return selector;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
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
          const aiTitle = await this.summaryService.generateTitle(contentSnippet, this.outputLanguageName());
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

    const md = `# ${title}\n\n${formatTranscriptEntriesAsMarkdown(entries, t("export.formalLabel"))}\n`;

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
    this.resetTransientTranscriptState();
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

  private resetTransientTranscriptState(): void {
    this.transcriptSessionVersion++;
    this.pendingTranscript = null;
    this.clearFlushTimer();
    this.committedPartialTexts = [];
    this.summaryBuffer = "";
    this.metaSummaryTexts = [];
    this.lastPartialText = "";
    this.lastStablePartialText = "";
    this.renderedPartialText = "";
    this.resetRollbackCandidate();
    this.lastPartialLanguage = "zh";
    this.lastPartialWallTime = null;
    if (this.recording) {
      this.getActiveASRClient().sendCommand({ type: "reset" });
    }
  }

}

function clampFontSize(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SETTINGS.transcriptFontSize;
  return Math.min(24, Math.max(12, Math.round(numeric)));
}

function isAiOutputLanguage(value: unknown): value is AiOutputLanguage {
  return value === "auto" || value === "zh" || value === "en";
}

function outputLanguageName(language: "zh" | "en"): string {
  return language === "en" ? "英文" : "简体中文";
}

async function writeTextToClipboard(text: string): Promise<void> {
  const browserClipboard = globalThis.navigator?.clipboard;
  if (browserClipboard?.writeText) {
    try {
      await browserClipboard.writeText(text);
      return;
    } catch (err) {
      console.warn("[Transcription] navigator.clipboard 写入失败，尝试 Electron clipboard:", err);
    }
  }

  const electronClipboard = (require("electron") as {
    clipboard?: { writeText?: (value: string) => void };
  }).clipboard;
  if (typeof electronClipboard?.writeText === "function") {
    electronClipboard.writeText(text);
    return;
  }

  throw new Error("Clipboard API unavailable");
}

async function ensureVaultFolder(app: import("obsidian").App, folder: string): Promise<void> {
  const parts = folder.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!(await app.vault.adapter.exists(current))) {
      await app.vault.adapter.mkdir(current);
    }
  }
}

type VaultAdapterWithBasePath = {
  getBasePath?: () => string;
};

function getVaultAbsolutePath(app: import("obsidian").App, path: string): string | null {
  const basePath = (app.vault.adapter as VaultAdapterWithBasePath).getBasePath?.();
  if (!basePath) return null;
  return `${basePath.replace(/\/$/, "")}/${path}`;
}

type ClaudianExternalContextSelector = {
  addExternalContext: (path: string) => { success: boolean; error?: string };
  getExternalContexts?: () => string[];
};

type ClaudianTabLike = {
  dom?: {
    inputEl?: HTMLTextAreaElement;
  };
  ui?: {
    externalContextSelector?: ClaudianExternalContextSelector;
  };
};

type ClaudianViewLike = {
  getActiveTab?: () => ClaudianTabLike | null;
  getTabManager?: () => {
    getActiveTab?: () => ClaudianTabLike | null;
  } | null;
};

function getClaudianTab(view: ClaudianViewLike): ClaudianTabLike | null {
  return view.getActiveTab?.() ?? view.getTabManager?.()?.getActiveTab?.() ?? null;
}

function getClaudianExternalContextSelector(app: import("obsidian").App): ClaudianExternalContextSelector | null {
  for (const leaf of app.workspace.getLeavesOfType("claudian-view")) {
    const selector = getClaudianTab(leaf.view as ClaudianViewLike)?.ui?.externalContextSelector;
    if (typeof selector?.addExternalContext === "function") return selector;
  }
  return null;
}

function getClaudianInput(app: import("obsidian").App): HTMLTextAreaElement | null {
  for (const leaf of app.workspace.getLeavesOfType("claudian-view")) {
    const input = getClaudianTab(leaf.view as ClaudianViewLike)?.dom?.inputEl;
    if (input) return input;
  }
  return null;
}

function buildClaudianPrompt(contextFile: string, promptTemplate?: string): string {
  const template = promptTemplate?.trim() || DEFAULT_SETTINGS.claudianPrompt;
  if (template.includes("{{contextFile}}")) {
    return template.split("{{contextFile}}").join(contextFile);
  }
  return `${template} ${contextFile}`;
}

function seedClaudianInput(app: import("obsidian").App, contextFile: string, promptTemplate?: string): boolean {
  const input = getClaudianInput(app);
  if (!input) return false;
  const seed = `${buildClaudianPrompt(contextFile, promptTemplate)}\n`;
  if (!input.value.includes(contextFile)) {
    input.value = input.value.trim()
      ? `${seed}\n${input.value.trim()}`
      : `${seed}\n`;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  return true;
}
