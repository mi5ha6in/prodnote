import { afterEach, describe, expect, it, vi } from "vitest";
import { ProdNoteStore } from "./state";

describe("ProdNoteStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates tasks, records manual sessions and timer sessions", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const task = await store.addTask({ title: "Проверить поток" });
    await store.addManualSession({
      taskId: task.id,
      startedAt: "2026-05-27T10:00:00.000Z",
      endedAt: "2026-05-27T10:45:00.000Z",
      note: "Ручная запись",
    });
    await store.startTimer(task.id);
    await store.stopTimer("Таймерная запись");

    expect(store.getWorkspace().tasks).toHaveLength(1);
    expect(store.getWorkspace().sessions).toHaveLength(2);
    expect(store.getWorkspace().sessions[0]?.mode).toBe("timer");
    expect(store.getWorkspace().sessions[1]?.durationMinutes).toBe(45);
  });

  it("records pomodoro focus and switches to break phase", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const task = await store.addTask({ title: "Помодоро" });
    await store.startPomodoro(task.id);
    await store.completePomodoroPhase("Фокус завершён");
    await store.completePomodoroPhase();

    expect(store.getWorkspace().pomodoroCycles).toHaveLength(1);
    expect(store.getWorkspace().pomodoroCycles[0]?.completedFocusCount).toBe(1);
    expect(store.getWorkspace().pomodoroCycles[0]?.completedShortBreakCount).toBe(1);
    expect(store.getWorkspace().pomodoroCycles[0]?.completedLongBreakCount).toBe(0);
    expect(store.getWorkspace().sessions[0]?.mode).toBe("pomodoro");
    expect(store.getActiveTimer()?.phase).toBe("focus");
  });

  it("caps overdue pomodoro focus sessions to the planned duration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T10:00:00.000Z"));

    const store = new ProdNoteStore();
    await store.init();

    const task = await store.addTask({ title: "Длинная помодоро-сессия" });
    await store.startPomodoro(task.id);
    vi.setSystemTime(new Date("2026-06-05T13:00:00.000Z"));
    await store.completePomodoroPhase();

    expect(store.getWorkspace().sessions[0]).toMatchObject({
      mode: "pomodoro",
      durationMinutes: 25,
      endedAt: "2026-06-05T10:25:00.000Z",
    });
  });

  it("does not count paused time in timer sessions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T10:00:00.000Z"));

    const store = new ProdNoteStore();
    await store.init();

    const task = await store.addTask({ title: "Таймер с паузой" });
    await store.startTimer(task.id);
    vi.setSystemTime(new Date("2026-06-05T10:10:00.000Z"));
    store.pauseActiveTimer();
    expect(store.getActiveTimer()?.pausedAt).toBe("2026-06-05T10:10:00.000Z");

    vi.setSystemTime(new Date("2026-06-05T11:10:00.000Z"));
    store.resumeActiveTimer();
    expect(store.getActiveTimer()?.pausedAt).toBeNull();

    vi.setSystemTime(new Date("2026-06-05T11:35:00.000Z"));
    await store.stopTimer("После паузы");

    expect(store.getWorkspace().sessions[0]).toMatchObject({
      mode: "timer",
      durationMinutes: 35,
      startedAt: "2026-06-05T10:00:00.000Z",
      endedAt: "2026-06-05T11:35:00.000Z",
    });
  });

  it("manages the daily checklist: add, toggle, rollover and promote", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const first = await store.addChecklistItem({ title: "Полить цветы", day: "2026-06-28" });
    await store.addChecklistItem({ title: "Прочитать главу", day: "2026-06-28" });
    expect(store.getWorkspace().checklist).toHaveLength(2);
    expect(first?.order).toBe(0);

    // Empty titles are ignored.
    expect(await store.addChecklistItem({ title: "   ", day: "2026-06-28" })).toBeNull();

    await store.toggleChecklistItem(first!.id);
    const toggled = store.getWorkspace().checklist.find((item) => item.id === first!.id);
    expect(toggled?.done).toBe(true);
    expect(toggled?.doneAt).not.toBeNull();

    // Only the unfinished item carries over to the next day.
    const carried = await store.rolloverChecklist("2026-06-28", "2026-06-29");
    expect(carried).toBe(1);
    const nextDay = store.getWorkspace().checklist.filter((item) => item.day === "2026-06-29");
    expect(nextDay).toHaveLength(1);
    expect(nextDay[0]).toMatchObject({ title: "Прочитать главу", rolledFrom: "2026-06-28" });

    // Rollover is idempotent — re-running does not duplicate.
    expect(await store.rolloverChecklist("2026-06-28", "2026-06-29")).toBe(0);

    const task = await store.promoteChecklistItemToTask(nextDay[0]!.id);
    expect(task).not.toBeNull();
    expect(store.getWorkspace().tasks.find((item) => item.id === task!.id)?.title).toBe("Прочитать главу");
    expect(store.getWorkspace().checklist.find((item) => item.id === nextDay[0]!.id)?.taskId).toBe(task!.id);

    // Promoting again returns the same linked task instead of creating a new one.
    expect(await store.promoteChecklistItemToTask(nextDay[0]!.id)).toMatchObject({ id: task!.id });
    expect(store.getWorkspace().tasks).toHaveLength(1);

    await store.removeChecklistItem(first!.id);
    expect(store.getWorkspace().checklist.some((item) => item.id === first!.id)).toBe(false);
  });

  it("deletes projects without deleting linked tasks and notes", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const project = await store.addProject({ name: "Удаляемый проект" });
    const task = await store.addTask({ title: "Связанная задача", projectId: project.id });
    const note = await store.addNote({
      title: "Связанная заметка",
      markdown: "Контекст проекта",
      projectId: project.id,
    });

    await store.deleteProject(project.id);

    expect(store.getWorkspace().projects.some((item) => item.id === project.id)).toBe(false);
    expect(store.getWorkspace().tasks.find((item) => item.id === task.id)?.projectId).toBeNull();
    expect(store.getWorkspace().notes.find((item) => item.id === note.id)?.projectId).toBeNull();
  });

  it("updates notes and records edit save timestamp", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const note = await store.addNote({
      title: "Черновик",
      markdown: "Первый текст",
    });

    await store.updateNote({
      noteId: note.id,
      title: "Готовый конспект",
      markdown: "Обновленный текст",
    });

    const updated = store.getWorkspace().notes.find((item) => item.id === note.id);

    expect(updated?.title).toBe("Готовый конспект");
    expect(updated?.markdown).toBe("Обновленный текст");
    expect(updated?.editHistory).toHaveLength(1);
    expect(updated?.editHistory[0]?.editedAt).toBeTruthy();
  });
});
