import { describe, expect, it } from "vitest";
import { createCalendarEvent, createProject, createTag, createTask } from "./defaults";
import {
  formatDuration,
  getPlanVsActualByTask,
  getPomodoroStats,
  getProductiveHours,
  getTotalMinutes,
  groupChecklistByDay,
  groupSessionsByDay,
  groupSessionsByProject,
  groupSessionsByTag,
  groupSessionsByTask,
} from "./stats";
import type { ChecklistItem, PomodoroCycle, TimeSession } from "./types";

describe("statistics", () => {
  const project = createProject({ name: "Проект" });
  const tag = createTag({ name: "Фокус" });
  const task = {
    ...createTask({ title: "Задача", projectId: project.id, tagIds: [tag.id] }),
    id: "task-1",
  };
  const sessions: TimeSession[] = [
    {
      id: "session-1",
      taskId: task.id,
      startedAt: "2026-05-27T08:00:00.000Z",
      endedAt: "2026-05-27T08:25:00.000Z",
      durationMinutes: 25,
      mode: "pomodoro",
      note: "",
      pomodoroCycleId: "pomodoro-1",
    },
    {
      id: "session-2",
      taskId: task.id,
      startedAt: "2026-05-28T09:00:00.000Z",
      endedAt: "2026-05-28T10:00:00.000Z",
      durationMinutes: 60,
      mode: "manual",
      note: "",
      pomodoroCycleId: null,
    },
  ];
  const pomodoroCycles: PomodoroCycle[] = [
    {
      id: "pomodoro-1",
      taskId: task.id,
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakEvery: 4,
      startedAt: "2026-05-27T08:00:00.000Z",
      completedFocusCount: 1,
      completedShortBreakCount: 1,
      completedLongBreakCount: 0,
      status: "running",
    },
  ];

  it("groups time by day, task, project, tag and hour", () => {
    expect(getTotalMinutes(sessions)).toBe(85);
    expect(groupSessionsByDay(sessions)).toEqual([
      { date: "2026-05-27", minutes: 25, sessions: 1 },
      { date: "2026-05-28", minutes: 60, sessions: 1 },
    ]);
    expect(groupSessionsByTask(sessions, [task])[0]).toMatchObject({ id: task.id, minutes: 85 });
    expect(groupSessionsByProject(sessions, [task], [project])[0]).toMatchObject({ id: project.id, minutes: 85 });
    expect(groupSessionsByTag(sessions, [task], [tag])[0]).toMatchObject({ id: tag.id, minutes: 85 });
    const localHour = new Date("2026-05-27T08:00:00.000Z").getHours();
    expect(getProductiveHours(sessions)[localHour]?.minutes).toBe(25);
  });

  it("calculates pomodoro totals and readable durations", () => {
    expect(getPomodoroStats(sessions, pomodoroCycles)).toEqual({
      total: 1,
      focusMinutes: 25,
      breakMinutes: 5,
      totalMinutes: 30,
    });
    expect(formatDuration(125)).toBe("2 ч 5 мин");
  });

  it("counts completed pomodoro focus rounds, not raw pomodoro sessions", () => {
    const interruptedPomodoroSession: TimeSession = {
      id: "session-3",
      taskId: task.id,
      startedAt: "2026-05-28T11:00:00.000Z",
      endedAt: "2026-05-28T11:10:00.000Z",
      durationMinutes: 10,
      mode: "pomodoro",
      note: "",
      pomodoroCycleId: "pomodoro-2",
    };

    expect(getPomodoroStats([...sessions, interruptedPomodoroSession], pomodoroCycles)).toEqual({
      total: 1,
      focusMinutes: 35,
      breakMinutes: 5,
      totalMinutes: 40,
    });
  });
});

describe("getPlanVsActualByTask", () => {
  const task = { ...createTask({ title: "Задача" }), id: "task-pa" };
  const sessions: TimeSession[] = [
    {
      id: "s1",
      taskId: "task-pa",
      startedAt: "2026-05-27T08:00:00.000Z",
      endedAt: "2026-05-27T08:40:00.000Z",
      durationMinutes: 40,
      mode: "timer",
      note: "",
      pomodoroCycleId: null,
    },
  ];

  it("pairs planned event minutes with actual session minutes", () => {
    const event = createCalendarEvent({
      title: "plan",
      startsAt: "2026-05-27T09:00:00.000Z",
      endsAt: "2026-05-27T10:00:00.000Z",
      taskId: "task-pa",
    });

    const [row] = getPlanVsActualByTask([event], sessions, [task]);
    expect(row).toMatchObject({ id: "task-pa", plannedMinutes: 60, actualMinutes: 40 });
  });

  it("ignores all-day events and tasks with no time", () => {
    const allDay = createCalendarEvent({
      title: "holiday",
      startsAt: "2026-05-27T00:00:00.000Z",
      endsAt: "2026-05-27T00:00:00.000Z",
      allDay: true,
      taskId: "task-pa",
    });

    expect(getPlanVsActualByTask([allDay], [], [task])).toHaveLength(0);
  });

  it("groups checklist completion by day, oldest first", () => {
    const make = (day: string, done: boolean): ChecklistItem => ({
      id: `c-${day}-${done}`,
      day,
      title: "Пункт",
      done,
      doneAt: done ? `${day}T09:00:00.000Z` : null,
      order: 0,
      taskId: null,
      rolledFrom: null,
      createdAt: `${day}T08:00:00.000Z`,
      updatedAt: `${day}T08:00:00.000Z`,
    });

    const stats = groupChecklistByDay([
      make("2026-06-02", true),
      make("2026-06-01", true),
      make("2026-06-01", false),
    ]);

    expect(stats.map((stat) => stat.date)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(stats[0]).toMatchObject({ total: 2, done: 1 });
    expect(stats[1]).toMatchObject({ total: 1, done: 1 });
  });
});
