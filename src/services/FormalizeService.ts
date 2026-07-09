import { requestUrl } from "obsidian";
import { FormalizeSettings } from "../types";
import { t } from "../i18n";
import { extractTextFromResponse } from "../utils/llmResponse";

export class FormalizeService {
  private settings: FormalizeSettings;

  constructor(settings: FormalizeSettings) {
    this.settings = settings;
  }

  updateSettings(settings: FormalizeSettings): void {
    this.settings = settings;
  }

  canFormalize(): boolean {
    return Boolean(
      this.settings.apiKey?.trim() &&
      this.settings.apiUrl?.trim() &&
      this.settings.model?.trim(),
    );
  }

  async formalize(text: string): Promise<string> {
    const inputText = text?.trim();
    if (!inputText) {
      throw new Error(t("formalize.emptyText"));
    }

    const apiUrl = normalizeApiUrl(this.settings.apiUrl);
    const model = this.settings.model?.trim();
    const apiKey = this.settings.apiKey?.trim();

    if (!apiKey) throw new Error(t("formalize.noApiKey"));
    if (!apiUrl) throw new Error(t("formalize.noApiUrl"));
    if (!model) throw new Error(t("formalize.noModel"));

    console.log("[Formalize] 开始请求", { apiUrl, model });

    try {
      const response = await requestUrl({
        url: apiUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "你是一个文本润色助手。请将用户提供的口语化语音转写文本改写为通顺的书面语。要求：保持原意不变，修正口语化表达、语气词、重复和冗余，使句子更简洁正式。只输出改写后的结果，不要解释。",
            },
            { role: "user", content: inputText },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
      });

      console.log("[Formalize] 收到响应", response.status);

      const data = response.json;
      if (data?.error) {
        const errMsg = typeof data.error.message === "string"
          ? data.error.message
          : t("formalize.apiError");
        throw new Error(errMsg);
      }
      const result = extractTextFromResponse(data);
      if (!result) {
        throw new Error(t("formalize.unsupportedFormat"));
      }
      return result;
    } catch (err) {
      console.error("[Formalize] 请求失败:", err);
      throw err;
    }
  }
}

function normalizeApiUrl(url: string): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "";
  if (/\/v1\/completions\/?$/i.test(trimmed)) {
    return trimmed.replace(/\/v1\/completions\/?$/i, "/v1/chat/completions");
  }
  return trimmed;
}
