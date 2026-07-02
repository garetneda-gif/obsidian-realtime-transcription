import type { AiBackendProvider, AiBackendSettings } from "../types";

const { spawn } = require("child_process") as typeof import("child_process");
const fs = require("fs") as typeof import("fs");
const os = require("os") as typeof import("os");
const path = require("path") as typeof import("path");

const NVM_LATEST_INSTALLED_ALIASES = new Set(["node", "stable", "unstable", "iojs"]);

export interface AgentRequest {
  systemPrompt: string;
  userText: string;
  label: string;
}

interface CommandSpec {
  command: string;
  args: string[];
  outputFile?: string;
}

export class AgentBackendService {
  private settings: AiBackendSettings;
  private cwd: string;

  constructor(settings: AiBackendSettings, cwd: string) {
    this.settings = settings;
    this.cwd = cwd;
  }

  updateSettings(settings: AiBackendSettings, cwd: string): void {
    this.settings = settings;
    this.cwd = cwd;
  }

  isLocalEnabled(): boolean {
    return this.settings.provider !== "openai-compatible";
  }

  isConfigured(): boolean {
    return this.isLocalEnabled();
  }

  async run(request: AgentRequest): Promise<string> {
    if (!this.isLocalEnabled()) {
      throw new Error("本地 AI 后端未启用");
    }

    const prompt = buildPrompt(request.systemPrompt, request.userText);
    const spec = buildCommandSpec(this.settings, prompt);
    const output = await runProcess(spec.command, spec.args, this.cwd, this.timeoutMs());
    try {
      const result = stripAnsi(readCommandOutput(spec, output)).trim();
      if (!result) {
        throw new Error(`${request.label}本地 AI 后端未返回内容`);
      }
      return result;
    } finally {
      cleanupCommandOutput(spec);
    }
  }

  async testConnection(): Promise<string> {
    const startedAt = Date.now();
    const result = await this.run({
      systemPrompt: "你是一个连接测试助手。只回复 OK，不要解释。",
      userText: "请只回复 OK",
      label: "测试",
    });
    const elapsedMs = Date.now() - startedAt;
    return `${providerName(this.settings.provider)} ${elapsedMs}ms: ${preview(result)}`;
  }

  private timeoutMs(): number {
    const timeoutSec = Number.isFinite(this.settings.timeoutSec)
      ? this.settings.timeoutSec
      : 90;
    return Math.max(10, Math.min(600, timeoutSec)) * 1000;
  }
}

function buildCommandSpec(settings: AiBackendSettings, prompt: string): CommandSpec {
  const provider = settings.provider;
  const explicitCommand = isAiBackendCliPathCompatible(settings) ? settings.cliPath.trim() : "";
  const command = resolveAiBackendCliPath(settings) || explicitCommand || defaultCommand(provider);
  const model = settings.model.trim();
  const extraArgs = buildExtraArgs(settings);

  switch (provider) {
    case "claude":
      return {
        command,
        args: [
          "-p",
          "--output-format",
          "text",
          "--no-session-persistence",
          "--tools",
          "",
          ...(model ? ["--model", model] : []),
          ...extraArgs,
          prompt,
        ],
      };
    case "codex":
      const outputFile = createCodexOutputFile();
      return {
        command,
        args: [
          "exec",
          "--output-last-message",
          outputFile,
          ...extraArgs,
          ...(model ? ["--model", model] : []),
          prompt,
        ],
        outputFile,
      };
    case "opencode":
      return {
        command,
        args: [
          "run",
          ...extraArgs,
          ...(model ? ["--model", model] : []),
          prompt,
        ],
      };
    case "openai-compatible":
    default:
      throw new Error("OpenAI 兼容模式不使用本地 agent 后端");
  }
}

export function resolveAiBackendCliPath(settings: AiBackendSettings): string {
  const explicit = settings.cliPath?.trim();
  if (explicit && isAiBackendCliPathCompatible(settings)) {
    const expanded = expandPath(explicit);
    if (isExecutableFile(expanded)) return expanded;
    if (explicit.includes("/") || explicit.includes("\\")) return expanded;
  }
  return findExecutable(defaultCommand(settings.provider));
}

export function isAiBackendCliPathCompatible(settings: AiBackendSettings): boolean {
  return isCliPathCompatibleWithProvider(settings.cliPath?.trim() ?? "", settings.provider);
}

