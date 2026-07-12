import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { CloudAuthService } from "../src/services/CloudAuthService.ts";
import { normalizeHostedCloudAuthSettings } from "../src/types.ts";
import type { CloudAuthSettings } from "../src/types.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function authSettings(overrides: Partial<CloudAuthSettings> = {}): CloudAuthSettings {
  return {
    serverUrl: "https://api.example.com",
    token: "token",
    refreshToken: "refresh",
    tokenExpiresAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    balanceCents: 0,
    ...overrides,
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("CloudAuthService normalizes server URL for every request", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (input) => {
    requests.push(String(input));
    return jsonResponse({
      token: "token",
      refresh_token: "refresh",
      expires_at: new Date(Date.now() + 86400000 * 3).toISOString(),
      balance_cents: 100,
    });
  }) as typeof fetch;

  const svc = new CloudAuthService(authSettings({
    serverUrl: "api.example.com///",
    token: "",
    refreshToken: "",
  }));

  await svc.login("user@example.com", "password123", "captcha-id", "ABCD");

  assert.equal(requests[0], "https://api.example.com/api/auth/login");
});

test("CloudAuthService builds hosted subdomain URLs", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (input) => {
    requests.push(String(input));
    return jsonResponse({
      token: "token",
      refresh_token: "refresh",
      expires_at: new Date(Date.now() + 86400000 * 3).toISOString(),
      balance_cents: 100,
    });
  }) as typeof fetch;

  const svc = new CloudAuthService(authSettings({
    serverUrl: "rt.songrong.org/",
    token: "",
    refreshToken: "",
  }));

  await svc.login("user@example.com", "password123", "captcha-id", "ABCD");

  assert.equal(requests[0], "https://rt.songrong.org/api/auth/login");
  assert.equal(svc.getAccountCenterUrl(), "https://rt.songrong.org/account");
});

test("CloudAuthService rejects empty server URL with a clear error", async () => {
  const svc = new CloudAuthService(authSettings({ serverUrl: "" }));

  await assert.rejects(() => svc.getBalance(), /Cloud server URL is required/);
});

test("hosted cloud auth migration clears credentials from old server URL", () => {
  const migrated = normalizeHostedCloudAuthSettings(authSettings({
    serverUrl: "https://old.example.com",
    token: "old-token",
    refreshToken: "old-refresh",
    tokenExpiresAt: "2099-01-01T00:00:00.000Z",
    balanceCents: 999,
  }));

  assert.equal(migrated.serverUrl, "https://transcribe.songrong.org");
  assert.equal(migrated.token, "");
  assert.equal(migrated.refreshToken, "");
  assert.equal(migrated.tokenExpiresAt, "");
  assert.equal(migrated.balanceCents, 0);
});

test("hosted cloud auth migration preserves credentials from the legacy Vercel domain", () => {
  const migrated = normalizeHostedCloudAuthSettings(authSettings({
    serverUrl: "obsidian-realtime-transcriber.vercel.app/",
    token: "token",
    refreshToken: "refresh",
    tokenExpiresAt: "2099-01-01T00:00:00.000Z",
    balanceCents: 123,
  }));

  assert.equal(migrated.serverUrl, "https://transcribe.songrong.org");
  assert.equal(migrated.token, "token");
  assert.equal(migrated.refreshToken, "refresh");
  assert.equal(migrated.tokenExpiresAt, "2099-01-01T00:00:00.000Z");
  assert.equal(migrated.balanceCents, 123);
});

test("hosted cloud auth migration keeps credentials for the custom domain", () => {
  const migrated = normalizeHostedCloudAuthSettings(authSettings({
    serverUrl: "transcribe.songrong.org/",
    token: "token",
    refreshToken: "refresh",
    tokenExpiresAt: "2099-01-01T00:00:00.000Z",
    balanceCents: 123,
  }));

  assert.equal(migrated.serverUrl, "https://transcribe.songrong.org");
  assert.equal(migrated.token, "token");
  assert.equal(migrated.refreshToken, "refresh");
  assert.equal(migrated.tokenExpiresAt, "2099-01-01T00:00:00.000Z");
  assert.equal(migrated.balanceCents, 123);
});

test("getAccount falls back to balance endpoint when /me is not available", async () => {
  const requests: string[] = [];
  let savedBalance = 0;
  globalThis.fetch = (async (input) => {
    requests.push(String(input));
    if (String(input).endsWith("/api/billing/me")) {
      return jsonResponse({ error: "Not found" }, 404);
    }
    return jsonResponse({ balance_cents: 1234 });
  }) as typeof fetch;

  const svc = new CloudAuthService(authSettings({ serverUrl: "https://api.example.com/" }));
  svc.setOnSettingsChanged((settings) => {
    savedBalance = settings.balanceCents;
  });

  const account = await svc.getAccount();

  assert.deepEqual(requests, [
    "https://api.example.com/api/billing/me",
    "https://api.example.com/api/billing/balance",
  ]);
  assert.equal(account.balance_cents, 1234);
  assert.equal(savedBalance, 1234);
});

test("getAccountCenterUrl returns normalized account center URL", () => {
  const svc = new CloudAuthService(authSettings({ serverUrl: "pay-api.example.com/" }));

  assert.equal(svc.getAccountCenterUrl(), "https://pay-api.example.com/account");
});

test("cloud ASR session creation and settlement use the unified session contract", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    requests.push({ url: String(input), body });
    if (String(input).endsWith("/api/asr/session")) {
      return jsonResponse({
        session_id: "session-1",
        provider: "deepgram",
        language: "en",
        engine_model: "nova-3",
        voice_id: "voice-1",
        precharge_cents: 100,
        balance_cents: 100,
        valid_seconds: 15,
        auth_type: "proxy",
        proxy_token: "proxy-token",
        expires_in: 15,
        websocket_url: "wss://api.example.com/api/asr/proxy",
      });
    }
    return jsonResponse({ balance_cents: 75 });
  }) as typeof fetch;

  const svc = new CloudAuthService(authSettings({ balanceCents: 200 }));
  const session = await svc.createAsrSession("client-session-1", "deepgram", "en");
  await svc.reportUsage(session.session_id, 12.6, "provider-request-1");

  assert.equal(session.provider, "deepgram");
  assert.deepEqual(requests, [
    {
      url: "https://api.example.com/api/asr/session",
      body: {
        client_session_id: "client-session-1",
        provider: "deepgram",
        language: "en",
      },
    },
    {
      url: "https://api.example.com/api/billing/report",
      body: {
        session_id: "session-1",
        provider_request_id: "provider-request-1",
        duration_seconds: 13,
      },
    },
  ]);
});
