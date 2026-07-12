import { TencentASRSettings, TranscriptionResult } from "../types";

const crypto = require("crypto") as typeof import("crypto");

/**
 * 腾讯云实时语音识别 WebSocket 客户端
 *
 * 协议参考: https://cloud.tencent.com/document/product/1093/48982
 *
 * 音频要求: 16kHz, 16-bit, 单声道 PCM（与 AudioCapture 输出一致）
 * 发送节奏: 每包 ≤200ms 数据（AudioCapture 每包约 256ms，可接受）
 *
 * 结果格式:
 *   slice_type=0 → 句子开始（忽略）
 *   slice_type=1 → 识别中（partial）
 *   slice_type=2 → 句子结束（final）
 */
export class TencentASRClient {
  private ws: WebSocket | null = null;
  private onResult: ((result: TranscriptionResult) => void) | null = null;
  private onStatusChange: ((connected: boolean) => void) | null = null;
  private onReconnecting: ((attempt: number) => void) | null = null;
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private settings: TencentASRSettings;
  /** 当前句子的起始时间（秒），从服务端 start_time 取得 */
  private currentSentenceStartSec = 0;

  constructor(settings: TencentASRSettings) {
    this.settings = settings;
  }

  updateSettings(settings: TencentASRSettings): void {
    this.settings = settings;
  }

  setOnResult(cb: (result: TranscriptionResult) => void): void {
    this.onResult = cb;
  }

  setOnStatusChange(cb: (connected: boolean) => void): void {
    this.onStatusChange = cb;
  }

  setOnReconnecting(cb: (attempt: number) => void): void {
    this.onReconnecting = cb;
  }

  /**
   * 使用服务端提供的签名 URL 连接（cloud 付费模式）
   * 跳过本地签名逻辑，直接用已签名的 URL 建立 WebSocket
   */
  async connectWithSignedUrl(signedUrl: string): Promise<void> {
    this.shouldReconnect = false; // cloud 模式不自动重连，由上层管理续签
    return this.connectToUrl(signedUrl);
  }

  /**
   * 构建签名并连接到腾讯云 ASR WebSocket（BYOK 模式）
   */
  async connect(): Promise<void> {
    this.shouldReconnect = true;

    // 先获取服务器时间（官方 SDK 做法，避免本地时钟偏差导致签名失败）
    const url = await this.buildSignedUrl();
    if (!url) {
      throw new Error("腾讯云 ASR 配置不完整（AppID / SecretID / SecretKey）");
    }

    return this.connectToUrl(url);
  }

