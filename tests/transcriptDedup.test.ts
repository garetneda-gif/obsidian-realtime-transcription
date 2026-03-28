import assert from "node:assert/strict";
import test from "node:test";
import {
  isStalePartialResult,
  trimCommittedPrefix,
} from "../src/utils/transcriptDedup.ts";

test("trimCommittedPrefix trims committed prefix even when punctuation and corrected tail differ", () => {
  const committed = [
    "项目概述，Obsidian实时语音转写插件，支持本地模型和云端的腾讯实时asm两种识别引擎中英日韩月",
  ];

  const trimmed = trimCommittedPrefix(
    committed,
    "项目概述，Obsidian实时语音转写插件，支持本地模型和云端的腾讯实时asm两种识别引擎，中英日韩粤语前后端分离架构",
  );

  assert.equal(trimmed.hasOverlap, true);
  assert.equal(trimmed.isDuplicate, false);
  assert.equal(trimmed.trimmedText, "粤语前后端分离架构");
});

test("trimCommittedPrefix keeps committed context usable for later final results", () => {
  const committed = [
    "项目概述，Obsidian实时语音转写插件，支持本地模型和云端的腾讯实时asm两种识别引擎中英日韩月",
  ];

  const trimmedFinal = trimCommittedPrefix(
    committed,
    "项目概述，Obsidian实时语音转写插件，支持本地模型和云端的腾讯实时asm两种识别引擎，中英日韩粤语前后端分离架构，通过websocket与后端通信。",
  );

  assert.equal(trimmedFinal.hasOverlap, true);
  assert.equal(trimmedFinal.trimmedText, "粤语前后端分离架构，通过websocket与后端通信。");
});

test("trimCommittedPrefix drops leftover leading punctuation after overlap trimming", () => {
  const trimmed = trimCommittedPrefix(
    ["第一段 已提交"],
    "第一段，已提交，新增内容",
  );

  assert.equal(trimmed.hasOverlap, true);
  assert.equal(trimmed.trimmedText, "新增内容");
});

test("isStalePartialResult rejects partials from an older flush sequence", () => {
  assert.equal(
    isStalePartialResult({ type: "partial", text: "旧partial", language: "zh", timestamps: { start: 0, duration: 0 }, flush_seq: 2 }, 3),
    true,
  );
  assert.equal(
    isStalePartialResult({ type: "partial", text: "新partial", language: "zh", timestamps: { start: 0, duration: 0 }, flush_seq: 3 }, 3),
    false,
  );
  assert.equal(
    isStalePartialResult({ type: "final", text: "final", language: "zh", timestamps: { start: 0, duration: 0 } }, 3),
    false,
  );
});
