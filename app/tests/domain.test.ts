import { describe, it, expect, vi } from "vitest";
import {
  addDuration,
  deadline,
  daysLeft,
  emptyRecords,
  inSoon,
  openUnit,
  completeUnit,
  validateItem,
  today,
  urgency,
  type Item,
} from "../lib/until/domain";
import { interpretText } from "../lib/until/recognition";
import { lookupProduct } from "../lib/until/lookup";
const item = (patch: Partial<Item> = {}): Item => ({
  id: crypto.randomUUID(),
  productId: "p",
  quantity: 3,
  printedDate: "2026-10-20",
  dateKind: "best before",
  purchaseDate: "",
  openedDate: "",
  location: "Fridge",
  notes: "",
  status: "active",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  schemaVersion: 1,
  ...patch,
});
describe("calendar deadlines", () => {
  it("clamps calendar months at month end, including leap year", () => {
    expect(addDuration("2026-01-31", { amount: 1, unit: "months" })).toBe(
      "2026-02-28",
    );
    expect(addDuration("2024-01-31", { amount: 1, unit: "months" })).toBe(
      "2024-02-29",
    );
    expect(addDuration("2024-02-29", { amount: 12, unit: "months" })).toBe(
      "2025-02-28",
    );
  });
  it("handles days and weeks over DST", () => {
    expect(addDuration("2026-03-28", { amount: 2, unit: "days" })).toBe(
      "2026-03-30",
    );
    expect(daysLeft("2026-03-30", "2026-03-28")).toBe(2);
    expect(addDuration("2026-12-27", { amount: 1, unit: "weeks" })).toBe(
      "2027-01-03",
    );
  });
  it("retains both dates and chooses earliest", () => {
    const i = item({
      openedDate: "2026-09-01",
      rule: { amount: 7, unit: "days" },
    });
    expect(deadline(i)).toEqual({
      date: "2026-09-08",
      opening: "2026-09-08",
      controls: "after opening",
    });
    i.printedDate = "2026-08-31";
    expect(deadline(i).date).toBe("2026-08-31");
    expect(deadline(i).controls).toBe("printed date");
  });
  it("has an inclusive Soon boundary and separate expired items", () => {
    expect(inSoon(item({ printedDate: "2026-09-08" }), 7, "2026-09-01")).toBe(
      true,
    );
    expect(inSoon(item({ printedDate: "2026-09-09" }), 7, "2026-09-01")).toBe(
      false,
    );
    expect(inSoon(item({ printedDate: "2026-08-31" }), 7, "2026-09-01")).toBe(
      false,
    );
    expect(urgency(item({ printedDate: "2026-09-01" }), 7, "2026-09-01")).toBe(
      "today",
    );
  });
  it("does not silently treat undated items as safe", () => {
    expect(deadline(item({ printedDate: "" })).date).toBe("");
    expect(inSoon(item({ printedDate: "" }), 7)).toBe(false);
    expect(urgency(item({ printedDate: "" }))).toBe("undated");
  });
  it("rejects impossible dates, quantities and invalid ranges", () => {
    expect(() => validateItem(item({ printedDate: "2026-02-30" }))).toThrow();
    expect(() => validateItem(item({ quantity: 0 }))).toThrow();
    expect(() =>
      validateItem(
        item({ purchaseDate: "2026-09-10", openedDate: "2026-09-01" }),
      ),
    ).toThrow();
    expect(() => validateItem(item({ openedDate: "2199-01-01" }))).toThrow();
  });
  it("uses the local date rather than UTC date", () => {
    const d = new Date(2026, 8, 25, 0, 5);
    expect(today(d)).toBe("2026-09-25");
  });
});
describe("owned groups", () => {
  it("splits one opening from three units, preserving printed date and product", () => {
    const r = emptyRecords();
    const i = item({ rule: { amount: 3, unit: "days" } });
    r.items = [i];
    openUnit(r, i.id, "2026-09-01");
    expect(r.items.map((i) => i.quantity)).toEqual([2, 1]);
    expect(r.items[0].openedDate).toBe("");
    expect(r.items[1].productId).toBe("p");
    expect(deadline(r.items[1]).date).toBe("2026-09-04");
  });
  it("keeps repeat purchases independent", () => {
    const r = emptyRecords();
    r.items = [
      item({ printedDate: "2026-10-20" }),
      item({ printedDate: "2026-11-01" }),
    ];
    expect(r.items[0].id).not.toBe(r.items[1].id);
    expect(r.items.map(deadline).map((d) => d.date)).toEqual([
      "2026-10-20",
      "2026-11-01",
    ]);
  });
  it("moves used/discarded units to history without changing totals", () => {
    const r = emptyRecords();
    const i = item();
    r.items = [i];
    completeUnit(r, i.id, "used");
    completeUnit(r, i.id, "discarded");
    expect(
      r.items
        .filter((i) => i.status === "active")
        .reduce((n, i) => n + i.quantity, 0),
    ).toBe(1);
    expect(r.items.reduce((n, i) => n + i.quantity, 0)).toBe(3);
    expect(r.items.map((i) => i.status)).toEqual([
      "active",
      "used",
      "discarded",
    ]);
    completeUnit(r, i.id, "used");
    expect(r.items.filter((i) => i.status === "active")).toHaveLength(0);
    expect(() => completeUnit(r, i.id, "used")).toThrow();
  });
});
describe("assistance and fallback", () => {
  it("exposes ambiguity instead of selecting a date", () => {
    expect(interpretText("EXP 03/04/2027").dates).toEqual([
      "2027-04-03",
      "2027-03-04",
    ]);
    expect(interpretText("EXP unclear").dates).toEqual([]);
    expect(interpretText("2027-02-31").dates).toEqual([]);
  });
  it("finds multiple dates and after-opening text", () => {
    const r = interpretText(
      "Best before 2027-08-12. Packed 2026-08-12. Use within 7 days after opening.",
    );
    expect(r.dates).toHaveLength(2);
    expect(r.rules).toEqual([{ amount: 7, unit: "days" }]);
  });
  it("uses previously confirmed products before contacting a provider", async () => {
    const provider = { lookup: vi.fn() };
    const p = {
      id: "p",
      name: "Yogurt",
      barcode: "3017620422003",
      brand: "",
      size: "",
      category: "Food",
      createdAt: "",
      updatedAt: "",
      schemaVersion: 1 as const,
    };
    expect(
      (await lookupProduct(p.barcode, [p], provider))?.savedProductId,
    ).toBe("p");
    expect(provider.lookup).not.toHaveBeenCalled();
  });
  it("preserves a fast manual path on invalid codes, offline or failed providers", async () => {
    await expect(lookupProduct("bad", [])).rejects.toThrow("barcode");
    vi.stubGlobal("navigator", { onLine: false });
    await expect(lookupProduct("3017620422003", [])).rejects.toThrow("offline");
    vi.stubGlobal("navigator", { onLine: true });
    await expect(
      lookupProduct("3017620422003", [], {
        lookup: async () => {
          throw Error("Unavailable");
        },
      }),
    ).rejects.toThrow("Unavailable");
    vi.unstubAllGlobals();
  });
});

it("accepts a valid device date when the remote UTC day is still yesterday", () => {
  const i = item({ openedDate: "2026-09-26", purchaseDate: "2026-09-26" });
  expect(() => validateItem(i, "2026-09-25")).toThrow();
  expect(() => validateItem(i, null)).not.toThrow();
  expect(() =>
    validateItem(item({ openedDate: "2026-02-30" }), null),
  ).toThrow();
});
