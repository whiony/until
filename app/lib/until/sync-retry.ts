import type { SyncState } from "./repository";

export class SyncRetryGate {
  private failures = 0;
  private nextAt = 0;

  canRun(now: number, force = false) {
    return force || now >= this.nextAt;
  }

  record(result: SyncState, now: number) {
    if (result === "unavailable") {
      this.failures = Math.min(this.failures + 1, 6);
      this.nextAt = now + Math.min(300000, 10000 * 2 ** (this.failures - 1));
    } else if (result !== "offline") {
      this.failures = 0;
      this.nextAt = 0;
    }
  }
}
