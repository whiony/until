import { it, expect } from "vitest";
import { demoRecords } from "../lib/until/demo";
import {
  completeUnit,
  dateWarningKey,
  emptyRecords,
} from "../lib/until/domain";
import { permanentDelete, retiredPhotoIds } from "../lib/until/deletion";
import { mergeRecords, SyncConflict } from "../lib/until/merge";
it("used and discarded keep history and shared photos; only explicit deletion removes records", () => {
  const r = demoRecords();
  const id = r.items[0].id;
  r.items[0].packagingPhotoId = "label";
  r.products[0].photoId = "product";
  const original = structuredClone(r);
  completeUnit(r, id, "used");
  expect(r.items.some((i) => i.status === "used")).toBe(true);
  expect(retiredPhotoIds(r)).toEqual([]);
  completeUnit(r, id, "discarded");
  expect(r.items.some((i) => i.status === "discarded")).toBe(true);
  permanentDelete(r, id);
  expect(r.items.some((i) => i.id === id)).toBe(false);
  expect(r.products.some((p) => p.id === original.items[0].productId)).toBe(
    true,
  );
  expect(retiredPhotoIds(r)).toEqual([]);
  for (const i of [...r.items].filter(
    (i) => i.productId === original.items[0].productId,
  ))
    permanentDelete(r, i.id);
  expect(retiredPhotoIds(r).sort()).toEqual(["label", "product"]);
});
it("offline deletion beats stale edits in either merge direction without deleting shared products", () => {
  const base = demoRecords(),
    offline = structuredClone(base),
    stale = structuredClone(base);
  offline.items[0].quantity = 1;
  permanentDelete(offline, base.items[0].id);
  stale.items[0].notes = "Old device edits after deletion";
  for (const [l, r] of [
    [offline, stale],
    [stale, offline],
  ]) {
    const merged = mergeRecords(base, l, r);
    expect(merged.items.some((i) => i.id === base.items[0].id)).toBe(false);
  }
});
it("compacted epochs prevent resurrection and preserve independent offline creates", () => {
  const base = demoRecords(),
    cloud = structuredClone(base),
    stale = structuredClone(base);
  permanentDelete(cloud, base.items[0].id);
  cloud.deletions = undefined;
  cloud.deletionEpoch = 1;
  const newItem = { ...stale.items[1], id: "offline-new" };
  stale.items.push(newItem);
  const merged = mergeRecords(base, stale, cloud);
  expect(merged.items.some((i) => i.id === base.items[0].id)).toBe(false);
  expect(merged.items.some((i) => i.id === newItem.id)).toBe(true);
  expect(() => mergeRecords(emptyRecords(), stale, cloud)).toThrow(
    SyncConflict,
  );
});
it("date acknowledgement depends only on the warning dates", () => {
  const i = {
    ...demoRecords().items[0],
    printedDate: "2020-01-01",
    openedDate: "2020-01-02",
  };
  expect(dateWarningKey({ ...i, location: "New", notes: "Changed" })).toBe(
    dateWarningKey(i),
  );
  expect(dateWarningKey({ ...i, openedDate: "2020-01-03" })).not.toBe(
    dateWarningKey(i),
  );
});
it("keeps an unsent offline deletion through unrelated cloud compaction and local collection", () => {
  const base = demoRecords(),
    local = structuredClone(base),
    cloud = structuredClone(base);
  permanentDelete(local, base.items[0].id);
  // The local collector prunes bodies but must not put queued markers in base.
  base.items = base.items.filter((i) => i.id !== local.deletions![0].id);
  base.products = base.products.filter((p) => p.id !== local.deletions![1].id);
  cloud.deletionEpoch = 1;
  const merged = mergeRecords(base, local, cloud, true);
  expect(merged.items.some((i) => i.id === local.deletions![0].id)).toBe(false);
  expect(merged.deletions?.some((d) => d.id === local.deletions![0].id)).toBe(
    true,
  );
});
