export type DateKind = "best before" | "use by" | "unspecified";
export type Duration = { amount: number; unit: "days" | "weeks" | "months" };
export type Provenance = {
  provider: string;
  url?: string;
  confirmedAt: string;
  completeness?: number;
};
export type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  barcode: string;
  size: string;
  photoId?: string;
  provenance?: Provenance;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
};
export type Item = {
  id: string;
  productId: string;
  quantity: number;
  printedDate: string;
  dateKind: DateKind;
  purchaseDate: string;
  openedDate: string;
  rule?: Duration;
  location: string;
  notes: string;
  packagingPhotoId?: string;
  recognition?: { text: string; confirmedAt: string };
  status: "active" | "used" | "discarded";
  // Present only when a use/discard action was actually recorded.
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
};
export type Settings = {
  soonDays: number;
  notifications: {
    requested: boolean;
    expirationDay: boolean;
    leadDays: number;
    time: string;
    quietStart: string;
    quietEnd: string;
    timezone: string;
  };
};
export type Records = {
  schemaVersion: 1;
  revision: number;
  products: Product[];
  items: Item[];
  settings: Settings;
};
export const categories = [
  "Food",
  "Beauty",
  "Medicine",
  "Supplements",
  "Household",
  "Pet",
];
export const locations = [
  "Fridge",
  "Freezer",
  "Pantry",
  "Bathroom",
  "Medicine Cabinet",
  "Pet Supplies",
];
export const newId = () => crypto.randomUUID();
export const stamp = () => new Date().toISOString();
export function emptyRecords(): Records {
  return {
    schemaVersion: 1,
    revision: 0,
    products: [],
    items: [],
    settings: {
      soonDays: 7,
      notifications: {
        requested: false,
        expirationDay: false,
        leadDays: 7,
        time: "09:00",
        quietStart: "21:00",
        quietEnd: "08:00",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    },
  };
}
export function today(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
// Date-only strings are calendar values. UTC arithmetic is used only as a timezone-free calendar calculator.
export function validDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return (
    !isNaN(+d) &&
    d.toISOString().slice(0, 10) === s &&
    s >= "1900-01-01" &&
    s <= "2200-12-31"
  );
}
export function addDuration(date: string, rule: Duration) {
  if (
    !validDate(date) ||
    !Number.isInteger(rule.amount) ||
    rule.amount < 1 ||
    rule.amount > 3650
  )
    throw Error("Enter a valid opening date and duration (1–3650).");
  const d = new Date(`${date}T12:00:00Z`);
  if (rule.unit === "months") {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + rule.amount);
    const end = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(day, end));
  } else
    d.setUTCDate(
      d.getUTCDate() + rule.amount * (rule.unit === "weeks" ? 7 : 1),
    );
  return d.toISOString().slice(0, 10);
}
export function deadline(i: Item) {
  const opening =
    i.openedDate && i.rule ? addDuration(i.openedDate, i.rule) : "";
  const date = [i.printedDate, opening].filter(Boolean).sort()[0] || "";
  return {
    date,
    opening,
    controls: date
      ? (opening && opening < i.printedDate) || !i.printedDate
        ? "after opening"
        : "printed date"
      : "needs a date",
  };
}
export function daysLeft(date: string, now = today()) {
  return Math.round(
    (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${now}T12:00:00Z`)) /
      86400000,
  );
}
export function urgency(i: Item, soonDays = 7, now = today()) {
  const date = deadline(i).date;
  if (!date) return "undated";
  const n = daysLeft(date, now);
  return n < 0
    ? "expired"
    : n === 0
      ? "today"
      : n <= 2
        ? "urgent"
        : n <= soonDays
          ? "soon"
          : "calm";
}
export function countdown(i: Item, now = today()) {
  const date = deadline(i).date;
  if (!date) return "Needs a date";
  const n = daysLeft(date, now);
  const best =
    i.dateKind === "best before" && deadline(i).controls === "printed date";
  return n < 0
    ? best
      ? `Best before was ${-n} ${n === -1 ? "day" : "days"} ago`
      : `Expired ${-n} ${n === -1 ? "day" : "days"} ago`
    : n === 0
      ? best
        ? "Best before today"
        : "Expires today"
      : n === 1
        ? best
          ? "Best before tomorrow"
          : "Expires tomorrow"
        : `${n} days left`;
}
// A server has no authoritative local calendar day for a travelling device.
// Pass null remotely; the editor validates future dates in the device timezone.
export function validateItem(i: Item, currentDay: string | null = today()) {
  if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 9999)
    throw Error("Quantity must be between 1 and 9999.");
  for (const s of [i.printedDate, i.openedDate, i.purchaseDate])
    if (s && !validDate(s))
      throw Error("Enter valid calendar dates between 1900 and 2200.");
  if (currentDay && i.openedDate > currentDay)
    throw Error("Opening date cannot be in the future.");
  if (currentDay && i.purchaseDate > currentDay)
    throw Error("Purchase date cannot be in the future.");
  if (i.purchaseDate && i.openedDate && i.purchaseDate > i.openedDate)
    throw Error("Purchase date cannot be after opening date.");
  if (i.rule) addDuration(i.openedDate || today(), i.rule);
}
export function completeUnit(
  r: Records,
  id: string,
  status: "used" | "discarded",
  all = false,
) {
  const i = r.items.find((x) => x.id === id);
  if (!i || i.status !== "active")
    throw Error("This item is no longer active.");
  const completedAt = stamp();
  if (all || i.quantity === 1) {
    i.status = status;
    i.completedAt = completedAt;
    i.updatedAt = completedAt;
  } else {
    i.quantity--;
    i.updatedAt = stamp();
    r.items.push({
      ...i,
      id: newId(),
      quantity: 1,
      status,
      completedAt,
      updatedAt: completedAt,
    });
  }
}
export function openUnit(r: Records, id: string, date = today()) {
  const i = r.items.find((x) => x.id === id);
  if (!i || i.status !== "active" || i.openedDate)
    throw Error("Only unopened active items can be opened.");
  const opened = { ...i, openedDate: date, updatedAt: stamp() };
  validateItem(opened);
  if (i.quantity > 1) {
    i.quantity--;
    i.updatedAt = stamp();
    r.items.push({ ...opened, id: newId(), quantity: 1 });
  } else Object.assign(i, opened);
}
export function inSoon(i: Item, window: number, now = today()) {
  const d = deadline(i).date;
  return (
    i.status === "active" &&
    !!d &&
    daysLeft(d, now) >= 0 &&
    daysLeft(d, now) <= window
  );
}

// Display only: stored calendar values and deadline arithmetic remain ISO-based.
export function displayDate(value: string) {
  if (!validDate(value)) return "";
  const [year, month, day] = value.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${day} ${months[Number(month) - 1]} ${year}`;
}

// Undated legacy history stays undated and sorts after recorded events.
export function recentHistory(a: Item, b: Item) {
  return (
    (b.completedAt || "").localeCompare(a.completedAt || "") ||
    a.id.localeCompare(b.id)
  );
}
export function historyDate(i: Item) {
  if (!i.completedAt) return "";
  const date = new Date(i.completedAt);
  return Number.isNaN(+date) ? "" : displayDate(today(date));
}
