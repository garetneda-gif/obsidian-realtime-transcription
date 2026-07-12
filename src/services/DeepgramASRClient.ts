import type { CloudLanguage, TranscriptionResult } from "../types";

interface DeepgramAlternative {
  transcript?: string;
  languages?: string[];
}

interface DeepgramMessage {
  type?: string;
  request_id?: string;
  start?: number;
  duration?: number;
  is_final?: boolean;
  speech_final?: boolean;
  from_finalize?: boolean;
  metadata?: {
    request_id?: string;
  };
  channel?: {
    detected_language?: string;
    alternatives?: DeepgramAlternative[];
  };
  description?: string;
  message?: string;
}

export class DeepgramASRClient {
  private ws: WebSocket | null = null;
  private language: CloudLanguage = "auto";
  private onResult: ((result: TranscriptionResult) => void) | null = null;
  private onStatusChange: ((connected: boolean) => void) | null = null;
  private onReconnecting: ((attempt: number) => void) | null = null;
  private onUnexpectedClose: (() => void) | null = null;
  private onError: ((message: string) => void) | null = null;
  private expectedClose = false;
  private opened = false;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private lastAudioAt = 0;
  private finalResultResolver: (() => void) | null = null;
  private finalResultTimer: ReturnType<typeof setTimeout> | null = null;
  private requestIdValue: string | null = null;

  updateLanguage(language: CloudLanguage): void {
    this.language = language;
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

  setOnUnexpectedClose(cb: () => void): void {
    this.onUnexpectedClose = cb;
  }

  setOnError(cb: (message: string) => void): void {
    this.onError = cb;
  }

  get requestId(): string | null {
    return this.requestIdValue;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(websocketUrl: string, accessToken: string, authType: "bearer" | "proxy" = "bearer"): Promise<void> {
    this.disconnect();
    this.expectedClose = false;
    this.opened = false;
    this.requestIdValue = null;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let socket: WebSocket;
      try {
        socket = new WebSocket(
          websocketUrl,
          authType === "proxy" ? ["ort-proxy", accessToken] : ["bearer", accessToken],
        );
      } catch (error) {
        reject(error);
        return;
      }
      this.ws = socket;
      socket.binaryType = "arraybuffer";

      const markOpened = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.opened = true;
        this.lastAudioAt = Date.now();
        this.startKeepAlive();
        this.onStatusChange?.(true);
        resolve();
      };

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.expectedClose = true;
        socket.close();
        reject(new Error("Cloud ASR connection timed out"));
      }, 10000);

      socket.onopen = () => {
        if (authType === "bearer") markOpened();
      };
      socket.onmessage = (event: MessageEvent) => {
        if (typeof event.data !== "string") return;
        if (authType === "proxy" && !settled) {
          try {
            const messageType = (JSON.parse(event.data) as DeepgramMessage).type;
            if (messageType === "ProxyReady") {
              socket.send(JSON.stringify({ type: "ProxyReadyAck" }));
              return;
            }
            if (messageType === "ProxyConfirmed") {
              markOpened();
              return;
            }
          } catch {
            return;
          }
        }
        this.handleMessage(event.data);
      };
      socket.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error("Cloud ASR connection failed"));
        } else {
          this.onError?.("Cloud ASR connection error");
        }
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        this.stopKeepAlive();
        this.resolveFinalWait();
        if (this.ws === socket) this.ws = null;
        this.onStatusChange?.(false);
        if (!settled) {
          settled = true;
          reject(new Error("Cloud ASR connection closed during setup"));
          return;
        }
        if (this.opened && !this.expectedClose) {
          this.onUnexpectedClose?.();
        }
      };
    });
  }

  sendAudio(data: Int16Array): void {
    if (!this.isConnected) return;
    this.lastAudioAt = Date.now();
    this.ws?.send(data.slice().buffer);
  }

  sendCommand(_cmd: Record<string, unknown>): void {
  }

  async finalizeAndDisconnect(timeoutMs = 2000): Promise<void> {
    if (!this.isConnected) {
      this.disconnect();
      return;
    }

    this.expectedClose = true;
    const finalResult = this.waitForFinalResult(timeoutMs);
    this.ws?.send(JSON.stringify({ type: "Finalize" }));
    await finalResult;
    if (this.isConnected) {
      this.ws?.send(JSON.stringify({ type: "CloseStream" }));
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    this.disconnect();
  }

  disconnect(): void {
    this.expectedClose = true;
    this.stopKeepAlive();
    this.resolveFinalWait();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(raw: string): void {
    let data: DeepgramMessage;
    try {
      data = JSON.parse(raw) as DeepgramMessage;
    } catch {
      return;
    }

    const requestId = data.request_id ?? data.metadata?.request_id;
    if (requestId) this.requestIdValue = requestId;

    if (data.type === "Error") {
      this.onError?.(data.description || data.message || "Cloud ASR error");
      this.ws?.close();
      return;
    }
    if (data.type !== "Results") return;

    const alternative = data.channel?.alternatives?.[0];
    const text = alternative?.transcript?.trim() ?? "";
    if (text) {
      this.onResult?.({
        type: data.is_final ? "final" : "partial",
        text,
        language: this.resolveLanguage(data, alternative),
        timestamps: {
          start: Number(data.start) || 0,
          duration: Number(data.duration) || 0,
        },
      });
    }
    if (data.from_finalize) this.resolveFinalWait();
  }

  private resolveLanguage(data: DeepgramMessage, alternative?: DeepgramAlternative): string {
    const detected = data.channel?.detected_language ?? alternative?.languages?.[0];
    const language = detected || this.language;
    if (language === "zh-HK" || language.toLowerCase() === "yue") return "yue";
    if (language.startsWith("zh")) return "zh";
    if (language.startsWith("en")) return "en";
    if (language.startsWith("ja")) return "ja";
    if (language.startsWith("ko")) return "ko";
    return language === "auto" ? "unknown" : language;
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.isConnected && Date.now() - this.lastAudioAt >= 3000) {
        this.ws?.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, 3000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private waitForFinalResult(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      this.finalResultResolver = resolve;
      this.finalResultTimer = setTimeout(() => this.resolveFinalWait(), timeoutMs);
    });
  }

  private resolveFinalWait(): void {
    if (this.finalResultTimer) {
      clearTimeout(this.finalResultTimer);
      this.finalResultTimer = null;
    }
    const resolve = this.finalResultResolver;
    this.finalResultResolver = null;
    resolve?.();
  }
}
