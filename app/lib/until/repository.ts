import { openDB, type DBSchema } from "idb";
import { emptyRecords, type Records, newId } from "./domain";
interface UntilDB extends DBSchema {
  state: { key: string; value: Records | string | number };
  photos: { key: string; value: Blob };
}
const database = () =>
  openDB<UntilDB>("until", 1, {
    upgrade(db) {
      db.createObjectStore("state");
      db.createObjectStore("photos");
    },
  });
export async function readRecords() {
  const db = await database();
  return (
    ((await db.get("state", "records")) as Records | undefined) ||
    emptyRecords()
  );
}
export async function deviceToken() {
  const db = await database();
  const tx = db.transaction("state", "readwrite");
  let token = (await tx.store.get("token")) as string | undefined;
  if (!token) {
    token = newId() + newId();
    await tx.store.put(token, "token");
  }
  await tx.done;
  return token;
}
export async function mutate(
  fn: (r: Records) => void,
  photos: Record<string, Blob> = {},
) {
  const db = await database();
  const tx = db.transaction(["state", "photos"], "readwrite");
  const r =
    ((await tx.objectStore("state").get("records")) as Records | undefined) ||
    emptyRecords();
  try {
    fn(r);
    r.revision++;
    await tx.objectStore("state").put(r, "records");
    await tx.objectStore("state").put(r.revision, "pending");
    for (const [id, blob] of Object.entries(photos))
      await tx.objectStore("photos").put(blob, id);
    await tx.done;
  } catch (e) {
    try {
      tx.abort();
    } catch {}
    throw e;
  }
  return r;
}
export async function getPhoto(id: string) {
  return (await database()).get("photos", id);
}
export type SyncState = "saved" | "pending" | "offline" | "unavailable";
let syncing: Promise<SyncState> | undefined;
export function syncRecords(): Promise<SyncState> {
  if (syncing) return syncing;
  syncing = runSync().finally(() => {
    syncing = undefined;
  });
  return syncing;
}
async function runSync(): Promise<SyncState> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  try {
    const db = await database();
    const token = await deviceToken();
    for (let attempt = 0; attempt < 5; attempt++) {
      const records = await readRecords();
      const pending = await db.get("state", "pending");
      if (!pending) return "saved";
      const photoIds = [
        ...new Set(
          [
            ...records.products.map((p) => p.photoId),
            ...records.items.map((i) => i.packagingPhotoId),
          ].filter(Boolean),
        ),
      ] as string[];
      for (const id of photoIds) {
        const blob = await db.get("photos", id);
        if (!blob) continue;
        const response = await fetch(`/api/photos/${id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": blob.type,
          },
          body: blob,
        });
        if (!response.ok) throw Error("Photo upload failed");
      }
      const response = await fetch("/api/sync", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(records),
      });
      if (!response.ok) throw Error("Remote save failed");
      const tx = db.transaction("state", "readwrite");
      if ((await tx.store.get("pending")) === records.revision)
        await tx.store.delete("pending");
      await tx.done;
      if (!(await db.get("state", "pending"))) return "saved";
    }
    return "pending";
  } catch {
    return "unavailable";
  }
}
export async function exportRecords() {
  const records = await readRecords();
  const blob = new Blob(
    [
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          ...records,
          photoNote:
            "Photos remain on this device and in remote photo storage; this JSON contains references, not image bytes.",
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `until-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
