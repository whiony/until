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

it("rejects a demo snapshot atomically without changing existing real records", async () => {
  const { demoRecords } = await import("../lib/until/demo");
  const before = await readRecords();
  await expect(mutate((r) => Object.assign(r, demoRecords()))).rejects.toThrow(
    "Demo records",
  );
  expect(await readRecords()).toEqual(before);
});

it("removes local photo bytes only after the final explicit deletion, including baseline copies", async () => {
  const { deleteItem } = await import("../lib/until/repository");
  const { openDB } = await import("idb");
  const productId = crypto.randomUUID(),
    first = crypto.randomUUID(),
    second = crypto.randomUUID(),
    photo = crypto.randomUUID(),
    label = crypto.randomUUID(),
    at = new Date().toISOString();
  const r = await mutate(
    (r) => {
      r.products = [
        {
          id: productId,
          name: "Real shared product",
          brand: "",
          category: "Food",
          barcode: "",
          size: "",
          photoId: photo,
          createdAt: at,
          updatedAt: at,
          schemaVersion: 1,
        },
      ];
      const item = {
        id: first,
        productId,
        quantity: 1,
        printedDate: "",
        dateKind: "unspecified" as const,
        openedDate: "",
        purchaseDate: "",
        location: "",
        notes: "",
        packagingPhotoId: label,
        status: "used" as const,
        completedAt: at,
        createdAt: at,
        updatedAt: at,
        schemaVersion: 1 as const,
      };
      r.items = [item, { ...item, id: second, status: "discarded" }];
    },
    { [photo]: new Blob(["product"]), [label]: new Blob(["label"]) },
  );
  const db = await openDB("until", 1);
  await db.put("state", r, "base:undefined");
  await deleteItem(first);
  expect(await (await getPhoto(photo))?.text()).toBe("product");
  expect(await (await getPhoto(label))?.text()).toBe("label");
  await deleteItem(second);
  expect(await getPhoto(photo)).toBeUndefined();
  expect(await getPhoto(label)).toBeUndefined();
  expect((await readRecords()).items).toHaveLength(0);
});
