import { describe, expect, it } from "vitest";
import { parseQuickAdd, type QuickAddContext } from "./quick-add";

// 2026-07-01 is a Wednesday.
const NOW = new Date(2026, 6, 1);

const context: QuickAddContext = {
  projects: [{ id: "p1", name: "Дом" }],
  tags: [
    { id: "t1", name: "срочно" },
    { id: "t2", name: "чтение" },
  ],
  now: NOW,
};

describe("parseQuickAdd", () => {
  it("returns the plain title when there are no tokens", () => {
    expect(parseQuickAdd("Просто задача", context)).toEqual({
      title: "Просто задача",
      dueDate: null,
      priority: null,
      projectId: null,
      tagIds: [],
    });
  });

  it("extracts priority, project and tags", () => {
    expect(parseQuickAdd("Позвонить !высокий", context)).toMatchObject({ title: "Позвонить", priority: "high" });
    expect(parseQuickAdd("#Дом помыть посуду", context)).toMatchObject({ title: "помыть посуду", projectId: "p1" });
    expect(parseQuickAdd("отчёт @срочно @чтение", context)).toMatchObject({ title: "отчёт", tagIds: ["t1", "t2"] });
    // #name falls back to a tag when no project matches.
    expect(parseQuickAdd("#срочно отчёт", context)).toMatchObject({ title: "отчёт", tagIds: ["t1"] });
  });

  it("parses relative and named dates", () => {
    expect(parseQuickAdd("Купить молоко завтра", context)).toMatchObject({ title: "Купить молоко", dueDate: "2026-07-02" });
    expect(parseQuickAdd("Отдохнуть сегодня", context)).toMatchObject({ dueDate: "2026-07-01" });
    expect(parseQuickAdd("Отчёт через 3 дня", context)).toMatchObject({ title: "Отчёт", dueDate: "2026-07-04" });
    expect(parseQuickAdd("План через неделю", context)).toMatchObject({ dueDate: "2026-07-08" });
    // Wednesday -> next Monday.
    expect(parseQuickAdd("Встреча пн", context)).toMatchObject({ title: "Встреча", dueDate: "2026-07-06" });
  });

  it("parses explicit dates and rolls bare past dates into next year", () => {
    expect(parseQuickAdd("Дедлайн 15.08", context)).toMatchObject({ dueDate: "2026-08-15" });
    expect(parseQuickAdd("Оплатить 15.06", context)).toMatchObject({ dueDate: "2027-06-15" });
    expect(parseQuickAdd("Годовщина 20.09.2027", context)).toMatchObject({ dueDate: "2027-09-20" });
  });

  it("combines several tokens and keeps the remaining title", () => {
    const result = parseQuickAdd("Купить #Дом молоко завтра !высокий @срочно", context);
    expect(result).toEqual({
      title: "Купить молоко",
      dueDate: "2026-07-02",
      priority: "high",
      projectId: "p1",
      tagIds: ["t1"],
    });
  });

  it("keeps unknown markers as plain words", () => {
    expect(parseQuickAdd("#неизвестно задача", context)).toMatchObject({ title: "неизвестно задача", projectId: null });
  });
});
