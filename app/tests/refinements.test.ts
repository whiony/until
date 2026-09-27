import { describe, it, expect } from "vitest";
import { demoRecords, itemCount, assertRealRecords } from "../lib/until/demo";
import {
  deadline,
  daysLeft,
  countdown,
  emptyRecords,
} from "../lib/until/domain";
import { editorIssue } from "../lib/until/editor-validation";
import { productTextCandidates } from "../lib/until/recognition";
describe("demo fixtures and counts", () => {
  it("uses stable IDs, six categories and relative deadlines including opened and undated", () => {
    const r = demoRecords("2026-09-26");
    expect(new Set(r.products.map((p) => p.category)).size).toBe(6);
    expect(
      r.items.map((i) =>
        deadline(i).date ? daysLeft(deadline(i).date, "2026-09-26") : null,
      ),
    ).toEqual([0, 1, 3, 7, 150, 365, -2, null, 2]);
    expect(demoRecords("2026-10-01").items.map((i) => i.id)).toEqual(
      r.items.map((i) => i.id),
    );
    expect(r.items.length).toBe(9);
  });
  it("refuses demo persistence and counts visible records independently of unit quantities", () => {
    const r = demoRecords();
    expect(() => assertRealRecords(r)).toThrow("Demo");
    expect(() => assertRealRecords(emptyRecords())).not.toThrow();
    expect(itemCount([])).toBe("0 items");
    expect(itemCount([r.items[1]])).toBe("1 item");
    expect(itemCount(r.items.slice(0, 2))).toBe("2 items");
  });
});
describe("editor validation", () => {
  it("accepts a name without any date and targets invalid fields in order", () => {
    const i = demoRecords().items[7];
    expect(editorIssue("Detergent", i, false)).toBe(null);
    expect(editorIssue("", i, false)?.field).toBe("product-name");
    expect(editorIssue("Name", { ...i, quantity: 0 }, false)?.field).toBe(
      "item-quantity",
    );
    expect(
      editorIssue("Name", { ...i, openedDate: "2199-01-01" }, false)?.field,
    ).toBe("opened-date");
  });
  it("uses day singular", () => {
    const i = demoRecords("2026-09-26").items[0];
    expect(countdown({ ...i, printedDate: "2026-09-25" }, "2026-09-26")).toBe(
      "Expired 1 day ago",
    );
  });
});
it("suggests only actual readable OCR lines and avoids guessing from uncertainty", () => {
  expect(
    productTextCandidates("GREEK YOGURT\nPLAIN\nBest before 2027-08-12", 92),
  ).toEqual(["GREEK YOGURT", "PLAIN"]);
  expect(productTextCandidates("hmm blurry", 20)).toEqual([]);
  expect(productTextCandidates("12345\nhttps://example.test", 99)).toEqual([]);
});
