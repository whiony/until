import { it, expect } from "vitest";
import { emptyRecords, type Product } from "../lib/until/domain";
import {
  addCategory,
  hideCategory,
  replaceCategory,
  categoryNames,
  normalizeCategories,
} from "../lib/until/preferences";
import { mergeRecords, SyncConflict } from "../lib/until/merge";
const product = (category: string): Product => ({
  id: crypto.randomUUID(),
  name: "Sample",
  brand: "",
  category,
  barcode: "",
  size: "",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  schemaVersion: 1,
});
it("keeps hidden built-ins in records and filters, but excludes future selection; restores them", () => {
  const r = emptyRecords();
  r.products.push(product("Food"));
  hideCategory(r, "Food", true);
  expect(categoryNames(r, true)).not.toContain("Food");
  expect(categoryNames(r)).toContain("Food");
  expect(r.products[0].category).toBe("Food");
  hideCategory(r, "Food", false);
  expect(categoryNames(r, true)).toContain("Food");
  expect(() => replaceCategory(r, "Food", "")).toThrow();
});
it("renames, retires and reassigns custom categories without deleting products and rejects duplicates", () => {
  const r = emptyRecords();
  addCategory(r, "Tea");
  r.products.push(product("Tea"));
  replaceCategory(r, "Tea", "Infusions", true);
  expect(r.products[0].category).toBe("Infusions");
  replaceCategory(r, "Infusions", "");
  expect(r.products[0].category).toBe("");
  expect(r.products).toHaveLength(1);
  r.products.push(product("Tea"));
  normalizeCategories(r);
  expect(r.products[1].category).toBe("");
  expect(() => addCategory(r, " tea ")).toThrow();
  expect(() => addCategory(r, " food ")).toThrow();
});
it("merges separate theme, reminders and category changes without resetting local preferences or duplicating categories", () => {
  const base = emptyRecords(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.settings.theme = "blue";
  addCategory(local, "Tea");
  remote.settings.soonDays = 14;
  hideCategory(remote, "Beauty", true);
  addCategory(remote, "Tea");
  const merged = mergeRecords(base, local, remote);
  expect(merged.settings.theme).toBe("blue");
  expect(merged.settings.soonDays).toBe(14);
  expect(merged.settings.categoryRules).toHaveLength(2);
  const next = structuredClone(merged);
  next.settings.theme = "peach";
  expect(mergeRecords(merged, next, merged).settings.theme).toBe("peach");
  const conflict = structuredClone(base);
  conflict.settings.theme = "lavender";
  expect(() => mergeRecords(base, local, conflict)).toThrow(SyncConflict);
});
it("redirects new offline products through renamed/deleted categories during reconciliation", () => {
  const base = emptyRecords();
  addCategory(base, "Tea");
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.products.push(product("Tea"));
  replaceCategory(remote, "Tea", "Food");
  const merged = mergeRecords(base, local, remote);
  expect(merged.products[0].category).toBe("Food");
  expect(local.products[0].category).toBe("Tea");
  expect(categoryNames(merged)).not.toContain("Tea");
  expect(mergeRecords(base, merged, remote).products).toHaveLength(1);
});

it("older clients omitting theme cannot erase a saved choice", () => {
  const base = emptyRecords();
  base.settings.theme = "blue";
  const local = structuredClone(base),
    remote = structuredClone(base);
  delete remote.settings.theme;
  remote.settings.soonDays = 10;
  expect(mergeRecords(base, local, remote).settings.theme).toBe("blue");
});
