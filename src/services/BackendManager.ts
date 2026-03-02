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

  constructor(pluginDir: string, settings: PluginSettings) {
    this.pluginDir = pluginDir;
    this.settings = settings;
  }

  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  async start(): Promise<boolean> {
    if (this.process) {
      return true; // 已在运行
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

    // 3. 检查端口是否已被占用（可能是上次残留的进程）
    const portInUse = await this.isPortInUse(this.settings.backendPort);
    if (portInUse) {
      // 尝试连接看是否是我们的服务
      try {
        const ws = new WebSocket(`ws://127.0.0.1:${this.settings.backendPort}`);
        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => { ws.close(); resolve(); };
          ws.onerror = () => reject();
          setTimeout(() => reject(), 2000);
        });
        // 端口上有 WebSocket 服务在运行，直接复用
        return true;
      } catch {
        new Notice(`端口 ${this.settings.backendPort} 已被占用，请在设置中更换端口`);
        return false;
      }
    }

    // 4. 启动 Python 后端
    const serverScript = path.join(this.pluginDir, "backend", "server.py");
    if (!existsSync(serverScript)) {
      new Notice(`后端脚本不存在: ${serverScript}`);
      return false;
    }

    const args = [
      serverScript,
      "--model-dir", modelDir,
      "--port", String(this.settings.backendPort),
      "--vad-threshold", String(this.settings.vad.threshold),
      "--vad-min-silence", String(this.settings.vad.minSilenceDuration),
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
          resolved = true;
          clearTimeout(timeout);
          resolve(true);
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
}
