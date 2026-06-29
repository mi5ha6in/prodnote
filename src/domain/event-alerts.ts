import type { CalendarEvent } from "./types";

export interface EventReminder {
  key: string;
  event: CalendarEvent;
  startsAt: string;
}

const notifiedReminderKeys = new Set<string>();

/**
 * Timed events that start within the lead window [now, now + leadMs].
 * All-day events are skipped (no meaningful start time). `leadMinutes <= 0`
 * disables reminders.
 */
export function getDueEventReminders(events: CalendarEvent[], nowMs: number, leadMinutes: number): EventReminder[] {
  if (leadMinutes <= 0) {
    return [];
  }

  const windowEnd = nowMs + leadMinutes * 60 * 1000;

  return events
    .filter((event) => !event.allDay)
    .map((event) => ({ event, startMs: Date.parse(event.startsAt) }))
    .filter(({ startMs }) => Number.isFinite(startMs) && startMs >= nowMs && startMs <= windowEnd)
    .map(({ event }) => ({ key: `${event.id}:${event.startsAt}`, event, startsAt: event.startsAt }));
}

/** Returns true once per reminder key, so a reminder fires a single time. */
export function shouldNotifyEventReminder(key: string): boolean {
  if (notifiedReminderKeys.has(key)) {
    return false;
  }

  notifiedReminderKeys.add(key);
  return true;
}

export function resetEventReminderNotifications(): void {
  notifiedReminderKeys.clear();
}
