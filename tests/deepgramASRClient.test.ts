import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { DeepgramASRClient } from "../src/services/DeepgramASRClient.ts";
import type { TranscriptionResult } from "../src/types.ts";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static latest: MockWebSocket | null = null;

  readonly url: string;
  readonly protocols: string[];
  readonly sent: unknown[] = [];
  readyState = MockWebSocket.CONNECTING;
  binaryType = "blob";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string, protocols: string | string[]) {
    this.url = url;
    this.protocols = typeof protocols === "string" ? [protocols] : [...protocols];
    MockWebSocket.latest = this;
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  message(payload: object): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  remoteClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

function installWebSocket(t: TestContext): void {
  const original = globalThis.WebSocket;
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    writable: true,
    value: MockWebSocket,
  });
  MockWebSocket.latest = null;
  t.after(() => {
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: original,
    });
    MockWebSocket.latest = null;
  });
}

async function connectClient(t: TestContext): Promise<{
  client: DeepgramASRClient;
  socket: MockWebSocket;
}> {
  installWebSocket(t);
  const client = new DeepgramASRClient();
  t.after(() => client.disconnect());
  const connected = client.connect("wss://api.deepgram.com/v1/listen?model=nova-3", "temporary-token");
  const socket = MockWebSocket.latest;
  assert.ok(socket);
  socket.open();
  await connected;
  return { client, socket };
}

test("connects with Deepgram bearer subprotocols", async (t) => {
  const { client, socket } = await connectClient(t);
  assert.deepEqual(socket.protocols, ["bearer", "temporary-token"]);
  assert.equal(socket.binaryType, "arraybuffer");
  assert.equal(client.isConnected, true);
});

test("waits for proxy readiness and uses the one-time proxy protocol", async (t) => {
  installWebSocket(t);
  const client = new DeepgramASRClient();
  t.after(() => client.disconnect());
  let resolved = false;
  const connected = client.connect("wss://api.example.com/api/asr/proxy", "proxy-token", "proxy")
    .then(() => { resolved = true; });
  const socket = MockWebSocket.latest;
  assert.ok(socket);
  socket.open();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(resolved, false);
  assert.deepEqual(socket.protocols, ["ort-proxy", "proxy-token"]);
  socket.message({ type: "ProxyReady" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(resolved, false);
  assert.deepEqual(socket.sent, [JSON.stringify({ type: "ProxyReadyAck" })]);
  socket.message({ type: "ProxyConfirmed" });
  await connected;
  assert.equal(resolved, true);
});

test("sends copied PCM frames as ArrayBuffer", async (t) => {
  const { client, socket } = await connectClient(t);
  const pcm = new Int16Array([100, -200, 300]);
  client.sendAudio(pcm);
  pcm[0] = 999;

  assert.equal(socket.sent.length, 1);
  assert.ok(socket.sent[0] instanceof ArrayBuffer);
  assert.deepEqual(Array.from(new Int16Array(socket.sent[0] as ArrayBuffer)), [100, -200, 300]);
});

test("maps partial and final results with language and timestamps", async (t) => {
  const { client, socket } = await connectClient(t);
  const results: TranscriptionResult[] = [];
  client.setOnResult((result) => results.push(result));
  client.updateLanguage("zh-HK");

  socket.message({
    type: "Results",
    request_id: "11111111-2222-4333-8444-555555555555",
    start: 1.25,
    duration: 0.75,
    is_final: false,
    channel: { alternatives: [{ transcript: " 你好 " }] },
  });
  socket.message({
    type: "Results",
    start: 2,
    duration: 1.5,
    is_final: true,
    channel: {
      detected_language: "en-US",
      alternatives: [{ transcript: "Hello world" }],
    },
  });

  assert.equal(client.requestId, "11111111-2222-4333-8444-555555555555");
  assert.deepEqual(results, [
    {
      type: "partial",
      text: "你好",
      language: "yue",
      timestamps: { start: 1.25, duration: 0.75 },
    },
    {
      type: "final",
      text: "Hello world",
      language: "en",
      timestamps: { start: 2, duration: 1.5 },
    },
  ]);
});

test("captures metadata request ID and ignores empty results", async (t) => {
  const { client, socket } = await connectClient(t);
  let resultCount = 0;
  client.setOnResult(() => resultCount++);

  socket.message({ type: "Metadata", request_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" });
  socket.message({
    type: "Results",
    is_final: true,
    channel: { alternatives: [{ transcript: "   " }] },
  });

  assert.equal(client.requestId, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  assert.equal(resultCount, 0);
});

test("surfaces provider error messages", async (t) => {
  const { client, socket } = await connectClient(t);
  let errorMessage = "";
  let closeCount = 0;
  client.setOnError((message) => {
    errorMessage = message;
  });
  client.setOnUnexpectedClose(() => closeCount++);

  socket.message({ type: "Error", description: "Invalid audio format" });
  assert.equal(errorMessage, "Invalid audio format");
  assert.equal(closeCount, 1);
  assert.equal(client.isConnected, false);
});

test("finalizes, waits for a final event, and closes the stream", async (t) => {
  const { client, socket } = await connectClient(t);
  const finalized = client.finalizeAndDisconnect(500);

  assert.equal(socket.sent[0], JSON.stringify({ type: "Finalize" }));
  socket.message({
    type: "Results",
    is_final: true,
    speech_final: true,
    channel: { alternatives: [{ transcript: "done" }] },
  });
  assert.equal(socket.sent.length, 1);
  socket.message({
    type: "Results",
    is_final: true,
    from_finalize: true,
    channel: { alternatives: [{ transcript: "final tail" }] },
  });
  await finalized;

  assert.equal(socket.sent[1], JSON.stringify({ type: "CloseStream" }));
  assert.equal(client.isConnected, false);
});

test("reports an unexpected remote close without reconnecting", async (t) => {
  const { client, socket } = await connectClient(t);
  let closeCount = 0;
  client.setOnUnexpectedClose(() => closeCount++);

  socket.remoteClose();
  assert.equal(closeCount, 1);
  assert.equal(client.isConnected, false);
});
