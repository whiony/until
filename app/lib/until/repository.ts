import { normalizeCategories, normalizeLocations } from "./preferences";
import { assertRealRecords } from "./demo";
import { cloudPhoto } from "./image-metadata";
import { openDB, type DBSchema } from "idb";
import { emptyRecords, type Records, newId } from "./domain";
import { mergeRecords, recordsEqual, photoIds, SyncConflict } from "./merge";
interface UntilDB extends DBSchema {
  state: { key: string; value: unknown };
  photos: { key: string; value: Blob };
}
const database = () =>
  openDB<UntilDB>("until", 1, {
    upgrade(db) {
      db.createObjectStore("state");
      db.createObjectStore("photos");
    },
  });
const recordKey = (account: string) => `records:${account}`;
async function activeAccount() {
  return (await (await database()).get("state", "activeAccount")) as
    string | undefined;
}
export async function readRecords() {
  const db = await database();
  const account = await activeAccount();
  return (
    ((await db.get(
      "state",
      account ? recordKey(account) : "records",
    )) as Records) || emptyRecords()
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
function announce() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("until-records"));
}
export async function mutate(
  fn: (r: Records) => void,
  photos: Record<string, Blob> = {},
) {
  const db = await database();
  const tx = db.transaction(["state", "photos"], "readwrite");
  const account = (await tx.objectStore("state").get("activeAccount")) as
    string | undefined;
  const key = account ? recordKey(account) : "records";
  const r =
    ((await tx.objectStore("state").get(key)) as Records) || emptyRecords();
  try {
    fn(r);
    normalizeCategories(r);
    normalizeLocations(r);
    assertRealRecords(r);
    r.revision++;
    await tx.objectStore("state").put(r, key);
    for (const [id, blob] of Object.entries(photos))
      await tx.objectStore("photos").put(blob, id);
    await tx.done;
  } catch (e) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw e;
  }
  announce();
  return r;
}
export async function getPhoto(id: string) {
  return (await database()).get("photos", id);
}
export type SyncState =
  "saved" | "pending" | "offline" | "unavailable" | "signed-out" | "conflict";
type Remote = { account: string; revision: number; records: Records | null };
let syncing: Promise<SyncState> | undefined;
export function syncRecords(): Promise<SyncState> {
  if (syncing) return syncing;
  const task: Promise<SyncState> = (async () => {
    if (typeof navigator !== "undefined" && navigator.locks)
      return await navigator.locks.request("until-account-sync", () =>
        runSync(),
      );
    return await runSync();
  })().finally(() => {
    syncing = undefined;
  });
  syncing = task;
  return task;
}
const request = (url: string, init: RequestInit = {}) =>
  fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