export function getDefaultAiBackendModelOptions(provider: AiBackendProvider): string[] {
  switch (provider) {
    case "claude":
      return ["", "sonnet", "opus", "haiku", "claude-sonnet-4-6", "claude-opus-4-6"];
    case "codex":
      return ["", "gpt-5.5", "gpt-5.4-mini", "gpt-5.4", "gpt-5.2-codex", "gpt-5.1-codex"];
    case "opencode":
      return [""];
    case "openai-compatible":
    default:
      return [];
  }
}

function readCommandOutput(spec: CommandSpec, stdout: string): string {
  if (!spec.outputFile) return stdout;
  try {
    const finalMessage = fs.readFileSync(spec.outputFile, "utf8");
    if (finalMessage.trim()) return finalMessage;
  } catch {
  }
  return stdout;
}

function cleanupCommandOutput(spec: CommandSpec): void {
  if (!spec.outputFile) return;
  try {
    fs.unlinkSync(spec.outputFile);
  } catch {
  }
}

function createCodexOutputFile(): string {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return path.join(os.tmpdir(), `realtime-transcription-codex-${suffix}.txt`);
}

function providerName(provider: AiBackendProvider): string {
  switch (provider) {
    case "claude":
      return "Claude Code CLI";
    case "codex":
      return "Codex CLI";
    case "opencode":
      return "OpenCode CLI";
    case "openai-compatible":
    default:
      return "API";
  }
}

function preview(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > 80 ? `${singleLine.slice(0, 80)}...` : singleLine;
}

function defaultCommand(provider: AiBackendProvider): string {
  switch (provider) {
    case "claude":
      return "claude";
    case "codex":
      return "codex";
    case "opencode":
      return "opencode";
    case "openai-compatible":
    default:
      return "";
  }
}

function isCliPathCompatibleWithProvider(cliPath: string, provider: AiBackendProvider): boolean {
  if (!cliPath || provider === "openai-compatible") return true;

  const expected = defaultCommand(provider);
  if (!expected) return true;

  const basename = stripExecutableExtension(path.basename(expandPath(cliPath)));
  const knownCommands = new Set(["claude", "codex", "opencode"]);
  return !knownCommands.has(basename) || basename === expected;
}

function stripExecutableExtension(command: string): string {
  return command.replace(/\.(cmd|exe|bat)$/i, "");
}

function findExecutable(command: string): string {
  if (!command) return "";
  if (command.includes("/") || command.includes("\\")) {
    const expanded = expandPath(command);
    return isExecutableFile(expanded) ? expanded : "";
  }

  for (const dir of getSearchPaths()) {
    const candidate = path.join(dir, commandForPlatform(command));
    if (isExecutableFile(candidate)) return candidate;
  }
  return "";
}

function commandForPlatform(command: string): string {
  if (process.platform !== "win32") return command;
  return /\.(cmd|exe|bat)$/i.test(command) ? command : `${command}.cmd`;
}

function getSearchPaths(): string[] {
  const home = os.homedir();
  const candidates = [
    ...parsePath(process.env.PATH ?? ""),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    process.env.VOLTA_HOME ? path.join(process.env.VOLTA_HOME, "bin") : "",
    process.env.ASDF_DATA_DIR ? path.join(process.env.ASDF_DATA_DIR, "shims") : "",
    process.env.ASDF_DATA_DIR ? path.join(process.env.ASDF_DATA_DIR, "bin") : "",
    process.env.ASDF_DIR ? path.join(process.env.ASDF_DIR, "shims") : "",
    process.env.ASDF_DIR ? path.join(process.env.ASDF_DIR, "bin") : "",
    process.env.FNM_MULTISHELL_PATH ?? "",
    process.env.FNM_DIR ?? "",
    process.env.NVM_SYMLINK ?? "",
    process.env.NVM_HOME ?? "",
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".local", "bin"),
    path.join(home, ".bun", "bin"),
    path.join(home, ".opencode", "bin"),
    path.join(home, ".docker", "bin"),
    path.join(home, ".volta", "bin"),
    path.join(home, ".asdf", "shims"),
    path.join(home, ".asdf", "bin"),
    path.join(home, ".fnm"),
    path.join(home, ".claude", "local"),
    path.join(home, ".claude", "local", "bin"),
    process.env.NVM_BIN ?? "",
    resolveNvmDefaultBin(home),
  ];
  const seen = new Set<string>();
  return candidates
    .map((entry) => expandPath(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

function parsePath(value: string): string[] {
  const delimiter = process.platform === "win32" ? ";" : ":";
  return value
    .split(delimiter)
    .map((entry) => stripQuotes(entry.trim()))
    .filter(Boolean);
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function expandPath(value: string | undefined): string {
  if (!value) return "";
  let expanded = value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)|\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, a, b) => {
    const key = a ?? b;
    return process.env[key] ?? match;
  });
  if (expanded === "~") return os.homedir();
  if (expanded.startsWith("~/") || expanded.startsWith("~\\")) {
    expanded = path.join(os.homedir(), expanded.slice(2));
  }
  return expanded;
}

