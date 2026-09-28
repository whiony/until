import { applyDeletions, permanentDelete } from "./deletion";
import { normalizeCategories, normalizeLocations } from "./preferences";
import { assertRealRecords } from "./demo";
import { cloudPhoto } from "./image-metadata";
import { openDB, type DBSchema } from "idb";
import { emptyRecords, type Records, newId } from "./domain";
import { mergeRecords, recordsEqual, photoIds, SyncConflict } from "./merge";
import { createPortableArchive, verifyPortableArchive, type PortableData } from "./portable-archive";
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
const photoKey = (account: string | undefined, id: string) =>
  account && account !== "guest" ? `account:${account}:${id}` : id;
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
      await tx.objectStore("photos").put(blob, photoKey(account, id));
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
  return getPhotoForAccount(await activeAccount(), id);
}
async function getPhotoForAccount(account: string | undefined, id: string) {
  const db = await database();
  if (account && account !== "guest")
    await migrateAccountPhotos(db, account);
  return db.get("photos", photoKey(account, id));
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
  await migrateAccountPhotos(db, remote.account);
  announce();
}
async function migrateAccountPhotos(db: Awaited<ReturnType<typeof database>>, account: string) {
  const marker = `photosScoped:${account}`;
  if (await db.get("state", marker)) return;
  const tx = db.transaction(["state", "photos"], "readwrite");
  const state = tx.objectStore("state"), photos = tx.objectStore("photos");
  const keys = await state.getAllKeys();
  const legacyOwner = await state.get("legacyOwner");
  const owned = new Set<string>();
  const other = new Set<string>();
  for (const key of keys) {
    if (key !== "records" && !key.startsWith("records:") &&
        !key.startsWith("base:") && !key.startsWith("recovery:") &&
        !key.startsWith("conflict:")) continue;
    const value = await state.get(key);
    const ids = new Set<string>();
    const visit = (part: unknown) => {
      if (!part || typeof part !== "object") return;
      const record = part as Partial<Records>;
      if (Array.isArray(record.items) && Array.isArray(record.products))
        for (const id of photoIds(record as Records)) ids.add(id);
      else for (const child of Object.values(part)) visit(child);
    };
    visit(value);
    const belongs = (key === "records" && legacyOwner === account) || key === recordKey(account) ||
      key === `base:${account}` || key.startsWith(`recovery:${account}:`) ||
      key === `conflict:${account}`;
    for (const id of ids) (belongs ? owned : other).add(id);
  }
  for (const id of owned) {
    if (other.has(id) || await photos.get(photoKey(account, id))) continue;
    const legacy = await photos.get(id);
    if (legacy) await photos.put(legacy, photoKey(account, id));
  }
  await state.put(true, marker);
  await tx.done;
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
    let blob = await db.get("photos", photoKey(account, id));
    if (!blob) {
      const response = await request(`/api/photos/${id}`, {
        headers: { "X-Until-Account": account, "X-Until-Legacy-Key": token },
      });
      if (!response.ok) throw Error("Photo download pending");
      blob = await response.blob();
      await db.put("photos", blob, photoKey(account, id));
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
async function maybeMaintainPhotos(db: Awaited<ReturnType<typeof database>>, account: string) {
  const key = `lastMaintenance:${account}`;
  const last = (await db.get("state", key)) as string | undefined;
  if (last && Date.now() - Date.parse(last) < 24 * 60 * 60 * 1000) return;
  const retryKey = `maintenanceRetryAfter:${account}`;
  const retryAfter = (await db.get("state", retryKey)) as number | undefined;
  if (retryAfter && Date.now() < retryAfter) return;
  try {
    const response = await request("/api/sync", {
      method: "POST",
      headers: { "X-Until-Account": account },
    });
    if (!response.ok) throw Error("Maintenance unavailable");
    await db.put("state", new Date().toISOString(), key);
    await db.delete("state", retryKey);
    await db.delete("state", `maintenanceFailures:${account}`);
  } catch {
    // Maintenance is retryable and must never make a successful sync look lost.
    try {
      const failuresKey = `maintenanceFailures:${account}`;
      const failures = Math.min((((await db.get("state", failuresKey)) as number | undefined) || 0) + 1, 8);
      await db.put("state", failures, failuresKey);
      await db.put("state", Date.now() + Math.min(3600000, 30000 * 2 ** (failures - 1)), retryKey);
    } catch {}
  }
}
async function runSync(): Promise<SyncState> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  try {
    const db = await database();
    for (let attempt = 0; attempt < 4; attempt++) {
      const account = await activeAccount();
      const knownRevision = account
        ? ((await db.get("state", `remoteRevision:${account}`)) as number | undefined)
        : undefined;
      const knownBase = account
        ? ((await db.get("state", `base:${account}`)) as Records | undefined)
        : undefined;
      const validator =
        account && knownBase && knownRevision !== undefined
          ? `"${account}:${knownRevision}"`
          : undefined;
      const response = await request("/api/sync", {
        headers: validator ? { "If-None-Match": validator } : {},
      });
      if (response.status === 401) {
        await db.put("state", "guest", "activeAccount");
        announce();
        return "signed-out";
      }
      if (response.status !== 304 && !response.ok) throw Error("Cannot pull");
      if (response.status === 304 && !validator) throw Error("Invalid unchanged response");
      const remote: Remote = response.status === 304
        ? { account: account!, revision: knownRevision!, records: knownBase! }
        : ((await response.json()) as Remote);
      if (response.status !== 304) await bindAccount(remote);
      const storedBase = (await db.get("state", `base:${remote.account}`)) as
        Records | undefined;
      const base = storedBase || emptyRecords();
      const local = await readRecords();
      const cloud = remote.records || emptyRecords();
      if (response.status === 304 && recordsEqual(local, cloud)) {
        await db.put("state", new Date().toISOString(), `lastSync:${remote.account}`);
        await maybeMaintainPhotos(db, remote.account);
        return "saved";
      }
      let merged: Records;
      try {
        merged = mergeRecords(base, local, cloud, !!storedBase);
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
      let uploaded = false;
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
        const saved = (await put.json()) as { records?: Records };
        if (saved.records) merged = saved.records;
        uploaded = true;
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
        const next = mergeRecords(local, current, merged, true);
        next.revision =
          current.revision + (recordsEqual(current, next) ? 0 : 1);
        await tx.store.put(next, recordKey(remote.account));
        await tx.store.put(merged, `base:${remote.account}`);
        await tx.store.put(remote.revision + (uploaded ? 1 : 0), `remoteRevision:${remote.account}`);
        await tx.store.put(
          new Date().toISOString(),
          `lastSync:${remote.account}`,
        );
        if (uploaded)
          await tx.store.put(new Date().toISOString(), `lastUpload:${remote.account}`);
        await tx.store.delete(`conflict:${remote.account}`);
        await tx.done;
        announce();
        if (recordsEqual(next, merged)) {
          await cleanupLocalPhotos();
          await maybeMaintainPhotos(db, remote.account);
          return "saved";
        }
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
  const base = account
    ? ((await db.get("state", `base:${account}`)) as Records | undefined)
    : undefined;
  const local = await readRecords();
  return {
    lastSync: (await db.get("state", `lastSync:${account}`)) as
      string | undefined,
    lastUpload: (await db.get("state", `lastUpload:${account}`)) as
      string | undefined,
    pending: !recordsEqual(base || emptyRecords(), local),
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
  await tx.store.put(remote.revision, `remoteRevision:${account}`);
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

export async function downloadYourData() {
  const db = await database();
  const account = await activeAccount();
  const records = ((await db.get("state", account ? recordKey(account) : "records")) as Records | undefined) || emptyRecords();
  const recovery: Records[] = [];
  for (const key of await db.getAllKeys("state")) {
    if (!key.startsWith(`recovery:${account}:`)) continue;
    const value = await db.get("state", key);
    if (value && typeof value === "object" &&
        Array.isArray((value as Records).items) &&
        Array.isArray((value as Records).products))
      recovery.push(value as Records);
  }
  const data: PortableData = {
    format: "until-portable-v1",
    exportedAt: new Date().toISOString(),
    records,
    recovery,
  };
  const ids = new Set([records, ...recovery].flatMap(photoIds));
  const photos: { id: string; blob: Blob }[] = [];
  for (const id of ids) {
    let blob = await getPhotoForAccount(account, id);
    if (!blob && account && account !== "guest" && navigator.onLine) {
      const response = await request(`/api/photos/${id}`, {
        headers: { "X-Until-Account": account },
      });
      if (response.ok) blob = await response.blob();
    }
    if (!blob) throw Error(`Photo ${id} is unavailable. Reconnect and try again; no incomplete archive was downloaded.`);
    photos.push({ id, blob });
  }
  const archive = await createPortableArchive(data, photos);
  await verifyPortableArchive(archive);
  if (await activeAccount() !== account)
    throw Error("The signed-in account changed while preparing the archive. Try again.");
  const url = URL.createObjectURL(archive);
  const a = document.createElement("a");
  a.href = url;
  a.download = `until-data-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Scan every account and recovery copy: the photo store is shared on this device.
export async function cleanupLocalPhotos() {
  const db = await database();
  const tx = db.transaction(["state", "photos"], "readwrite");
  const state = tx.objectStore("state");
  const account = (await state.get("activeAccount")) as string | undefined;
  const current = (await state.get(
    account ? recordKey(account) : "records",
  )) as Records | undefined;
  for (const key of await state.getAllKeys()) {
    if (
      key !== `base:${account}` &&
      key !== `conflict:${account}` &&
      !key.startsWith(`recovery:${account}:`)
    )
      continue;
    const value = await state.get(key);
    const prune = (v: unknown) => {
      if (!v || typeof v !== "object") return;
      const record = v as Records;
      if (Array.isArray(record.items) && Array.isArray(record.products)) {
        const acknowledged = record.deletions;
        record.deletions = current?.deletions;
        applyDeletions(record);
        // A queued local marker is not an acknowledged cloud deletion.
        record.deletions = acknowledged;
      } else for (const child of Object.values(v)) prune(child);
    };
    prune(value);
    await state.put(value, key);
  }
  const live = new Set<string>();
  for (const key of await state.getAllKeys()) {
    const value = await state.get(key);
    const owner = key.startsWith("records:") || key.startsWith("base:") || key.startsWith("conflict:")
      ? key.slice(key.indexOf(":") + 1)
      : key.startsWith("recovery:") ? key.split(":")[1] : undefined;
    const visit = (v: unknown) => {
      if (!v || typeof v !== "object") return;
      const record = v as Partial<Records>;
      if (Array.isArray(record.items) && Array.isArray(record.products))
        for (const id of photoIds(record as Records)) {
          live.add(photoKey(owner, id));
          live.add(id); // Preserve legacy bytes until every account can migrate.
        }
      else for (const child of Object.values(v)) visit(child);
    };
    visit(value);
  }
  for (const id of await tx.objectStore("photos").getAllKeys())
    if (!live.has(id)) await tx.objectStore("photos").delete(id);
  await tx.done;
}
export async function deleteItem(id: string) {
  const records = await mutate((r) => permanentDelete(r, id));
  // The deletion transaction is already committed. Cleanup failures must not
  // report that the item was kept; collection is retried after the next sync.
  await cleanupLocalPhotos().catch(() => {});
  return records;
}
