import { App, Modal, Setting } from "obsidian";

export class TitleInputModal extends Modal {
  private result: string | null = null;
  private resolvePromise: ((value: string | null) => void) | null = null;

  constructor(app: App, private defaultTitle: string) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "输入导出文件名" });

    let inputValue = this.defaultTitle;

    new Setting(contentEl)
      .setName("文件名")
      .addText((text) => {
        text
          .setValue(this.defaultTitle)
          .setPlaceholder("请输入文件名")
          .onChange((value) => {
            inputValue = value;
          });
        setTimeout(() => text.inputEl.focus(), 50);
        text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter") {
            this.result = inputValue.trim() || null;
            this.close();
          }
        });
      });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("确定")
          .setCta()
          .onClick(() => {
            this.result = inputValue.trim() || null;
            this.close();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("取消").onClick(() => {
          this.result = null;
          this.close();
        }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolvePromise?.(this.result);
  }

  waitForInput(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}
