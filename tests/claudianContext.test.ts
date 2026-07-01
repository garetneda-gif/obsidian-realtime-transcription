import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClaudianContextMarkdown,
  CLAUDIAN_CONTEXT_FILE,
  CLAUDIAN_CONTEXT_FOLDER,
} from "../src/utils/claudianContext.ts";

test("buildClaudianContextMarkdown stores current transcript context", () => {
  const body = buildClaudianContextMarkdown(
    [
      "**[09:08:07]** `ZH`",
      "第一段转写",
      "",
      "**[09:09:08]** `SUMMARY`",
      "摘要内容",
    ].join("\n"),
    2,
    new Date("2026-07-01T01:02:03.000Z"),
  );

  assert.equal(CLAUDIAN_CONTEXT_FOLDER, "Claudian/实时转写上下文");
  assert.equal(CLAUDIAN_CONTEXT_FILE, "Claudian/实时转写上下文/current.md");
  assert.match(body, /source: realtime-transcription/);
  assert.match(body, /updated: 2026-07-01T01:02:03\.000Z/);
  assert.match(body, /entries: 2/);
  assert.match(body, /# 当前实时转写上下文/);
  assert.match(body, /第一段转写/);
  assert.match(body, /摘要内容/);
});
