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
export function parseIcs(text: string): ParsedIcsEvent[] {
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
        const event = buildEventFromProperties(current);
        if (event) {
          events.push(event);
        }
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
      lines.push(`DTEND;VALUE=DATE:${formatDateValue(event.endsAt)}`);
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

function buildEventFromProperties(properties: IcsProperty[]): ParsedIcsEvent | null {
  const byName = new Map<string, IcsProperty>();
  for (const property of properties) {
    if (!byName.has(property.name)) {
      byName.set(property.name, property);
    }
  }

  const dtStart = byName.get("DTSTART");
  if (!dtStart) {
    return null;
  }

  const start = parseIcsDate(dtStart);
  const dtEnd = byName.get("DTEND");
  const end = dtEnd ? parseIcsDate(dtEnd) : null;

  const allDay = start.allDay && (end?.allDay ?? true);
  const startsAt = start.iso;
  const endsAt = end?.iso ?? defaultEnd(start.iso, allDay);

  return {
    title: unescapeText(byName.get("SUMMARY")?.value ?? "").trim() || "Без названия",
    description: unescapeText(byName.get("DESCRIPTION")?.value ?? "").trim(),
    location: unescapeText(byName.get("LOCATION")?.value ?? "").trim(),
    startsAt,
    endsAt,
    allDay,
    externalUid: byName.get("UID")?.value.trim() || null,
  };
}

function defaultEnd(startIso: string, allDay: boolean): string {
  const startMs = Date.parse(startIso);
  const durationMs = allDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  return new Date(startMs + durationMs).toISOString();
}

interface ParsedIcsDate {
  iso: string;
  allDay: boolean;
}

function parseIcsDate(property: IcsProperty): ParsedIcsDate {
  const value = property.value.trim();
  const isDateOnly = property.params.VALUE === "DATE" || /^\d{8}$/.test(value);

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
  if (utc) {
    return {
      iso: new Date(
        Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)),
      ).toISOString(),
      allDay: false,
    };
  }

  return {
    iso: new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ).toISOString(),
    allDay: false,
  };
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
      params[part.slice(0, eqIndex).toUpperCase()] = part.slice(eqIndex + 1).toUpperCase();
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
