import { requestUrl, RequestUrlResponse } from "obsidian";
import { FormalizeSettings } from "../types";

const FORMALIZE_TIMEOUT_MS = 30000;

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
      throw new Error("待润色文本为空");
    }

    const apiUrl = normalizeApiUrl(this.settings.apiUrl);
    const model = this.settings.model?.trim();
    const apiKey = this.settings.apiKey?.trim();

    if (!apiKey) throw new Error("未配置润色 API Key");
    if (!apiUrl) throw new Error("未配置润色 API 端点");
    if (!model) throw new Error("未配置润色模型");

    const response = await Promise.race<RequestUrlResponse>([
      requestUrl({
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
    }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`润色请求超时（>${Math.floor(FORMALIZE_TIMEOUT_MS / 1000)} 秒）`)), FORMALIZE_TIMEOUT_MS),
      ),
    ]);

    const data = response.json;
    if (data?.error) {
      const errMsg = typeof data.error.message === "string"
        ? data.error.message
        : "润色 API 返回错误";
      throw new Error(errMsg);
    }
    const result = extractTextFromResponse(data);
    if (!result) {
      throw new Error("润色 API 返回格式不受支持");
    }
    return result;
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

function extractTextFromResponse(data: any): string {
  const choice = data?.choices?.[0];
  if (!choice) return "";

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

  const text = choice?.text;
  if (typeof text === "string" && text.trim()) {
    return text.trim();
  }
  return "";
}
