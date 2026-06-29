import { describe, expect, it } from "vitest";
import {
  buildMonthMatrix,
  dayKey,
  groupByHorizon,
  itemsForDay,
  layoutWeekSegments,
  type CalendarItem,
} from "./calendar";

function item(id: string, startsAt: string): CalendarItem {
  return { id, source: "event", title: id, startsAt, endsAt: startsAt, allDay: false, kind: "event", taskId: null };
}

function atLocalNoon(year: number, month: number, day: number): string {
  return new Date(year, month, day, 12, 0, 0).toISOString();
}

describe("groupByHorizon", () => {
  const now = new Date(2026, 5, 15, 10, 0, 0); // Mon 15 Jun 2026

  it("buckets items into horizon sections", () => {
    const items = [
      item("overdue", atLocalNoon(2026, 5, 10)),
      item("today", atLocalNoon(2026, 5, 15)),
      item("tomorrow", atLocalNoon(2026, 5, 16)),
      item("thisWeek", atLocalNoon(2026, 5, 19)),
      item("thisMonth", atLocalNoon(2026, 5, 28)),
      item("thisYear", atLocalNoon(2026, 9, 1)),
      item("later", atLocalNoon(2027, 2, 1)),
    ];

    const sections = groupByHorizon(items, now, 1);
    const byKey = Object.fromEntries(sections.map((section) => [section.key, section.items.map((entry) => entry.id)]));

    expect(byKey.overdue).toEqual(["overdue"]);
    expect(byKey.today).toEqual(["today"]);
    expect(byKey.tomorrow).toEqual(["tomorrow"]);
    expect(byKey.thisWeek).toEqual(["thisWeek"]);
    expect(byKey.thisMonth).toEqual(["thisMonth"]);
    expect(byKey.thisYear).toEqual(["thisYear"]);
    expect(byKey.later).toEqual(["later"]);
  });

  it("omits empty sections", () => {
    const sections = groupByHorizon([item("a", atLocalNoon(2026, 5, 15))], now, 1);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("today");
  });
});

describe("buildMonthMatrix", () => {
  it("builds a 6x7 grid starting on Monday", () => {
    const now = new Date(2026, 5, 15, 10, 0, 0);
    const weeks = buildMonthMatrix(2026, 5, 1, now); // June 2026

    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toHaveLength(7);
    // June 1 2026 is a Monday → first cell is June 1, in month
    expect(weeks[0][0].day).toBe(1);
    expect(weeks[0][0].inMonth).toBe(true);
    expect(weeks.flat().find((cell) => cell.isToday)?.dateKey).toBe(dayKey(now));
  });

  it("respects Sunday week start", () => {
    const now = new Date(2026, 5, 15, 10, 0, 0);
    const weeks = buildMonthMatrix(2026, 5, 7, now);
    // June 1 2026 is Monday → with Sunday start, first cell is May 31
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[0][0].day).toBe(31);
  });
});

describe("layoutWeekSegments", () => {
  // Week of Mon 15 Jun 2026 .. Sun 21 Jun 2026 (third week of June)
  const week = buildMonthMatrix(2026, 5, 1, new Date(2026, 5, 15))[2];

  function spanItem(id: string, startDay: number, endDay: number): CalendarItem {
    return {
      id,
      source: "event",
      title: id,
      startsAt: new Date(2026, 5, startDay, 0, 0, 0).toISOString(),
      endsAt: new Date(2026, 5, endDay, 0, 0, 0).toISOString(),
      allDay: true,
      kind: "event",
      taskId: null,
    };
  }

  it("places a multi-day event as one spanning segment", () => {
    const lanes = layoutWeekSegments(week, [spanItem("wed-fri", 17, 19)]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0][0]).toMatchObject({ startCol: 2, span: 3, continuesLeft: false, continuesRight: false });
  });

  it("clips events that extend past the week edges", () => {
    const lanes = layoutWeekSegments(week, [spanItem("prev-tue", 10, 16)]);
    expect(lanes[0][0]).toMatchObject({ startCol: 0, span: 2, continuesLeft: true, continuesRight: false });
  });

  it("stacks overlapping events into separate lanes", () => {
    const lanes = layoutWeekSegments(week, [spanItem("a", 16, 18), spanItem("b", 17, 19)]);
    expect(lanes).toHaveLength(2);
  });

  it("keeps non-overlapping events in the same lane", () => {
    const lanes = layoutWeekSegments(week, [spanItem("a", 15, 16), spanItem("b", 18, 19)]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toHaveLength(2);
  });
});

describe("itemsForDay", () => {
  it("filters items by local day", () => {
    const items = [item("a", atLocalNoon(2026, 5, 15)), item("b", atLocalNoon(2026, 5, 16))];
    const key = dayKey(new Date(2026, 5, 15));
    expect(itemsForDay(items, key).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("includes multi-day events on every covered day", () => {
    const week: CalendarItem = {
      id: "week",
      source: "event",
      title: "week",
      startsAt: new Date(2026, 5, 15, 0, 0, 0).toISOString(),
      endsAt: new Date(2026, 5, 21, 0, 0, 0).toISOString(),
      allDay: true,
      kind: "event",
      taskId: null,
    };

    for (let day = 15; day <= 21; day += 1) {
      const key = dayKey(new Date(2026, 5, day));
      expect(itemsForDay([week], key).map((entry) => entry.id)).toEqual(["week"]);
    }
    expect(itemsForDay([week], dayKey(new Date(2026, 5, 22)))).toHaveLength(0);
    expect(itemsForDay([week], dayKey(new Date(2026, 5, 14)))).toHaveLength(0);
  });
});
