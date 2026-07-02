import { Notice } from "obsidian";
import { PluginSettings } from "../types";
import { t } from "../i18n";

const { spawn, execFile, execSync } = require("child_process") as typeof import("child_process");
const { existsSync, writeFileSync, readFileSync, unlinkSync } = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
type ChildProcess = import("child_process").ChildProcess;

export class BackendManager {
  private process: ChildProcess | null = null;
  private pluginDir: string;
  private settings: PluginSettings;
  private lastLaunchSignature: string | null = null;
  /** 实际使用的端口（可能因端口占用而与 settings.backendPort 不同） */
  activePort: number = 0;
  private readonly pidFile: string;

  constructor(pluginDir: string, settings: PluginSettings) {
    this.pluginDir = pluginDir;
    this.settings = settings;
    this.pidFile = path.join(pluginDir, "backend.pid");
  }

  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  async start(): Promise<boolean> {
    const desiredSignature = this.getLaunchSignature();
    if (this.process) {
      const checkPort = this.activePort || this.settings.backendPort;
      const alive = await this.isBackendReachable(checkPort, 1800);
      if (alive && this.lastLaunchSignature === desiredSignature) return true;
      try {
        if (process.platform === "win32" && this.process.pid) {
          execSync(`taskkill /PID ${this.process.pid} /T /F 2>nul`, { timeout: 3000 });
        } else {
          this.process.kill("SIGTERM");
        }
      } catch {
        // 忽略杀进程失败
      }
      this.process = null;
      this.lastLaunchSignature = null;
    }

    if (await this.isBackendReachable(this.settings.backendPort, 1200)) {
      this.activePort = this.settings.backendPort;
      this.lastLaunchSignature = desiredSignature;
      return true;
    }

    // 0. 清理孤儿进程（插件重载后 this.process 为 null，旧进程仍存活）
    this.killOrphanedProcesses();

    // 1. 检查 Python 环境
    const envOk = await this.checkEnvironment();
    if (!envOk) {
      const pipCmd = process.platform === "win32" ? "pip" : "pip3";
      new Notice(`${t("backend.envFail")}\n${pipCmd} install sherpa-onnx websockets numpy`);
      return false;
    }

    // 2. 检查模型文件
    const modelDir = this.settings.modelDir;
    if (!modelDir) {
      new Notice(t("backend.noModelDir"));
      return false;
    }

    const requiredFiles = [
      this.settings.useInt8 ? "model.int8.onnx" : "model.onnx",
      "tokens.txt",
      "silero_vad.onnx",
    ];

    for (const file of requiredFiles) {
      if (!existsSync(path.join(modelDir, file))) {
        new Notice(`${t("backend.modelFileMissing")}: ${file}\n${t("backend.modelFileMissingHint")}`);
        return false;
      }
    }

    // 3. 查找可用端口（配置端口被占用时自动递增）
    let port = this.settings.backendPort;
    const maxRetries = 10;
    for (let i = 0; i < maxRetries; i++) {
      const inUse = await this.isPortInUse(port);
      if (!inUse) break;
      // 端口被占用，检查是否是我们自己的后端
      const wsAlive = await this.isBackendReachable(port, 2200);
      if (wsAlive) {
        this.activePort = port;
        return true;
      }
      // 不是我们的后端，尝试下一个端口
      const nextPort = port + 1;
      if (i < maxRetries - 1) {
        console.log(`[Transcription] 端口 ${port} 已被占用，尝试 ${nextPort}`);
        port = nextPort;
      } else {
        new Notice(`${t("backend.portOccupied")}: ${this.settings.backendPort}-${port}`);
        return false;
      }
    }
    if (port !== this.settings.backendPort) {
      new Notice(`${t("backend.portSwitched")}: ${this.settings.backendPort} -> ${port}`);
    }
    this.activePort = port;

    // 4. 启动 Python 后端
    const serverScript = path.join(this.pluginDir, "backend", "server.py");
    if (!existsSync(serverScript)) {
      new Notice(`${t("backend.scriptMissing")}: ${serverScript}`);
      return false;
    }

    const args = [
      serverScript,
      "--model-dir", modelDir,
      "--port", String(port),
      "--vad-threshold", String(this.settings.vad.threshold),
      "--vad-min-silence", String(this.settings.vad.minSilenceDuration),
      "--partial-profile", this.settings.realtimeProfile,
      "--recognition-mode", this.settings.recognitionMode,
      "--provider", this.settings.gpuProvider,
    ];
    if (this.settings.useInt8) {
      args.push("--use-int8");
    } else {
      args.push("--no-int8");
    }

    return new Promise<boolean>((resolve) => {
      let lastStderr = "";
      this.process = spawn(this.settings.pythonPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: this.pluginDir,
      });

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          new Notice(t("backend.startTimeout"));
          resolve(false);
        }
      }, 30000);

      this.process!.stdout!.on("data", (data: Buffer) => {
        const msg = data.toString();
        console.log("[Transcription Backend]", msg);
        if (msg.includes("Server started") && !resolved) {
          void (async () => {
            const reachable = await this.isBackendReachable(port, 2500);
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            if (!reachable) {
              new Notice(t("backend.startedNotReady"));
              resolve(false);
              return;
            }
            this.writePidFile();
            this.lastLaunchSignature = desiredSignature;
            resolve(true);
          })();
        }
      });

      this.process!.stderr!.on("data", (data: Buffer) => {
        const msg = data.toString();
        lastStderr = msg.trim() || lastStderr;
        console.error("[Transcription Backend Error]", msg);
      });

      this.process!.on("error", (err: Error) => {
        console.error("后端进程启动失败:", err);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          new Notice(`${t("backend.startFailed")}: ${err.message}`);
          resolve(false);
        }
      });

      this.process!.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
        console.log(`后端进程退出, code=${code}, signal=${signal ?? "none"}`);
        this.process = null;
        this.lastLaunchSignature = null;
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const detail = lastStderr ? `\n${lastStderr}` : "";
          const reason = signal ? `${code ?? "null"}, signal=${signal}` : `${code ?? "null"}`;
          new Notice(`${t("backend.exitFailed")}: ${reason})${detail}`);
          resolve(false);
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      const pid = this.process.pid;
      if (process.platform === "win32" && pid) {
        // Windows: 使用 taskkill 强制终止进程树
        try { execSync(`taskkill /PID ${pid} /T /F 2>nul`, { timeout: 5000 }); } catch { /* 忽略 */ }
      } else {
        this.process.kill("SIGTERM");
      }
      // 等待进程退出，最多 5 秒
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) {
            if (process.platform === "win32" && pid) {
              try { execSync(`taskkill /PID ${pid} /T /F 2>nul`, { timeout: 3000 }); } catch { /* 忽略 */ }
            } else {
              this.process.kill("SIGKILL");
            }
          }
          resolve();
        }, 5000);

        if (this.process) {
          this.process.on("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });
      this.process = null;
      this.lastLaunchSignature = null;
    }
    this.removePidFile();
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  async checkEnvironment(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      execFile(
        this.settings.pythonPath,
        ["-c", "import sherpa_onnx; import websockets; print('ok')"],
        { timeout: 10000 },
        (error: Error | null, stdout: string) => {
          resolve(!error && stdout.trim() === "ok");
        },
      );
    });
  }

  async downloadModel(outputDir: string): Promise<boolean> {
    const downloadScript = path.join(this.pluginDir, "backend", "download_model.py");

    if (!existsSync(downloadScript)) {
      new Notice(`${t("backend.downloadScriptMissing")}: ${downloadScript}\n${t("backend.downloadScriptMissingHint")}`);
      return false;
    }

    return new Promise<boolean>((resolve) => {
      // -u：强制 Python 无缓冲输出，进度可实时传到 Node.js
      const proc = spawn(this.settings.pythonPath, ["-u", downloadScript, "--output-dir", outputDir], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      proc.stdout!.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        console.log("[Model Download]", msg);
        // 有新文件开始下载时推送 Notice
        if (msg.includes("下载:") || msg.includes("Download:")) {
          new Notice(msg.split("\n")[0], 3000);
        }
      });
      proc.stderr!.on("data", (data: Buffer) => {
        console.error("[Model Download Error]", data.toString());
      });
      proc.on("exit", (code: number | null) => {
        resolve(code === 0);
      });
      proc.on("error", (err: Error) => {
        new Notice(`${t("backend.cannotStartPython")} (${this.settings.pythonPath}): ${err.message}`);
        resolve(false);
      });
    });
  }

  /** 将当前后端进程的 PID 写入文件，供下次启动时清理 */
  private writePidFile(): void {
    if (!this.process?.pid) return;
    try {
      writeFileSync(this.pidFile, String(this.process.pid), "utf-8");
    } catch {
      // 写入失败不阻塞启动
    }
  }

  /** 删除 PID 文件 */
  private removePidFile(): void {
    try {
      if (existsSync(this.pidFile)) unlinkSync(this.pidFile);
    } catch {
      // 忽略
    }
  }

  /**
   * 清理孤儿后端进程：
   * 1. 优先读取 PID 文件，精确 kill
   * 2. 兜底：按命令行特征查找残留进程（跨平台）
   */
  private killOrphanedProcesses(): void {
    const isWin = process.platform === "win32";

    // 策略 1：PID 文件
    if (existsSync(this.pidFile)) {
      try {
        const pid = parseInt(readFileSync(this.pidFile, "utf-8").trim(), 10);
        if (pid > 0) {
          if (isWin) {
            execSync(`taskkill /PID ${pid} /F 2>nul`, { timeout: 3000 });
          } else {
            process.kill(pid, "SIGTERM");
          }
          console.log(`[Transcription] 通过 PID 文件清理孤儿进程 ${pid}`);
        }
      } catch {
        // 进程可能已退出，忽略
      }
      this.removePidFile();
    }

    // 策略 2：兜底，按命令行特征查找残留进程
    try {
      if (isWin) {
        // Windows: 使用 wmic 按命令行匹配查找 server.py 进程
        const output = execSync(
          `wmic process where "CommandLine like '%server.py%'" get ProcessId /format:list 2>nul`,
          { encoding: "utf-8", timeout: 3000 },
        ).trim();
        for (const line of output.split("\n")) {
          const match = line.match(/ProcessId=(\d+)/);
          if (match) {
            const pid = parseInt(match[1], 10);
            if (pid > 0) {
              try {
                execSync(`taskkill /PID ${pid} /F 2>nul`, { timeout: 3000 });
                console.log(`[Transcription] 兜底清理残留进程 ${pid}`);
              } catch {
                // 忽略
              }
            }
          }
        }
      } else {
        // Unix: 使用 pgrep 查找
        const serverScript = path.join(this.pluginDir, "backend", "server.py");
        const output = execSync(
          `pgrep -f "${serverScript}" 2>/dev/null || true`,
          { encoding: "utf-8", timeout: 3000 },
        ).trim();
        if (output) {
          for (const line of output.split("\n")) {
            const pid = parseInt(line.trim(), 10);
            if (pid > 0) {
              try {
                process.kill(pid, "SIGTERM");
                console.log(`[Transcription] 兜底清理残留进程 ${pid}`);
              } catch {
                // 忽略
              }
            }
          }
        }
      }
    } catch {
      // 命令不可用或超时，忽略
    }
  }

  private isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require("net") as typeof import("net");
      const server = net.createServer();
      server.once("error", () => resolve(true));
      server.once("listening", () => {
        server.close();
        resolve(false);
      });
      server.listen(port, "127.0.0.1");
    });
  }

  private isBackendReachable(port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      let ws: WebSocket | null = null;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          ws?.close();
        } catch {
          // noop
        }
        resolve(ok);
      };

      const timer = setTimeout(() => finish(false), timeoutMs);
      try {
        ws = new WebSocket(`ws://127.0.0.1:${port}`);
        ws.onopen = () => finish(true);
        ws.onerror = () => finish(false);
      } catch {
        finish(false);
      }
    });
  }

  private getLaunchSignature(): string {
    return JSON.stringify({
      pythonPath: this.settings.pythonPath,
      modelDir: this.settings.modelDir,
      backendPort: this.settings.backendPort,
      useInt8: this.settings.useInt8,
      vadThreshold: this.settings.vad.threshold,
      vadMinSilence: this.settings.vad.minSilenceDuration,
      realtimeProfile: this.settings.realtimeProfile,
      recognitionMode: this.settings.recognitionMode,
      gpuProvider: this.settings.gpuProvider,
    });
  }
}
