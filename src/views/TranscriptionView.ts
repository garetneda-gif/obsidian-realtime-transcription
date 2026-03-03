import { ItemView, Notice, WorkspaceLeaf, setIcon, createDiv } from "obsidian";
import { VIEW_TYPE_TRANSCRIPTION, LANG_LABELS, PLUGIN_ID } from "../constants";
import { TranscriptEntry, TranscriptionResult, SummaryDisplayMode } from "../types";

export class TranscriptionView extends ItemView {
  private controlBar!: HTMLElement;
  private statusBar!: HTMLElement;
  private transcriptContainer!: HTMLElement;
  private recordBtn!: HTMLButtonElement;
  private summaryBtn!: HTMLButtonElement;
  private exportBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private statusDot!: HTMLElement;
  private statusText!: HTMLElement;
  private streamingCard: HTMLElement | null = null;
  private streamingEntryId: string | null = null;
  private streamingTimeEl: HTMLElement | null = null;
  private streamingLangBadgeEl: HTMLElement | null = null;
  private streamingOriginalEl: HTMLElement | null = null;
  private entries: TranscriptEntry[] = [];

  // 外部注入的回调
  onToggleRecording: (() => void | Promise<void>) | null = null;
  onToggleDisplayMode: (() => void | Promise<void>) | null = null;
  onExport: (() => void) | null = null;
  onFormalize: ((entryId: string, text: string) => Promise<string>) | null = null;

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

    // 控制栏（含状态指示器）
    this.controlBar = container.createDiv("control-bar");
    this.buildControlBar();

    // 状态指示器嵌入控制栏右侧
    const statusIndicator = this.controlBar.createDiv("status-indicator");
    this.statusDot = statusIndicator.createDiv("status-dot");
    this.statusText = statusIndicator.createEl("span", { cls: "status-text" });
    this.statusText.setText("未连接");

    // 保留隐藏的 statusBar 引用以兼容
    this.statusBar = statusIndicator;

    // 转写结果区域
    this.transcriptContainer = container.createDiv("transcript-container");

