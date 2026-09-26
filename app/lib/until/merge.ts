import { emptyRecords, type Records } from "./domain";
export class SyncConflict extends Error {
  constructor(public fields: string[]) {
    super("Changes overlap on another device. Both copies are preserved.");
  }
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
// Three-way merge, independent of device clocks. Related item fields are atomic:
// silently combining a status/quantity split can manufacture or lose units.
export function mergeRecords(
  base: Records,
  local: Records,
  remote: Records,
): Records {
  const conflicts: string[] = [];
  function merge<T>(
    b: T | undefined,
    l: T | undefined,
    r: T | undefined,
    path: string,
  ): T {
    if (l === undefined) return r as T;
    if (r === undefined) return l as T;
    if (equal(l, b)) return r as T;
    if (equal(r, b) || equal(l, r)) return l as T;
    if (!b) {
      if (!l) return r as T;
      if (!r) return l as T;
    }
    conflicts.push(path);
    return l as T;
  }
  function entities<K extends "products" | "items">(key: K): Records[K] {
    const b = new Map(base[key].map((x) => [x.id, x])),
      l = new Map(local[key].map((x) => [x.id, x])),
      r = new Map(remote[key].map((x) => [x.id, x]));
    return [...new Set([...b.keys(), ...l.keys(), ...r.keys()])]
      .map((id) => merge(b.get(id), l.get(id), r.get(id), `${key}:${id}`))
      .filter(Boolean) as Records[K];
  }
  const result = {
    ...emptyRecords(),
    revision: local.revision,
    products: entities("products"),
    items: entities("items"),
    settings: merge(
      base.settings,
      local.settings,
      remote.settings,
      "preferences",
    ),
  };
  if (conflicts.length) throw new SyncConflict(conflicts);
  return result;
}
export const recordsEqual = (a: Records, b: Records) =>
  equal({ ...a, revision: 0 }, { ...b, revision: 0 });
export const photoIds = (r: Records) =>
  [
    ...new Set(
      [
        ...r.products.map((p) => p.photoId),
        ...r.items.map((i) => i.packagingPhotoId),
      ].filter(Boolean),
    ),
  ] as string[];
