import { requestUrl } from "obsidian";
import { extractTextFromResponse } from "../utils/llmResponse";

export interface AiApiConnectionConfig {
  label: string;
  apiUrl: string;
  apiKey: string;
  model: string;
}

export async function testOpenAiCompatibleConnection(config: AiApiConnectionConfig): Promise<string> {
  const apiUrl = normalizeApiUrl(config.apiUrl);
  const apiKey = config.apiKey?.trim();
  const model = config.model?.trim();

  if (!apiUrl) throw new Error(`${config.label} API 端点为空`);
  if (!apiKey) throw new Error(`${config.label} API Key 为空`);
  if (!model) throw new Error(`${config.label}模型为空`);

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
        { role: "system", content: "你是一个连接测试助手。只回复 OK，不要解释。" },
        { role: "user", content: "请只回复 OK" },
      ],
      temperature: 0,
    }),
  });

  const data = response.json;
  if (data?.error) {
    const message = typeof data.error.message === "string"
      ? data.error.message
      : typeof data.error === "string" ? data.error : `${config.label} API 返回错误`;
    throw new Error(message);
  }

  const result = extractTextFromResponse(data);
  if (!result) throw new Error(`${config.label} API 返回格式不受支持`);
  return `${config.label}: ${preview(result)}`;
}

function normalizeApiUrl(url: string): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "";
  if (/\/v1\/completions\/?$/i.test(trimmed)) {
    return trimmed.replace(/\/v1\/completions\/?$/i, "/v1/chat/completions");
  }
  return trimmed;
}

function preview(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > 80 ? `${singleLine.slice(0, 80)}...` : singleLine;
}
