import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_TRANSCRIPTION, LANG_LABELS, PLUGIN_ID } from "../constants";
import type { TranscriptEntry, TranscriptionResult, SummaryDisplayMode, PanelSettingsValues, AiOutputLanguage } from "../types";
import { t } from "../i18n";
import { executeObsidianCommand } from "../utils/obsidianCommands";

const FORMALIZE_UI_TIMEOUT_MS = 35000;

export class TranscriptionView extends ItemView {
  private controlBar!: HTMLElement;
  private statusBar!: HTMLElement;
  private transcriptContainer!: HTMLElement;
  private recordBtn!: HTMLButtonElement;
  private summaryBtn!: HTMLButtonElement;
  private exportBtn!: HTMLButtonElement;
  private copyBtn!: HTMLButtonElement;
  private claudianBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private settingsBtn!: HTMLButtonElement;
  private statusDot!: HTMLElement;
  private statusText!: HTMLElement;
  private streamingCard: HTMLElement | null = null;
  private streamingEntryId: string | null = null;
  private streamingTimeEl: HTMLElement | null = null;
  private streamingLangBadgeEl: HTMLElement | null = null;
  private streamingOriginalEl: HTMLElement | null = null;
  private scrollToBottomBtn!: HTMLElement;
  private settingsPage: HTMLElement | null = null;
  private pinnedToBottom = true;
  private entries: TranscriptEntry[] = [];
  private panelSettingsValues: PanelSettingsValues = {
    aiOutputLanguage: "auto",
    transcriptFontSize: 15,
    autoTranslate: false,
    autoFormalize: false,
  };

