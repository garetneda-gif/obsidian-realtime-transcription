import { requestUrl } from "obsidian";
import { SummarySettings } from "../types";
import { t } from "../i18n";
import { extractTextFromResponse } from "../utils/llmResponse";
import { AgentBackendService } from "./AgentBackendService";

export class SummaryService {
  private settings: SummarySettings;
  private agentBackend: AgentBackendService;

  constructor(settings: SummarySettings, agentBackend: AgentBackendService) {
    this.settings = settings;
    this.agentBackend = agentBackend;
  }

  updateSettings(settings: SummarySettings): void {
    this.settings = settings;
  }

  isConfigured(): boolean {
    if (!this.settings.enabled) return false;
    return this.agentBackend.isConfigured() || this.hasApiConfig();
  }

  async summarize(text: string, outputLanguage: string): Promise<string> {
    const systemPrompt =
      `你是会议记录整理助手。请将输入内容总结为${outputLanguage}的 3-6 条要点。直接输出要点列表，不要加任何前言、标题或说明文字。简洁准确，不要编造信息。`;
    const agentResult = await this.runAgentIfConfigured(systemPrompt, text, "摘要");
    if (agentResult) return agentResult;

    const apiUrl = normalizeApiUrl(this.settings.apiUrl);
    const model = this.settings.model?.trim();
    const apiKey = this.settings.apiKey?.trim();

    if (!apiKey) throw new Error(t("summary.noApiKey"));
    if (!apiUrl) throw new Error(t("summary.noApiUrl"));
    if (!model) throw new Error(t("summary.noModel"));

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
            content: systemPrompt,
          },
          { role: "user", content: text },
        ],
        temperature: 0.2,
      }),
    });

    const data = response.json;
    const summary = extractTextFromResponse(data);
    if (!summary) {
      throw new Error(getResponseErrorMessage(data, t("summary.unsupportedFormat")));
    }
    return summary;
  }

  async metaSummarize(summaries: string[], outputLanguage: string): Promise<string> {
    const combined = summaries.map((s, i) => `【摘要 ${i + 1}】\n${s}`).join("\n\n");
    const systemPrompt =
      `你是高级会议记录整理助手。下面是多段会议摘要，请将它们综合为一份结构化的总摘要。输出${outputLanguage}，按主题分组归纳，使用 Markdown 格式（二级标题 + 要点列表）。直接输出内容，不要加任何前言或说明。简洁准确，不要编造信息。`;
    const agentResult = await this.runAgentIfConfigured(systemPrompt, combined, "二次摘要");
    if (agentResult) return agentResult;

    const apiUrl = normalizeApiUrl(this.settings.apiUrl);
    const model = this.settings.model?.trim();
    const apiKey = this.settings.apiKey?.trim();

    if (!apiKey) throw new Error(t("summary.noApiKey"));
    if (!apiUrl) throw new Error(t("summary.noApiUrl"));
    if (!model) throw new Error(t("summary.noModel"));

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
            content: systemPrompt,
          },
          { role: "user", content: combined },
        ],
        temperature: 0.2,
      }),
    });

    const data = response.json;
    const result = extractTextFromResponse(data);
    if (!result) {
      throw new Error(getResponseErrorMessage(data, t("summary.metaUnsupportedFormat")));
    }
    return result;
  }

  async generateTitle(contentSnippet: string, outputLanguage: string): Promise<string> {
    const systemPrompt =
      `你是标题生成助手。根据语音转写内容拟定一个${outputLanguage}简短标题，10字以内，不带标点符号。只输出标题本身。`;
    const agentResult = await this.runAgentIfConfigured(systemPrompt, contentSnippet, "AI 命名");
    if (agentResult) return cleanTitle(agentResult);

    const apiUrl = normalizeApiUrl(this.settings.apiUrl);
    const model = this.settings.model?.trim();
    const apiKey = this.settings.apiKey?.trim();

    if (!apiKey) throw new Error(t("summary.noApiKey"));
    if (!apiUrl) throw new Error(t("summary.noApiUrl"));
    if (!model) throw new Error(t("summary.noModel"));

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
            content: systemPrompt,
          },
          { role: "user", content: contentSnippet },
        ],
        temperature: 0.3,
      }),
    });

    const data = response.json;
    const title = extractTextFromResponse(data);
    if (!title) {
      throw new Error(getResponseErrorMessage(data, t("summary.titleUnsupportedFormat")));
    }
    return cleanTitle(title);
  }

  private hasApiConfig(): boolean {
    return Boolean(
      this.settings.apiKey?.trim() &&
      this.settings.apiUrl?.trim() &&
      this.settings.model?.trim(),
    );
  }

  private async runAgentIfConfigured(systemPrompt: string, userText: string, label: string): Promise<string | null> {
    if (!this.agentBackend.isConfigured()) return null;
    return this.agentBackend.run({ systemPrompt, userText, label });
  }
}

function cleanTitle(title: string): string {
  return title.replace(/[。！？.!?"'""'']/g, "").trim();
}

function getResponseErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return fallback;

  const error = (data as { error?: unknown }).error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof error === "string" && error.trim()) return error;

  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return fallback;
  const first = choices[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return fallback;
  const finishReason = (first as { finish_reason?: unknown }).finish_reason;
  if (finishReason === "length") {
    return "摘要 API 输出被截断，请换非推理模型或缩短摘要触发字数";
  }
  if (finishReason === "content_filter") {
    return "摘要 API 输出被内容过滤";
  }
  return fallback;
}

function normalizeApiUrl(url: string): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "";
  if (/\/v1\/completions\/?$/i.test(trimmed)) {
    return trimmed.replace(/\/v1\/completions\/?$/i, "/v1/chat/completions");
  }
  return trimmed;
}
