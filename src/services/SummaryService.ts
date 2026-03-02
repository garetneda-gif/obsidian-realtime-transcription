import { requestUrl } from "obsidian";
import { SummarySettings } from "../types";

export class SummaryService {
  private settings: SummarySettings;

  constructor(settings: SummarySettings) {
    this.settings = settings;
  }

  updateSettings(settings: SummarySettings): void {
    this.settings = settings;
  }

  isConfigured(): boolean {
    return Boolean(
      this.settings.enabled &&
      this.settings.apiKey?.trim() &&
      this.settings.apiUrl?.trim() &&
      this.settings.model?.trim(),
    );
  }

  async summarize(text: string): Promise<string> {
    const apiUrl = normalizeApiUrl(this.settings.apiUrl);
    const model = this.settings.model?.trim();
    const apiKey = this.settings.apiKey?.trim();

    if (!apiKey) throw new Error("未配置摘要 API Key");
    if (!apiUrl) throw new Error("未配置摘要 API 端点");
    if (!model) throw new Error("未配置摘要模型");

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
              "你是会议记录整理助手。请将输入内容总结为简体中文，输出 3-6 条要点，简洁准确，不要编造信息。",
          },
          { role: "user", content: text },
        ],
        temperature: 0.2,
        max_tokens: 900,
      }),
    });

    const data = response.json;
    const summary = extractTextFromResponse(data);
    if (!summary) {
      const errMsg = typeof data?.error?.message === "string"
        ? data.error.message
        : "摘要 API 返回格式不受支持";
      throw new Error(errMsg);
    }
    return summary;
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
