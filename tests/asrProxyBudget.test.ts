import assert from "node:assert/strict";
import test from "node:test";

import { RealtimeAudioBudget } from "../api/asr-proxy.ts";

const bytesPerSecond = 16_000 * 2;

test("proxy audio budget rejects faster-than-realtime PCM", () => {
  let now = 0;
  const budget = new RealtimeAudioBudget(30, () => now);

  assert.equal(budget.accept(bytesPerSecond * 2), true);
  assert.equal(budget.accept(2), false);
  now += 1_000;
  assert.equal(budget.accept(bytesPerSecond), true);
  assert.equal(budget.accept(2), false);
});

test("proxy audio budget never exceeds prepaid PCM duration", () => {
  let now = 0;
  const budget = new RealtimeAudioBudget(3, () => now);

  assert.equal(budget.accept(bytesPerSecond * 2), true);
  now += 1_000;
  assert.equal(budget.accept(bytesPerSecond), true);
  now += 10_000;
  assert.equal(budget.accept(2), false);
});
