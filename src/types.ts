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
    thresholdChars: 3000,
  },
  exportMode: "full",
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
}

export interface TranscriptEntry {
  id: string;
  result: TranscriptionResult;
  translation: string | null;
  formalText: string | null;
  wallTime: Date;
}
