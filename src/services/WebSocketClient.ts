import { TranscriptionResult } from "../types";

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onResult: ((result: TranscriptionResult) => void) | null = null;
  private onStatusChange: ((connected: boolean) => void) | null = null;
  private onReconnecting: ((attempt: number) => void) | null = null;
  private shouldReconnect = false;
  private port = 0;
  private reconnectAttempt = 0;

  setOnResult(cb: (result: TranscriptionResult) => void): void {
    this.onResult = cb;
  }

  setOnStatusChange(cb: (connected: boolean) => void): void {
    this.onStatusChange = cb;
  }

  setOnReconnecting(cb: (attempt: number) => void): void {
    this.onReconnecting = cb;
  }

  connect(port: number): Promise<void> {
    this.port = port;
    this.shouldReconnect = true;

    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(`ws://127.0.0.1:${port}`);
      } catch (err) {
        reject(err);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("WebSocket 连接超时"));
      }, 5000);

      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.reconnectAttempt = 0;
        this.onStatusChange?.(true);
        resolve();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === "string") {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "pong") return;
            this.onResult?.(data as TranscriptionResult);
          } catch {
            // 忽略无法解析的消息
          }
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
          reject(new Error("WebSocket 连接失败"));
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  sendAudio(data: Int16Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data.buffer);
    }
  }

  sendCommand(cmd: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(cmd));
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectAttempt++;
    this.onReconnecting?.(this.reconnectAttempt);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect(this.port).catch(() => {
          // 重连失败，onclose 会继续触发下一轮
        });
      }
    }, 1500);
  }
}
