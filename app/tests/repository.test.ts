import "fake-indexeddb/auto";
import { it, expect, vi } from "vitest";
import {
  mutate,
  readRecords,
  getPhoto,
  deviceToken,
  syncRecords,
} from "../lib/until/repository";
it("atomically persists records and photos across new reads, and serializes concurrent edits", async () => {
  const b = new Blob(["photo"], { type: "image/jpeg" });
  await mutate(
    (r) => {
      r.settings.soonDays = 12;
    },
    { picture: b },
  );
  expect((await readRecords()).settings.soonDays).toBe(12);
  expect(await (await getPhoto("picture"))?.text()).toBe("photo");
  const revision = (await readRecords()).revision;
  await Promise.all([
    mutate((r) => {
      r.settings.soonDays++;
    }),
    mutate((r) => {
      r.settings.soonDays++;
    }),
  ]);
  expect((await readRecords()).settings.soonDays).toBe(14);
  expect((await readRecords()).revision).toBe(revision + 2);
  expect(await deviceToken()).toBe(await deviceToken());
});
it("retains data when account authentication is unavailable", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw Error("Network unavailable");
    }),
  );
  const before = await readRecords();
  expect(await syncRecords()).toBe("unavailable");
  expect(await readRecords()).toEqual(before);
  vi.unstubAllGlobals();
});
