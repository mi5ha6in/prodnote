import { describe, expect, it } from "vitest";
import { createCalendarEvent } from "./defaults";
import { buildIcs, parseIcs } from "./ics";

describe("parseIcs", () => {
  it("parses a timed UTC event", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:abc-123",
      "SUMMARY:Daily standup",
      "DTSTART:20260701T090000Z",
      "DTEND:20260701T093000Z",
      "LOCATION:Zoom",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const [event] = parseIcs(ics);

    expect(event.title).toBe("Daily standup");
    expect(event.location).toBe("Zoom");
    expect(event.allDay).toBe(false);
    expect(event.externalUid).toBe("abc-123");
    expect(event.startsAt).toBe("2026-07-01T09:00:00.000Z");
    expect(event.endsAt).toBe("2026-07-01T09:30:00.000Z");
  });

  it("parses a single-day all-day event with exclusive DTEND", () => {
    const ics = [
      "BEGIN:VEVENT",
      "UID:holiday-1",
      "SUMMARY:Holiday",
      "DTSTART;VALUE=DATE:20260704",
      "DTEND;VALUE=DATE:20260705",
      "END:VEVENT",
    ].join("\r\n");

    const [event] = parseIcs(ics);

    expect(event.allDay).toBe(true);
    // Exclusive DTEND 20260705 -> inclusive last day is July 4 (single day).
    expect(new Date(event.startsAt).getDate()).toBe(4);
    expect(new Date(event.endsAt).getDate()).toBe(4);
  });

  it("parses a multi-day all-day event (inclusive last day)", () => {
    const ics = [
      "BEGIN:VEVENT",
      "UID:trip-1",
      "SUMMARY:Trip",
      "DTSTART;VALUE=DATE:20260615",
      "DTEND;VALUE=DATE:20260622",
      "END:VEVENT",
    ].join("\r\n");

    const [event] = parseIcs(ics);

    expect(new Date(event.startsAt).getDate()).toBe(15);
    expect(new Date(event.endsAt).getDate()).toBe(21); // 22 exclusive -> 21 inclusive
  });

  it("unfolds wrapped lines and unescapes text", () => {
    const ics = [
      "BEGIN:VEVENT",
      "UID:u1",
      "SUMMARY:Plan A\\, then B",
      "DESCRIPTION:line one\\nline ",
      " two",
      "DTSTART:20260701T120000Z",
      "END:VEVENT",
    ].join("\r\n");

    const [event] = parseIcs(ics);

    expect(event.title).toBe("Plan A, then B");
    expect(event.description).toBe("line one\nline two");
  });

  it("defaults the end time when DTEND is missing", () => {
    const ics = ["BEGIN:VEVENT", "UID:u2", "SUMMARY:No end", "DTSTART:20260701T100000Z", "END:VEVENT"].join("\r\n");

    const [event] = parseIcs(ics);

    expect(event.endsAt).toBe("2026-07-01T11:00:00.000Z");
  });

  it("ignores non-VEVENT content", () => {
    const ics = ["BEGIN:VCALENDAR", "BEGIN:VTODO", "SUMMARY:task", "END:VTODO", "END:VCALENDAR"].join("\r\n");

    expect(parseIcs(ics)).toHaveLength(0);
  });

  it("converts TZID wall time to UTC", () => {
    // Europe/Moscow is a fixed UTC+3 zone (no DST), so 09:00 local => 06:00Z.
    const ics = [
      "BEGIN:VEVENT",
      "UID:tz-1",
      "SUMMARY:Standup",
      "DTSTART;TZID=Europe/Moscow:20260115T090000",
      "DTEND;TZID=Europe/Moscow:20260115T093000",
      "END:VEVENT",
    ].join("\r\n");

    const [event] = parseIcs(ics);
    expect(event.startsAt).toBe("2026-01-15T06:00:00.000Z");
    expect(event.endsAt).toBe("2026-01-15T06:30:00.000Z");
  });

  it("expands a weekly RRULE with COUNT", () => {
    const now = Date.parse("2026-07-01T00:00:00.000Z");
    const ics = [
      "BEGIN:VEVENT",
      "UID:weekly-1",
      "SUMMARY:Weekly sync",
      "DTSTART:20260702T140000Z",
      "DTEND:20260702T150000Z",
      "RRULE:FREQ=WEEKLY;COUNT=3",
      "END:VEVENT",
    ].join("\r\n");

    const events = parseIcs(ics, now);
    expect(events).toHaveLength(3);
    expect(events[0].startsAt).toBe("2026-07-02T14:00:00.000Z");
    expect(events[1].startsAt).toBe("2026-07-09T14:00:00.000Z");
    expect(events[2].startsAt).toBe("2026-07-16T14:00:00.000Z");
    // Each occurrence gets a distinct dedup UID.
    expect(new Set(events.map((event) => event.externalUid)).size).toBe(3);
  });

  it("expands weekly BYDAY occurrences", () => {
    const now = Date.parse("2026-07-01T00:00:00.000Z");
    const ics = [
      "BEGIN:VEVENT",
      "UID:byday-1",
      "SUMMARY:MWF",
      "DTSTART:20260706T080000Z", // Monday 6 Jul 2026
      "DTEND:20260706T083000Z",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=3",
      "END:VEVENT",
    ].join("\r\n");

    const days = parseIcs(ics, now).map((event) => new Date(event.startsAt).getUTCDate());
    expect(days).toEqual([6, 8, 10]); // Mon, Wed, Fri
  });
});

describe("buildIcs", () => {
  it("round-trips a timed event through parse", () => {
    const event = createCalendarEvent({
      title: "Review, sync; notes",
      startsAt: "2026-07-01T09:00:00.000Z",
      endsAt: "2026-07-01T10:00:00.000Z",
      description: "multi\nline",
      externalUid: "round-1",
    });

    const ics = buildIcs([event]);
    const [parsed] = parseIcs(ics);

    expect(parsed.title).toBe("Review, sync; notes");
    expect(parsed.description).toBe("multi\nline");
    expect(parsed.startsAt).toBe("2026-07-01T09:00:00.000Z");
    expect(parsed.endsAt).toBe("2026-07-01T10:00:00.000Z");
    expect(parsed.externalUid).toBe("round-1");
  });

  it("emits VALUE=DATE for all-day events", () => {
    const event = createCalendarEvent({
      title: "All day",
      startsAt: "2026-07-04T00:00:00.000Z",
      endsAt: "2026-07-05T00:00:00.000Z",
      allDay: true,
    });

    const ics = buildIcs([event]);

    expect(ics).toContain("DTSTART;VALUE=DATE:");
    const [parsed] = parseIcs(ics);
    expect(parsed.allDay).toBe(true);
  });
});
