import { requestUrl } from "obsidian";
import { TranslationSettings } from "../types";
import { extractTextFromResponse } from "../utils/llmResponse";
import { AgentBackendService } from "./AgentBackendService";

export class TranslationService {
  private settings: TranslationSettings;
  private agentBackend: AgentBackendService;

  constructor(settings: TranslationSettings, agentBackend: AgentBackendService) {
    this.settings = settings;
    this.agentBackend = agentBackend;
  }

  updateSettings(settings: TranslationSettings): void {
    this.settings = settings;
  }

  canTranslate(): boolean {
    if (!this.settings.enabled) return false;
    return this.agentBackend.isConfigured() || this.hasApiConfig();
  }

  isConfigured(): boolean {
    return this.agentBackend.isConfigured() || this.hasApiConfig();
  }

  shouldTranslate(language: string, targetLanguage: "zh" | "en" | "custom"): boolean {
    if (!this.canTranslate()) return false;
    if (language === "summary" || language === "meta-summary") return false;
    if (targetLanguage === "custom") return true;
    const normalized = language === "yue" ? "zh" : language;
    return normalized !== targetLanguage;
  }

  async formalize(text: string, outputLanguage: string, signal?: AbortSignal): Promise<string> {
    // 复用 translate 的完整调用链，仅替换 system prompt
    return this.callApi(
      `你是一个文本润色助手。请将用户提供的口语化语音转写文本改写为${outputLanguage}的通顺书面语。要求：保持原意不变，修正口语化表达、语气词、重复和冗余，使句子更简洁正式。只输出改写后的结果，不要解释。`,
      text,
      "润色",
      signal,
    );
  }

  async translate(text: string, fromLang: string, outputLanguage: string, signal?: AbortSignal): Promise<string> {
    const langName =
      fromLang === "en" ? "英文" :
      fromLang === "ja" ? "日文" :
      fromLang === "ko" ? "韩文" :
      fromLang === "hybrid" ? "中英混合" : fromLang;
    return this.callApi(
      `你是一个专业翻译助手。请将以下${langName}文本翻译为${outputLanguage}。只输出翻译结果，不要解释。`,
      text,
      "翻译",
      signal,
    );
  }

  private async callApi(systemPrompt: string, userText: string, label: string, signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    if (this.agentBackend.isConfigured()) {
      return this.agentBackend.run({ systemPrompt, userText, label, signal });
    }

    if (!this.settings.apiKey) throw new Error(`未配置${label} API Key`);
    const model = this.settings.model?.trim();
    const apiUrl = normalizeApiUrl(this.settings.apiUrl);
    if (!model) throw new Error(`未配置${label}模型`);
    if (!apiUrl) throw new Error(`未配置${label} API 端点`);

    const timeoutMs = 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await abortable(requestUrl({
        url: apiUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.settings.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText },
          ],
          temperature: 0.3,
        }),
      }), signal, controller.signal);
      clearTimeout(timer);
      throwIfAborted(signal);

      const data = response.json;
      // 检查 API 级错误（某些代理返回 200 + error body）
      if (data?.error) {
        const errMsg = typeof data.error.message === "string"
          ? data.error.message
          : typeof data.error === "string" ? data.error : `${label} API 返回错误`;
        throw new Error(errMsg);
      }
      const result = extractTextFromResponse(data);
      if (!result) {
        throw new Error(`${label} API 返回格式不受支持`);
      }
      return result;
    } catch (err) {
      clearTimeout(timer);
      console.error(`${label}失败:`, err);
      throw err;
    }
  }

  private hasApiConfig(): boolean {
    if (!this.settings.apiKey) return false;
    if (!this.settings.apiUrl?.trim()) return false;
    if (!this.settings.model?.trim()) return false;
    return true;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("操作已取消");
  error.name = "AbortError";
  throw error;
}

function abortable<T>(promise: Promise<T>, ...signals: Array<AbortSignal | undefined>): Promise<T> {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  for (const signal of activeSignals) {
    throwIfAborted(signal);
  }
  if (activeSignals.length === 0) return promise;
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      const rejectAbort = () => {
        const error = new Error("操作已取消");
        error.name = "AbortError";
        reject(error);
      };
      for (const signal of activeSignals) {
        signal.addEventListener("abort", rejectAbort, { once: true });
      }
    }),
  ]);
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
