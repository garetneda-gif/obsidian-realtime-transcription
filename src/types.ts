export interface TranslationSettings {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  model: string;
}

export interface VadSettings {
  threshold: number;
  minSilenceDuration: number;
}

export interface PluginSettings {
  pythonPath: string;
  backendPort: number;
  modelDir: string;
  useInt8: boolean;
  autoStartBackend: boolean;
  translation: TranslationSettings;
  vad: VadSettings;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  pythonPath: "python3",
  backendPort: 18888,
  modelDir: "",
  useInt8: true,
  autoStartBackend: true,
  translation: {
    enabled: false,
    apiUrl: "https://api.openai.com/v1/chat/completions",
    apiKey: "",
    model: "gpt-4o-mini",
  },
  vad: {
    threshold: 0.5,
    minSilenceDuration: 0.5,
  },
};

export interface TranscriptionResult {
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
  wallTime: Date;
}
