import { beforeEach, describe, expect, it } from "vitest";
import { createCalendarEvent } from "./defaults";
import { getDueEventReminders, resetEventReminderNotifications, shouldNotifyEventReminder } from "./event-alerts";

function timedEvent(id: string, startsAt: string, allDay = false) {
  return { ...createCalendarEvent({ title: id, startsAt, endsAt: startsAt, allDay }), id };
}

describe("getDueEventReminders", () => {
  const now = Date.parse("2026-07-01T09:00:00.000Z");

  it("returns timed events starting within the lead window", () => {
    const events = [
      timedEvent("soon", "2026-07-01T09:10:00.000Z"), // in 10 min
      timedEvent("later", "2026-07-01T10:00:00.000Z"), // in 60 min
      timedEvent("past", "2026-07-01T08:55:00.000Z"), // already started
    ];

    const due = getDueEventReminders(events, now, 15);
    expect(due.map((reminder) => reminder.event.id)).toEqual(["soon"]);
  });

  it("ignores all-day events", () => {
    const events = [timedEvent("allday", "2026-07-01T09:10:00.000Z", true)];
    expect(getDueEventReminders(events, now, 15)).toHaveLength(0);
  });

  it("is disabled when lead is zero", () => {
    const events = [timedEvent("soon", "2026-07-01T09:10:00.000Z")];
    expect(getDueEventReminders(events, now, 0)).toHaveLength(0);
  });
});

describe("shouldNotifyEventReminder", () => {
  beforeEach(() => resetEventReminderNotifications());

  it("fires once per key", () => {
    expect(shouldNotifyEventReminder("a")).toBe(true);
    expect(shouldNotifyEventReminder("a")).toBe(false);
    expect(shouldNotifyEventReminder("b")).toBe(true);
  });
});
