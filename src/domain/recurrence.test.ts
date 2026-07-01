import { describe, expect, it } from "vitest";
import {
  expandRecurrence,
  nextRecurrenceDate,
  presetToRule,
  type RecurrenceRule,
  ruleToPreset,
} from "./recurrence";

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

describe("nextRecurrenceDate", () => {
  it("advances daily, weekly, weekdays, monthly and yearly rules", () => {
    // 2026-07-01 is a Wednesday, 2026-07-03 a Friday.
    expect(nextRecurrenceDate("2026-07-01", presetToRule("daily")!)).toBe("2026-07-02");
    expect(nextRecurrenceDate("2026-07-01", rule({ freq: "DAILY", interval: 2 }))).toBe("2026-07-03");
    expect(nextRecurrenceDate("2026-07-01", presetToRule("weekly")!)).toBe("2026-07-08");
    expect(nextRecurrenceDate("2026-07-03", presetToRule("weekdays")!)).toBe("2026-07-06");
    expect(nextRecurrenceDate("2026-07-15", presetToRule("monthly")!)).toBe("2026-08-15");
    expect(nextRecurrenceDate("2026-07-15", presetToRule("yearly")!)).toBe("2027-07-15");
  });

  it("returns null once the rule passes its until date", () => {
    expect(
      nextRecurrenceDate("2026-07-01", rule({ freq: "DAILY", untilMs: Date.parse("2026-07-01T00:00:00.000Z") })),
    ).toBeNull();
  });
});

describe("recurrence presets", () => {
  it("maps presets to rules and back", () => {
    for (const preset of ["daily", "weekdays", "weekly", "monthly", "yearly"] as const) {
      expect(ruleToPreset(presetToRule(preset))).toBe(preset);
    }
    expect(presetToRule("none")).toBeNull();
    expect(ruleToPreset(null)).toBe("none");
  });
});
