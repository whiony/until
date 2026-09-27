import { it, expect } from "vitest";
import { emptyRecords, type Item, countdown } from "../lib/until/domain";
import { demoRecords } from "../lib/until/demo";
import { reminderDigest } from "../lib/until/reminder-plan";
import { deviceReminderStatus } from "../lib/until/notifications";
const item: Item = {
  id: "item-1",
  productId: "product-1",
  quantity: 1,
  printedDate: "2026-09-29",
  dateKind: "unspecified",
  purchaseDate: "",
  openedDate: "",
  location: "",
  notes: "",
  status: "active",
  createdAt: "",
  updatedAt: "",
  schemaVersion: 1,
};
function records() {
  const r = emptyRecords();
  r.settings.notifications = {
    requested: true,
    expirationDay: false,
    leadDays: 2,
    time: "09:00",
    quietStart: "21:00",
    quietEnd: "08:00",
    timezone: "Europe/Zagreb",
  };
  r.items.push({ ...item });
  return r;
}
it("uses effective dates and recomputes scheduling after date/opening/status/quantity changes", () => {
  const r = records(),
    now = new Date("2026-09-27T07:01:00Z");
  expect(reminderDigest("a", r, now)?.itemIds).toEqual([item.id]);
  r.items[0].printedDate = "2026-10-20";
  expect(reminderDigest("a", r, now)).toBeNull();
  r.items[0].openedDate = "2026-09-26";
  r.items[0].rule = { amount: 2, unit: "days" };
  expect(reminderDigest("a", r, now)?.itemIds).toEqual([item.id]);
  for (const status of ["used", "discarded"] as const) {
    r.items[0].status = status;
    expect(reminderDigest("a", r, now)).toBeNull();
  }
  r.items[0].status = "active";
  r.items[0].quantity = 0;
  expect(reminderDigest("a", r, now)).toBeNull();
  expect(() => reminderDigest("a", demoRecords(), now)).toThrow();
});
it("deduplicates daily digests within accounts and respects local time, quiet hours and due-day preference", () => {
  const r = records(),
    now = new Date("2026-09-27T07:01:00Z");
  const d = reminderDigest("a", r, now)!;
  expect(reminderDigest("a", r, now, new Set([d.key]))).toBeNull();
  expect(reminderDigest("b", r, now, new Set([d.key]))?.account).toBe("b");
  expect(() => reminderDigest("", r, now)).toThrow();
  expect(reminderDigest("a", r, new Date("2026-09-27T06:59:00Z"))).toBeNull();
  expect(reminderDigest("a", r, new Date("2026-09-27T19:01:00Z"))).toBeNull();
  r.items[0].printedDate = "2026-09-27";
  expect(reminderDigest("a", r, now)).toBeNull();
  r.settings.notifications.expirationDay = true;
  expect(reminderDigest("a", r, now)?.itemIds).toEqual([item.id]);
  r.settings.notifications.requested = false;
  expect(reminderDigest("a", r, now)).toBeNull();
});
it("keeps timezone calendars correct across DST and uses concise tracked status independently of label wording", () => {
  const r = records();
  r.items[0].printedDate = "2026-10-26";
  expect(reminderDigest("a", r, new Date("2026-10-25T07:59:00Z"))).toBeNull();
  expect(reminderDigest("a", r, new Date("2026-10-25T08:01:00Z"))?.date).toBe(
    "2026-10-25",
  );
  expect(countdown(item, "2026-10-01")).toBe("Expired 2 days ago");
  expect(countdown({ ...item, dateKind: "best before" }, "2026-10-01")).toBe(
    "Expired 2 days ago",
  );
  expect(countdown({ ...item, dateKind: "use by" }, "2026-10-01")).toBe(
    "Expired 2 days ago",
  );
  expect(countdown(item, "2026-09-29")).toBe("Recorded date is today");
});
it("reports installation, API and denied states without requesting permission or pretending to subscribe", () => {
  expect(
    deviceReminderStatus({
      ios: true,
      installed: false,
      supported: false,
      permission: "unsupported",
    })?.state,
  ).toBe("not-installed");
  expect(
    deviceReminderStatus({
      ios: false,
      installed: false,
      supported: false,
      permission: "unsupported",
    })?.state,
  ).toBe("unsupported");
  expect(
    deviceReminderStatus({
      ios: true,
      installed: true,
      supported: true,
      permission: "denied",
    })?.state,
  ).toBe("denied");
  expect(
    deviceReminderStatus({
      ios: true,
      installed: true,
      supported: true,
      permission: "default",
    }),
  ).toBeNull();
});
