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

test("createRechargeOrder posts normalized return URL and returns order id", async () => {
  let requestBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return jsonResponse({
      order_id: "rt_123",
      url: "https://pay.example.com/order/rt_123",
    });
  }) as typeof fetch;

  const svc = new CloudAuthService(authSettings({ serverUrl: "pay-api.example.com/" }));
  const order = await svc.createRechargeOrder("19.90");

  assert.equal(order.order_id, "rt_123");
  assert.equal(requestBody?.amount, "19.90");
  assert.equal(requestBody?.return_url, "https://pay-api.example.com");
});

test("refreshOrder surfaces provider error code and message", async () => {
  globalThis.fetch = (async () =>
    jsonResponse({ code: "ORDER_PENDING", error: "Payment still pending" }, 409)) as typeof fetch;

  const svc = new CloudAuthService(authSettings());

  await assert.rejects(
    () => svc.refreshOrder("rt_pending"),
    /ORDER_PENDING: Payment still pending/,
  );
});
