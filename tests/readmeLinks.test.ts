import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readmeZh = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const readmeEn = readFileSync(new URL("../README_EN.md", import.meta.url), "utf8");

test("README language switch links use absolute GitHub URLs for Obsidian plugin browser", () => {
  const englishReadmeUrl = "https://github.com/garetneda-gif/obsidian-realtime-transcription/blob/main/README_EN.md";
  const chineseReadmeUrl = "https://github.com/garetneda-gif/obsidian-realtime-transcription/blob/main/README.md";

  assert.ok(readmeZh.includes(`[English](${englishReadmeUrl})`));
  assert.ok(readmeEn.includes(`[中文](${chineseReadmeUrl})`));
  assert.ok(!readmeZh.includes("<a href="));
  assert.ok(!readmeEn.includes("<a href="));
  assert.ok(!readmeZh.includes('href="README_EN.md"'));
  assert.ok(!readmeEn.includes('href="README.md"'));
});
