import { emptyRecords, today, type Records, type Item } from "./domain";
export const DEMO_PREFIX = "demo:";
// Presentation-only fixtures. Never passed to the repository, exports or reminders.
export function demoRecords(day = today()): Records {
  const r = emptyRecords();
  const date = (offset: number) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const examples: [string, string, string, number | null, number, boolean?][] =
    [
      ["Greek yogurt", "Food", "Fridge", 0, 2, true],
      ["Greek yogurt · spare tub", "Food", "Fridge", 1, 1, true],
      ["Fresh spinach", "Food", "Fridge", 3, 1],
      ["Hand cream", "Beauty", "Bathroom", 7, 2],
      ["First aid cream", "Medicine", "Medicine Cabinet", 150, 1],
      ["Vitamin D", "Supplements", "Medicine Cabinet", 365, 3],
      ["Cat food", "Pet", "Pet Supplies", -2, 4],
      ["Laundry detergent", "Household", "Pantry", null, 1],
      ["Opened face serum", "Beauty", "Bathroom", 90, 1],
    ];
  examples.forEach(([name, category, location, offset, quantity, photo], n) => {
    const id = `${DEMO_PREFIX}${n}`,
      stamp = `${day}T12:00:00Z`;
    r.products.push({
      id,
      name,
      category,
      brand: "",
      barcode: "",
      size: n < 2 ? "150 g" : "",
      photoId: photo ? "demo:yogurt" : undefined,
      createdAt: stamp,
      updatedAt: stamp,
      schemaVersion: 1,
    });
    r.items.push({
      id,
      productId: id,
      quantity,
      printedDate: offset === null ? "" : date(offset),
      dateKind: "best before",
      openedDate: n === 8 ? date(-5) : "",
      rule: n === 8 ? { amount: 7, unit: "days" } : undefined,
      purchaseDate: "",
      location,
      notes: "Demo example · not part of your account",
      status: "active",
      createdAt: stamp,
      updatedAt: stamp,
      schemaVersion: 1,
    });
  });
  return r;
}
export const units = (items: Item[]) =>
  items.reduce((sum, item) => sum + item.quantity, 0);
export const itemCount = (items: Item[]) =>
  `${units(items)} ${units(items) === 1 ? "unit" : "units"} · ${items.length} ${items.length === 1 ? "group" : "groups"}`;
export function assertRealRecords(r: Records) {
  if ([...r.items, ...r.products].some((v) => v.id.startsWith(DEMO_PREFIX)))
    throw Error("Demo records cannot be saved.");
}
