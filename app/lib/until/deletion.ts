import { type Records, stamp } from "./domain";
import { photoIds } from "./merge";
export type Deletion = {
  id: string;
  kind: "item" | "product";
  at: string;
  photos?: string[];
};
export function permanentDelete(r: Records, id: string) {
  const item = r.items.find((i) => i.id === id);
  if (!item) throw Error("This item has already been deleted.");
  const at = stamp();
  const markers = (r.deletions ||= []);
  markers.push({
    id,
    kind: "item",
    at,
    photos: item.packagingPhotoId ? [item.packagingPhotoId] : [],
  });
  r.items = r.items.filter((i) => i.id !== id);
  if (!r.items.some((i) => i.productId === item.productId)) {
    const product = r.products.find((p) => p.id === item.productId);
    markers.push({
      id: item.productId,
      kind: "product",
      at,
      photos: product?.photoId ? [product.photoId] : [],
    });
    r.products = r.products.filter((p) => p.id !== item.productId);
  }
  applyDeletions(r);
}
export function applyDeletions(r: Records) {
  const items = new Set(
    r.deletions?.filter((d) => d.kind === "item").map((d) => d.id),
  );
  const products = new Set(
    r.deletions?.filter((d) => d.kind === "product").map((d) => d.id),
  );
  r.items = r.items.filter((i) => !items.has(i.id));
  r.products = r.products.filter(
    (p) => !products.has(p.id) || r.items.some((i) => i.productId === p.id),
  );
}
// A new deletion always wins over edits to the same record. After markers expire,
// the epoch lets a stale device remove old entities missing from the current cloud.
export function deletionBranches(
  base: Records,
  local: Records,
  remote: Records,
) {
  const epoch = Math.max(local.deletionEpoch || 0, remote.deletionEpoch || 0);
  const l = structuredClone(local),
    r = structuredClone(remote);
  if ((local.deletionEpoch || 0) < epoch) {
    const cloudItems = new Set(remote.items.map((i) => i.id));
    const cloudProducts = new Set(remote.products.map((p) => p.id));
    const oldItems = new Set(base.items.map((i) => i.id));
    const oldProducts = new Set(base.products.map((p) => p.id));
    l.items = l.items.filter(
      (i) => !oldItems.has(i.id) || cloudItems.has(i.id),
    );
    l.products = l.products.filter(
      (p) => !oldProducts.has(p.id) || cloudProducts.has(p.id),
    );
  }
  const map = new Map<string, Deletion>();
  for (const branch of [remote, local])
    for (const d of branch.deletions || []) {
      // Locally queued deletions survive a cloud compaction; previously synced old markers do not.
      if (
        (branch.deletionEpoch || 0) < epoch &&
        base.deletions?.some((b) => b.kind === d.kind && b.id === d.id)
      )
        continue;
      const key = `${d.kind}:${d.id}`;
      const old = map.get(key);
      if (!old) map.set(key, d); // Remote cleanup metadata is authoritative.
    }
  const deletions = [...map.values()];
  l.deletions = r.deletions = deletions;
  applyDeletions(l);
  applyDeletions(r);
  return { local: l, remote: r, epoch, deletions };
}
export function retiredPhotoIds(r: Records) {
  const live = new Set(photoIds(r));
  return [
    ...new Set((r.deletions || []).flatMap((d) => d.photos || [])),
  ].filter((id) => !live.has(id));
}
