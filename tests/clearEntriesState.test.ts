import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");

test("clearEntries resets transient transcript and summary state", () => {
  assert.match(source, /private async clearEntries\(\): Promise<void> \{\s+this\.resetTransientTranscriptState\(\);/);

  const resetBody = extractMethodBody("resetTransientTranscriptState");
  for (const expected of [
    "this.transcriptSessionVersion++",
    "this.pendingTranscript = null",
    "this.clearFlushTimer()",
    "this.committedPartialTexts = []",
    'this.summaryBuffer = ""',
    "this.metaSummaryTexts = []",
    'this.renderedPartialText = ""',
    'this.lastPartialText = ""',
    'this.lastStablePartialText = ""',
  ]) {
    assert.ok(resetBody.includes(expected), `missing reset: ${expected}`);
  }
});

test("in-flight summaries are discarded after clearEntries changes session version", () => {
  assert.match(source, /const sessionVersion = this\.transcriptSessionVersion;[\s\S]*?summaryService\.summarize\(source\);[\s\S]*?sessionVersion !== this\.transcriptSessionVersion/);
  assert.match(source, /const sessionVersion = this\.transcriptSessionVersion;[\s\S]*?summaryService\.metaSummarize\(texts\);[\s\S]*?sessionVersion !== this\.transcriptSessionVersion/);
});

test("summary queues are checked again after stale in-flight requests finish", () => {
  assert.match(source, /finally \{\s+this\.summaryInFlight = false;[\s\S]*?this\.summaryBuffer\.trim\(\)\.length >= threshold[\s\S]*?this\.maybeRunSummary\(new Date\(\)\)/);
  assert.match(source, /finally \{\s+this\.metaSummaryInFlight = false;[\s\S]*?this\.metaSummaryTexts\.length >= triggerCount[\s\S]*?this\.maybeRunMetaSummary\(new Date\(\)\)/);
});

function extractMethodBody(methodName: string): string {
  const start = source.indexOf(`private ${methodName}(): void {`);
  assert.notEqual(start, -1, `${methodName} not found`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index++) {
    const char = source[index];
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) {
      return source.slice(bodyStart + 1, index);
    }
  }
  assert.fail(`${methodName} body not closed`);
}