    // 空状态提示
    this.showEmptyState();
  }

  async onClose(): Promise<void> {
    this.entries = [];
    this.streamingCard = null;
    this.streamingEntryId = null;
    this.streamingTimeEl = null;
    this.streamingLangBadgeEl = null;
    this.streamingOriginalEl = null;
  }

  private buildControlBar(): void {
    const triggerRecordingToggle = () => {
      this.setConnectionStatus(false, "按钮已点击，准备启动...");
      if (this.onToggleRecording) {
        void this.onToggleRecording();
        return;
      }

      // 兜底：即使回调丢失，也尝试通过命令触发录音切换
      void this.app.commands.executeCommandById(`${PLUGIN_ID}:toggle-recording`);
      new Notice("录音按钮回调未绑定，已尝试命令兜底触发");
    };

    // 录制按钮
    this.recordBtn = this.controlBar.createEl("button", {
      cls: "record-btn",
      attr: { "aria-label": "开始录制", type: "button" },
    });
    const recordIcon = this.recordBtn.createDiv("record-btn-icon");
    setIcon(recordIcon, "microphone");

    this.recordBtn.addEventListener("click", triggerRecordingToggle);

    // 显示模式切换（仅摘要 / 摘要+转录）
    this.summaryBtn = this.controlBar.createEl("button", {
      cls: "action-btn summary-btn",
      attr: { "aria-label": "切换为仅显示摘要", type: "button" },
    });
    setIcon(this.summaryBtn, "sparkles");
    this.summaryBtn.addEventListener("click", () => {
      void this.onToggleDisplayMode?.();
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

  setDisplayMode(mode: SummaryDisplayMode): void {
    if (!this.summaryBtn) return;
    if (mode === "summaryOnly") {
      this.summaryBtn.addClass("active");
      this.summaryBtn.setAttribute("aria-label", "切换为摘要+转录");
      this.transcriptContainer.addClass("summary-only");
    } else {
      this.summaryBtn.removeClass("active");
      this.summaryBtn.setAttribute("aria-label", "切换为仅显示摘要");
      this.transcriptContainer.removeClass("summary-only");
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

  upsertStreamingTranscript(
    entryId: string,
    text: string,
    language: string,
    wallTime: Date,
  ): void {
    const empty = this.transcriptContainer.querySelector(".empty-state");
    if (empty) empty.remove();

    if (!this.streamingCard || this.streamingEntryId !== entryId) {
      this.streamingCard = this.transcriptContainer.createDiv({
        cls: "transcript-card",
        attr: { "data-entry-id": entryId },
      });
      this.streamingEntryId = entryId;
      const header = this.streamingCard.createDiv("card-header");
      this.streamingTimeEl = header.createEl("span", { cls: "card-timestamp" });
      this.streamingLangBadgeEl = header.createEl("span", { cls: "card-lang-badge" });
      this.streamingOriginalEl = this.streamingCard.createDiv("card-original");
    }

    if (this.streamingTimeEl) {
      this.streamingTimeEl.setText(this.formatWallTime(wallTime));
    }
    if (this.streamingLangBadgeEl) {
      this.streamingLangBadgeEl.className = "card-lang-badge";
      this.streamingLangBadgeEl.addClass(`lang-${language}`);
      this.streamingLangBadgeEl.setText(LANG_LABELS[language] ?? language);
    }
    if (this.streamingOriginalEl) {
      this.streamingOriginalEl.setText(text);
    }
    this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
  }

  commitStreamingTranscript(entry: TranscriptEntry): void {
    if (!this.streamingCard || this.streamingEntryId !== entry.id) {
      this.addTranscript(entry);
      return;
    }

    this.streamingCard.setAttr("data-entry-id", entry.id);
    if (entry.result.language === "summary") {
      this.streamingCard.addClass("summary-card");
      const title = this.streamingCard.querySelector(".summary-title");
      if (!title) {
        this.streamingCard.createDiv("summary-title").setText("AI 摘要");
      }
    } else {
      this.streamingCard.removeClass("summary-card");
      const title = this.streamingCard.querySelector(".summary-title");
      if (title) title.remove();
    }

    if (this.streamingTimeEl) {
      this.streamingTimeEl.setText(this.formatWallTime(entry.wallTime));
    }
    if (this.streamingLangBadgeEl) {
      this.streamingLangBadgeEl.className = "card-lang-badge";
      this.streamingLangBadgeEl.addClass(`lang-${entry.result.language}`);
      this.streamingLangBadgeEl.setText(
        LANG_LABELS[entry.result.language] ?? entry.result.language,
      );
    }
    if (this.streamingOriginalEl) {
      this.streamingOriginalEl.setText(entry.result.text);
    }

    // 提交时为非摘要卡片追加润色按钮
    const isSummary = entry.result.language === "summary";
    if (!isSummary && !this.streamingCard.querySelector(".card-footer")) {
      this.appendFormalizeButton(this.streamingCard, entry);
    }

    if (!this.entries.find((e) => e.id === entry.id)) {
      this.entries.push(entry);
    }
    this.streamingCard = null;
    this.streamingEntryId = null;
    this.streamingTimeEl = null;
    this.streamingLangBadgeEl = null;
    this.streamingOriginalEl = null;
  }

  clearStreamingTranscript(): void {
    if (this.streamingCard) {
      this.streamingCard.remove();
    }
    this.streamingCard = null;
    this.streamingEntryId = null;
    this.streamingTimeEl = null;
    this.streamingLangBadgeEl = null;
    this.streamingOriginalEl = null;
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
    this.clearStreamingTranscript();
    this.transcriptContainer.empty();
    this.showEmptyState();
  }

  getEntries(): TranscriptEntry[] {
    return [...this.entries];
  }

  updateFormalText(entryId: string, formalText: string): void {
    const entry = this.entries.find((e) => e.id === entryId);
    if (entry) {
      entry.formalText = formalText;
    }

    const card = this.transcriptContainer.querySelector(
      `[data-entry-id="${entryId}"]`,
    );
    if (!card) return;

    // 移除加载状态
    const loading = card.querySelector(".card-formal-loading");
    if (loading) loading.remove();

    // 更新按钮状态
    const btn = card.querySelector(".formalize-btn") as HTMLElement | null;
    if (btn) {
      btn.classList.remove("loading");
      btn.classList.add("done");
      btn.empty();
      const checkIcon = btn.createDiv("formalize-btn-icon");
      setIcon(checkIcon, "check");
      btn.appendText("已润色");
    }

    // 插入或更新润色文本
    let formalEl = card.querySelector(".card-formal") as HTMLElement | null;
    if (!formalEl) {
      // 在原文之后、翻译之前插入
      const originalEl = card.querySelector(".card-original");
      formalEl = createDiv({ cls: "card-formal" });
      if (originalEl?.nextSibling) {
        card.insertBefore(formalEl, originalEl.nextSibling);
      } else {
        card.appendChild(formalEl);
      }
    }
    formalEl.setText(formalText);
  }

  private renderCard(entry: TranscriptEntry): void {
    const card = this.transcriptContainer.createDiv({
      cls: "transcript-card",
      attr: { "data-entry-id": entry.id },
    });
    const isSummary = entry.result.language === "summary";
    if (isSummary) {
      card.addClass("summary-card");
    }

    // 卡片头部：时间 + 语言
    const cardHeader = card.createDiv("card-header");
    const timeEl = cardHeader.createEl("span", { cls: "card-timestamp" });
    timeEl.setText(this.formatWallTime(entry.wallTime));

    const langBadge = cardHeader.createEl("span", { cls: "card-lang-badge" });
    langBadge.setText(LANG_LABELS[entry.result.language] ?? entry.result.language);
    langBadge.addClass(`lang-${entry.result.language}`);

    // 摘要标题
    if (isSummary) {
      const titleRow = card.createDiv("summary-title-row");
      const iconEl = titleRow.createDiv("summary-title-icon");
      setIcon(iconEl, "sparkles");
      titleRow.createEl("span", { cls: "summary-title", text: "AI 摘要" });
    }

    // 原文
    const originalEl = card.createDiv("card-original");
    originalEl.setText(entry.result.text);

    // 润色文本（已有则直接显示）
    if (entry.formalText) {
      card.createDiv({ cls: "card-formal", text: entry.formalText });
    }

    // 润色按钮（非摘要卡片显示）
    if (!isSummary) {
      this.appendFormalizeButton(card as HTMLElement, entry);
    }

    // 译文
    if (entry.translation) {
      const translationEl = card.createDiv("card-translation");
      translationEl.setText(entry.translation);
    } else if (this.shouldShowTranslationPlaceholder(entry.result.language)) {
      const loadingEl = card.createDiv("card-translation-loading");
      loadingEl.setText("翻译中...");
    }
  }

  private appendFormalizeButton(card: HTMLElement, entry: TranscriptEntry): void {
    const footer = card.createDiv("card-footer");
    const formalizeBtn = footer.createEl("button", {
      cls: entry.formalText ? "formalize-btn done" : "formalize-btn",
      text: entry.formalText ? "已润色" : "润色",
      attr: { type: "button" },
    });
    const btnIcon = formalizeBtn.createDiv("formalize-btn-icon");
    setIcon(btnIcon, "wand-2");
    formalizeBtn.insertBefore(btnIcon, formalizeBtn.firstChild);

    formalizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (formalizeBtn.classList.contains("loading") || formalizeBtn.classList.contains("done")) {
        return;
      }
      void this.handleFormalizeClick(entry.id, entry.result.text, formalizeBtn, card);
    });
  }

  private async handleFormalizeClick(
    entryId: string,
    text: string,
    btn: HTMLElement,
    card: HTMLElement,
  ): Promise<void> {
    if (!this.onFormalize) {
      new Notice("润色功能未配置");
      return;
    }

    btn.classList.add("loading");
    btn.textContent = "润色中...";

    // 添加加载占位
    const originalEl = card.querySelector(".card-original");
    const loadingEl = createDiv({ cls: "card-formal-loading", text: "正在润色..." });
    if (originalEl?.nextSibling) {
      card.insertBefore(loadingEl, originalEl.nextSibling);
    } else {
      card.appendChild(loadingEl);
    }

    try {
      const result = await this.onFormalize(entryId, text);
      this.updateFormalText(entryId, result);
    } catch (err) {
      loadingEl.remove();
      btn.classList.remove("loading");
      btn.textContent = "润色";
      const btnIcon = btn.createDiv("formalize-btn-icon");
      setIcon(btnIcon, "wand-2");
      btn.insertBefore(btnIcon, btn.firstChild);
      const detail = err instanceof Error ? err.message : "未知错误";
      new Notice(`润色失败: ${detail}`);
    }
  }

  private shouldShowTranslationPlaceholder(language: string): boolean {
    return language === "en";
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
