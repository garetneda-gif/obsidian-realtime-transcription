import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { CloudAuthService } from "../src/services/CloudAuthService.ts";
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

  await svc.login("user@example.com", "password123");

  assert.equal(requests[0], "https://api.example.com/api/auth/login");
});

test("CloudAuthService rejects empty server URL with a clear error", async () => {
  const svc = new CloudAuthService(authSettings({ serverUrl: "" }));

  await assert.rejects(() => svc.getBalance(), /Cloud server URL is required/);
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
