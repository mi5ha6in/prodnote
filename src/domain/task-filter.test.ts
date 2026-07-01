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
    expect(filterAndSortTasks(pool, criteria({ projectId: "none" }), [project]).map((t) => t.id)).toEqual(
      [noProject, tagged, highDone].map((t) => t.id),
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
  });
});
