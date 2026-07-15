import assert from "node:assert/strict";
import test from "node:test";
import { parseCodexModelCache } from "../src/utils/codexModelCache.ts";

test("parseCodexModelCache returns visible models in Codex priority order", () => {
  assert.deepEqual(parseCodexModelCache({
    models: [
      { slug: "codex-auto-review", display_name: "Codex Auto Review", visibility: "hide", priority: 1 },
      { slug: "gpt-5.4-mini", display_name: "GPT-5.4-Mini", visibility: "list", priority: 20 },
      { slug: "gpt-5.6-sol", display_name: "GPT-5.6-Sol", visibility: "list", priority: 2 },
      { slug: "gpt-5.6-sol", display_name: "Duplicate", visibility: "list", priority: 3 },
    ],
  }), [
    { value: "gpt-5.6-sol", label: "5.6 Sol" },
    { value: "gpt-5.4-mini", label: "5.4 Mini" },
  ]);
});

test("parseCodexModelCache safely handles missing or invalid model data", () => {
  assert.deepEqual(parseCodexModelCache(null), []);
  assert.deepEqual(parseCodexModelCache({ models: [{ slug: "" }, null] }), []);
});
