export interface TranslationSettings {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  model: string;
}

export interface FormalizeSettings {
  apiUrl: string;
  apiKey: string;
  model: string;
}

export type SummaryDisplayMode = "summaryOnly" | "both";
export type ExportMode = "summaryOnly" | "full";
export type ExportTitleMode = "timestamp" | "ai" | "manual";
export type ExportTextMode = "original" | "formalized";
export type CopyContentMode = "summaryOnly" | "full";
export type CopyRangeMode = "all" | "latest";
export type AiOutputLanguage = "auto" | "zh" | "en" | "custom";
export type AiBackendProvider = "openai-compatible" | "claude" | "codex" | "opencode";
export type AiBackendProfileRole = "fast" | "smart";

export interface AiBackendProfileSettings {
  provider: AiBackendProvider;
  apiUrl: string;
  apiKey: string;
  cliPath: string;
  model: string;
  timeoutSec: number;
  extraArgs: string;
}

export interface AiBackendSettings {
  fast: AiBackendProfileSettings;
  smart: AiBackendProfileSettings;
}

export const DEFAULT_AI_BACKEND_PROFILE: AiBackendProfileSettings = {
  provider: "openai-compatible",
  apiUrl: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  cliPath: "",
  model: "",
  timeoutSec: 90,
  extraArgs: "",
};

export function createDefaultAiBackendSettings(): AiBackendSettings {
  return {
    fast: { ...DEFAULT_AI_BACKEND_PROFILE },
    smart: { ...DEFAULT_AI_BACKEND_PROFILE },
  };
}

export function normalizeAiBackendSettings(value: unknown): AiBackendSettings {
  const raw = isRecord(value) ? value : {};
  const legacyCandidate = hasLegacyAiBackendShape(raw) ? raw : {};
  return {
    fast: normalizeAiBackendProfileSettings(raw.fast ?? legacyCandidate),
    smart: normalizeAiBackendProfileSettings(raw.smart ?? legacyCandidate),
  };
}

export function normalizeAiBackendProfileSettings(value: unknown): AiBackendProfileSettings {
  const raw = isRecord(value) ? value : {};
  return {
    provider: normalizeAiBackendProvider(raw.provider),
    apiUrl: stringValue(raw.apiUrl, DEFAULT_AI_BACKEND_PROFILE.apiUrl),
    apiKey: stringValue(raw.apiKey, DEFAULT_AI_BACKEND_PROFILE.apiKey),
    cliPath: stringValue(raw.cliPath, DEFAULT_AI_BACKEND_PROFILE.cliPath),
    model: stringValue(raw.model, DEFAULT_AI_BACKEND_PROFILE.model),
    timeoutSec: numberValue(raw.timeoutSec, DEFAULT_AI_BACKEND_PROFILE.timeoutSec),
    extraArgs: stringValue(raw.extraArgs, DEFAULT_AI_BACKEND_PROFILE.extraArgs),
  };
}

export interface SummarySettings {
  enabled: boolean;
  displayMode: SummaryDisplayMode;
  apiUrl: string;
  apiKey: string;
  model: string;
  thresholdChars: number;
}

export interface VadSettings {
  threshold: number;
  minSilenceDuration: number;
}

export type RealtimeProfile = "stable" | "fast";
export type RecognitionMode = "zh-en" | "zh" | "en";
export type GpuProvider = "cpu" | "cuda" | "coreml";

export type AsrProvider = "local" | "tencent" | "cloud";

export const HOSTED_CLOUD_ENABLED = false;

/** 判断是否为云端 ASR 提供方（tencent BYOK 或 cloud 付费托管） */
export function isCloudASR(provider: AsrProvider): boolean {
  return provider !== "local";
}

/** 判断是否为付费托管模式 */
export function isHostedCloud(provider: AsrProvider): boolean {
  return provider === "cloud";
}

export interface CloudAuthSettings {
  serverUrl: string;
  token: string;
  refreshToken: string;
  tokenExpiresAt: string;
  balanceCents: number;
}

export interface TencentASRSettings {
  appId: string;
  secretId: string;
  secretKey: string;
  /** 引擎模型：16k_zh / 16k_en / 16k_zh_large 等 */
  engineModelType: string;
}

export interface AggregationSettings {
  flushWindowSec: number;
  maxChars: number;
  realtimePreview: boolean;
}

export interface MetaSummarySettings {
  enabled: boolean;
  /** 每累积多少个摘要触发一次二次摘要 */
  triggerCount: number;
}

