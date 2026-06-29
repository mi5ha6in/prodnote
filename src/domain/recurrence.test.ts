import { describe, expect, it } from "vitest";
import { expandRecurrence, type RecurrenceRule } from "./recurrence";

const now = Date.parse("2026-07-01T00:00:00.000Z");

function rule(partial: Partial<RecurrenceRule>): RecurrenceRule {
  return { freq: "WEEKLY", interval: 1, count: null, untilMs: null, byDay: [], ...partial };
}

describe("expandRecurrence", () => {
  it("expands weekly with COUNT", () => {
    const occ = expandRecurrence("2026-07-02T14:00:00.000Z", "2026-07-02T15:00:00.000Z", rule({ count: 3 }), now);
    expect(occ.map((o) => o.startsAt)).toEqual([
      "2026-07-02T14:00:00.000Z",
      "2026-07-09T14:00:00.000Z",
      "2026-07-16T14:00:00.000Z",
    ]);
  });

  it("respects INTERVAL for daily", () => {
    const occ = expandRecurrence(
      "2026-07-02T09:00:00.000Z",
      "2026-07-02T09:30:00.000Z",
      rule({ freq: "DAILY", interval: 2, count: 3 }),
      now,
    );
    const days = occ.map((o) => new Date(o.startsAt).getUTCDate());
    expect(days).toEqual([2, 4, 6]);
  });

  it("stops at UNTIL", () => {
    const occ = expandRecurrence(
      "2026-07-02T14:00:00.000Z",
      "2026-07-02T15:00:00.000Z",
      rule({ untilMs: Date.parse("2026-07-12T00:00:00.000Z") }),
      now,
    );
    expect(occ).toHaveLength(2); // Jul 2 and Jul 9
  });
});
