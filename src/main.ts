import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_TRANSCRIPTION } from "./constants";
import { TranscriptionView } from "./views/TranscriptionView";
import { BackendManager } from "./services/BackendManager";
import { WebSocketClient } from "./services/WebSocketClient";
import { AudioCapture } from "./services/AudioCapture";
import { TranslationService } from "./services/TranslationService";
import { TranscriptionSettingTab } from "./settings";
import { DEFAULT_SETTINGS, PluginSettings, TranscriptEntry, TranscriptionResult } from "./types";

export default class RealtimeTranscriptionPlugin extends Plugin {
  settings!: PluginSettings;
  private backendManager!: BackendManager;
  private wsClient!: WebSocketClient;
  private audioCapture!: AudioCapture;
  private translationService!: TranslationService;
  private recording = false;
  private entryCounter = 0;

  async onload(): Promise<void> {
    await this.loadSettings();

    // 注册侧边栏视图
    this.registerView(VIEW_TYPE_TRANSCRIPTION, (leaf) => {
      const view = new TranscriptionView(leaf);
      view.onToggleRecording = () => this.toggleRecording();
      view.onExport = () => this.exportToNote();
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
    const pluginDir = (this.manifest as { dir?: string }).dir ?? "";
    this.backendManager = new BackendManager(pluginDir, this.settings);
    this.wsClient = new WebSocketClient();
    this.audioCapture = new AudioCapture();
    this.translationService = new TranslationService(this.settings.translation);

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
  }

  async onunload(): Promise<void> {
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
    if (this.recording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  private async startRecording(): Promise<void> {
    const view = this.getView();
    if (!view) {
      await this.activateView();
    }

    const currentView = this.getView();
    if (!currentView) return;

    // 1. 启动后端
    currentView.setConnectionStatus(false, "启动后端...");
    const started = await this.backendManager.start();
    if (!started) return;

    // 2. 连接 WebSocket
    currentView.setConnectionStatus(false, "连接中...");
    try {
      await this.wsClient.connect(this.settings.backendPort);
    } catch {
      new Notice("无法连接到转写后端");
      return;
    }

    // 3. 重置 VAD 状态
    this.wsClient.sendCommand({ type: "reset" });

    // 4. 开始音频采集
    try {
      await this.audioCapture.start((data) => {
        this.wsClient.sendAudio(data);
      });
    } catch (err) {
      new Notice("无法访问麦克风，请检查权限设置");
      this.wsClient.disconnect();
      return;
    }

    this.recording = true;
    currentView.setRecordingState(true);
    currentView.setListeningStatus(true);
    new Notice("开始录制");
  }

  private async stopRecording(): Promise<void> {
    this.audioCapture.stop();
    this.recording = false;

    const view = this.getView();
    if (view) {
      view.setRecordingState(false);
      view.setConnectionStatus(this.wsClient.isConnected);
    }

    new Notice("录制已停止");
  }

  private async handleTranscriptionResult(result: TranscriptionResult): Promise<void> {
    const view = this.getView();
    if (!view) return;

    this.entryCounter++;
    const entry: TranscriptEntry = {
      id: `entry-${this.entryCounter}`,
      result,
      translation: null,
      wallTime: new Date(),
    };

    view.addTranscript(entry);

    // 英文等非中文内容自动翻译
    if (this.translationService.shouldTranslate(result.language)) {
      try {
        const translation = await this.translationService.translate(
          result.text,
          result.language,
        );
        entry.translation = translation;
        view.updateTranslation(entry.id, translation);
      } catch (err) {
        console.error("翻译失败:", err);
        view.updateTranslation(entry.id, "[翻译失败]");
      }
    }
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
