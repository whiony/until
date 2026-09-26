import { deadline, daysLeft, type Records } from "./domain";
import { assertRealRecords } from "./demo";
export type ReminderDigest = {
  key: string;
  account: string;
  date: string;
  itemIds: string[];
};
// Server scheduling policy only. This does not start a timer or send a notification.
// Recompute from current account records immediately before delivery, never a stale queue.
export function reminderDigest(
  account: string,
  records: Records,
  now: Date,
  delivered: ReadonlySet<string> = new Set(),
): ReminderDigest | null {
  if (!account) throw Error("An authenticated account is required.");
  assertRealRecords(records);
  const prefs = records.settings.notifications;
  if (!prefs.requested) return null;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: prefs.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const time = `${part("hour")}:${part("minute")}`;
  const quiet =
    prefs.quietStart !== prefs.quietEnd &&
    (prefs.quietStart < prefs.quietEnd
      ? time >= prefs.quietStart && time < prefs.quietEnd
      : time >= prefs.quietStart || time < prefs.quietEnd);
  if (time < prefs.time || quiet) return null;
  const key = `${account}:${date}`;
  if (delivered.has(key)) return null;
  const itemIds = records.items
    .filter((item) => {
      if (item.status !== "active" || item.quantity < 1) return false;
      const date = deadline(item).date;
      if (!date) return false;
      const left = daysLeft(
        date,
        `${part("year")}-${part("month")}-${part("day")}`,
      );
      return (
        (left > 0 && left <= prefs.leadDays) ||
        (left === 0 && prefs.expirationDay)
      );
    })
    .map((i) => i.id)
    .sort();
  return itemIds.length ? { key, account, date, itemIds } : null;
}
