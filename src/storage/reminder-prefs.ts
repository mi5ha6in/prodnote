/**
 * Per-device event reminder preference (lead time in minutes; 0 = off).
 * Stored locally because notifications are device-specific and need no sync.
 */
const STORAGE_KEY = "prodnote-event-reminder-minutes";
const DEFAULT_MINUTES = 15;

export const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60] as const;

export function getEventReminderMinutes(): number {
  if (typeof localStorage === "undefined") {
    return DEFAULT_MINUTES;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return DEFAULT_MINUTES;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MINUTES;
}

export function setEventReminderMinutes(minutes: number): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.round(minutes))));
}
