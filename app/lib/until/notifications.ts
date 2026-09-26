export type ReminderStatus = {
  available: boolean;
  state: "not-installed" | "unsupported" | "denied" | "unavailable";
  reason: string;
};
export function deviceReminderStatus(device: {
  ios: boolean;
  installed: boolean;
  supported: boolean;
  permission: NotificationPermission | "unsupported";
}): ReminderStatus | null {
  if (device.ios && !device.installed)
    return {
      available: false,
      state: "not-installed",
      reason:
        "Open Until from your Home Screen to use iPhone push reminders. In Safari, choose Share → Add to Home Screen.",
    };
  if (!device.supported)
    return {
      available: false,
      state: "unsupported",
      reason:
        "This browser does not support Web Push. Your Soon view still works.",
    };
  if (device.permission === "denied")
    return {
      available: false,
      state: "denied",
      reason:
        "Notifications are denied on this device. You can change permission in your device or browser settings. Your Soon view still works.",
    };
  return null;
}
export const notificationService = {
  async capability(): Promise<ReminderStatus> {
    const local = deviceReminderStatus({
      ios:
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
      installed:
        matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
      supported:
        window.isSecureContext &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window,
      permission:
        "Notification" in window ? Notification.permission : "unsupported",
    });
    const r = await fetch("/api/notifications", { cache: "no-store" });
    if (!r.ok)
      throw Error("Could not check reminder delivery. No alerts are enabled.");
    const server = (await r.json()) as ReminderStatus;
    if (local) return { ...local, reason: `${local.reason} ${server.reason}` };
    return { ...server, state: "unavailable" };
  },
};
