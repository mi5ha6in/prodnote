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
      // Clamp the target day to the month length so the 29th–31st still fire in
      // shorter months (e.g. a monthly-31 rule lands on Feb 28) instead of skipping them.
      return date.getDate() === clampDayToMonth(base.day, date) && monthDiff(base.midnight, date) % interval === 0;
    case "YEARLY":
      // Same clamp for Feb 29 in non-leap years — it falls back to Feb 28 rather than vanishing.
      return (
        date.getMonth() === base.month &&
        date.getDate() === clampDayToMonth(base.day, date) &&
        monthDiff(base.midnight, date) % (interval * 12) === 0
      );
    default:
      return false;
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** The target day clamped to the last day of the month `date` falls in. */
function clampDayToMonth(day: number, date: Date): number {
  return Math.min(day, daysInMonth(date.getFullYear(), date.getMonth()));
}

function monthDiff(baseMidnight: number, date: Date): number {
  const start = new Date(baseMidnight);
  return (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
}

/**
 * Next recurrence date as `YYYY-MM-DD` strictly after `fromDate`, or null once the
 * rule has ended (past `untilMs`). Operates on date-only strings — used for task
 * deadlines that recur when a task is completed.
 */
export function nextRecurrenceDate(fromDate: string, rule: RecurrenceRule): string | null {
  const [year, month, day] = fromDate.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const start = new Date(year, month - 1, day);
  const base = {
    midnight: start.getTime(),
    weekday: start.getDay(),
    day: start.getDate(),
    month: start.getMonth(),
  };
  const interval = Math.max(1, rule.interval);
  const cursor = new Date(year, month - 1, day);

  // Scan day by day until the next match. The bound scales with the interval so
  // yearly rules (incl. Feb 29) and multi-year/-month intervals still resolve.
  const scanLimit = Math.max(800, 366 * interval + 40);
  for (let safety = 0; safety < scanLimit; safety += 1) {
    cursor.setDate(cursor.getDate() + 1);
    if (matchesFrequency(rule.freq, interval, rule.byDay, cursor, base)) {
      if (rule.untilMs !== null && cursor.getTime() > rule.untilMs) {
        return null;
      }
      return formatDateKey(cursor);
    }
  }

  return null;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** UI-facing recurrence presets that map to a subset of RecurrenceRule. */
export type RecurrencePreset = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export const RECURRENCE_PRESET_LABELS: Record<RecurrencePreset, string> = {
  none: "Не повторять",
  daily: "Ежедневно",
  weekdays: "По будням",
  weekly: "Еженедельно",
  monthly: "Ежемесячно",
  yearly: "Ежегодно",
};

const WEEKDAYS = [1, 2, 3, 4, 5];

export function presetToRule(preset: RecurrencePreset): RecurrenceRule | null {
  switch (preset) {
    case "daily":
      return { freq: "DAILY", interval: 1, count: null, untilMs: null, byDay: [] };
    case "weekdays":
      return { freq: "WEEKLY", interval: 1, count: null, untilMs: null, byDay: [...WEEKDAYS] };
    case "weekly":
      return { freq: "WEEKLY", interval: 1, count: null, untilMs: null, byDay: [] };
    case "monthly":
      return { freq: "MONTHLY", interval: 1, count: null, untilMs: null, byDay: [] };
    case "yearly":
      return { freq: "YEARLY", interval: 1, count: null, untilMs: null, byDay: [] };
    case "none":
    default:
      return null;
  }
}

export function ruleToPreset(rule: RecurrenceRule | null): RecurrencePreset {
  if (!rule) {
    return "none";
  }
  switch (rule.freq) {
    case "DAILY":
      return "daily";
    case "WEEKLY":
      return rule.byDay.length === WEEKDAYS.length && WEEKDAYS.every((day) => rule.byDay.includes(day))
        ? "weekdays"
        : "weekly";
    case "MONTHLY":
      return "monthly";
    case "YEARLY":
      return "yearly";
    default:
      return "none";
  }
}