async function bindAccount(remote: Remote) {
  const db = await database();
  if ((await db.get("state", "legacyOwner")) === undefined) {
    const token = await deviceToken();
    const response = await request("/api/legacy", {
      method: "POST",
      headers: {
        "X-Until-Legacy-Key": token,
        "X-Until-Account": remote.account,
      },
    });
    if (!response.ok) throw Error("Migration unavailable");
    const legacy = (await response.json()) as Records | null;
    const tx = db.transaction("state", "readwrite");
    if (!(await tx.store.get("legacyOwner"))) {
      const local =
        ((await tx.store.get("records")) as Records) || emptyRecords();
      if (legacy) {
        for (const key of ["products", "items"] as const) {
          const merged = new Map(legacy[key].map((v) => [v.id, v]));
          for (const v of local[key]) {
            const old = merged.get(v.id);
            if (!old || v.updatedAt >= old.updatedAt) merged.set(v.id, v);
          }
          Object.assign(local, { [key]: [...merged.values()] });
        }
      }
      if (!(await tx.store.get(recordKey(remote.account))))
        await tx.store.put(local, recordKey(remote.account));
      await tx.store.put(remote.account, "legacyOwner");
    }
    await tx.done;
  }
  const tx = db.transaction("state", "readwrite");
  await tx.store.put(remote.account, "activeAccount");
  if (!(await tx.store.get(recordKey(remote.account))))
    await tx.store.put(emptyRecords(), recordKey(remote.account));
  await tx.done;
  announce();
}
async function transferPhotos(
  records: Records,
  remote: Records,
  account: string,
) {
  const db = await database();
  const remoteIds = new Set(photoIds(remote));
  const token = await deviceToken();
  for (const id of photoIds(records)) {
    let blob = await db.get("photos", id);
    if (!blob) {
      const response = await request(`/api/photos/${id}`, {
        headers: { "X-Until-Account": account, "X-Until-Legacy-Key": token },
      });
      if (!response.ok) throw Error("Photo download pending");
      blob = await response.blob();
      await db.put("photos", blob, id);
      announce();
    }
    if (!remoteIds.has(id)) {
      const response = await request(`/api/photos/${id}`, {
        method: "PUT",
        headers: { "X-Until-Account": account, "Content-Type": blob.type },
        body: await cloudPhoto(blob),
      });
      if (!response.ok) throw Error("Photo upload pending");
    }
  }
}
async function runSync(): Promise<SyncState> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  try {
    const db = await database();
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await request("/api/sync");
      if (response.status === 401) {
        await db.put("state", "guest", "activeAccount");
        announce();
        return "signed-out";
      }
      if (!response.ok) throw Error("Cannot pull");
      const remote = (await response.json()) as Remote;
      await bindAccount(remote);
      const base =
        ((await db.get("state", `base:${remote.account}`)) as Records) ||
        emptyRecords();
      const local = await readRecords();
      const cloud = remote.records || emptyRecords();
      let merged: Records;
      try {
        merged = mergeRecords(base, local, cloud);
      } catch (e) {
        if (e instanceof SyncConflict) {
          await db.put(
            "state",
            { local, remote, fields: e.fields },
            `conflict:${remote.account}`,
          );
          return "conflict";
        }
        throw e;
      }
      await transferPhotos(merged, cloud, remote.account);
      if (!recordsEqual(merged, cloud)) {
        const put = await request("/api/sync", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "If-Match": String(remote.revision),
            "X-Until-Account": remote.account,
          },
          body: JSON.stringify(merged),
        });
        if (put.status === 409) continue;
        if (!put.ok) throw Error("Remote save pending");
      }
      const tx = db.transaction("state", "readwrite");
      if ((await tx.store.get("activeAccount")) !== remote.account) {
        await tx.done;
        continue;
      }
      const current =
        ((await tx.store.get(recordKey(remote.account))) as Records) ||
        emptyRecords();
      try {
        const next = mergeRecords(local, current, merged);
        next.revision =
          current.revision + (recordsEqual(current, next) ? 0 : 1);
        await tx.store.put(next, recordKey(remote.account));
        await tx.store.put(merged, `base:${remote.account}`);
        await tx.store.put(
          new Date().toISOString(),
          `lastSync:${remote.account}`,
        );
        await tx.store.delete(`conflict:${remote.account}`);
        await tx.done;
        announce();
        if (recordsEqual(next, merged)) return "saved";
      } catch (e) {
        try {
          tx.abort();
        } catch {}
        await tx.done.catch(() => {});
        if (e instanceof SyncConflict) return "pending";
        throw e;
      }
    }
    return "pending";
  } catch {
    return "unavailable";
  }
}
export async function getSyncInfo() {
  const db = await database();
  const account = await activeAccount();
  return {
    lastSync: (await db.get("state", `lastSync:${account}`)) as
      string | undefined,
    conflict: (await db.get("state", `conflict:${account}`)) as
      { local: Records; remote: Remote; fields: string[] } | undefined,
  };
}
// Explicit user resolution: archive the local branch first, never delete it during reconciliation.
export async function adoptCloudCopy() {
  const db = await database();
  const account = await activeAccount();
  if (!account) throw Error("Sign in first.");
  const response = await request("/api/sync", {
    headers: { "X-Until-Account": account },
  });
  if (!response.ok) throw Error("Cloud copy unavailable.");
  const remote = (await response.json()) as Remote;
  const cloud = remote.records || emptyRecords();
  await transferPhotos(cloud, cloud, account);
  const tx = db.transaction("state", "readwrite");
  const local = await tx.store.get(recordKey(account));
  await tx.store.put(local, `recovery:${account}:${Date.now()}`);
  await tx.store.put(cloud, recordKey(account));
  await tx.store.put(cloud, `base:${account}`);
  await tx.store.delete(`conflict:${account}`);
  await tx.done;
  announce();
}
export async function exportRecords(includeRecovery = false) {
  const db = await database();
  const account = await activeAccount();
  const records = await readRecords();
  const recovery: unknown[] = [];
  if (includeRecovery) {
    for (const key of await db.getAllKeys("state"))
      if (key.startsWith(`recovery:${account}:`))
        recovery.push(await db.get("state", key));
  }
  const blob = new Blob(
    [
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          ...records,
          recovery,
          photoNote:
            "Photo references only; image bytes are stored separately.",
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
  a.download = "until-export.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