function resolveNvmDefaultBin(home: string): string {
  const nvmDir = process.env.NVM_DIR || path.join(home, ".nvm");
  try {
    const alias = fs.readFileSync(path.join(nvmDir, "alias", "default"), "utf8").trim();
    const resolved = resolveNvmAlias(nvmDir, alias);
    if (!resolved) return "";
    const versionsDir = path.join(nvmDir, "versions", "node");
    const entries = fs
      .readdirSync(versionsDir)
      .filter((entry) => entry.startsWith("v"))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const matched = findMatchingNvmVersion(entries, resolved);
    if (!matched) return "";
    const bin = path.join(versionsDir, matched, "bin");
    return fs.existsSync(bin) ? bin : "";
  } catch {
    return "";
  }
}

function resolveNvmAlias(nvmDir: string, alias: string, depth = 0): string {
  if (!alias || depth > 5) return "";
  if (/^\d/.test(alias) || alias.startsWith("v") || isNvmBuiltInLatestAlias(alias)) return alias;
  try {
    const target = fs.readFileSync(path.join(nvmDir, "alias", ...alias.split("/")), "utf8").trim();
    return resolveNvmAlias(nvmDir, target, depth + 1);
  } catch {
    return "";
  }
}

function findMatchingNvmVersion(entries: string[], resolvedAlias: string): string | undefined {
  if (isNvmBuiltInLatestAlias(resolvedAlias)) return entries[0];
  const version = resolvedAlias.replace(/^v/, "");
  return entries.find((entry) => {
    const entryVersion = entry.slice(1);
    return entryVersion === version || entryVersion.startsWith(`${version}.`);
  });
}

function isNvmBuiltInLatestAlias(alias: string): boolean {
  return NVM_LATEST_INSTALLED_ALIASES.has(alias) || alias.startsWith("lts/");
}

function isExecutableFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (process.platform === "win32") return true;
    return (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function buildPrompt(systemPrompt: string, userText: string): string {
  return [
    "System instructions:",
    systemPrompt.trim(),
    "",
    "User content:",
    userText.trim(),
  ].join("\n");
}

function runProcess(command: string, args: string[], cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd: cwd || process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`本地 AI 后端超时（${Math.round(timeoutMs / 1000)} 秒）`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(formatProcessFailure(code, signal, stderr, stdout)));
    });
  });
}

function formatProcessFailure(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
  stdout: string,
): string {
  const detail = stripAnsi(stderr.trim() || stdout.trim());
  if (detail) return detail;
  if (signal === "SIGKILL" || code === 137) {
    return "本地 CLI 进程被系统终止（SIGKILL）。请先确认该 CLI 在终端中可正常运行，并检查安装、登录态或系统权限。";
  }
  if (signal) return `本地 CLI 进程被终止：${signal}`;
  return `本地 CLI 退出码：${code}`;
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");
}

function buildExtraArgs(settings: AiBackendSettings): string[] {
  const args = splitArgs(settings.extraArgs ?? "");
  if (settings.provider !== "codex") return args;
  return stripUnsupportedFlags(args, new Set(["--agent", "--ask-for-approval", "--sandbox"]));
}

function stripUnsupportedFlags(args: string[], blockedFlags: Set<string>): string[] {
  const filtered: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const flag = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (!blockedFlags.has(flag)) {
      filtered.push(arg);
      continue;
    }
    if (!arg.includes("=") && index + 1 < args.length && !args[index + 1].startsWith("-")) {
      index += 1;
    }
  }

  return filtered;
}

function splitArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of input.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping) current += "\\";
  if (current) args.push(current);
  return args;
}
