/** Shared recurrence model + bounded expansion, used by ICS import and the UI. */
export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface RecurrenceRule {
  freq: RecurrenceFreq | string;
  interval: number;
  count: number | null;
  untilMs: number | null;
  /** Weekdays (0=Sun..6=Sat) for WEEKLY; empty means the start weekday. */
  byDay: number[];
}

export const WEEKDAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OCCURRENCES = 200;

/**
 * Expand a recurrence into concrete occurrences within a bounded window
 * (DTSTART .. min(UNTIL, now + 1 year), capped count, recent occurrences kept).
 */
export function expandRecurrence(
  startIso: string,
  endIso: string,
  rule: RecurrenceRule,
  nowMs: number,
): Array<{ startsAt: string; endsAt: string }> {
  const start = new Date(startIso);
  const duration = Date.parse(endIso) - Date.parse(startIso);
  const windowEndMs = Math.min(rule.untilMs ?? Infinity, nowMs + 365 * DAY_MS);
  const recentCutoffMs = nowMs - 31 * DAY_MS;
  const interval = Math.max(1, rule.interval);

  const base = {
    midnight: new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime(),
    weekday: start.getDay(),
    day: start.getDate(),
    month: start.getMonth(),
  };

  const results: Array<{ startsAt: string; endsAt: string }> = [];
  const cursor = new Date(base.midnight);
  let occurrenceIndex = 0;

  for (let safety = 0; safety < 1500 && results.length < MAX_OCCURRENCES; safety += 1) {
    if (cursor.getTime() > windowEndMs) {
      break;
    }

    if (matchesFrequency(rule.freq, interval, rule.byDay, cursor, base)) {
      occurrenceIndex += 1;
      if (rule.count !== null && occurrenceIndex > rule.count) {
        break;
      }

      const occStart = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
        start.getHours(),
        start.getMinutes(),
        start.getSeconds(),
      );
      if (occStart.getTime() <= windowEndMs && occStart.getTime() + duration >= recentCutoffMs) {
        results.push({
          startsAt: occStart.toISOString(),
          endsAt: new Date(occStart.getTime() + duration).toISOString(),
        });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return results.length ? results : [{ startsAt: startIso, endsAt: endIso }];
}

function matchesFrequency(
  freq: string,
  interval: number,
  byDay: number[],
  date: Date,
  base: { midnight: number; weekday: number; day: number; month: number },
): boolean {
  const dayDiff = Math.round((date.getTime() - base.midnight) / DAY_MS);
  if (dayDiff < 0) {
    return false;
  }

  switch (freq) {
    case "DAILY":
      return dayDiff % interval === 0;
    case "WEEKLY": {
      if (Math.floor(dayDiff / 7) % interval !== 0) {
        return false;
      }
      return byDay.length ? byDay.includes(date.getDay()) : date.getDay() === base.weekday;
    }
    case "MONTHLY":
      return date.getDate() === base.day && monthDiff(base.midnight, date) % interval === 0;
    case "YEARLY":
      return (
        date.getDate() === base.day &&
        date.getMonth() === base.month &&
        monthDiff(base.midnight, date) % (interval * 12) === 0
      );
    default:
      return false;
  }
}

function monthDiff(baseMidnight: number, date: Date): number {
  const start = new Date(baseMidnight);
  return (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
}
