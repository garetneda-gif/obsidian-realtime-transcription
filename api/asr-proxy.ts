import { createServer } from "node:http";
import WebSocket, { WebSocketServer } from "ws";

const deepgramApiKey = process.env.DEEPGRAM_API_KEY || "";
const billingOrigin = (process.env.BS_PUBLIC_SERVER_URL || "").replace(/\/+$/, "");
const allowedCommands = new Set(["KeepAlive", "Finalize", "CloseStream"]);
const maxBufferedBytes = 4 * 1024 * 1024;
const pcmBytesPerSecond = 16_000 * 2;
const audioBurstSeconds = 2;

export class RealtimeAudioBudget {
  private availableBytes = pcmBytesPerSecond * audioBurstSeconds;
  private totalBytes = 0;
  private lastUpdateMs: number;
  private readonly maxSeconds: number;
  private readonly now: () => number;

  constructor(maxSeconds: number, now: () => number = Date.now) {
    this.maxSeconds = maxSeconds;
    this.now = now;
    this.lastUpdateMs = this.now();
  }

  accept(byteLength: number): boolean {
    if (!Number.isSafeInteger(byteLength) || byteLength <= 0) return false;
    const nowMs = this.now();
    const elapsedMs = Math.max(0, nowMs - this.lastUpdateMs);
    this.lastUpdateMs = nowMs;
    this.availableBytes = Math.min(
      pcmBytesPerSecond * audioBurstSeconds,
      this.availableBytes + (elapsedMs * pcmBytesPerSecond) / 1000,
    );
    const maxBytes = Math.max(1, this.maxSeconds) * pcmBytesPerSecond;
    if (byteLength > this.availableBytes || this.totalBytes + byteLength > maxBytes) return false;
    this.availableBytes -= byteLength;
    this.totalBytes += byteLength;
    return true;
  }
}

function rawDataByteLength(data: WebSocket.RawData): number {
  if (Array.isArray(data)) return data.reduce((total, chunk) => total + chunk.byteLength, 0);
  return data.byteLength;
}

const server = createServer((_request, response) => {
  response.writeHead(426, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "WebSocket upgrade required" }));
});

const wss = new WebSocketServer({
  server,
  maxPayload: 1024 * 1024,
  handleProtocols(protocols) {
    return protocols.has("ort-proxy") ? "ort-proxy" : false;
  },
});

function proxyToken(request: import("node:http").IncomingMessage): string {
  const protocols = String(request.headers["sec-websocket-protocol"] || "")
    .split(",")
    .map((value) => value.trim());
  return protocols.find((value) => value && value !== "ort-proxy") || "";
}

async function sessionAction(
  action: "authorize" | "connected" | "failed",
  token: string,
): Promise<Response> {
  return fetch(`${billingOrigin}/api/asr/proxy/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

async function confirmSessionConnected(token: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let retry = false;
    try {
      const response = await sessionAction("connected", token);
      if (response.ok) return true;
      if (response.status < 500) return false;
      retry = true;
    } catch {
      retry = true;
    }
    if (!retry) return false;
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  return false;
}

function deepgramUrl(sessionId: string, language: string): string {
  const params = new URLSearchParams({
    model: "nova-3",
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    interim_results: "true",
    endpointing: "500",
    smart_format: "true",
    punctuate: "true",
    vad_events: "true",
    utterance_end_ms: "1000",
    mip_opt_out: "true",
    tag: "obsidian-paid",
    extra: `ort_session:${sessionId}`,
    language: language === "auto" ? "multi" : language,
  });
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

wss.on("connection", async (client, request) => {
  const token = proxyToken(request);
  let clientClosed = false;
  client.once("close", () => {
    clientClosed = true;
  });
  client.once("error", () => {
    clientClosed = true;
  });
  if (!token || !billingOrigin || !deepgramApiKey) {
    client.close(1008, "Proxy authorization unavailable");
    return;
  }

  let authorization: { session_id: string; language: string; max_seconds: number };
  try {
    const response = await sessionAction("authorize", token);
    if (!response.ok) {
      client.close(1008, "Proxy session rejected");
      return;
    }
    authorization = await response.json() as typeof authorization;
  } catch {
    client.close(1011, "Proxy authorization failed");
    return;
  }
  if (clientClosed) {
    await sessionAction("failed", token).catch(() => undefined);
    return;
  }

  const upstream = new WebSocket(deepgramUrl(authorization.session_id, authorization.language), {
    headers: { Authorization: `Token ${deepgramApiKey}` },
    maxPayload: 1024 * 1024,
  });
  let ready = false;
  let readySignalSent = false;
  let confirming = false;
  let closed = false;
  let startupFailureReported = false;
  const audioBudget = new RealtimeAudioBudget(authorization.max_seconds);
  const reportStartupFailure = async () => {
    if (ready || startupFailureReported) return;
    startupFailureReported = true;
    await sessionAction("failed", token).catch(() => undefined);
  };
  const closeBoth = (code = 1011, reason = "Cloud ASR proxy closed") => {
    if (closed) return;
    closed = true;
    if (client.readyState === WebSocket.OPEN) client.close(code, reason);
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      upstream.close();
    }
  };
  const durationTimer = setTimeout(
    () => {
      if (!ready) void reportStartupFailure();
      closeBoth(1000, "Cloud ASR session limit reached");
    },
    Math.max(1, Number(authorization.max_seconds) || 1) * 1000,
  );

  upstream.on("open", () => {
    if (client.readyState !== WebSocket.OPEN) return;
    readySignalSent = true;
    client.send(JSON.stringify({ type: "ProxyReady" }));
  });

  client.on("message", (data, isBinary) => {
    if (!isBinary) {
      try {
        const payload = JSON.parse(data.toString()) as { type?: string };
        if (payload.type === "ProxyReadyAck" && readySignalSent && !ready && !confirming) {
          confirming = true;
          void (async () => {
            if (await confirmSessionConnected(token)) {
              ready = true;
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: "ProxyConfirmed" }));
              }
              return;
            }
            await reportStartupFailure();
            closeBoth(1011, "Proxy confirmation failed");
          })();
          return;
        }
        if (!ready || upstream.readyState !== WebSocket.OPEN) return;
        if (payload.type && allowedCommands.has(payload.type)) upstream.send(JSON.stringify(payload));
      } catch {
        closeBoth(1008, "Invalid cloud ASR command");
      }
      return;
    }
    if (!ready || upstream.readyState !== WebSocket.OPEN) return;
    if (upstream.bufferedAmount > maxBufferedBytes) {
      closeBoth(1009, "Cloud ASR backpressure limit reached");
      return;
    }
    if (!audioBudget.accept(rawDataByteLength(data))) {
      closeBoth(1008, "Cloud ASR audio limit exceeded");
      return;
    }
    upstream.send(data, { binary: true });
  });

  upstream.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });
  upstream.on("error", async () => {
    await reportStartupFailure();
    closeBoth(1011, "Cloud ASR upstream failed");
  });
  upstream.on("close", async () => {
    await reportStartupFailure();
    closeBoth(1000, "Cloud ASR upstream closed");
  });
  client.on("close", async () => {
    clearTimeout(durationTimer);
    await reportStartupFailure();
    closeBoth(1000, "Client closed");
  });
  client.on("error", async () => {
    await reportStartupFailure();
    closeBoth();
  });
});

export default server;
