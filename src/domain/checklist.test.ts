import { describe, expect, it } from "vitest";
import {
  habitStreak,
  habitWeekProgress,
  habitWeekStreak,
  lastNDays,
  materializeTemplates,
  shiftDayKey,
  templateAppliesToDay,
  weekdayOf,
} from "./checklist";
import { createChecklistItem, createChecklistTemplate } from "./defaults";
import type { ChecklistItem, ChecklistTemplate } from "./types";

const MONDAY = "2026-06-29";
const SATURDAY = "2026-06-27";

describe("checklist recurrence", () => {
  it("derives weekday and shifts day keys across month boundaries", () => {
    expect(weekdayOf(MONDAY)).toBe(1);
    expect(weekdayOf(SATURDAY)).toBe(6);
    expect(shiftDayKey(MONDAY, -1)).toBe("2026-06-28");
    expect(shiftDayKey("2026-07-01", -1)).toBe("2026-06-30");
    expect(shiftDayKey("2026-06-30", 1)).toBe("2026-07-01");
  });

  it("matches cadence to the day of week", () => {
    const daily = createChecklistTemplate({ title: "Каждый", cadence: "daily" });
    const weekdays = createChecklistTemplate({ title: "Будни", cadence: "weekdays" });
    const weekends = createChecklistTemplate({ title: "Выходные", cadence: "weekends" });

    expect(templateAppliesToDay(daily, MONDAY)).toBe(true);
    expect(templateAppliesToDay(weekdays, MONDAY)).toBe(true);
    expect(templateAppliesToDay(weekends, MONDAY)).toBe(false);

    expect(templateAppliesToDay(weekdays, SATURDAY)).toBe(false);
    expect(templateAppliesToDay(weekends, SATURDAY)).toBe(true);

    const archived: ChecklistTemplate = { ...daily, archived: true };
    expect(templateAppliesToDay(archived, MONDAY)).toBe(false);
  });

  it("materializes only missing, applicable templates", () => {
    const daily = createChecklistTemplate({ title: "Зарядка", cadence: "daily" });
    const weekdays = createChecklistTemplate({ title: "Ревью", cadence: "weekdays" });
    const weekends = createChecklistTemplate({ title: "Уборка", cadence: "weekends" });
    const existing = createChecklistItem({ title: "Зарядка", day: MONDAY, order: 0, templateId: daily.id });

    const created = materializeTemplates([daily, weekdays, weekends], [existing], MONDAY, 1);

    expect(created.map((item) => item.title)).toEqual(["Ревью"]);
    expect(created[0]).toMatchObject({ day: MONDAY, order: 1, templateId: weekdays.id });
  });

  it("lists the trailing window of days oldest first", () => {
    expect(lastNDays(MONDAY, 3)).toEqual(["2026-06-27", "2026-06-28", MONDAY]);
  });

  it("counts a habit streak, tolerating a pending most-recent day", () => {
    const habit = createChecklistTemplate({ title: "Английский", cadence: "daily", isHabit: true });
    const doneOn = (day: string, done: boolean): ChecklistItem => ({
      ...createChecklistItem({ title: habit.title, day, templateId: habit.id }),
      done,
      doneAt: done ? `${day}T09:00:00.000Z` : null,
    });

    // Yesterday and the day before are done; today is still pending.
    const items = [
      doneOn(MONDAY, false),
      doneOn("2026-06-28", true),
      doneOn("2026-06-27", true),
      doneOn("2026-06-26", false),
    ];

    expect(habitStreak(habit, items, MONDAY)).toBe(2);

    // Completing today extends the streak.
    const withToday = items.map((item) => (item.day === MONDAY ? { ...item, done: true } : item));
    expect(habitStreak(habit, withToday, MONDAY)).toBe(3);
  });

  it("tracks weekly-goal habits: week progress and consecutive-week streak", () => {
    const habit = createChecklistTemplate({ title: "Спортзал", cadence: "daily", isHabit: true, targetPerWeek: 3 });
    const doneOn = (day: string): ChecklistItem => ({
      ...createChecklistItem({ title: habit.title, day, templateId: habit.id }),
      done: true,
      doneAt: `${day}T09:00:00.000Z`,
    });

    // Прошлая неделя (22–28 июня): 3 раза — норма. Текущая (с 29-го): пока 2.
    const items = [
      doneOn("2026-06-22"),
      doneOn("2026-06-24"),
      doneOn("2026-06-26"),
      doneOn(MONDAY),
      doneOn("2026-06-30"),
    ];

    expect(habitWeekProgress(habit, items, MONDAY)).toBe(2);
    // Текущая неделя не добрана — не ломает серию, но и не считается.
    expect(habitWeekStreak(habit, items, MONDAY)).toBe(1);

    // Добор третьего дня в текущей неделе продлевает серию недель.
    const withThird = [...items, doneOn("2026-07-01")];
    expect(habitWeekStreak(habit, withThird, MONDAY)).toBe(2);
  });
});
