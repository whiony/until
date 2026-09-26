import { normalizeCategories, normalizeLocations } from "./preferences";
import { emptyRecords, type Records } from "./domain";
export class SyncConflict extends Error {
  constructor(public fields: string[]) {
    super("Changes overlap on another device. Both copies are preserved.");
  }
}
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
};
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
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
      .filter(Boolean)
      .map((entity) => structuredClone(entity)) as Records[K];
  }
  const result = {
    ...emptyRecords(),
    revision: local.revision,
    products: entities("products"),
    items: entities("items"),
    settings: {
      soonDays: merge(
        base.settings.soonDays,
        local.settings.soonDays,
        remote.settings.soonDays,
        "preferences:soonDays",
      ),
      notifications: merge(
        base.settings.notifications,
        local.settings.notifications,
        remote.settings.notifications,
        "preferences:notifications",
      ),
      theme: merge(
        base.settings.theme || "green",
        local.settings.theme || base.settings.theme || "green",
        remote.settings.theme || base.settings.theme || "green",
        "preferences:theme",
      ),
      categoryRules: [
        ...new Set(
          [base, local, remote].flatMap((x) =>
            (x.settings.categoryRules || []).map((c) =>
              c.name.toLocaleLowerCase("en"),
            ),
          ),
        ),
      ].map((name) => {
        const rule = (r: Records) =>
          r.settings.categoryRules?.find(
            (c) => c.name.toLocaleLowerCase("en") === name,
          );
        return merge(rule(base), rule(local), rule(remote), `category:${name}`);
      }),
      locationRules: [
        ...new Set(
          [base, local, remote].flatMap((x) =>
            (x.settings.locationRules || []).map((c) =>
              c.name.toLocaleLowerCase("en"),
            ),
          ),
        ),
      ].map((name) => {
        const rule = (r: Records) =>
          r.settings.locationRules?.find(
            (c) => c.name.toLocaleLowerCase("en") === name,
          );
        return merge(rule(base), rule(local), rule(remote), `location:${name}`);
      }),
    },
  };
  if (conflicts.length) throw new SyncConflict(conflicts);
  normalizeCategories(result);
  normalizeLocations(result);
  return result;
}
export const recordsEqual = (a: Records, b: Records) =>
  equal(
    {
      ...a,
      revision: 0,
      settings: {
        ...a.settings,
        theme: a.settings.theme || "green",
        categoryRules: a.settings.categoryRules || [],
        locationRules: a.settings.locationRules || [],
      },
    },
    {
      ...b,
      revision: 0,
      settings: {
        ...b.settings,
        theme: b.settings.theme || "green",
        categoryRules: b.settings.categoryRules || [],
        locationRules: b.settings.locationRules || [],
      },
    },
  );
export const photoIds = (r: Records) =>
  [
    ...new Set(
      [
        ...r.products.map((p) => p.photoId),
        ...r.items.map((i) => i.packagingPhotoId),
      ].filter(Boolean),
    ),
  ] as string[];
