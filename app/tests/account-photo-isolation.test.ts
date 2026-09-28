import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { openDB } from "idb";
import { emptyRecords } from "../lib/until/domain";
import { cleanupLocalPhotos, getPhoto } from "../lib/until/repository";

it("migrates unambiguous legacy photos offline and keeps equal photo IDs isolated by account", async () => {
  const db = await openDB("until", 1, {
    upgrade(database) {
      database.createObjectStore("state");
      database.createObjectStore("photos");
    },
  });
  const first = `first-${crypto.randomUUID()}`;
  const second = `second-${crypto.randomUUID()}`;
  const unique = crypto.randomUUID();
  const shared = crypto.randomUUID();
  const firstRecords = emptyRecords();
  const secondRecords = emptyRecords();
  const now = new Date().toISOString();
  const product = (id: string) => ({
    id: crypto.randomUUID(), name: "Stored photo", brand: "", category: "",
    barcode: "", size: "", photoId: id, createdAt: now, updatedAt: now,
    schemaVersion: 1 as const,
  });
  firstRecords.products.push(product(unique), product(shared));
  secondRecords.products.push(product(shared));
  await db.put("state", firstRecords, `records:${first}`);
  await db.put("state", secondRecords, `records:${second}`);
  await db.put("photos", new Blob(["old photo"]), unique);
  await db.put("photos", new Blob(["ambiguous old photo"]), shared);
  await db.put("state", first, "activeAccount");
  expect(await (await getPhoto(unique))?.text()).toBe("old photo");
  expect(await getPhoto(shared)).toBeUndefined();
  await db.put("photos", new Blob(["first account"]), `account:${first}:${shared}`);
  await db.put("photos", new Blob(["second account"]), `account:${second}:${shared}`);
  await cleanupLocalPhotos();
  expect(await (await getPhoto(shared))?.text()).toBe("first account");
  await db.put("state", second, "activeAccount");
  expect(await (await getPhoto(shared))?.text()).toBe("second account");
  expect(await getPhoto(unique)).toBeUndefined();
  db.close();
});
