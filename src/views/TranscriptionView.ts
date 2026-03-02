import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_TRANSCRIPTION, LANG_LABELS } from "../constants";
import { TranscriptEntry, TranscriptionResult } from "../types";

export class TranscriptionView extends ItemView {
  private controlBar!: HTMLElement;
  private statusBar!: HTMLElement;
  private transcriptContainer!: HTMLElement;
  private recordBtn!: HTMLButtonElement;
  private exportBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private statusDot!: HTMLElement;
  private statusText!: HTMLElement;
  private entries: TranscriptEntry[] = [];

  // 外部注入的回调
  onToggleRecording: (() => void) | null = null;
  onExport: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_TRANSCRIPTION;
  }

  getDisplayText(): string {
    return "实时语音转写";
  }

  getIcon(): string {
    return "microphone";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("transcription-view");

    // 头部标题
    const header = container.createDiv("transcription-header");
    const titleEl = header.createEl("span", { cls: "transcription-title" });
    titleEl.setText("文字转写");

    // 控制栏
    this.controlBar = container.createDiv("control-bar");
    this.buildControlBar();

    // 状态栏
    this.statusBar = container.createDiv("status-bar");
    this.statusDot = this.statusBar.createDiv("status-dot");
    this.statusText = this.statusBar.createEl("span", { cls: "status-text" });
    this.statusText.setText("未连接");

    // 转写结果区域
    this.transcriptContainer = container.createDiv("transcript-container");

    // 空状态提示
    this.showEmptyState();
  }

  async onClose(): Promise<void> {
    this.entries = [];
  }

  private buildControlBar(): void {
    // 录制按钮
    this.recordBtn = this.controlBar.createEl("button", {
      cls: "record-btn",
      attr: { "aria-label": "开始录制" },
    });
    const recordIcon = this.recordBtn.createDiv("record-btn-icon");
    setIcon(recordIcon, "microphone");

    this.recordBtn.addEventListener("click", () => {
      this.onToggleRecording?.();
    });

    // 导出按钮
    this.exportBtn = this.controlBar.createEl("button", {
      cls: "action-btn",
      attr: { "aria-label": "导出为笔记" },
    });
    setIcon(this.exportBtn, "file-text");
    this.exportBtn.addEventListener("click", () => {
      this.onExport?.();
    });

    // 清除按钮
    this.clearBtn = this.controlBar.createEl("button", {
      cls: "action-btn",
      attr: { "aria-label": "清除记录" },
    });
    setIcon(this.clearBtn, "trash-2");
    this.clearBtn.addEventListener("click", () => {
      this.clearTranscripts();
    });
  }

  setRecordingState(recording: boolean): void {
    if (recording) {
      this.recordBtn.addClass("recording");
      this.recordBtn.setAttribute("aria-label", "停止录制");
    } else {
      this.recordBtn.removeClass("recording");
      this.recordBtn.setAttribute("aria-label", "开始录制");
    }
  }

  setConnectionStatus(connected: boolean, detail?: string): void {
    this.statusDot.className = "status-dot";
    if (connected) {
      this.statusDot.addClass("connected");
      this.statusText.setText(detail ?? "已连接");
    } else {
      this.statusText.setText(detail ?? "未连接");
    }
  }

  setListeningStatus(listening: boolean): void {
    if (listening) {
      this.statusDot.className = "status-dot recording";
      this.statusText.setText("正在聆听...");
    }
  }

  addTranscript(entry: TranscriptEntry): void {
    // 移除空状态提示
    const empty = this.transcriptContainer.querySelector(".empty-state");
    if (empty) empty.remove();

    this.entries.push(entry);
    this.renderCard(entry);

    // 自动滚动到底部
    this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
  }

  updateTranslation(entryId: string, translation: string): void {
    const entry = this.entries.find((e) => e.id === entryId);
    if (entry) {
      entry.translation = translation;
    }

    const card = this.transcriptContainer.querySelector(`[data-entry-id="${entryId}"]`);
    if (card) {
      let translationEl = card.querySelector(".card-translation") as HTMLElement | null;
      // 移除加载占位
      const loading = card.querySelector(".card-translation-loading");
      if (loading) loading.remove();

      if (!translationEl) {
        translationEl = card.createDiv("card-translation");
      }
      translationEl.setText(translation);
    }
  }

  clearTranscripts(): void {
    this.entries = [];
    this.transcriptContainer.empty();
    this.showEmptyState();
  }

  getEntries(): TranscriptEntry[] {
    return [...this.entries];
  }

  private renderCard(entry: TranscriptEntry): void {
    const card = this.transcriptContainer.createDiv({
      cls: "transcript-card",
      attr: { "data-entry-id": entry.id },
    });

    // 卡片头部：时间 + 语言
    const cardHeader = card.createDiv("card-header");
    const timeEl = cardHeader.createEl("span", { cls: "card-timestamp" });
    timeEl.setText(this.formatWallTime(entry.wallTime));

    const langBadge = cardHeader.createEl("span", { cls: "card-lang-badge" });
    langBadge.setText(LANG_LABELS[entry.result.language] ?? entry.result.language);
    langBadge.addClass(`lang-${entry.result.language}`);

    // 原文
    const originalEl = card.createDiv("card-original");
    originalEl.setText(entry.result.text);

    // 译文
    if (entry.translation) {
      const translationEl = card.createDiv("card-translation");
      translationEl.setText(entry.translation);
    } else if (entry.result.language !== "zh" && entry.result.language !== "yue") {
      // 翻译中占位
      const loadingEl = card.createDiv("card-translation-loading");
      loadingEl.setText("翻译中...");
    }
  }

  private formatWallTime(date: Date): string {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  private showEmptyState(): void {
    const empty = this.transcriptContainer.createDiv("empty-state");
    const iconEl = empty.createDiv("empty-icon");
    setIcon(iconEl, "microphone");
    empty.createEl("p", { text: "点击麦克风按钮开始录制" });
    empty.createEl("p", {
      text: "支持中文、英文、日文、韩文、粤语",
      cls: "empty-subtitle",
    });
  }
}
