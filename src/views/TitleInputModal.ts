import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";

export class TitleInputModal extends Modal {
  private result: string | null = null;
  private resolvePromise: ((value: string | null) => void) | null = null;

  constructor(app: App, private defaultTitle: string) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: t("modal.exportTitle") });

    let inputValue = this.defaultTitle;

    new Setting(contentEl)
      .setName(t("modal.fileName"))
      .addText((text) => {
        text
          .setValue(this.defaultTitle)
          .setPlaceholder(t("modal.fileNamePlaceholder"))
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
          .setButtonText(t("modal.confirm"))
          .setCta()
          .onClick(() => {
            this.result = inputValue.trim() || null;
            this.close();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText(t("modal.cancel")).onClick(() => {
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
