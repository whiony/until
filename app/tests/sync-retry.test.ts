import { expect, it } from "vitest";
import { SyncRetryGate } from "../lib/until/sync-retry";

it("backs off repeated failures, allows explicit resume, and resets after success", () => {
  const retry = new SyncRetryGate();
  expect(retry.canRun(0)).toBe(true);
  retry.record("unavailable", 0);
  expect(retry.canRun(9999)).toBe(false);
  expect(retry.canRun(9999, true)).toBe(true);
  retry.record("unavailable", 10000);
  expect(retry.canRun(29999)).toBe(false);
  expect(retry.canRun(30000)).toBe(true);
  retry.record("offline", 30000);
  expect(retry.canRun(30000)).toBe(true);
  retry.record("saved", 30000);
  expect(retry.canRun(30000)).toBe(true);
  retry.record("unavailable", 30000);
  expect(retry.canRun(39999)).toBe(false);
  expect(retry.canRun(40000)).toBe(true);
});
