import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsSource = readFileSync(new URL("../src/settings.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const agentSource = readFileSync(new URL("../src/services/AgentBackendService.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../src/i18n.ts", import.meta.url), "utf8");

test("AI backend settings expose structured fast and smart model profiles", () => {
  assert.ok(settingsSource.includes('t("settings.aiBackend.test.name")'));
  assert.ok(settingsSource.includes('this.renderAiBackendProfileSettings(containerEl, "fast")'));
  assert.ok(settingsSource.includes('this.renderAiBackendProfileSettings(containerEl, "smart")'));
  assert.ok(settingsSource.includes("this.plugin.testAiBackendConnection(role)"));
  assert.ok(settingsSource.includes("this.plugin.detectAiBackendCliPath(provider, role)"));
  assert.ok(settingsSource.includes("getDefaultAiBackendModelOptions(profile.provider)"));
  assert.match(settingsSource, /setting\.addDropdown\([\s\S]*?setting\.addText/);
  assert.ok(settingsSource.includes('setPlaceholder(t("settings.aiBackend.model.placeholder"))'));
  assert.ok(settingsSource.includes('dropdown.addOption(customValue, t("settings.aiBackend.model.custom"))'));
  assert.ok(settingsSource.includes('t("settings.feedback.bug")'));
  assert.ok(settingsSource.includes('t("settings.feedback.feature")'));
  assert.ok(settingsSource.includes("issues/new?labels=bug"));
  assert.ok(settingsSource.includes("issues/new?labels=enhancement"));
  assert.ok(!settingsSource.includes("this.plugin.listAiBackendModels"));
  assert.ok(!i18nSource.includes("settings.aiBackend.model.refresh"));
  assert.ok(i18nSource.includes('"settings.aiBackend.fast.title": "快速模型"'));
  assert.ok(i18nSource.includes('"settings.aiBackend.smart.title": "智能模型"'));
  assert.ok(i18nSource.includes('"settings.aiBackend.test.name": "测试连接"'));
  assert.ok(i18nSource.includes('"settings.feedback.name": "反馈与建议"'));
});

test("AI backend connection test uses the selected fast or smart profile", () => {
  assert.ok(mainSource.includes("private fastAgentBackendService!: AgentBackendService"));
  assert.ok(mainSource.includes("private smartAgentBackendService!: AgentBackendService"));
  assert.ok(mainSource.includes("new TranslationService(this.settings.translation, this.fastAgentBackendService)"));
  assert.ok(mainSource.includes("new FormalizeService(this.settings.formalize, this.fastAgentBackendService)"));
  assert.ok(mainSource.includes("new SummaryService(this.settings.summary, this.smartAgentBackendService)"));
  assert.ok(mainSource.includes("const TITLE_SERVICE_SETTINGS: SummarySettings"));
  assert.ok(mainSource.includes("this.titleService = new SummaryService(TITLE_SERVICE_SETTINGS, this.fastAgentBackendService)"));
  assert.ok(mainSource.includes("const aiTitle = await this.titleService.generateTitle"));
  assert.ok(!i18nSource.includes("AI 命名等分析性任务"));
  assert.ok(mainSource.includes("role === \"fast\""));
  assert.ok(mainSource.includes("return service.testConnection()"));
  assert.ok(agentSource.includes("async testConnection(): Promise<string>"));
  assert.match(agentSource, /const result = await this\.run\(\{\s+systemPrompt:/);
  assert.ok(agentSource.includes("private async runApi(request: AgentRequest): Promise<string>"));
  assert.ok(agentSource.includes("requestUrl({"));
  assert.ok(agentSource.includes("signal?: AbortSignal"));
  assert.ok(agentSource.includes("throwIfAborted(request.signal)"));
  assert.ok(agentSource.includes("runProcess(spec.command, spec.args, this.cwd, this.timeoutMs(), request.signal)"));
  assert.ok(agentSource.includes('child.kill("SIGTERM")'));
  assert.ok(agentSource.includes("extractTextFromResponse(data)"));
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
    /if \(!isAiBackendCliPathCompatible\(profile\) && detectedCliPath\) \{\s+profile\.cliPath = detectedCliPath;/,
  );
  assert.match(
    settingsSource,
    /const compatible = isAiBackendCliPathCompatible\(profile\);[\s\S]*?profile\.cliPath = detected;/,
  );
});

test("AI profile settings replace duplicate per-feature backend forms", () => {
  assert.ok(!settingsSource.includes("usingLocalAiBackend"));
  assert.ok(!settingsSource.includes("settings.translation.apiUrl.name"));
  assert.ok(!settingsSource.includes("settings.formalize.apiUrl.name"));
  assert.ok(!settingsSource.includes("settings.summary.apiUrl.name"));
  assert.ok(settingsSource.includes("settings.aiBackend.apiUrl.name"));
  assert.ok(settingsSource.includes("settings.aiBackend.apiKey.name"));
  assert.ok(mainSource.includes("normalizeAiBackendSettings"));
  assert.ok(mainSource.includes("applyLegacyApiConfig(this.settings.aiBackend.fast, this.settings.translation)"));
  assert.ok(mainSource.includes("applyLegacyApiConfig(this.settings.aiBackend.smart, this.settings.summary)"));
});

test("hosted cloud account entry points stay feature-gated", () => {
  assert.ok(mainSource.includes("HOSTED_CLOUD_ENABLED"));
  assert.ok(mainSource.includes('!HOSTED_CLOUD_ENABLED && this.settings.asrProvider === "cloud"'));
  assert.ok(settingsSource.includes("if (HOSTED_CLOUD_ENABLED)"));
  assert.ok(settingsSource.includes('dropdown.addOption("cloud", t("settings.asr.provider.cloud"))'));
  assert.ok(!settingsSource.includes('addOption("tencent", t("settings.asr.provider.tencent"))'));
  assert.ok(settingsSource.includes("if (HOSTED_CLOUD_ENABLED && isHostedCloud(provider))"));
  assert.ok(mainSource.includes("const provider = this.recordingProvider ?? this.settings.asrProvider"));
});
