import "fake-indexeddb/auto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openDB } from "idb";
import { emptyRecords } from "../lib/until/domain";
import { createPortableArchive, verifyPortableArchive } from "../lib/until/portable-archive";

it("restores current records and both photo kinds into isolated storage with intact associations", async () => {
  const records = emptyRecords();
  const productId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const productPhoto = crypto.randomUUID();
  const packagingPhoto = crypto.randomUUID();
  const at = new Date().toISOString();
  records.products.push({ id: productId, name: "Test cream", brand: "", category: "Beauty", barcode: "", size: "", photoId: productPhoto, createdAt: at, updatedAt: at, schemaVersion: 1 });
  records.items.push({ id: itemId, productId, quantity: 2, printedDate: "2029-04-15", dateKind: "best before", purchaseDate: "", openedDate: "", location: "Bathroom", notes: "", packagingPhotoId: packagingPhoto, status: "active", createdAt: at, updatedAt: at, schemaVersion: 1 });
  const bytes = await readFile("tests/fixtures/label.png");
  const blobs = [productPhoto, packagingPhoto].map((id) => ({ id, blob: new Blob([new Uint8Array(bytes)], { type: "image/png" }) }));
  const archive = await createPortableArchive({ format: "until-portable-v1", exportedAt: at, records, recovery: [] }, blobs);
  const { data, entries } = await verifyPortableArchive(archive);
  const restored = await openDB(`until-restore-${crypto.randomUUID()}`, 1, { upgrade(db) { db.createObjectStore("state"); db.createObjectStore("photos"); } });
  await restored.put("state", data.records, "records");
  for (const photo of blobs) await restored.put("photos", new Blob([new Uint8Array(entries.get(`photos/${photo.id}.png`)!)], { type: "image/png" }), photo.id);
  const copy = await restored.get("state", "records");
  expect(copy.products[0].photoId).toBe(productPhoto);
  expect(copy.items[0].packagingPhotoId).toBe(packagingPhoto);
  expect(copy.items[0].productId).toBe(copy.products[0].id);
  expect(new Uint8Array(await (await restored.get("photos", productPhoto)).arrayBuffer())).toEqual(new Uint8Array(bytes));
  expect(new Uint8Array(await (await restored.get("photos", packagingPhoto)).arrayBuffer())).toEqual(new Uint8Array(bytes));
  restored.close();
  const folder = await mkdtemp(join(tmpdir(), "until-restore-test-"));
  try {
    const source = join(folder, "data.zip");
    const output = join(folder, "isolated");
    await writeFile(source, new Uint8Array(await archive.arrayBuffer()));
    execFileSync("python3", ["scripts/restore-portable-archive.py", source, output]);
    expect(JSON.parse(await readFile(join(output, "records.json"), "utf8")).records.items[0].packagingPhotoId).toBe(packagingPhoto);
    expect(new Uint8Array(await readFile(join(output, "photos", `${productPhoto}.png`)))).toEqual(new Uint8Array(bytes));
    expect(new Uint8Array(await readFile(join(output, "photos", `${packagingPhoto}.png`)))).toEqual(new Uint8Array(bytes));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

it("refuses a missing or damaged referenced photo instead of creating a partial archive", async () => {
  const records = emptyRecords();
  const id = crypto.randomUUID();
  const at = new Date().toISOString();
  records.products.push({ id: crypto.randomUUID(), name: "Photo", brand: "", category: "", barcode: "", size: "", photoId: id, createdAt: at, updatedAt: at, schemaVersion: 1 });
  const data = { format: "until-portable-v1" as const, exportedAt: at, records, recovery: [] };
  await expect(createPortableArchive(data, [])).rejects.toThrow("missing");
  const archive = await createPortableArchive(data, [{ id, blob: new Blob(["image"], { type: "image/png" }) }]);
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const location = bytes.indexOf("i".charCodeAt(0), 50);
  bytes[location] ^= 1;
  await expect(verifyPortableArchive(new Blob([bytes]))).rejects.toThrow();
});

it("keeps a recovery-only photo in the portable archive", async () => {
  const photoId = crypto.randomUUID();
  const recovery = emptyRecords();
  const at = new Date().toISOString();
  recovery.products.push({ id: crypto.randomUUID(), name: "Recovered product", brand: "", category: "", barcode: "", size: "", photoId, createdAt: at, updatedAt: at, schemaVersion: 1 });
  const archive = await createPortableArchive({ format: "until-portable-v1", exportedAt: at, records: emptyRecords(), recovery: [recovery] }, [
    { id: photoId, blob: new Blob(["recovery bytes"], { type: "image/png" }) },
  ]);
  const { data, entries } = await verifyPortableArchive(archive);
  expect(data.recovery[0].products[0].photoId).toBe(photoId);
  expect(new TextDecoder().decode(entries.get(`photos/${photoId}.png`))).toBe("recovery bytes");
});
