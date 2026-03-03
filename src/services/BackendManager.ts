import { Notice } from "obsidian";
import { PluginSettings } from "../types";

const { spawn, execFile } = require("child_process") as typeof import("child_process");
const { existsSync } = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
type ChildProcess = import("child_process").ChildProcess;

export class BackendManager {
  private process: ChildProcess | null = null;
  private pluginDir: string;
  private settings: PluginSettings;
  private lastLaunchSignature: string | null = null;
  /** 实际使用的端口（可能因端口占用而与 settings.backendPort 不同） */
  activePort: number = 0;

  constructor(pluginDir: string, settings: PluginSettings) {
    this.pluginDir = pluginDir;
    this.settings = settings;
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
        this.process.kill("SIGTERM");
      } catch {
        // 忽略杀进程失败
      }
      this.process = null;
      this.lastLaunchSignature = null;
    }

    // 1. 检查 Python 环境
    const envOk = await this.checkEnvironment();
    if (!envOk) {
      new Notice("Python 环境检测失败，请确认已安装 sherpa-onnx:\npip3 install sherpa-onnx websockets numpy");
      return false;
    }

    // 2. 检查模型文件
    const modelDir = this.settings.modelDir;
    if (!modelDir) {
      new Notice("请在插件设置中配置模型目录路径");
      return false;
    }

    const requiredFiles = [
      this.settings.useInt8 ? "model.int8.onnx" : "model.onnx",
      "tokens.txt",
      "silero_vad.onnx",
    ];

    for (const file of requiredFiles) {
      if (!existsSync(path.join(modelDir, file))) {
        new Notice(`模型文件缺失: ${file}\n请先下载模型或检查路径`);
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
        new Notice(`端口 ${this.settings.backendPort}-${port} 均被占用，请在设置中更换端口`);
        return false;
      }
    }
    if (port !== this.settings.backendPort) {
      new Notice(`端口 ${this.settings.backendPort} 被占用，自动切换到 ${port}`);
    }
    this.activePort = port;

    // 4. 启动 Python 后端
    const serverScript = path.join(this.pluginDir, "backend", "server.py");
    if (!existsSync(serverScript)) {
      new Notice(`后端脚本不存在: ${serverScript}`);
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
          new Notice("后端启动超时（30秒），请检查模型文件和 Python 环境");
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
              new Notice("后端已启动但连接未就绪，请重试");
              resolve(false);
              return;
            }
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
          new Notice(`后端启动失败: ${err.message}`);
          resolve(false);
        }
      });

      this.process!.on("exit", (code: number | null) => {
        console.log(`后端进程退出, code=${code}`);
        this.process = null;
        this.lastLaunchSignature = null;
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const detail = lastStderr ? `\n${lastStderr}` : "";
          new Notice(`后端启动失败（退出码: ${code ?? "null"}）${detail}`);
          resolve(false);
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      // 等待进程退出，最多 5 秒
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) {
            this.process.kill("SIGKILL");
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
    return new Promise<boolean>((resolve) => {
      const proc = spawn(this.settings.pythonPath, [downloadScript, "--output-dir", outputDir], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      proc.stdout!.on("data", (data: Buffer) => {
        console.log("[Model Download]", data.toString());
      });
      proc.stderr!.on("data", (data: Buffer) => {
        console.error("[Model Download Error]", data.toString());
      });
      proc.on("exit", (code: number | null) => {
        resolve(code === 0);
      });
      proc.on("error", () => resolve(false));
    });
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
    });
  }
}
