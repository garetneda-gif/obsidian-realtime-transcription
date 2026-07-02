import type { AiBackendProvider, AiBackendSettings } from "../types";

const { spawn } = require("child_process") as typeof import("child_process");

export interface AgentRequest {
  systemPrompt: string;
  userText: string;
  label: string;
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
    const result = stripAnsi(output).trim();
    if (!result) {
      throw new Error(`${request.label}本地 AI 后端未返回内容`);
    }
    return result;
  }

  private timeoutMs(): number {
    const timeoutSec = Number.isFinite(this.settings.timeoutSec)
      ? this.settings.timeoutSec
      : 90;
    return Math.max(10, Math.min(600, timeoutSec)) * 1000;
  }
}

function buildCommandSpec(settings: AiBackendSettings, prompt: string): { command: string; args: string[] } {
  const provider = settings.provider;
  const command = settings.cliPath.trim() || defaultCommand(provider);
  const model = settings.model.trim();
  const extraArgs = splitArgs(settings.extraArgs);

  switch (provider) {
    case "claude":
      return {
        command,
        args: [
          ...extraArgs,
          "-p",
          prompt,
          "--output-format",
          "text",
          "--no-session-persistence",
          "--tools",
          "",
          ...(model ? ["--model", model] : []),
        ],
      };
    case "codex":
      return {
        command,
        args: [
          "exec",
          ...extraArgs,
          "--ask-for-approval",
          "never",
          "--sandbox",
          "read-only",
          ...(model ? ["--model", model] : []),
          prompt,
        ],
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
      const detail = stderr.trim() || stdout.trim() || signal || `exit ${code}`;
      reject(new Error(detail));
    });
  });
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");
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
