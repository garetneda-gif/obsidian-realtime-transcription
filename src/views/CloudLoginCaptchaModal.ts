import { App, Modal, Notice, Setting } from "obsidian";
import type { CloudAuthService, CloudCaptcha } from "../services/CloudAuthService";
import { t } from "../i18n";

export interface CloudCaptchaAnswer {
  captchaId: string;
  answer: string;
}

export class CloudLoginCaptchaModal extends Modal {
  private captcha: CloudCaptcha | null = null;
  private answer = "";
  private result: CloudCaptchaAnswer | null = null;
  private resolvePromise: ((value: CloudCaptchaAnswer | null) => void) | null = null;

  constructor(app: App, private service: CloudAuthService) {
    super(app);
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: t("settings.cloud.captcha.title") });
    contentEl.createEl("p", { text: t("settings.cloud.captcha.desc"), cls: "setting-item-description" });

    contentEl.createEl("img", {
      cls: "realtime-cloud-captcha-image",
      attr: {
        alt: t("settings.cloud.captcha.title"),
        src: this.captcha?.image || "",
      },
    });

    new Setting(contentEl)
      .setName(t("settings.cloud.captcha.answer"))
      .addText((text) => {
        text.setPlaceholder("ABCD").onChange((value) => { this.answer = value.trim(); });
        setTimeout(() => text.inputEl.focus(), 50);
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") this.submit();
        });
      });

    new Setting(contentEl)
      .addButton((button) => button
        .setButtonText(t("settings.cloud.captcha.refresh"))
        .onClick(() => this.loadCaptcha()))
      .addButton((button) => button
        .setButtonText(t("settings.cloud.login.btn"))
        .setCta()
        .onClick(() => this.submit()));

    if (!this.captcha) void this.loadCaptcha();
  }

  private async loadCaptcha(): Promise<void> {
    try {
      this.captcha = await this.service.getCaptcha();
      this.answer = "";
      this.render();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }

  private submit(): void {
    if (!this.captcha || !this.answer) {
      new Notice(t("settings.cloud.captcha.required"));
      return;
    }
    this.result = { captchaId: this.captcha.captcha_id, answer: this.answer };
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolvePromise?.(this.result);
  }

  waitForAnswer(): Promise<CloudCaptchaAnswer | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}