  // 外部注入的回调
  onToggleRecording: (() => void | Promise<void>) | null = null;
  onToggleDisplayMode: (() => void | Promise<void>) | null = null;
  onExport: (() => void) | null = null;
  onCopyTranscripts: (() => void | Promise<void>) | null = null;
  onSendToClaudian: (() => void | Promise<void>) | null = null;
  onFormalize: ((entryId: string, text: string) => Promise<string>) | null = null;
  onTranslate: ((entryId: string, text: string, language: string) => Promise<string>) | null = null;
  onClearTranscripts: (() => void | Promise<void>) | null = null;
  onSavePanelSettings: ((values: PanelSettingsValues) => void | Promise<void>) | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_TRANSCRIPTION;
  }

  getDisplayText(): string {
    return t("view.displayText");
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
    titleEl.setText(t("view.title"));

    // 控制栏（含状态指示器）
    this.controlBar = container.createDiv("control-bar");
    this.buildControlBar();

    // 状态指示器嵌入控制栏右侧
    const statusIndicator = this.controlBar.createDiv("status-indicator");
    this.statusDot = statusIndicator.createDiv("status-dot");
    this.statusText = statusIndicator.createEl("span", { cls: "status-text" });
    this.statusText.setText(t("view.statusDisconnected"));

    // 保留隐藏的 statusBar 引用以兼容
    this.statusBar = statusIndicator;

    // 转写结果区域（需要 wrapper 定位浮动按钮）
    const transcriptWrapper = container.createDiv("transcript-wrapper");
    this.transcriptContainer = transcriptWrapper.createDiv("transcript-container");

    // 滚动到底部浮动按钮
    this.scrollToBottomBtn = transcriptWrapper.createDiv("scroll-to-bottom-btn");
    setIcon(this.scrollToBottomBtn, "chevron-down");
    this.scrollToBottomBtn.addEventListener("click", () => {
      this.pinnedToBottom = true;
      this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
    });
    this.transcriptContainer.addEventListener("scroll", () => {
      if (this.isNearBottom()) {
        this.pinnedToBottom = true;
      } else {
        this.pinnedToBottom = false;
      }
      this.updateScrollBtnVisibility();
    });

    // 空状态提示
    this.showEmptyState();
  }

  async onClose(): Promise<void> {
    // 不清空 entries，数据由 plugin 实例持久化管理
    this.streamingCard = null;
    this.streamingEntryId = null;
    this.streamingTimeEl = null;
    this.streamingLangBadgeEl = null;
    this.streamingOriginalEl = null;
  }

  private buildControlBar(): void {
    const triggerRecordingToggle = () => {
      this.setConnectionStatus(false, t("view.btnClickedPreparing"));
      if (this.onToggleRecording) {
        void this.onToggleRecording();
        return;
      }

      // 兜底：即使回调丢失，也尝试通过命令触发录音切换
      executeObsidianCommand(this.app, `${PLUGIN_ID}:toggle-recording`);
      new Notice(t("view.callbackFallback"));
    };

    // 显示模式切换（仅摘要 / 摘要+转录）
    this.summaryBtn = this.controlBar.createEl("button", {
      cls: "action-btn summary-btn",
      attr: { "aria-label": t("view.switchToSummaryOnly"), type: "button" },
    });
    setIcon(this.summaryBtn, "sparkles");
    this.summaryBtn.addEventListener("click", () => {
      void this.onToggleDisplayMode?.();
    });

    // 导出按钮
    this.exportBtn = this.controlBar.createEl("button", {
      cls: "action-btn",
      attr: { "aria-label": t("view.exportNote") },
    });
    setIcon(this.exportBtn, "file-text");
    this.exportBtn.addEventListener("click", () => {
      this.onExport?.();
    });

    // 录制按钮
    this.recordBtn = this.controlBar.createEl("button", {
      cls: "record-btn",
      attr: { "aria-label": t("view.startRecording"), type: "button" },
    });
    const recordIcon = this.recordBtn.createDiv("record-btn-icon");
    setIcon(recordIcon, "microphone");

    this.recordBtn.addEventListener("click", triggerRecordingToggle);

    this.copyBtn = this.controlBar.createEl("button", {
      cls: "action-btn",
      attr: { "aria-label": t("view.copyRecords"), type: "button" },
    });
    setIcon(this.copyBtn, "copy");
    this.copyBtn.addEventListener("click", () => {
      void this.onCopyTranscripts?.();
    });

    this.claudianBtn = this.controlBar.createEl("button", {
      cls: "action-btn",
      attr: { "aria-label": t("view.sendToClaudian"), type: "button" },
    });
    setIcon(this.claudianBtn, "bot");
    this.claudianBtn.addEventListener("click", () => {
      void this.onSendToClaudian?.();
    });

    this.settingsBtn = this.controlBar.createEl("button", {
      cls: "action-btn panel-settings-btn",
      attr: { "aria-label": t("view.panelSettings"), type: "button" },
    });
    setIcon(this.settingsBtn, "settings");
    this.settingsBtn.addEventListener("click", () => {
      this.showPanelSettingsPage();
    });

    // 清除按钮
    this.clearBtn = this.controlBar.createEl("button", {
      cls: "action-btn clear-btn",
      attr: { "aria-label": t("view.clearRecords") },
    });
    setIcon(this.clearBtn, "trash-2");
    this.clearBtn.addEventListener("click", () => {
      this.clearTranscripts();
    });
  }

  /** Refresh all static UI text after locale change */
  refreshLocale(): void {
    const titleEl = this.containerEl.querySelector(".transcription-title");
    if (titleEl) (titleEl as HTMLElement).setText(t("view.title"));

    this.recordBtn?.setAttribute("aria-label",
      this.recordBtn.hasClass("recording") ? t("view.stopRecording") : t("view.startRecording"));
    this.summaryBtn?.setAttribute("aria-label",
      this.summaryBtn.hasClass("active") ? t("view.switchToBoth") : t("view.switchToSummaryOnly"));
    this.exportBtn?.setAttribute("aria-label", t("view.exportNote"));
    this.copyBtn?.setAttribute("aria-label", t("view.copyRecords"));
    this.claudianBtn?.setAttribute("aria-label", t("view.sendToClaudian"));
    this.clearBtn?.setAttribute("aria-label", t("view.clearRecords"));
    this.settingsBtn?.setAttribute("aria-label", t("view.panelSettings"));

    // Update status text based on current state
    if (this.statusDot?.hasClass("recording")) {
      this.statusText?.setText(t("view.statusListening"));
    } else if (this.statusDot?.hasClass("connected")) {
      this.statusText?.setText(t("view.statusConnected"));
    } else {
      this.statusText?.setText(t("view.statusDisconnected"));
    }

    // Update empty state if present
    const emptyState = this.transcriptContainer?.querySelector(".empty-state");
    if (emptyState) {
      emptyState.remove();
      this.showEmptyState();
    }
  }

  setRecordingState(recording: boolean): void {
    if (recording) {
      this.recordBtn.addClass("recording");
      this.recordBtn.setAttribute("aria-label", t("view.stopRecording"));
    } else {
      this.recordBtn.removeClass("recording");
      this.recordBtn.setAttribute("aria-label", t("view.startRecording"));
    }
  }

  setDisplayMode(mode: SummaryDisplayMode): void {
    if (!this.summaryBtn) return;
    if (mode === "summaryOnly") {
      this.summaryBtn.addClass("active");
      this.summaryBtn.setAttribute("aria-label", t("view.switchToBoth"));
      this.transcriptContainer.addClass("summary-only");
    } else {
      this.summaryBtn.removeClass("active");
      this.summaryBtn.setAttribute("aria-label", t("view.switchToSummaryOnly"));
      this.transcriptContainer.removeClass("summary-only");
    }
  }

  applyTranscriptFontSize(size: number): void {
    if (!this.transcriptContainer) return;
    this.transcriptContainer.style.setProperty("--rt-transcript-font-size", `${size}px`);
  }

  setPanelSettings(values: PanelSettingsValues): void {
    this.panelSettingsValues = {
      aiOutputLanguage: isAiOutputLanguage(values.aiOutputLanguage)
        ? values.aiOutputLanguage
        : "auto",
      transcriptFontSize: clampPanelFontSize(values.transcriptFontSize),
      autoTranslate: Boolean(values.autoTranslate),
      autoFormalize: Boolean(values.autoFormalize),
    };
    this.applyTranscriptFontSize(this.panelSettingsValues.transcriptFontSize);
    if (this.settingsPage) {
      this.showPanelSettingsPage();
    }
  }

  private showPanelSettingsPage(): void {
    const root = this.containerEl.children[1] as HTMLElement | undefined;
    if (!root) return;

    if (this.settingsPage) {
      this.settingsPage.remove();
    }

    const draft: PanelSettingsValues = { ...this.panelSettingsValues };
    const page = root.createDiv("panel-settings-page");
    this.settingsPage = page;

    const toolbar = page.createDiv("panel-settings-toolbar");
    const backBtn = toolbar.createEl("button", {
      cls: "panel-settings-icon-btn",
      attr: { type: "button", "aria-label": t("panelSettings.back"), title: t("panelSettings.back") },
    });
    setIcon(backBtn, "arrow-left");
    backBtn.addEventListener("click", () => {
      this.applyTranscriptFontSize(this.panelSettingsValues.transcriptFontSize);
      this.hidePanelSettingsPage();
    });

    toolbar.createEl("div", {
      cls: "panel-settings-title",
      text: t("panelSettings.title"),
    });

    const saveBtn = toolbar.createEl("button", {
      cls: "panel-settings-icon-btn save-btn",
      attr: { type: "button", "aria-label": t("panelSettings.save"), title: t("panelSettings.save") },
    });
    setIcon(saveBtn, "save");

    const content = page.createDiv("panel-settings-content");

    const fontRow = this.createPanelSettingRow(
      content,
      t("panelSettings.fontSize.name"),
      t("panelSettings.fontSize.desc"),
    );
    const fontControls = fontRow.createDiv("panel-settings-control-row");
    const fontValue = fontControls.createEl("span", {
      cls: "panel-settings-value",
      text: `${draft.transcriptFontSize}px`,
    });
    const fontInput = fontControls.createEl("input", {
      cls: "panel-settings-range",
      attr: {
        type: "range",
        min: "12",
        max: "24",
        step: "1",
        value: String(draft.transcriptFontSize),
      },
    }) as HTMLInputElement;
    fontInput.addEventListener("input", () => {
      draft.transcriptFontSize = clampPanelFontSize(Number(fontInput.value));
      fontValue.setText(`${draft.transcriptFontSize}px`);
      this.applyTranscriptFontSize(draft.transcriptFontSize);
    });

    const languageRow = this.createPanelSettingRow(
      content,
      t("panelSettings.outputLanguage.name"),
      t("panelSettings.outputLanguage.desc"),
    );
    const languageSelect = languageRow.createEl("select", {
      cls: "panel-settings-select",
    }) as HTMLSelectElement;
    this.appendLanguageOption(languageSelect, "auto", t("panelSettings.outputLanguage.auto"));
    this.appendLanguageOption(languageSelect, "zh", t("panelSettings.outputLanguage.zh"));
    this.appendLanguageOption(languageSelect, "en", t("panelSettings.outputLanguage.en"));
    languageSelect.value = draft.aiOutputLanguage;
    languageSelect.addEventListener("change", () => {
      draft.aiOutputLanguage = isAiOutputLanguage(languageSelect.value)
        ? languageSelect.value
        : "auto";
    });

    this.createPanelToggleRow(
      content,
      t("panelSettings.autoTranslate.name"),
      t("panelSettings.autoTranslate.desc"),
      draft.autoTranslate,
      (checked) => {
        draft.autoTranslate = checked;
      },
    );

    this.createPanelToggleRow(
      content,
      t("panelSettings.autoFormalize.name"),
      t("panelSettings.autoFormalize.desc"),
      draft.autoFormalize,
      (checked) => {
        draft.autoFormalize = checked;
      },
    );

    saveBtn.addEventListener("click", () => {
      void this.savePanelSettingsDraft(draft, saveBtn);
    });
  }

  private hidePanelSettingsPage(): void {
    this.settingsPage?.remove();
    this.settingsPage = null;
  }

  private createPanelSettingRow(container: HTMLElement, name: string, desc: string): HTMLElement {
    const row = container.createDiv("panel-settings-row");
    const text = row.createDiv("panel-settings-row-text");
    text.createEl("div", { cls: "panel-settings-row-name", text: name });
    text.createEl("div", { cls: "panel-settings-row-desc", text: desc });
    return row;
  }

  private createPanelToggleRow(
    container: HTMLElement,
    name: string,
    desc: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
  ): void {
    const row = this.createPanelSettingRow(container, name, desc);
    row.addClass("panel-settings-toggle-row");
    const label = row.createEl("label", { cls: "panel-settings-toggle" });
    const input = label.createEl("input", {
      attr: { type: "checkbox" },
    }) as HTMLInputElement;
    input.checked = checked;
    label.createEl("span", { cls: "panel-settings-toggle-track" });
    input.addEventListener("change", () => {
      onChange(input.checked);
    });
  }

  private appendLanguageOption(select: HTMLSelectElement, value: AiOutputLanguage, text: string): void {
    const option = select.createEl("option", {
      text,
      attr: { value },
    }) as HTMLOptionElement;
    option.value = value;
  }

  private async savePanelSettingsDraft(
    draft: PanelSettingsValues,
    saveBtn: HTMLButtonElement,
  ): Promise<void> {
    saveBtn.disabled = true;
    try {
      await Promise.resolve(this.onSavePanelSettings?.({ ...draft }));
      this.setPanelSettings(draft);
      this.hidePanelSettingsPage();
    } catch (err) {
      const detail = err instanceof Error && err.message ? err.message : "unknown error";
      new Notice(`${t("panelSettings.saveFailed")}: ${detail}`);
      saveBtn.disabled = false;
    }
  }

  setConnectionStatus(connected: boolean, detail?: string): void {
    this.statusDot.className = "status-dot";
    if (connected) {
      this.statusDot.addClass("connected");
      this.statusText.setText(detail ?? t("view.statusConnected"));
    } else {
      this.statusText.setText(detail ?? t("view.statusDisconnected"));
    }
  }

  setListeningStatus(listening: boolean): void {
    if (listening) {
      this.statusDot.className = "status-dot recording";
      this.statusText.setText(t("view.statusListening"));
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
        cls: "transcript-card streaming",
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
    if (this.pinnedToBottom) {
      this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
    }
  }

  commitStreamingTranscript(entry: TranscriptEntry): void {
    if (!this.streamingCard || this.streamingEntryId !== entry.id) {
      this.addTranscript(entry);
      return;
    }

    this.streamingCard.setAttr("data-entry-id", entry.id);
    this.streamingCard.removeClass("streaming");
    if (entry.result.language === "summary") {
      this.streamingCard.addClass("summary-card");
      const title = this.streamingCard.querySelector(".summary-title");
      if (!title) {
        this.streamingCard.createDiv("summary-title").setText(t("view.aiSummary"));
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
      const isSummaryEntry = entry.result.language === "summary";
      if (isSummaryEntry) {
        this.streamingOriginalEl.empty();
        void MarkdownRenderer.render(this.app, entry.result.text, this.streamingOriginalEl, "", this);
      } else {
        this.streamingOriginalEl.setText(entry.result.text);
      }
    }

    const isSummary = entry.result.language === "summary";
    if (!isSummary && !this.streamingCard.querySelector(".card-footer")) {
      this.appendEntryActions(this.streamingCard, entry);
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

    // 仅在锁定底部时自动滚动
    if (this.pinnedToBottom) {
      this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
    }
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
    void this.onClearTranscripts?.();
  }

  getEntries(): TranscriptEntry[] {
    return [...this.entries];
  }

  /** 从持久化数据恢复 entries（插件加载或视图重新打开时调用） */
  restoreEntries(entries: TranscriptEntry[]): void {
    this.entries = [...entries];
    this.transcriptContainer.empty();
    if (this.entries.length === 0) {
      this.showEmptyState();
      return;
    }
    for (const entry of this.entries) {
      this.renderCard(entry);
    }
    this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
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
      this.showTransientSuccess(btn, "file-text", t("view.showOriginal"));
    }

    const oldFormalEl = card.querySelector(".card-formal");
    if (oldFormalEl) oldFormalEl.remove();
    const originalEl = card.querySelector(".card-original") as HTMLElement | null;
    if (originalEl) {
      originalEl.setText(formalText);
      (card as HTMLElement).setAttr("data-showing-formal", "true");
    }
  }

  private renderCard(entry: TranscriptEntry): void {
    const card = this.transcriptContainer.createDiv({
      cls: "transcript-card",
      attr: { "data-entry-id": entry.id },
    });
    const isSummary = entry.result.language === "summary";
    const isMetaSummary = entry.result.language === "meta-summary";
    if (isSummary) {
      card.addClass("summary-card");
    }
    if (isMetaSummary) {
      card.addClass("summary-card");
      card.addClass("meta-summary-card");
    }

    // 卡片头部：时间 + 语言
    const cardHeader = card.createDiv("card-header");
    const timeEl = cardHeader.createEl("span", { cls: "card-timestamp" });
    timeEl.setText(this.formatWallTime(entry.wallTime));

    const langBadge = cardHeader.createEl("span", { cls: "card-lang-badge" });
    langBadge.setText(LANG_LABELS[entry.result.language] ?? entry.result.language);
    langBadge.addClass(`lang-${entry.result.language}`);

    // 摘要/二次摘要标题
    if (isMetaSummary) {
      const titleRow = card.createDiv("summary-title-row");
      const iconEl = titleRow.createDiv("summary-title-icon meta-summary-title-icon");
      setIcon(iconEl, "layers");
      titleRow.createEl("span", { cls: "summary-title meta-summary-title", text: t("view.aiMetaSummary") });
    } else if (isSummary) {
      const titleRow = card.createDiv("summary-title-row");
      const iconEl = titleRow.createDiv("summary-title-icon");
      setIcon(iconEl, "sparkles");
      titleRow.createEl("span", { cls: "summary-title", text: t("view.aiSummary") });
    }

    // 原文
    const originalEl = card.createDiv("card-original");
    if (isSummary || isMetaSummary) {
      void MarkdownRenderer.render(this.app, entry.result.text, originalEl, "", this);
    } else {
      originalEl.setText(entry.formalText ?? entry.result.text);
      if (entry.formalText) {
        card.setAttr("data-showing-formal", "true");
      }
    }

    if (!isSummary && !isMetaSummary) {
      this.appendEntryActions(card as HTMLElement, entry);
    }

    // 译文
    if (entry.translation) {
      const translationEl = card.createDiv("card-translation");
      translationEl.setText(entry.translation);
    } else if (this.shouldShowTranslationPlaceholder(entry.result.language)) {
      const loadingEl = card.createDiv("card-translation-loading");
      loadingEl.setText(t("view.translating"));
      loadingEl.setAttr("data-loading-text", t("view.translating"));
    }
  }

  private appendEntryActions(card: HTMLElement, entry: TranscriptEntry): void {
    const footer = card.createDiv("card-footer");
    this.appendTranslateButton(footer, card, entry);
    this.appendFormalizeButton(footer, card, entry);
  }

  private appendTranslateButton(footer: HTMLElement, card: HTMLElement, entry: TranscriptEntry): void {
    const translateBtn = footer.createEl("button", {
      cls: "entry-action-btn translate-btn",
      attr: { type: "button" },
    });
    this.setIconButton(translateBtn, "languages", t("view.translate"));

    translateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (translateBtn.classList.contains("loading") || translateBtn.classList.contains("done")) {
        return;
      }
      void this.handleTranslateClick(entry, translateBtn, card);
    });
  }

  private appendFormalizeButton(footer: HTMLElement, card: HTMLElement, entry: TranscriptEntry): void {
    const formalizeBtn = footer.createEl("button", {
      cls: "entry-action-btn formalize-btn",
      attr: { type: "button" },
    });
    this.setIconButton(
      formalizeBtn,
      entry.formalText ? "file-text" : "wand-2",
      entry.formalText ? t("view.showOriginal") : t("view.formalize"),
    );

    formalizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (formalizeBtn.classList.contains("loading") || formalizeBtn.classList.contains("done")) {
        return;
      }
      const currentEntry = this.entries.find((item) => item.id === entry.id) ?? entry;
      if (currentEntry.formalText) {
        this.toggleFormalizedText(currentEntry, formalizeBtn, card);
        return;
      }
      void this.handleFormalizeClick(entry.id, entry.result.text, formalizeBtn, card);
    });
  }

  private setIconButton(btn: HTMLElement, icon: string, label: string): void {
    btn.empty();
    btn.setAttr("aria-label", label);
    btn.setAttr("title", label);
    const btnIcon = btn.createDiv("entry-action-btn-icon");
    setIcon(btnIcon, icon);
  }

  private showTransientSuccess(btn: HTMLElement, resetIcon: string, resetLabel: string): void {
    btn.classList.add("done");
    this.setIconButton(btn, "check", t("view.actionDone"));
    window.setTimeout(() => {
      btn.classList.remove("done");
      this.setIconButton(btn, resetIcon, resetLabel);
    }, 2000);
  }

  private toggleFormalizedText(
    entry: TranscriptEntry,
    btn: HTMLElement,
    card: HTMLElement,
  ): void {
    const originalEl = card.querySelector(".card-original") as HTMLElement | null;
    if (!originalEl || !entry.formalText) return;

    const showingFormal = card.getAttr("data-showing-formal") === "true";
    if (showingFormal) {
      originalEl.setText(entry.result.text);
      card.setAttr("data-showing-formal", "false");
      this.setIconButton(btn, "wand-2", t("view.showFormalized"));
      return;
    }

    originalEl.setText(entry.formalText);
    card.setAttr("data-showing-formal", "true");
    this.setIconButton(btn, "file-text", t("view.showOriginal"));
  }

  private async handleTranslateClick(
    entry: TranscriptEntry,
    btn: HTMLElement,
    card: HTMLElement,
  ): Promise<void> {
    if (!this.onTranslate) {
      new Notice(t("view.translateNotConfigured"));
      return;
    }

    btn.classList.add("loading");
    this.setIconButton(btn, "loader-circle", t("view.translating"));

    const oldLoading = card.querySelector(".card-translation-loading");
    if (oldLoading) oldLoading.remove();
    const loadingEl = document.createElement("div");
    loadingEl.className = "card-translation-loading";
    loadingEl.textContent = t("view.translating");
    loadingEl.setAttr("data-loading-text", t("view.translating"));
    card.appendChild(loadingEl);

    try {
      const result = await Promise.resolve(
        this.onTranslate(entry.id, entry.result.text, entry.result.language),
      );
      this.updateTranslation(entry.id, result);
      btn.classList.remove("loading");
      this.showTransientSuccess(btn, "languages", t("view.translate"));
    } catch (err) {
      loadingEl.remove();
      btn.classList.remove("loading");
      this.setIconButton(btn, "languages", t("view.translate"));
      const detail = err instanceof Error ? err.message : "unknown error";
      new Notice(`${t("view.translateFailed")}: ${detail}`);
    }
  }

  private async handleFormalizeClick(
    entryId: string,
    text: string,
    btn: HTMLElement,
    card: HTMLElement,
  ): Promise<void> {
    if (!this.onFormalize) {
      new Notice(t("view.formalizeNotConfigured"));
      return;
    }

    btn.classList.add("loading");
    this.setIconButton(btn, "loader-circle", t("view.formalizing"));

    // 添加加载占位
    const oldLoading = card.querySelector(".card-formal-loading");
    if (oldLoading) oldLoading.remove();
    const originalEl = card.querySelector(".card-original");
    const loadingEl = document.createElement("div");
    loadingEl.className = "card-formal-loading";
    loadingEl.textContent = t("view.formalizeLoading");
    loadingEl.setAttr("data-loading-text", t("view.formalizeLoading"));
    if (originalEl?.nextSibling) {
      card.insertBefore(loadingEl, originalEl.nextSibling);
    } else {
      card.appendChild(loadingEl);
    }

    let watchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!btn.classList.contains("loading")) return;
      loadingEl.remove();
      btn.classList.remove("loading");
      this.setIconButton(btn, "wand-2", t("view.formalize"));
      new Notice(`${t("view.formalizeTimeout")}(>${Math.floor(FORMALIZE_UI_TIMEOUT_MS / 1000)}${t("view.formalizeTimeoutDetail")}`);
    }, FORMALIZE_UI_TIMEOUT_MS + 1000);

    try {
      const result = await withTimeout(
        Promise.resolve().then(() => this.onFormalize!(entryId, text)),
        FORMALIZE_UI_TIMEOUT_MS,
        `${t("view.formalizeTimeout")}(>${Math.floor(FORMALIZE_UI_TIMEOUT_MS / 1000)}${t("view.formalizeTimeoutDetail")}`,
      );
      this.updateFormalText(entryId, result);
    } catch (err) {
      loadingEl.remove();
      btn.classList.remove("loading");
      this.setIconButton(btn, "wand-2", t("view.formalize"));
      const detail = err instanceof Error ? err.message : "unknown error";
      new Notice(`${t("view.formalizeFailed")}: ${detail}`);
    } finally {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
    }
  }

  private shouldShowTranslationPlaceholder(_language: string): boolean {
    return false;
  }

  private formatWallTime(date: Date): string {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  /** 用户是否已滚动到底部附近（未手动上翻浏览） */
  private isNearBottom(threshold = 80): boolean {
    const { scrollTop, scrollHeight, clientHeight } = this.transcriptContainer;
    return scrollHeight - scrollTop - clientHeight <= threshold;
  }

  private updateScrollBtnVisibility(): void {
    if (this.isNearBottom()) {
      this.scrollToBottomBtn.removeClass("visible");
    } else {
      this.scrollToBottomBtn.addClass("visible");
    }
  }

  private showEmptyState(): void {
    const empty = this.transcriptContainer.createDiv("empty-state");
    const iconEl = empty.createDiv("empty-icon");
    setIcon(iconEl, "microphone");
    empty.createEl("p", { text: t("view.emptyStateTitle") });
    empty.createEl("p", {
      text: t("view.emptyStateSubtitle"),
      cls: "empty-subtitle",
    });
  }
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function clampPanelFontSize(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 15;
  return Math.min(24, Math.max(12, Math.round(numeric)));
}

function isAiOutputLanguage(value: unknown): value is AiOutputLanguage {
  return value === "auto" || value === "zh" || value === "en";
}
