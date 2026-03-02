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
    if (!this.settings.apiUrl?.trim()) return false;
    if (!this.settings.model?.trim()) return false;
    return language === "en" || language === "ja" || language === "ko";
  }

  canFormalize(): boolean {
    if (!this.settings.apiKey) return false;
    if (!this.settings.apiUrl?.trim()) return false;
    if (!this.settings.model?.trim()) return false;
    return true;
  }

  async formalize(text: string): Promise<string> {
    if (!this.settings.apiKey) {
      throw new Error("未配置翻译 API Key");
    }
    const model = this.settings.model?.trim();
    const apiUrl = normalizeApiUrl(this.settings.apiUrl);
    if (!model) throw new Error("未配置翻译模型");
    if (!apiUrl) throw new Error("未配置翻译 API 端点");

    try {
      const response = await requestUrl({
        url: apiUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.settings.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "你是一个文本润色助手。请将用户提供的口语化语音转写文本改写为通顺的书面语。要求：保持原意不变，修正口语化表达、语气词、重复和冗余，使句子更简洁正式。只输出改写后的结果，不要解释。",
            },
            { role: "user", content: text },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
      });

      const data = response.json;
      const result = extractTextFromResponse(data);
      if (!result) {
        const errMsg =
          typeof data?.error?.message === "string"
            ? data.error.message
            : "润色 API 返回格式不受支持";
        throw new Error(errMsg);
      }
      return result;
    } catch (err) {
      console.error("润色失败:", err);
      throw err;
    }
  }

  async translate(text: string, fromLang: string): Promise<string> {
    if (!this.settings.apiKey) {
      throw new Error("未配置翻译 API Key");
    }
    const model = this.settings.model?.trim();
    const apiUrl = normalizeApiUrl(this.settings.apiUrl);
    if (!model) {
      throw new Error("未配置翻译模型");
    }
    if (!apiUrl) {
      throw new Error("未配置翻译 API 端点");
    }

    const langName =
      fromLang === "en" ? "英文" :
      fromLang === "ja" ? "日文" :
      fromLang === "ko" ? "韩文" : fromLang;

    try {
      const response = await requestUrl({
        url: apiUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.settings.apiKey}`,
        },
        body: JSON.stringify({
          model,
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
      const translated = extractTextFromResponse(data);
      if (!translated) {
        const errMsg = typeof data?.error?.message === "string"
          ? data.error.message
          : "翻译 API 返回格式不受支持";
        throw new Error(errMsg);
      }
      return translated;
    } catch (err) {
      console.error("翻译失败:", err);
      throw err;
    }
  }
}

function normalizeApiUrl(url: string): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "";

  // 兼容常见误配：把 /v1/completions 自动转成 /v1/chat/completions
  if (/\/v1\/completions\/?$/i.test(trimmed)) {
    return trimmed.replace(/\/v1\/completions\/?$/i, "/v1/chat/completions");
  }
  return trimmed;
}

function extractTextFromResponse(data: any): string {
  const choice = data?.choices?.[0];
  if (!choice) return "";

  // Chat Completions 兼容格式
  const chatContent = choice?.message?.content;
  if (typeof chatContent === "string" && chatContent.trim()) {
    return chatContent.trim();
  }
  if (Array.isArray(chatContent)) {
    const joined = chatContent
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    if (joined) return joined;
  }

  // Legacy Completions 兼容格式
  const text = choice?.text;
  if (typeof text === "string" && text.trim()) {
    return text.trim();
  }

  return "";
}
