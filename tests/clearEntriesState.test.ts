import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const viewSource = readFileSync(
  new URL("../src/views/TranscriptionView.ts", import.meta.url),
  "utf8",
);
const backendSource = readFileSync(
  new URL("../src/services/BackendManager.ts", import.meta.url),
  "utf8",
);
const i18nSource = readFileSync(new URL("../src/i18n.ts", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("clearEntries resets transient transcript and summary state", () => {
  assert.match(source, /private async clearEntries\(\): Promise<void> \{\s+this\.resetTransientTranscriptState\(\);/);

  const resetBody = extractMethodBody("resetTransientTranscriptState");
  for (const expected of [
    "this.transcriptSessionVersion++",
    "this.pendingTranscript = null",
    "this.clearFlushTimer()",
    "this.committedPartialTexts = []",
    'this.summaryBuffer = ""',
    "this.summaryRetryAfter = 0",
    "this.metaSummaryTexts = []",
    "this.metaSummaryRetryAfter = 0",
    'this.renderedPartialText = ""',
    'this.lastPartialText = ""',
    'this.lastStablePartialText = ""',
  ]) {
    assert.ok(resetBody.includes(expected), `missing reset: ${expected}`);
  }
});

test("in-flight summaries are discarded after clearEntries changes session version", () => {
  assert.match(source, /const sessionVersion = this\.transcriptSessionVersion;[\s\S]*?summaryService\.summarize\(source,[\s\S]*?\);[\s\S]*?sessionVersion !== this\.transcriptSessionVersion/);
  assert.match(source, /const sessionVersion = this\.transcriptSessionVersion;[\s\S]*?summaryService\.metaSummarize\(texts,[\s\S]*?\);[\s\S]*?sessionVersion !== this\.transcriptSessionVersion/);
});

test("summary queues are checked again after stale in-flight requests finish", () => {
  assert.match(source, /finally \{\s+this\.summaryInFlight = false;[\s\S]*?this\.summaryBuffer\.trim\(\)\.length >= threshold[\s\S]*?this\.maybeRunSummary\(new Date\(\)\)/);
  assert.match(source, /finally \{\s+this\.metaSummaryInFlight = false;[\s\S]*?this\.metaSummaryTexts\.length >= triggerCount[\s\S]*?this\.maybeRunMetaSummary\(new Date\(\)\)/);
});

test("summary failures back off instead of immediately looping notices", () => {
  assert.ok(source.includes("const AI_SUMMARY_FAILURE_RETRY_MS = 60_000"));
  assert.ok(source.includes("private summaryRetryAfter = 0"));
  assert.ok(source.includes("private metaSummaryRetryAfter = 0"));
  assert.match(source, /this\.summaryRetryAfter = Date\.now\(\) \+ AI_SUMMARY_FAILURE_RETRY_MS/);
  assert.match(source, /this\.metaSummaryRetryAfter = Date\.now\(\) \+ AI_SUMMARY_FAILURE_RETRY_MS/);
  assert.match(source, /this\.summaryBuffer\.trim\(\)\.length >= threshold && Date\.now\(\) >= this\.summaryRetryAfter/);
  assert.match(source, /this\.metaSummaryTexts\.length >= triggerCount && Date\.now\(\) >= this\.metaSummaryRetryAfter/);
});

test("normalizeLanguage prefers transcript text before recognition mode fallback", () => {
  const body = extractMethodBody("normalizeLanguage");
  assert.ok(body.includes("const latinWordCount"));
  assert.ok(body.includes('return "hybrid";'));
  assert.ok(
    body.indexOf('if (hanCount === 0 && latinCount >= 3) return "en";') <
      body.indexOf('if (mode === "zh") return "zh";'),
  );
});

test("transcription view infers display language for badges and manual translation", () => {
  const body = extractMethodBody("inferDisplayLanguage", viewSource);
  assert.ok(body.includes("const latinWordCount"));
  assert.ok(body.includes('return "hybrid";'));
  assert.ok(i18nSource.includes('"lang.hybrid": "混合"'));
  assert.ok(body.includes('if (hanCount === 0 && latinCount >= 3) return "en";'));
  assert.match(
    viewSource,
    /this\.updateLanguageBadge\(langBadge, entry\.result\.language, entry\.result\.text\);/,
  );
  assert.match(
    viewSource,
    /const sourceLanguage = this\.inferDisplayLanguage\([\s\S]*?entry\.result\.language,[\s\S]*?entry\.result\.text,[\s\S]*?\);[\s\S]*?this\.onTranslate\(entry\.id, entry\.result\.text, sourceLanguage\)/,
  );
});

test("manual translation replaces existing translation with the loading placeholder", () => {
  const body = extractMethodBody("handleTranslateClick", viewSource);
  assert.ok(
    body.indexOf('card.querySelector(".card-translation")') <
      body.indexOf('document.createElement("div")'),
  );
  assert.ok(body.includes("oldTranslation.remove()"));
  assert.ok(body.includes("entry.translation = null"));
});

test("panel settings include copy and export content modes", () => {
  const getBody = extractMethodBody("getPanelSettingsValues");
  const saveBody = extractMethodBody("savePanelSettings");
  assert.ok(getBody.includes("copyContentMode"));
  assert.ok(getBody.includes("exportMode"));
  assert.ok(saveBody.includes("this.settings.copyContentMode"));
  assert.ok(saveBody.includes("this.settings.exportMode"));
  assert.ok(viewSource.includes("panelSettings.copyContent.name"));
  assert.ok(viewSource.includes("panelSettings.exportMode.name"));
  assert.ok(i18nSource.includes('"panelSettings.title": "转写设置"'));
});

test("panel settings expose custom AI output language and wrapped select arrow", () => {
  const getBody = extractMethodBody("getPanelSettingsValues");
  const saveBody = extractMethodBody("savePanelSettings");
  assert.ok(getBody.includes("customAiOutputLanguage"));
  assert.ok(saveBody.includes("sanitizeCustomOutputLanguage(values.customAiOutputLanguage)"));
  assert.ok(source.includes('value === "auto" || value === "zh" || value === "en" || value === "custom"'));
  assert.ok(source.includes("standardLanguageCodeFromName(this.settings.customAiOutputLanguage)"));
  assert.ok(viewSource.includes("panelSettings.outputLanguage.custom"));
  assert.ok(viewSource.includes("panelSettings.outputLanguage.customPlaceholder"));
  assert.ok(viewSource.includes("customLanguageInput.style.display"));
  assert.ok(viewSource.includes('setIcon(saveBtn, "save")'));
  assert.ok(!viewSource.includes("setPanelSettingsSaveIcon"));
  assert.ok(viewSource.includes("createPanelSelect(languageRow)"));
  assert.ok(viewSource.includes('setIcon(arrow, "chevron-down")'));
  assert.ok(i18nSource.includes('"panelSettings.outputLanguage.custom": "自定义"'));
  assert.ok(stylesSource.includes(".panel-settings-select-wrap"));
  assert.ok(stylesSource.includes(".panel-settings-select-arrow"));
  assert.ok(stylesSource.includes(".panel-settings-feedback-row"));
  assert.ok(viewSource.includes("panel-settings-feedback-link"));
  assert.ok(stylesSource.includes("-webkit-appearance: none"));
  assert.ok(stylesSource.includes("appearance: none"));
  assert.ok(stylesSource.includes("max-width: 100%"));
  assert.ok(stylesSource.includes("padding: 0 34px 0 10px"));
  assert.ok(stylesSource.includes("right: 12px"));
  assert.ok(stylesSource.includes("font-size: 13px"));
  assert.ok(stylesSource.includes("accent-color: var(--interactive-accent)"));
  assert.ok(stylesSource.includes(".transcript-card.summary-card .card-original"));
  assert.ok(stylesSource.includes("font-size: var(--rt-transcript-font-size, 15px)"));
  assert.ok(viewSource.includes("appendSummaryHeader"));
  assert.ok(viewSource.includes("summary-title-actions"));
  assert.ok(viewSource.includes("onRegenerateSummary"));
  assert.ok(source.includes("summarySourceText: source"));
  assert.ok(source.includes('summarySourceText: texts.join("\\n\\n")'));
  assert.ok(stylesSource.includes("border-left: 2px solid #f6b23a"));
  assert.ok(stylesSource.includes(".summary-action-btn"));
  assert.ok(stylesSource.includes("is-summary-collapsed"));
  assert.ok(!stylesSource.includes("linear-gradient(135deg, rgba(124, 58, 237"));
});

test("recording toggle ignores concurrent start and stop transitions", () => {
  const body = extractMethodBody("toggleRecording");
  assert.ok(source.includes("private recordingTransition = false"));
  assert.match(body, /if \(this\.recordingTransition\) \{\s+return;\s+\}/);
  assert.match(body, /finally \{\s+this\.recordingTransition = false;\s+\}/);
});

test("backend start only reuses a pingable backend before orphan cleanup", () => {
  const body = extractMethodBody("start", backendSource);
  assert.ok(
    body.indexOf("this.isBackendReachable(this.settings.backendPort") <
      body.indexOf("this.killOrphanedProcesses()"),
  );
  const reachableBody = extractMethodBody("isBackendReachable", backendSource);
  assert.ok(reachableBody.includes('ws?.send(JSON.stringify({ type: "ping" }))'));
  assert.ok(reachableBody.includes('finish(data.type === "pong")'));
});

test("recording stops itself when ASR connection is lost", () => {
  assert.ok(source.includes("private connectionLossTimer"));
  assert.ok(source.includes("this.scheduleConnectionLossGuard()"));
  const guardBody = extractMethodBody("scheduleConnectionLossGuard");
  assert.ok(guardBody.includes("this.getActiveASRClient().isConnected"));
  assert.ok(guardBody.includes("this.stopAfterConnectionLoss()"));
  const stopBody = extractMethodBody("stopAfterConnectionLoss");
  assert.ok(stopBody.includes("this.recordingTransition = true"));
  assert.ok(stopBody.includes('t("notice.recordingConnectionLost")'));
  assert.ok(i18nSource.includes('"notice.recordingConnectionLost": "转写后端连接已断开，已停止录制"'));
});

function extractMethodBody(methodName: string, targetSource = source): string {
  const start = targetSource.indexOf(`private ${methodName}`);
  const publicStart = targetSource.indexOf(`async ${methodName}`);
  const methodStart = start === -1 ? publicStart : start;
  assert.notEqual(methodStart, -1, `${methodName} not found`);

  const bodyStart = targetSource.indexOf("{", methodStart);
  let depth = 0;
  for (let index = bodyStart; index < targetSource.length; index++) {
    const char = targetSource[index];
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) {
      return targetSource.slice(bodyStart + 1, index);
    }
  }
  assert.fail(`${methodName} body not closed`);
}
