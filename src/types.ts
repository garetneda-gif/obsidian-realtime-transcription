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
export type CopyContentMode = "summaryOnly" | "full";
export type CopyRangeMode = "all" | "latest";
export type AiOutputLanguage = "auto" | "zh" | "en";

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
  metaSummary: MetaSummarySettings;
  exportMode: ExportMode;
  exportTitleMode: ExportTitleMode;
  copyContentMode: CopyContentMode;
  copyRangeMode: CopyRangeMode;
  aiOutputLanguage: AiOutputLanguage;
  transcriptFontSize: number;
  autoFormalize: boolean;
  claudianPrompt: string;
  vad: VadSettings;
  aggregation: AggregationSettings;
}

export interface PanelSettingsValues {
  aiOutputLanguage: AiOutputLanguage;
  transcriptFontSize: number;
  autoTranslate: boolean;
  autoFormalize: boolean;
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
    serverUrl: "https://asr-api.realtimetranscription.com",
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
  metaSummary: {
    enabled: false,
    triggerCount: 3,
  },
  exportMode: "full",
  exportTitleMode: "timestamp",
  copyContentMode: "full",
  copyRangeMode: "all",
  aiOutputLanguage: "auto",
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
}

/** JSON 持久化用序列化版本，wallTime 为 ISO 字符串 */
export interface SerializedTranscriptEntry {
  id: string;
  result: TranscriptionResult;
  translation: string | null;
  formalText: string | null;
  wallTime: string;
}
