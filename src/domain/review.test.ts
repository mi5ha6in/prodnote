import { describe, expect, it } from "vitest";
import { createChecklistItem, createChecklistTemplate, createStarterWorkspace, createTask } from "./defaults";
import { buildReviewTrends, buildWeeklyReview, weekStartKey } from "./review";
import type { TimeSession, Workspace } from "./types";

const WEEK_START = "2026-06-29"; // Monday

function session(startedAt: string, minutes: number): TimeSession {
  return {
    id: `s-${startedAt}`,
    taskId: "t1",
    startedAt,
    endedAt: startedAt,
    durationMinutes: minutes,
    mode: "timer",
    note: "",
    pomodoroCycleId: null,
  };
}

describe("weekly review", () => {
  it("resolves the week start for both week-start settings", () => {
    const tuesday = new Date(2026, 5, 30);
    expect(weekStartKey(tuesday, 1)).toBe("2026-06-29");
    expect(weekStartKey(tuesday, 7)).toBe("2026-06-28");
  });

  it("aggregates the week and computes a bounded score", () => {
    const habit = createChecklistTemplate({ title: "Английский", cadence: "daily", isHabit: true });
    const workspace: Workspace = {
      ...createStarterWorkspace(),
      checklistTemplates: [habit],
      sessions: [session("2026-06-29T10:00:00.000Z", 45), session("2026-07-10T10:00:00.000Z", 30)],
      tasks: [
        { ...createTask({ title: "Готово в неделю" }), completedAt: "2026-06-30T12:00:00.000Z" },
        { ...createTask({ title: "Готово вне недели" }), completedAt: "2026-07-20T12:00:00.000Z" },
      ],
      checklist: [
        { ...createChecklistItem({ title: "A", day: "2026-06-29", templateId: habit.id }), done: true, doneAt: "2026-06-29T09:00:00.000Z" },
        createChecklistItem({ title: "B", day: "2026-06-29" }),
        { ...createChecklistItem({ title: "C", day: "2026-07-01" }), done: true, doneAt: "2026-07-01T09:00:00.000Z" },
      ],
    };

    const review = buildWeeklyReview(workspace, WEEK_START);

    expect(review.end).toBe("2026-07-05");
    expect(review.totalMinutes).toBe(45);
    expect(review.sessionCount).toBe(1);
    expect(review.tasksCompleted).toBe(1);
    expect(review.checklistPlanned).toBe(3);
    expect(review.checklistDone).toBe(2);
    expect(review.habitsScheduled).toBe(1);
    expect(review.habitsDone).toBe(1);
    expect(review.activeDays).toBe(2);
    expect(review.perDay).toHaveLength(7);
    expect(review.score).toBe(61);
  });

  it("factors a weekly time goal into the score", () => {
    const base = createStarterWorkspace();
    const withGoal = (goalMinutes: number): Workspace => ({
      ...base,
      settings: { ...base.settings, weeklyTimeGoalMinutes: goalMinutes },
      sessions: [session("2026-06-29T10:00:00.000Z", 60)],
    });

    const met = buildWeeklyReview(withGoal(60), WEEK_START);
    const missed = buildWeeklyReview(withGoal(600), WEEK_START);

    expect(met.goalMinutes).toBe(60);
    expect(met.score).toBeGreaterThan(missed.score);
  });

  it("compares the week with the previous one and the trailing average", () => {
    const workspace: Workspace = {
      ...createStarterWorkspace(),
      sessions: [
        session("2026-06-29T10:00:00.000Z", 120), // текущая неделя
        session("2026-06-30T10:00:00.000Z", 60),
        session("2026-06-22T10:00:00.000Z", 90), // прошлая
        session("2026-06-15T10:00:00.000Z", 30), // позапрошлая
      ],
      tasks: [{ ...createTask({ title: "Закрыта" }), completedAt: "2026-06-29T12:00:00.000Z" }],
    };

    const trends = buildReviewTrends(workspace, WEEK_START);
    expect(trends.deltaMinutes).toBe(180 - 90);
    expect(trends.deltaTasksCompleted).toBe(1);
    // Среднее по двум непустым прошлым неделям: (90 + 30) / 2 = 60 → +200%.
    expect(trends.minutesVsAveragePercent).toBe(200);
    // Лучший день — понедельник (120 мин), индекс 0 при weekStartsOn=1.
    expect(trends.bestDayIndex).toBe(0);
  });

  it("returns null averages without history and no best day for an empty week", () => {
    const empty = createStarterWorkspace();
    const trends = buildReviewTrends(empty, WEEK_START);
    expect(trends.minutesVsAveragePercent).toBeNull();
    expect(trends.bestDayIndex).toBeNull();
    expect(trends.deltaMinutes).toBe(0);
  });
});
