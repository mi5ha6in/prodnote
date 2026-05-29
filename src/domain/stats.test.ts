import { describe, expect, it } from "vitest";
import { createProject, createTag, createTask } from "./defaults";
import {
  formatDuration,
  getPomodoroStats,
  getProductiveHours,
  getTotalMinutes,
  groupSessionsByDay,
  groupSessionsByProject,
  groupSessionsByTag,
  groupSessionsByTask,
} from "./stats";
import type { PomodoroCycle, TimeSession } from "./types";

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
