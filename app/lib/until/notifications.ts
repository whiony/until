export interface NotificationService {
  capability(): Promise<{ available: boolean; reason: string }>;
  enable(): Promise<void>;
  disable(): Promise<void>;
}
export const notificationService: NotificationService = {
  async capability() {
    const r = await fetch("/api/notifications");
    if (!r.ok) throw Error("Notification service unavailable.");
    return r.json();
  },
  async enable() {
    const c = await this.capability();
    if (!c.available) throw Error(c.reason);
    throw Error("Push subscription endpoint is not configured.");
  },
  async disable() {
    /* No subscriptions are created until a real service is configured. */
  },
};
