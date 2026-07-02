import { describe, expect, it } from "vitest";
import { buildDayPlan, isPlannedForDay } from "./day-plan";
import { createCalendarEvent, createStarterWorkspace, createTask } from "./defaults";

const DAY = "2026-07-02";
const NOW = new Date("2026-07-02T08:00:00");

describe("isPlannedForDay", () => {
  it("counts due date and planned slot on the day", () => {
    expect(isPlannedForDay(createTask({ title: "a", dueDate: DAY }), DAY)).toBe(true);
    const planned = createTask({ title: "b" });
    planned.plannedAt = `${DAY}T10:00:00`;
    expect(isPlannedForDay(planned, DAY)).toBe(true);
    expect(isPlannedForDay(createTask({ title: "c", dueDate: "2026-07-03" }), DAY)).toBe(false);
  });
});

describe("buildDayPlan", () => {
  it("splits open tasks into overdue, planned and week candidates", () => {
    const workspace = createStarterWorkspace();
    const overdue = createTask({ title: "Просрочена", dueDate: "2026-06-30" });
    const dueToday = createTask({ title: "На сегодня", dueDate: DAY });
    const withinWeek = createTask({ title: "На неделе", dueDate: "2026-07-05" });
    const beyondWeek = createTask({ title: "Далеко", dueDate: "2026-08-01" });
    const noDate = createTask({ title: "Без даты" });
    const done = { ...createTask({ title: "Готова", dueDate: DAY }), status: "done" as const };
    workspace.tasks = [overdue, dueToday, withinWeek, beyondWeek, noDate, done];

    const plan = buildDayPlan(workspace, DAY, NOW);
    expect(plan.overdue.map((t) => t.title)).toEqual(["Просрочена"]);
    expect(plan.planned.map((t) => t.title)).toEqual(["На сегодня"]);
    expect(plan.candidates.map((t) => t.title).sort()).toEqual(["Без даты", "На неделе"]);
  });

  it("budgets the day: capacity minus events minus estimates", () => {
    const workspace = createStarterWorkspace();
    workspace.settings.dailyCapacityMinutes = 480;
    const taskA = createTask({ title: "A", dueDate: DAY });
    taskA.estimateMinutes = 90;
    const taskB = createTask({ title: "B", dueDate: DAY });
    workspace.tasks = [taskA, taskB];
    workspace.events = [
      createCalendarEvent({ title: "Встреча", startsAt: `${DAY}T10:00:00`, endsAt: `${DAY}T11:30:00` }),
    ];

    const plan = buildDayPlan(workspace, DAY, NOW);
    expect(plan.busyMinutes).toBe(90);
    expect(plan.plannedEstimateMinutes).toBe(90);
    expect(plan.freeMinutes).toBe(480 - 90 - 90);
  });

  it("clamps overnight events to the day's share and skips all-day ones", () => {
    const workspace = createStarterWorkspace();
    workspace.events = [
      createCalendarEvent({ title: "Ночной", startsAt: "2026-07-01T23:00:00", endsAt: `${DAY}T01:00:00` }),
      { ...createCalendarEvent({ title: "Весь день", startsAt: `${DAY}T00:00:00`, endsAt: `${DAY}T23:59:00` }), allDay: true },
    ];

    const plan = buildDayPlan(workspace, DAY, NOW);
    expect(plan.busyMinutes).toBe(60);
  });

  it("disables the budget for past days and when capacity is 0", () => {
    const workspace = createStarterWorkspace();
    workspace.settings.dailyCapacityMinutes = 480;
    expect(buildDayPlan(workspace, "2026-06-01", NOW).capacityMinutes).toBe(0);

    workspace.settings.dailyCapacityMinutes = 0;
    expect(buildDayPlan(workspace, DAY, NOW).capacityMinutes).toBe(0);
  });
});
