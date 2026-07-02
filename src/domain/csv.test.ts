import { describe, expect, it } from "vitest";
import { sessionsToCsv } from "./csv";
import { createProject, createTask } from "./defaults";
import type { TimeSession } from "./types";

function session(overrides: Partial<TimeSession>): TimeSession {
  return {
    id: "s1",
    taskId: "t1",
    startedAt: "2026-07-02T10:00:00.000Z",
    endedAt: "2026-07-02T10:45:00.000Z",
    durationMinutes: 45,
    mode: "timer",
    note: "",
    pomodoroCycleId: null,
    ...overrides,
  };
}

describe("sessionsToCsv", () => {
  it("emits header and rows oldest-first with task and project names", () => {
    const project = createProject({ name: "Клиент А" });
    const task = { ...createTask({ title: "Правки" }), projectId: project.id };
    const csv = sessionsToCsv(
      [
        session({ id: "s2", taskId: task.id, startedAt: "2026-07-02T12:00:00.000Z", endedAt: "2026-07-02T12:30:00.000Z", durationMinutes: 30 }),
        session({ id: "s1", taskId: task.id }),
      ],
      [task],
      [project],
    );

    const lines = csv.split("\n");
    expect(lines[0]).toBe("Дата,Начало,Конец,Минуты,Режим,Задача,Проект,Заметка");
    expect(lines[1]).toContain("10:00");
    expect(lines[2]).toContain("12:00");
    expect(lines[1]).toContain("Правки");
    expect(lines[1]).toContain("Клиент А");
  });

  it("quotes cells with commas, quotes and newlines", () => {
    const task = createTask({ title: 'Задача, со "сложным" именем' });
    const csv = sessionsToCsv([session({ taskId: task.id, note: "строка1\nстрока2" })], [task], []);
    expect(csv).toContain('"Задача, со ""сложным"" именем"');
    expect(csv).toContain('"строка1\nстрока2"');
  });

  it("marks sessions of deleted tasks", () => {
    const csv = sessionsToCsv([session({ taskId: "missing" })], [], []);
    expect(csv).toContain("Удалённая задача");
  });
});
