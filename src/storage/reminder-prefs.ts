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

const ALLDAY_KEY = "prodnote-allday-reminder-hour";
const DEFAULT_ALLDAY_HOUR = 9;

/** Morning hour for all-day/deadline reminders; -1 disables them. */
export const ALLDAY_REMINDER_OPTIONS = [-1, 7, 8, 9, 10, 12] as const;

export function getAllDayReminderHour(): number {
  if (typeof localStorage === "undefined") {
    return DEFAULT_ALLDAY_HOUR;
  }
  const raw = localStorage.getItem(ALLDAY_KEY);
  if (raw === null) {
    return DEFAULT_ALLDAY_HOUR;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= -1 && parsed <= 23 ? parsed : DEFAULT_ALLDAY_HOUR;
}

export function setAllDayReminderHour(hour: number): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(ALLDAY_KEY, String(Math.max(-1, Math.min(23, Math.round(hour)))));
  }
}
