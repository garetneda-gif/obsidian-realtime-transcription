import assert from "node:assert/strict";
import test from "node:test";
import { extractTextFromResponse } from "../src/utils/llmResponse.ts";

test("extractTextFromResponse reads Chat Completions message content", () => {
  assert.equal(
    extractTextFromResponse({
      choices: [{ message: { content: "  摘要内容  " } }],
    }),
    "摘要内容",
  );
});

test("extractTextFromResponse reads Chat Completions content parts", () => {
  assert.equal(
    extractTextFromResponse({
      choices: [{ message: { content: [{ type: "text", text: "第一段" }, { text: "第二段" }] } }],
    }),
    "第一段第二段",
  );
});

test("extractTextFromResponse reads legacy completions text", () => {
  assert.equal(
    extractTextFromResponse({
      choices: [{ text: "  旧格式摘要  " }],
    }),
    "旧格式摘要",
  );
});

test("extractTextFromResponse reads Responses API output_text", () => {
  assert.equal(
    extractTextFromResponse({
      output_text: "  新格式摘要  ",
    }),
    "新格式摘要",
  );
});

test("extractTextFromResponse reads Responses API output message content", () => {
  assert.equal(
    extractTextFromResponse({
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: "第一条" },
            { type: "output_text", text: "第二条" },
          ],
        },
      ],
    }),
    "第一条第二条",
  );
});

test("extractTextFromResponse ignores unsupported response bodies", () => {
  assert.equal(
    extractTextFromResponse({
      id: "resp_123",
      output: [{ type: "reasoning", summary: [] }],
    }),
    "",
  );
});
