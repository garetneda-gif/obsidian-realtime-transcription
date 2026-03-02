import { requestUrl } from "obsidian";
import { TranslationSettings } from "../types";

export class TranslationService {
  private settings: TranslationSettings;

  constructor(settings: TranslationSettings) {
    this.settings = settings;
  }

  updateSettings(settings: TranslationSettings): void {
    this.settings = settings;
  }

  shouldTranslate(language: string): boolean {
    if (!this.settings.enabled) return false;
    if (!this.settings.apiKey) return false;
    // 中文和粤语不需要翻译
    return language !== "zh" && language !== "yue";
  }

  async translate(text: string, fromLang: string): Promise<string> {
    if (!this.settings.apiKey) {
      throw new Error("未配置翻译 API Key");
    }

    const langName =
      fromLang === "en" ? "英文" :
      fromLang === "ja" ? "日文" :
      fromLang === "ko" ? "韩文" : fromLang;

    try {
      const response = await requestUrl({
        url: this.settings.apiUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.settings.apiKey}`,
        },
        body: JSON.stringify({
          model: this.settings.model,
          messages: [
            {
              role: "system",
              content: `你是一个专业翻译助手。请将以下${langName}文本翻译为简体中文。只输出翻译结果，不要解释。`,
            },
            { role: "user", content: text },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
      });

      const data = response.json;
      return data.choices[0].message.content.trim();
    } catch (err) {
      console.error("翻译失败:", err);
      throw err;
    }
  }
}