  /**
   * 内部：用指定 URL 建立 WebSocket 连接
   */
  private connectToUrl(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        reject(err);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("腾讯云 ASR 连接超时"));
      }, 10000);

      this.ws.binaryType = "arraybuffer";

      let handshakeResolved = false;

      this.ws.onopen = () => {
        // 腾讯云 WebSocket 连接成功后，不立即 resolve
        // 需等待握手响应 {"code": 0, "message": "success"}
        console.log("[TencentASR] WebSocket 已连接，等待握手响应...");
      };

      this.ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data !== "string") return;

        try {
          const data = JSON.parse(event.data);

          // 首条 code===0 的消息视为握手成功（无论是否携带 result）
          if (!handshakeResolved && data.code === 0) {
            handshakeResolved = true;
            clearTimeout(timeout);
            this.reconnectAttempt = 0;
            this.onStatusChange?.(true);
            resolve();
            // 如果首条消息同时携带识别结果，继续处理
            if (data.result) {
              this.handleASRResult(data.result);
            }
            return;
          }

          // 识别全部完成
          if (data.final === 1) {
            console.log("[TencentASR] 识别完成（final=1）");
            return;
          }

          // 错误
          if (data.code !== 0) {
            console.error(`[TencentASR] 服务端错误: code=${data.code} msg=${data.message}`);
            // 握手阶段的错误（如鉴权失败）：立即 reject 并停止重连
            if (!handshakeResolved) {
              handshakeResolved = true;
              clearTimeout(timeout);
              this.shouldReconnect = false;
              reject(new Error(`腾讯云 ASR 错误 (${data.code}): ${data.message}`));
              try { this.ws?.close(); } catch { /* noop */ }
            }
            return;
          }

          // 识别结果
          if (data.result) {
            this.handleASRResult(data.result);
          }
        } catch {
          // 忽略无法解析的消息
        }
      };

      this.ws.onclose = () => {
        clearTimeout(timeout);
        this.onStatusChange?.(false);
        this.ws = null;
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        if (this.ws?.readyState !== WebSocket.OPEN) {
          this.shouldReconnect = false;
          reject(new Error("腾讯云 ASR 连接失败"));
        }
      };
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempt = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      // 发送空音频帧表示音频流结束（腾讯云协议要求）
      try {
        this.ws.send(new ArrayBuffer(0));
      } catch {
        // 忽略
      }
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 发送 16kHz 16-bit PCM 音频数据
   * 直接发送 Int16Array 的 ArrayBuffer，与本地模式一致
   */
  sendAudio(data: Int16Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data.buffer);
    }
  }

  /**
   * 云端模式下 sendCommand 为空操作
   * 本地模式的 reset / flush_partial 命令对腾讯云无意义
   */
  sendCommand(_cmd: Record<string, unknown>): void {
    // noop — 腾讯云 ASR 不需要这些控制命令
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── 私有方法 ──

  /**
   * 将腾讯云的识别结果转换为统一的 TranscriptionResult
   */
  private handleASRResult(result: {
    slice_type: number;
    index: number;
    start_time: number;
    end_time: number;
    voice_text_str: string;
  }): void {
    const text = result.voice_text_str?.trim();
    if (!text) return;

    // slice_type: 0=句子开始, 1=识别中(partial), 2=句子结束(final)
    if (result.slice_type === 0) {
      this.currentSentenceStartSec = result.start_time / 1000;
      return;
    }

    const type = result.slice_type === 2 ? "final" : "partial";
    const startSec = this.currentSentenceStartSec;
    const durationSec = (result.end_time - result.start_time) / 1000;

    // 腾讯云不返回 per-result 语言标签
    // 根据引擎模型推断：16k_zh → zh, 16k_en → en, 其他 → zh
    const language = this.inferLanguage();

    const transcriptionResult: TranscriptionResult = {
      type,
      text,
      language,
      timestamps: {
        start: startSec,
        duration: durationSec,
      },
    };

    console.log(`[TencentASR] ${type}: "${text.slice(0, 60)}" lang=${language}`);
    this.onResult?.(transcriptionResult);
  }

  /**
   * 根据引擎模型类型推断语言
   */
  private inferLanguage(): string {
    const engine = this.settings.engineModelType;
    if (engine.includes("_zh_en")) return "zh";
    if (engine.includes("_en")) return "en";
    if (engine.includes("_zh")) return "zh";
    return "zh";
  }

  /**
   * 从腾讯云服务器获取时间戳（避免本地时钟偏差导致签名失败）
   * 官方 JS SDK 也是这么做的：https://github.com/TencentCloud/tencentcloud-speech-sdk-js
   */
  private async fetchServerTime(): Promise<number> {
    try {
      const resp = await fetch("https://asr.cloud.tencent.com/server_time");
      const text = await resp.text();
      const ts = parseInt(text, 10);
      if (ts > 0) {
        console.log(`[TencentASR] 服务器时间: ${ts}, 本地时间: ${Math.floor(Date.now() / 1000)}, 偏差: ${ts - Math.floor(Date.now() / 1000)}s`);
        return ts;
      }
    } catch (err) {
      console.warn("[TencentASR] 获取服务器时间失败，使用本地时间:", err);
    }
    return Math.floor(Date.now() / 1000);
  }

  /**
   * 构建带 HMAC-SHA1 签名的 WebSocket URL
   *
   * 签名流程:
   * 1. 所有参数按 key 字典序排列
   * 2. 拼接为 host/path?key1=val1&key2=val2（ASR WebSocket 不加 GET 前缀）
   * 3. HMAC-SHA1(plaintext, secretKey) → Base64 → URL encode
   */
  private async buildSignedUrl(): Promise<string | null> {
    const { appId, secretId, secretKey } = this.settings;
    if (!appId || !secretId || !secretKey) return null;

    const now = await this.fetchServerTime();
    const voiceId = this.generateVoiceId();

    // 仅含必要参数（与官方 SDK 一致），可选参数不加入签名
    const params: Record<string, string> = {
      secretid: secretId,
      timestamp: String(now),
      expired: String(now + 86400),
      nonce: String(Math.round(Date.now() / 100000)),
      engine_model_type: this.settings.engineModelType,
      voice_id: voiceId,
      voice_format: "1",
    };

    // 按 key 字典序排列
    const sortedKeys = Object.keys(params).sort();
    const queryString = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");

    // 签名原文: host + path + ? + sorted params（注意：ASR WebSocket 不加 GET 前缀）
    const signPlaintext = `asr.cloud.tencent.com/asr/v2/${appId}?${queryString}`;

    // HMAC-SHA1 签名
    const hmac = crypto.createHmac("sha1", secretKey);
    hmac.update(signPlaintext);
    const signature = hmac.digest("base64");

    // URL 编码签名（必须编码 + 和 =）
    const encodedSignature = encodeURIComponent(signature);

    return `wss://asr.cloud.tencent.com/asr/v2/${appId}?${queryString}&signature=${encodedSignature}`;
  }

  private generateVoiceId(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";
    for (let i = 0; i < 16; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectAttempt++;
    this.onReconnecting?.(this.reconnectAttempt);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect().catch(() => {
          // 重连失败，onclose 会继续触发下一轮
        });
      }
    }, 2000);
  }
}
