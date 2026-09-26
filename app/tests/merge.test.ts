import { it, expect } from "vitest";
import { mergeRecords, SyncConflict } from "../lib/until/merge";
import { emptyRecords, type Product } from "../lib/until/domain";
const product = (id: string): Product => ({
  id,
  name: id,
  brand: "",
  category: "Food",
  barcode: "",
  size: "",
  schemaVersion: 1,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});
it("unions independent offline creates without duplicate IDs", () => {
  const base = emptyRecords(),
    a = structuredClone(base),
    b = structuredClone(base);
  a.products.push(product("a"));
  b.products.push(product("b"));
  const merged = mergeRecords(base, a, b);
  expect(merged.products.map((p) => p.id)).toEqual(["a", "b"]);
  expect(mergeRecords(base, merged, b).products).toHaveLength(2);
});
it("merges changes to different records regardless of device clock", () => {
  const base = emptyRecords();
  base.products = [product("a"), product("b")];
  const a = structuredClone(base),
    b = structuredClone(base);
  a.products[0].name = "Device A";
  b.products[1].name = "Device B";
  expect(mergeRecords(base, a, b).products.map((p) => p.name)).toEqual([
    "Device A",
    "Device B",
  ]);
});
it("preserves local data rather than overwrite overlapping edits", () => {
  const base = emptyRecords();
  base.products = [product("a")];
  const a = structuredClone(base),
    b = structuredClone(base);
  a.products[0].name = "Local";
  b.products[0].name = "Cloud";
  expect(() => mergeRecords(base, a, b)).toThrow(SyncConflict);
  expect(a.products[0].name).toBe("Local");
  expect(b.products[0].name).toBe("Cloud");
});
it("does not delete records absent from an old device snapshot", () => {
  const base = emptyRecords();
  base.products = [product("a")];
  const old = emptyRecords();
  expect(mergeRecords(base, old, base).products).toHaveLength(1);
});
