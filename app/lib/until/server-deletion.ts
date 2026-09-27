import { env } from "cloudflare:workers";
import { database } from "./server";
import type { Records } from "./domain";
import { photoIds } from "./merge";
import { applyDeletions, retiredPhotoIds } from "./deletion";
const RETENTION = 30 * 86400000;
// Called only after authenticating the owner. No client-supplied object path.
export async function cleanupRemotePhotos(owner: string, records: Records) {
  if (!env.BUCKET) return records;
  const r = structuredClone(records);
  const candidates = new Set(retiredPhotoIds(r));
  let cursor: string | undefined;
  do {
    const page = await env.BUCKET.list({ prefix: `account/${owner}/`, cursor });
    for (const object of page.objects) {
      const id = object.key.slice(`account/${owner}/`.length);
      // Failed/draft uploads receive a grace period before orphan collection.
      if (object.uploaded.getTime() < Date.now() - 86400000) candidates.add(id);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  // Recheck the authoritative payload before deletion, including shared photos.
  const row = await database()
    .prepare("SELECT payload FROM account_records WHERE owner=?")
    .bind(owner)
    .first<{ payload: string }>();
  const latest = row ? (JSON.parse(row.payload) as Records) : r;
  const live = new Set(photoIds(latest));
  const claims = await database()
    .prepare("SELECT device FROM legacy_claims WHERE account=?")
    .bind(owner)
    .all<{ device: string }>();
  for (const claim of claims.results) {
    const old = await database()
      .prepare("SELECT payload FROM device_records WHERE owner=?")
      .bind(claim.device)
      .first<{ payload: string }>();
    if (!old) continue;
    const legacy = JSON.parse(old.payload) as Records;
    legacy.deletions = latest.deletions;
    applyDeletions(legacy);
    for (const id of photoIds(legacy)) live.add(id);
    await database()
      .prepare("UPDATE device_records SET payload=? WHERE owner=?")
      .bind(JSON.stringify(legacy), claim.device)
      .run();
  }
  const collected = new Set<string>();
  // Bounded work keeps collection within the storage lease and makes large
  // offline deletion batches progress over subsequent syncs.
  for (const id of [...candidates]
    .filter((id) => !live.has(id))
    .slice(0, 100)) {
    if (!/^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(id) || live.has(id)) continue;
    await env.BUCKET.delete(`account/${owner}/${id}`);
    for (const claim of claims.results)
      await env.BUCKET.delete(`${claim.device}/${id}`);
    collected.add(id);
  }
  // Markers are retained if cleanup failed (the caller keeps the original copy).
  for (const d of r.deletions || []) {
    d.photos = (d.photos || []).filter(
      (id) => !live.has(id) && !collected.has(id),
    );
    if (!d.photos.length) delete d.photos;
  }
  const keep = (r.deletions || []).filter(
    (d) => d.photos?.length || Date.now() - Date.parse(d.at) < RETENTION,
  );
  if (keep.length !== (r.deletions || []).length) {
    r.deletionEpoch = (r.deletionEpoch || 0) + 1;
    r.deletions = keep.length ? keep : undefined;
  }
  return r;
}
