import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsSource = readFileSync(new URL("../src/settings.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const agentSource = readFileSync(new URL("../src/services/AgentBackendService.ts", import.meta.url), "utf8");
const apiTestSource = readFileSync(new URL("../src/services/AiConnectionTestService.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../src/i18n.ts", import.meta.url), "utf8");

test("AI backend settings expose a connection test button", () => {
  assert.ok(settingsSource.includes('t("settings.aiBackend.test.name")'));
  assert.ok(settingsSource.includes("this.plugin.testAiBackendConnection()"));
  assert.ok(settingsSource.includes("this.plugin.detectAiBackendCliPath(value)"));
  assert.ok(settingsSource.includes("getDefaultAiBackendModelOptions(provider)"));
  assert.match(settingsSource, /setting\.addDropdown\([\s\S]*?setting\.addText/);
  assert.ok(settingsSource.includes('setPlaceholder(t("settings.aiBackend.model.placeholder"))'));
  assert.ok(settingsSource.includes('t("settings.feedback.bug")'));
  assert.ok(settingsSource.includes('t("settings.feedback.feature")'));
  assert.ok(settingsSource.includes("issues/new?labels=bug"));
  assert.ok(settingsSource.includes("issues/new?labels=enhancement"));
  assert.ok(!settingsSource.includes("this.plugin.listAiBackendModels"));
  assert.ok(!i18nSource.includes("settings.aiBackend.model.refresh"));
  assert.ok(i18nSource.includes('"settings.aiBackend.test.name": "测试连接"'));
  assert.ok(i18nSource.includes('"settings.feedback.name": "反馈与建议"'));
});

test("AI backend connection test uses real local or API execution paths", () => {
  assert.match(
    mainSource,
    /if \(this\.agentBackendService\.isLocalEnabled\(\)\) \{\s+return this\.agentBackendService\.testConnection\(\);/,
  );
  assert.ok(mainSource.includes("testOpenAiCompatibleConnection(config)"));
  assert.ok(agentSource.includes("async testConnection(): Promise<string>"));
  assert.match(agentSource, /const result = await this\.run\(\{\s+systemPrompt:/);
  assert.ok(apiTestSource.includes("requestUrl({"));
  assert.ok(apiTestSource.includes("extractTextFromResponse(data)"));
  const codexBlock = agentSource.slice(agentSource.indexOf('case "codex"'), agentSource.indexOf('case "opencode"'));
  assert.ok(!codexBlock.includes("--ask-for-approval"));
  assert.ok(!codexBlock.includes("--sandbox"));
  assert.ok(codexBlock.includes("--output-last-message"));
  assert.ok(agentSource.includes("readCommandOutput(spec, output)"));
  assert.ok(agentSource.includes("cleanupCommandOutput(spec)"));
  assert.ok(agentSource.includes('stripUnsupportedFlags(args, new Set(["--agent", "--ask-for-approval", "--sandbox"]))'));
});

test("CLI path detection ignores stale known provider commands", () => {
  assert.ok(agentSource.includes("export function isAiBackendCliPathCompatible"));
  assert.ok(agentSource.includes("const explicitCommand = isAiBackendCliPathCompatible(settings)"));
  assert.ok(agentSource.includes('const knownCommands = new Set(["claude", "codex", "opencode"])'));
  assert.ok(agentSource.includes("return findExecutable(defaultCommand(settings.provider))"));
  assert.match(
    mainSource,
    /if \(!isAiBackendCliPathCompatible\(this\.settings\.aiBackend\) && detectedCliPath\) \{\s+this\.settings\.aiBackend\.cliPath = detectedCliPath;/,
  );
  assert.match(
    settingsSource,
    /const compatible = isAiBackendCliPathCompatible\(this\.plugin\.settings\.aiBackend\);[\s\S]*?this\.plugin\.settings\.aiBackend\.cliPath = detected;/,
  );
});

test("CLI mode hides per-feature API forms to avoid duplicate backend settings", () => {
  assert.ok(settingsSource.includes('const usingLocalAiBackend = this.plugin.settings.aiBackend.provider !== "openai-compatible"'));
  assert.match(settingsSource, /if \(!usingLocalAiBackend\) \{[\s\S]*?settings\.translation\.apiUrl\.name/);
  assert.match(settingsSource, /if \(!usingLocalAiBackend\) \{[\s\S]*?settings\.formalize\.apiUrl\.name/);
  assert.match(settingsSource, /if \(!usingLocalAiBackend\) \{[\s\S]*?settings\.summary\.apiUrl\.name/);
  assert.ok(settingsSource.includes("settings.aiBackend.localMode.name"));
});
