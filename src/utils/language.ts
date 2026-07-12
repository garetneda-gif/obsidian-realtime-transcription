import type { RecognitionMode } from "../types";

const EXPLICIT_LANGUAGE_CODES = new Set(["ja", "ko", "yue", "en"]);

interface LanguageStats {
  hanCount: number;
  latinCount: number;
  latinWords: string[];
  proseLatinWords: string[];
  kanaCount: number;
  hangulCount: number;
}

export function inferTranscriptLanguage(
  rawLanguage: string,
  text: string,
  recognitionMode: RecognitionMode = "zh-en",
): string {
  const language = (rawLanguage || "auto").toLowerCase();
  if (language === "summary" || language === "meta-summary") {
    return language;
  }

  const stats = collectLanguageStats(text);

  if (stats.kanaCount > 0) return "ja";
  if (stats.hangulCount > 0) return "ko";
  if (isHybridText(stats)) return "hybrid";

  if (isEnglishText(stats)) {
    return "en";
  }

  if (stats.hanCount >= 2) {
    return language === "yue" ? "yue" : "zh";
  }

  if (stats.hanCount === 1) {
    if (stats.latinCount >= 8) return "en";
    return language === "yue" ? "yue" : "zh";
  }

  if (recognitionMode === "zh") return "zh";
  if (recognitionMode === "en") return "en";

  if (EXPLICIT_LANGUAGE_CODES.has(language)) {
    return language;
  }
  if (language === "zh") return "zh";

  return "zh";
}

function collectLanguageStats(text: string): LanguageStats {
  const latinWords = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
  return {
    hanCount: (text.match(/[\u3400-\u9fff]/g) ?? []).length,
    latinCount: (text.match(/[A-Za-z]/g) ?? []).length,
    latinWords,
    proseLatinWords: latinWords.filter(isProseLatinWord),
    kanaCount: (text.match(/[\u3040-\u30ff]/g) ?? []).length,
    hangulCount: (text.match(/[\uac00-\ud7af]/g) ?? []).length,
  };
}

function isHybridText(stats: LanguageStats): boolean {
  if (stats.hanCount < 2) return false;

  const latinShare = stats.latinCount / Math.max(1, stats.hanCount + stats.latinCount);
  return stats.proseLatinWords.length >= 3 && stats.latinCount >= 16 && latinShare >= 0.2;
}

function isEnglishText(stats: LanguageStats): boolean {
  if (stats.latinWords.length >= 3 && stats.latinCount >= Math.max(8, stats.hanCount * 2)) {
    return true;
  }
  return stats.hanCount === 0 && stats.latinCount >= 3;
}

function isProseLatinWord(word: string): boolean {
  return word.length >= 3 && /[a-z]/.test(word);
}
