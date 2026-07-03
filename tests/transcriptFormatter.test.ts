import assert from "node:assert/strict";
import test from "node:test";
import { formatTranscriptEntriesAsMarkdown } from "../src/utils/transcriptFormatter.ts";
import type { TranscriptEntry } from "../src/types.ts";

test("formatTranscriptEntriesAsMarkdown keeps current export record format", () => {
  const entries: TranscriptEntry[] = [
    {
      id: "entry-1",
      result: {
        type: "final",
        text: "第一段转写",
        language: "zh",
        timestamps: { start: 0, duration: 0 },
      },
      translation: "Translated text",
      formalText: "第一段书面化",
      wallTime: new Date(2026, 6, 1, 9, 8, 7),
    },
    {
      id: "entry-2",
      result: {
        text: "摘要内容",
        language: "summary",
        timestamps: { start: 0, duration: 0 },
      },
      translation: null,
      formalText: null,
      wallTime: new Date(2026, 6, 1, 9, 9, 8),
    },
  ];

  assert.equal(
    formatTranscriptEntriesAsMarkdown(entries, "润色"),
    [
      "**[09:08:07]** `ZH`",
      "第一段转写",
      "> **润色**: 第一段书面化",
      "> Translated text",
      "",
      "**[09:09:08]** `SUMMARY`",
      "摘要内容",
    ].join("\n"),
  );
});

test("formatTranscriptEntriesAsMarkdown can replace originals with formalized text", () => {
  const entries: TranscriptEntry[] = [
    {
      id: "entry-1",
      result: {
        type: "final",
        text: "口语原文",
        language: "zh",
        timestamps: { start: 0, duration: 0 },
      },
      translation: null,
      formalText: "书面化文本",
      wallTime: new Date(2026, 6, 1, 9, 8, 7),
    },
  ];

  assert.equal(
    formatTranscriptEntriesAsMarkdown(entries, "润色", { useFormalTextAsOriginal: true }),
    [
      "**[09:08:07]** `ZH`",
      "书面化文本",
    ].join("\n"),
  );
});
