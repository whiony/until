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
it("keeps pending edits after a failed save and retries idempotently", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  const requests: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(init.body as string).revision);
      throw Error("Offline");
    }),
  );
  expect(await syncRecords()).toBe("unavailable");
  const r = await readRecords();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(init.body as string).revision);
      return new Response("{}");
    }),
  );
  expect(await syncRecords()).toBe("saved");
  expect(requests).toEqual([r.revision, r.revision]);
  expect((await readRecords()).revision).toBe(r.revision);
  vi.unstubAllGlobals();
});
it("does not acknowledge an edit made while a remote request is in flight", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  await mutate((r) => {
    r.settings.soonDays = 20;
  });
  let count = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (count++ === 0)
        await mutate((r) => {
          r.settings.soonDays = 21;
        });
      return new Response("{}");
    }),
  );
  expect(await syncRecords()).toBe("saved");
  expect(count).toBe(2);
  expect((await readRecords()).settings.soonDays).toBe(21);
  vi.unstubAllGlobals();
});
