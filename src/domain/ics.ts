import type { CalendarEvent } from "./types";

export interface ParsedIcsEvent {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  externalUid: string | null;
}

interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

/**
 * Parse an iCalendar (.ics) document into plain events.
 * Supports line unfolding, VEVENT blocks, all-day (VALUE=DATE) and timed events
 * (UTC `Z` or floating local time). RRULE is not expanded — the single DTSTART
 * occurrence is imported.
 */
export function parseIcs(text: string, nowMs = Date.now()): ParsedIcsEvent[] {
  const lines = unfoldLines(text);
  const events: ParsedIcsEvent[] = [];
  let current: IcsProperty[] | null = null;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      current = [];
      continue;
    }

    if (upper === "END:VEVENT") {
      if (current) {
        events.push(...buildEventsFromProperties(current, nowMs));
      }
      current = null;
      continue;
    }

    if (current) {
      const property = parseProperty(line);
      if (property) {
        current.push(property);
      }
    }
  }

  return events;
}

/** Serialize events into an iCalendar document. */
export function buildIcs(events: CalendarEvent[]): string {
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ProdNote//Calendar//RU", "CALSCALE:GREGORIAN"];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.externalUid ?? event.id}`);
    lines.push(`DTSTAMP:${formatUtcStamp(event.createdAt)}`);
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateValue(event.startsAt)}`);
      // iCal all-day DTEND is exclusive: the day after the inclusive last day.
      lines.push(`DTEND;VALUE=DATE:${formatDateValue(shiftDays(event.endsAt, 1))}`);
    } else {
      lines.push(`DTSTART:${formatUtcStamp(event.startsAt)}`);
      lines.push(`DTEND:${formatUtcStamp(event.endsAt)}`);
    }
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeText(event.location)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n");
}

function buildEventsFromProperties(properties: IcsProperty[], nowMs = Date.now()): ParsedIcsEvent[] {
  const byName = new Map<string, IcsProperty>();
  for (const property of properties) {
    if (!byName.has(property.name)) {
      byName.set(property.name, property);
    }
  }

  const dtStart = byName.get("DTSTART");
  if (!dtStart) {
    return [];
  }

  const start = parseIcsDate(dtStart);
  const dtEnd = byName.get("DTEND");
  const end = dtEnd ? parseIcsDate(dtEnd) : null;

  const allDay = start.allDay && (end?.allDay ?? true);
  const startsAt = start.iso;
  // iCal all-day DTEND is exclusive (the day after the last day); store the
  // inclusive last day internally. A single-day all-day event has no real end.
  const endsAt = allDay
    ? end
      ? shiftDays(end.iso, -1)
      : start.iso
    : end?.iso ?? defaultEnd(start.iso);

  const base = {
    title: unescapeText(byName.get("SUMMARY")?.value ?? "").trim() || "Без названия",
    description: unescapeText(byName.get("DESCRIPTION")?.value ?? "").trim(),
    location: unescapeText(byName.get("LOCATION")?.value ?? "").trim(),
    allDay,
    uid: byName.get("UID")?.value.trim() || null,
  };

  const rrule = byName.get("RRULE")?.value;
  const occurrences = rrule ? expandRecurrence(startsAt, endsAt, rrule, nowMs) : [{ startsAt, endsAt }];

  return occurrences.map((occurrence) => ({
    title: base.title,
    description: base.description,
    location: base.location,
    startsAt: occurrence.startsAt,
    endsAt: occurrence.endsAt,
    allDay: base.allDay,
    externalUid: base.uid ? (rrule ? `${base.uid}:${occurrence.startsAt.slice(0, 10)}` : base.uid) : null,
  }));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RRULE_MAX_OCCURRENCES = 200;
const WEEKDAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

interface Recurrence {
  freq: string;
  interval: number;
  count: number | null;
  untilMs: number | null;
  byDay: number[];
}

function parseRrule(value: string): Recurrence {
  const parts = Object.fromEntries(
    value.split(";").map((piece) => {
      const [key, raw] = piece.split("=");
      return [key.toUpperCase(), raw ?? ""];
    }),
  );

  return {
    freq: (parts.FREQ ?? "").toUpperCase(),
    interval: Math.max(1, Number(parts.INTERVAL ?? "1") || 1),
    count: parts.COUNT ? Number(parts.COUNT) : null,
    untilMs: parts.UNTIL ? Date.parse(toIsoFromIcsDate(parts.UNTIL)) : null,
    byDay: parts.BYDAY
      ? parts.BYDAY.split(",")
          .map((code) => WEEKDAY_CODES[code.trim().slice(-2).toUpperCase()])
          .filter((day): day is number => day !== undefined)
      : [],
  };
}

function toIsoFromIcsDate(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(value.trim());
  if (!match) {
    return value;
  }
  const [, y, mo, d, h = "23", mi = "59", s = "59"] = match;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))).toISOString();
}

/** Expand an RRULE into concrete occurrences within a bounded window. */
function expandRecurrence(
  startIso: string,
  endIso: string,
  rruleValue: string,
  nowMs: number,
): Array<{ startsAt: string; endsAt: string }> {
  const rule = parseRrule(rruleValue);
  const start = new Date(startIso);
  const duration = Date.parse(endIso) - Date.parse(startIso);
  const windowEndMs = Math.min(rule.untilMs ?? Infinity, nowMs + 365 * DAY_MS);
  const recentCutoffMs = nowMs - 31 * DAY_MS;
  const startWeekday = start.getDay();
  const startDay = start.getDate();
  const startMonth = start.getMonth();

  const results: Array<{ startsAt: string; endsAt: string }> = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const startMidnight = cursor.getTime();
  let occurrenceIndex = 0;

  for (let safety = 0; safety < 1000 && results.length < RRULE_MAX_OCCURRENCES; safety += 1) {
    if (cursor.getTime() > windowEndMs) {
      break;
    }

    if (matchesFrequency(rule, cursor, { startMidnight, startWeekday, startDay, startMonth })) {
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
  rule: Recurrence,
  date: Date,
  base: { startMidnight: number; startWeekday: number; startDay: number; startMonth: number },
): boolean {
  const dayDiff = Math.round((date.getTime() - base.startMidnight) / DAY_MS);
  if (dayDiff < 0) {
    return false;
  }

  switch (rule.freq) {
    case "DAILY":
      return dayDiff % rule.interval === 0;
    case "WEEKLY": {
      const weekDiff = Math.floor(dayDiff / 7);
      if (weekDiff % rule.interval !== 0) {
        return false;
      }
      return rule.byDay.length ? rule.byDay.includes(date.getDay()) : date.getDay() === base.startWeekday;
    }
    case "MONTHLY":
      return date.getDate() === base.startDay && monthDiff(base, date) % rule.interval === 0;
    case "YEARLY":
      return (
        date.getDate() === base.startDay &&
        date.getMonth() === base.startMonth &&
        monthDiff(base, date) % (rule.interval * 12) === 0
      );
    default:
      return false;
  }
}

function monthDiff(base: { startMidnight: number }, date: Date): number {
  const start = new Date(base.startMidnight);
  return (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
}

function defaultEnd(startIso: string): string {
  return new Date(Date.parse(startIso) + 60 * 60 * 1000).toISOString();
}

function shiftDays(iso: string, days: number): string {
  const date = new Date(iso);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).toISOString();
}

interface ParsedIcsDate {
  iso: string;
  allDay: boolean;
}

function parseIcsDate(property: IcsProperty): ParsedIcsDate {
  const value = property.value.trim();
  const isDateOnly = (property.params.VALUE ?? "").toUpperCase() === "DATE" || /^\d{8}$/.test(value);

  if (isDateOnly) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    return { iso: new Date(year, month - 1, day).toISOString(), allDay: true };
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value);
  if (!match) {
    return { iso: new Date().toISOString(), allDay: false };
  }

  const [, year, month, day, hour, minute, second, utc] = match;
  const parts = [Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second)] as const;

  if (utc) {
    return {
      iso: new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5])).toISOString(),
      allDay: false,
    };
  }

  const tzid = property.params.TZID;
  if (tzid) {
    return { iso: zonedWallTimeToUtc(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], tzid), allDay: false };
  }

  return {
    iso: new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]).toISOString(),
    allDay: false,
  };
}

/** UTC ISO for a wall-clock time interpreted in the given IANA time zone. */
function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): string {
  const wallUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = wallUtc - timeZoneOffsetMs(timeZone, wallUtc);
  // One refinement pass handles DST boundaries.
  guess = wallUtc - timeZoneOffsetMs(timeZone, guess);
  return new Date(guess).toISOString();
}

/** Offset (ms) of a time zone at the given UTC instant: localWallTime - utc. */
function timeZoneOffsetMs(timeZone: string, utcMs: number): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]));
    const wall = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return wall - utcMs;
  } catch {
    return 0;
  }
}

function parseProperty(line: string): IcsProperty | null {
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) {
    return null;
  }

  const rawName = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const [name, ...paramParts] = rawName.split(";");
  const params: Record<string, string> = {};

  for (const part of paramParts) {
    const eqIndex = part.indexOf("=");
    if (eqIndex !== -1) {
      // Keep the value's original case — TZID names like "America/New_York" are case-sensitive.
      params[part.slice(0, eqIndex).toUpperCase()] = part.slice(eqIndex + 1);
    }
  }

  return { name: name.toUpperCase(), params, value };
}

/** Join folded continuation lines (lines starting with a space or tab). */
function unfoldLines(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const result: string[] = [];

  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && result.length > 0) {
      result[result.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      result.push(line);
    }
  }

  return result;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, "0");
}

function formatUtcStamp(iso: string): string {
  const date = new Date(iso);
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function formatDateValue(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** Fold lines longer than 75 octets per RFC 5545 (approximated by characters). */
function foldLine(line: string): string {
  if (line.length <= 75) {
    return line;
  }

  const chunks: string[] = [];
  let remaining = line;
  chunks.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);

  while (remaining.length > 0) {
    chunks.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }

  return chunks.join("\r\n");
}
