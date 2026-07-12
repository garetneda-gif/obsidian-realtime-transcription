import type { TranscriptEntry } from "../types";

export function formatTranscriptEntriesAsMarkdown(
  entries: TranscriptEntry[],
  formalLabel: string,
  options: { useFormalTextAsOriginal?: boolean } = {},
): string {
  return entries.map((entry) => formatEntry(entry, formalLabel, options)).join("\n\n");
}

function formatEntry(
  entry: TranscriptEntry,
  formalLabel: string,
  options: { useFormalTextAsOriginal?: boolean },
): string {
  const text = options.useFormalTextAsOriginal && entry.formalText
    ? entry.formalText
    : entry.result.text;
  const lines = [
    `**[${formatTime(entry.wallTime)}]** \`${entry.result.language.toUpperCase()}\``,
    text,
  ];

  if (entry.formalText && !options.useFormalTextAsOriginal) {
    lines.push(`> **${formalLabel}**: ${entry.formalText}`);
  }
  if (entry.translation) {
    lines.push(`> ${entry.translation}`);
  }

  return lines.join("\n");
}

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
