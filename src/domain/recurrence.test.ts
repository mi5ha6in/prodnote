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

  it("clamps monthly rules to the last day of shorter months instead of skipping them", () => {
    // Раньше 31-е января прыгало сразу на 31 марта, теряя февраль.
    expect(nextRecurrenceDate("2026-01-31", presetToRule("monthly")!)).toBe("2026-02-28");
    expect(nextRecurrenceDate("2026-01-30", presetToRule("monthly")!)).toBe("2026-02-28");
    expect(nextRecurrenceDate("2026-02-28", presetToRule("monthly")!)).toBe("2026-03-28");
    // Апрель без 31-го — клемп до 30-го.
    expect(nextRecurrenceDate("2026-03-31", presetToRule("monthly")!)).toBe("2026-04-30");
  });

  it("advances a yearly Feb 29 rule to Feb 28 in non-leap years instead of dying", () => {
    // Раньше цикл не доходил до следующего 29 февраля и возвращал null.
    expect(nextRecurrenceDate("2024-02-29", presetToRule("yearly")!)).toBe("2025-02-28");
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
