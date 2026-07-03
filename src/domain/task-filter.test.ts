import { describe, expect, it } from "vitest";
import { createProject, createTask } from "./defaults";
import { DEFAULT_TASK_FILTER, filterAndSortTasks, isTaskFilterActive, type TaskFilterCriteria } from "./task-filter";
import type { Task } from "./types";

function makeTask(overrides: Partial<Task> & { title: string }): Task {
  return { ...createTask({ title: overrides.title }), ...overrides };
}

function criteria(partial: Partial<TaskFilterCriteria>): TaskFilterCriteria {
  return { ...DEFAULT_TASK_FILTER, ...partial };
}

describe("filterAndSortTasks", () => {
  it("matches search across title, description, history and subtasks (AND terms)", () => {
    const byTitle = makeTask({ title: "Написать конспект" });
    const byDescription = makeTask({ title: "Задача", description: "Изучить конспект по теме" });
    const byHistory = makeTask({
      title: "Другая",
      history: [{ id: "h1", at: "", kind: "note", markdown: "конспект готов" }],
    });
    const bySubtask = makeTask({ title: "Ещё", subtasks: [{ id: "s1", title: "собрать конспект", done: false }] });
    const noMatch = makeTask({ title: "Прогулка" });
    const tasks = [byTitle, byDescription, byHistory, bySubtask, noMatch];

    const matched = filterAndSortTasks(tasks, criteria({ search: "конспект" }), []).map((task) => task.id);
    expect(matched.sort()).toEqual([byTitle, byDescription, byHistory, bySubtask].map((task) => task.id).sort());

    // Every term must match.
    expect(filterAndSortTasks(tasks, criteria({ search: "конспект прогулка" }), [])).toHaveLength(0);
  });

  it("filters by project (specific and none), tag, priority and status", () => {
    const project = createProject({ name: "Проект" });
    const inProject = makeTask({ title: "A", projectId: project.id });
    const noProject = makeTask({ title: "B", projectId: null });
    const tagged = makeTask({ title: "C", tagIds: ["tag1"] });
    const highDone = makeTask({ title: "D", priority: "high", status: "done" });
    const pool = [inProject, noProject, tagged, highDone];

    expect(filterAndSortTasks(pool, criteria({ projectId: project.id }), [project]).map((t) => t.id)).toEqual([inProject.id]);
    // Порядок при равных createdAt недетерминирован — сравниваем состав, а не порядок.
    expect(filterAndSortTasks(pool, criteria({ projectId: "none" }), [project]).map((t) => t.id).sort()).toEqual(
      [noProject, tagged, highDone].map((t) => t.id).sort(),
    );
    expect(filterAndSortTasks(pool, criteria({ tagId: "tag1" }), []).map((t) => t.id)).toEqual([tagged.id]);
    expect(filterAndSortTasks(pool, criteria({ priority: "high" }), []).map((t) => t.id)).toEqual([highDone.id]);
    expect(filterAndSortTasks(pool, criteria({ status: "done" }), []).map((t) => t.id)).toEqual([highDone.id]);
  });

  it("sorts by due date (nulls last), priority, title and created", () => {
    const a = makeTask({ title: "Бета", priority: "low", dueDate: "2026-02-01", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = makeTask({ title: "Альфа", priority: "high", dueDate: null, createdAt: "2026-01-03T00:00:00.000Z" });
    const c = makeTask({ title: "Гамма", priority: "medium", dueDate: "2026-01-15", createdAt: "2026-01-02T00:00:00.000Z" });
    const tasks = [a, b, c];

    expect(filterAndSortTasks(tasks, criteria({ sort: "due" }), []).map((t) => t.id)).toEqual([c.id, a.id, b.id]);
    expect(filterAndSortTasks(tasks, criteria({ sort: "priority" }), []).map((t) => t.id)).toEqual([b.id, c.id, a.id]);
    expect(filterAndSortTasks(tasks, criteria({ sort: "title" }), []).map((t) => t.id)).toEqual([b.id, a.id, c.id]);
    expect(filterAndSortTasks(tasks, criteria({ sort: "created" }), []).map((t) => t.id)).toEqual([b.id, c.id, a.id]);
  });

  it("sorts by project name with no-project tasks last", () => {
    const beta = createProject({ name: "Бета" });
    const alpha = createProject({ name: "Альфа" });
    const t1 = makeTask({ title: "1", projectId: beta.id });
    const t2 = makeTask({ title: "2", projectId: alpha.id });
    const t3 = makeTask({ title: "3", projectId: null });

    const result = filterAndSortTasks([t1, t2, t3], criteria({ sort: "project" }), [beta, alpha]);
    expect(result.map((t) => t.id)).toEqual([t2.id, t1.id, t3.id]);
  });

  it("does not mutate the input array", () => {
    const a = makeTask({ title: "A", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = makeTask({ title: "B", createdAt: "2026-01-02T00:00:00.000Z" });
    const tasks = [a, b];
    const snapshot = [...tasks];

    filterAndSortTasks(tasks, criteria({ sort: "title" }), []);
    expect(tasks).toEqual(snapshot);
  });

  it("flags active filters but not sort-only criteria", () => {
    expect(isTaskFilterActive(DEFAULT_TASK_FILTER)).toBe(false);
    expect(isTaskFilterActive(criteria({ sort: "due" }))).toBe(false);
    expect(isTaskFilterActive(criteria({ search: "x" }))).toBe(true);
    expect(isTaskFilterActive(criteria({ status: "done" }))).toBe(true);
    expect(isTaskFilterActive(criteria({ smartList: "today" }))).toBe(true);
  });

  describe("smart lists", () => {
    const now = new Date("2026-07-02T12:00:00");

    it("today includes tasks due today and overdue, skips done and undated", () => {
      const dueToday = makeTask({ title: "Сегодня", dueDate: "2026-07-02" });
      const overdue = makeTask({ title: "Просрочена", dueDate: "2026-06-30" });
      const future = makeTask({ title: "Позже", dueDate: "2026-07-03" });
      const done = makeTask({ title: "Готова", dueDate: "2026-07-02", status: "done" });
      const undated = makeTask({ title: "Без даты" });
      const pool = [dueToday, overdue, future, done, undated];

      const matched = filterAndSortTasks(pool, criteria({ smartList: "today" }), [], now).map((t) => t.id);
      expect(matched.sort()).toEqual([dueToday.id, overdue.id].sort());
    });

    it("today and week include tasks planned for the day even without a deadline", () => {
      const plannedToday = makeTask({ title: "План на сегодня", plannedAt: "2026-07-02T00:00:00" });
      const plannedThisWeek = makeTask({ title: "План на неделе", plannedAt: "2026-07-05T00:00:00" });
      const plannedPast = makeTask({ title: "План во вчера", plannedAt: "2026-07-01T00:00:00" });
      const pool = [plannedToday, plannedThisWeek, plannedPast];

      const today = filterAndSortTasks(pool, criteria({ smartList: "today" }), [], now).map((t) => t.id);
      expect(today).toEqual([plannedToday.id]);

      const week = filterAndSortTasks(pool, criteria({ smartList: "week" }), [], now).map((t) => t.id);
      expect(week.sort()).toEqual([plannedToday.id, plannedThisWeek.id].sort());
    });

    it("overdue stays deadline-only: a past plan slot is not overdue", () => {
      const plannedPast = makeTask({ title: "План во вчера", plannedAt: "2026-07-01T00:00:00" });
      const duePast = makeTask({ title: "Дедлайн вчера", dueDate: "2026-07-01" });
      const pool = [plannedPast, duePast];

      const overdueOnly = filterAndSortTasks(pool, criteria({ smartList: "overdue" }), [], now).map((t) => t.id);
      expect(overdueOnly).toEqual([duePast.id]);
    });

    it("week spans the next 7 days inclusive, overdue is strictly before today", () => {
      const overdue = makeTask({ title: "Вчера", dueDate: "2026-07-01" });
      const today = makeTask({ title: "Сегодня", dueDate: "2026-07-02" });
      const lastDay = makeTask({ title: "Через 6 дней", dueDate: "2026-07-08" });
      const beyond = makeTask({ title: "Через 7 дней", dueDate: "2026-07-09" });
      const pool = [overdue, today, lastDay, beyond];

      const week = filterAndSortTasks(pool, criteria({ smartList: "week" }), [], now).map((t) => t.id);
      expect(week.sort()).toEqual([overdue.id, today.id, lastDay.id].sort());

      const overdueOnly = filterAndSortTasks(pool, criteria({ smartList: "overdue" }), [], now).map((t) => t.id);
      expect(overdueOnly).toEqual([overdue.id]);
    });

    it("inbox collects tasks without a project or in the «Входящие» project, skips done", () => {
      const inbox = createProject({ name: "Входящие" });
      const other = createProject({ name: "Работа" });
      const noProject = makeTask({ title: "A", projectId: null });
      const inInbox = makeTask({ title: "B", projectId: inbox.id });
      const inOther = makeTask({ title: "C", projectId: other.id });
      const doneNoProject = makeTask({ title: "D", projectId: null, status: "done" });
      const pool = [noProject, inInbox, inOther, doneNoProject];

      const matched = filterAndSortTasks(pool, criteria({ smartList: "inbox" }), [inbox, other], now).map((t) => t.id);
      expect(matched.sort()).toEqual([noProject.id, inInbox.id].sort());
    });
  });
});
