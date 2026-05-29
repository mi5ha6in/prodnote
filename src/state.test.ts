import { describe, expect, it } from "vitest";
import { ProdNoteStore } from "./state";

describe("ProdNoteStore", () => {
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