export interface PluginSettings {
  locale: "zh" | "en";
  asrProvider: AsrProvider;
  tencentASR: TencentASRSettings;
  cloudAuth: CloudAuthSettings;
  pythonPath: string;
  backendPort: number;
  modelDir: string;
  useInt8: boolean;
  autoStartBackend: boolean;
  realtimeProfile: RealtimeProfile;
  recognitionMode: RecognitionMode;
  gpuProvider: GpuProvider;
  translation: TranslationSettings;
  formalize: FormalizeSettings;
  summary: SummarySettings;
  aiBackend: AiBackendSettings;
  metaSummary: MetaSummarySettings;
  exportMode: ExportMode;
  exportTitleMode: ExportTitleMode;
  copyContentMode: CopyContentMode;
  copyRangeMode: CopyRangeMode;
  exportTextMode: ExportTextMode;
  aiOutputLanguage: AiOutputLanguage;
  customAiOutputLanguage: string;
  transcriptFontSize: number;
  autoFormalize: boolean;
  claudianPrompt: string;
  vad: VadSettings;
  aggregation: AggregationSettings;
}

export interface PanelSettingsValues {
  aiOutputLanguage: AiOutputLanguage;
  customAiOutputLanguage: string;
  transcriptFontSize: number;
  autoTranslate: boolean;
  autoFormalize: boolean;
  copyContentMode: CopyContentMode;
  exportMode: ExportMode;
  exportTextMode: ExportTextMode;
}

function normalizeCloudServerUrl(serverUrl: string): string {
  const trimmed = serverUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function normalizeHostedCloudAuthSettings(
  value: Partial<CloudAuthSettings> | null | undefined,
): CloudAuthSettings {
  const fixedServerUrl = DEFAULT_SETTINGS.cloudAuth.serverUrl;
  const merged = { ...DEFAULT_SETTINGS.cloudAuth, ...value };
  if (normalizeCloudServerUrl(merged.serverUrl) === fixedServerUrl) {
    return { ...merged, serverUrl: fixedServerUrl };
  }
  return {
    ...merged,
    serverUrl: fixedServerUrl,
    token: "",
    refreshToken: "",
    tokenExpiresAt: "",
    balanceCents: 0,
  };
}

export const DEFAULT_SETTINGS: PluginSettings = {
  locale: "zh",
  asrProvider: "local",
  tencentASR: {
    appId: "",
    secretId: "",
    secretKey: "",
    engineModelType: "16k_zh",
  },
  cloudAuth: {
    serverUrl: "https://rt.songrong.org",
    token: "",
    refreshToken: "",
    tokenExpiresAt: "",
    balanceCents: 0,
  },
  pythonPath: process.platform === "win32" ? "python" : "python3",
  backendPort: 18888,
  modelDir: "",
  useInt8: true,
  autoStartBackend: true,
  realtimeProfile: "stable",
  recognitionMode: "zh-en",
  gpuProvider: "cpu",
  translation: {
    enabled: false,
    apiUrl: "https://api.openai.com/v1/chat/completions",
    apiKey: "",
    model: "gpt-4o-mini",
  },
  formalize: {
    apiUrl: "https://api.openai.com/v1/chat/completions",
    apiKey: "",
    model: "gpt-4o-mini",
  },
  summary: {
    enabled: false,
    displayMode: "both",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    apiKey: "",
    model: "gpt-4o-mini",
    thresholdChars: 500,
  },
  aiBackend: {
    fast: { ...DEFAULT_AI_BACKEND_PROFILE },
    smart: { ...DEFAULT_AI_BACKEND_PROFILE },
  },
  metaSummary: {
    enabled: false,
    triggerCount: 3,
  },
  exportMode: "full",
  exportTitleMode: "timestamp",
  copyContentMode: "full",
  copyRangeMode: "all",
  exportTextMode: "original",
  aiOutputLanguage: "auto",
  customAiOutputLanguage: "",
  transcriptFontSize: 15,
  autoFormalize: false,
  claudianPrompt: "请参考转写上下文： @ {{contextFile}} 并回答",
  vad: {
    threshold: 0.5,
    minSilenceDuration: 1.0,
  },
  aggregation: {
    flushWindowSec: 4,
    maxChars: 320,
    realtimePreview: true,
  },
};

function normalizeAiBackendProvider(value: unknown): AiBackendProvider {
  if (value === "openai-compatible" || value === "claude" || value === "codex" || value === "opencode") {
    return value;
  }
  return DEFAULT_AI_BACKEND_PROFILE.provider;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasLegacyAiBackendShape(value: Record<string, unknown>): boolean {
  return (
    "provider" in value ||
    "cliPath" in value ||
    "model" in value ||
    "timeoutSec" in value ||
    "extraArgs" in value
  );
}

export interface TranscriptionResult {
  type?: "partial" | "final";
  text: string;
  timestamps: {
    start: number;
    duration: number;
  };
  language: string;
  /** 后端回传的 flush 序列号，用于过滤 flush_partial 竞态产生的过时 partial */
  flush_seq?: number;
}

export interface TranscriptEntry {
  id: string;
  result: TranscriptionResult;
  translation: string | null;
  formalText: string | null;
  wallTime: Date;
  summarySourceText?: string;
}

/** JSON 持久化用序列化版本，wallTime 为 ISO 字符串 */
export interface SerializedTranscriptEntry {
  id: string;
  result: TranscriptionResult;
  translation: string | null;
  formalText: string | null;
  wallTime: string;
  summarySourceText?: string;
}
