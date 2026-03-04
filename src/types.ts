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

export interface AggregationSettings {
  flushWindowSec: number;
  maxChars: number;
  realtimePreview: boolean;
}

export interface PluginSettings {
  pythonPath: string;
  backendPort: number;
  modelDir: string;
  useInt8: boolean;
  autoStartBackend: boolean;
  realtimeProfile: RealtimeProfile;
  recognitionMode: RecognitionMode;
  translation: TranslationSettings;
  formalize: FormalizeSettings;
  summary: SummarySettings;
  exportMode: ExportMode;
  exportTitleMode: ExportTitleMode;
  vad: VadSettings;
  aggregation: AggregationSettings;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  pythonPath: "python3",
  backendPort: 18888,
  modelDir: "",
  useInt8: true,
  autoStartBackend: true,
  realtimeProfile: "stable",
  recognitionMode: "zh-en",
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
  exportMode: "full",
  exportTitleMode: "timestamp",
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
