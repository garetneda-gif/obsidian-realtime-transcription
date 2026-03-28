import type { TranscriptionResult } from "../types";

const COMPARISON_SKIP_RE = /[\s\p{P}\p{S}]/u;
const LEADING_SEPARATOR_RE = /^[\s，。！？、,.;:：；!?\-—]+/u;

export interface TrimCommittedPrefixResult {
  hasOverlap: boolean;
  isDuplicate: boolean;
  trimmedText: string;
  shouldResetCommitted: boolean;
}

interface ComparableText {
  normalized: string;
  originalCutPoints: number[];
}

function toComparableText(text: string): ComparableText {
  let normalized = "";
  const originalCutPoints: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (COMPARISON_SKIP_RE.test(char)) continue;
    normalized += char.toLowerCase();
    originalCutPoints.push(index + 1);
  }

  return { normalized, originalCutPoints };
}

export function trimCommittedPrefix(
  committedTexts: string[],
  incomingText: string,
): TrimCommittedPrefixResult {
  const committed = toComparableText(committedTexts.join(""));
  const incoming = toComparableText(incomingText);

  if (!committed.normalized || !incoming.normalized) {
    return {
      hasOverlap: false,
      isDuplicate: false,
      trimmedText: incomingText.trim(),
      shouldResetCommitted: false,
    };
  }

  let overlapLength = 0;
  for (let index = 1; index <= committed.normalized.length; index += 1) {
    if (incoming.normalized.startsWith(committed.normalized.slice(0, index))) {
      overlapLength = index;
    }
  }

  const hasMeaningfulOverlap = overlapLength >= committed.normalized.length * 0.5;
  if (!hasMeaningfulOverlap) {
    return {
      hasOverlap: false,
      isDuplicate: false,
      trimmedText: incomingText.trim(),
      shouldResetCommitted: overlapLength < 3 && incoming.normalized.length >= 4,
    };
  }

  const remainingNormalized = incoming.normalized.slice(overlapLength);
  if (!remainingNormalized || remainingNormalized.length < 2) {
    return {
      hasOverlap: true,
      isDuplicate: true,
      trimmedText: "",
      shouldResetCommitted: false,
    };
  }

  const cutIndex = incoming.originalCutPoints[overlapLength - 1] ?? 0;
  const trimmedText = incomingText.slice(cutIndex).replace(LEADING_SEPARATOR_RE, "").trim();

  return {
    hasOverlap: true,
    isDuplicate: false,
    trimmedText,
    shouldResetCommitted: false,
  };
}

export function isStalePartialResult(
  result: Pick<TranscriptionResult, "type" | "flush_seq">,
  currentFlushSeq: number,
): boolean {
  return result.type === "partial"
    && typeof result.flush_seq === "number"
    && result.flush_seq < currentFlushSeq;
}
