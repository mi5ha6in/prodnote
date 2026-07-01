import { afterEach, describe, expect, it, vi } from "vitest";
import { dayKey } from "./domain/calendar";
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

  it("renames and reorders checklist items", async () => {
    const store = new ProdNoteStore();
    await store.init();
    const day = "2026-06-29";

    const a = await store.addChecklistItem({ title: "A", day });
    const b = await store.addChecklistItem({ title: "B", day });
    const c = await store.addChecklistItem({ title: "C", day });
    const find = (id: string) => store.getWorkspace().checklist.find((item) => item.id === id);

    await store.reorderChecklist(day, [c!.id, a!.id, b!.id]);
    expect(find(c!.id)?.order).toBe(0);
    expect(find(a!.id)?.order).toBe(1);
    expect(find(b!.id)?.order).toBe(2);

    await store.renameChecklistItem(a!.id, "A-renamed");
    expect(find(a!.id)?.title).toBe("A-renamed");

    await store.renameChecklistItem(a!.id, "   ");
    expect(find(a!.id)?.title).toBe("A-renamed");
  });

  it("materializes recurring templates into the current day without duplicates", async () => {
    const store = new ProdNoteStore();
    await store.init();
    const today = dayKey(new Date());

    const template = await store.addChecklistTemplate({ title: "Зарядка", cadence: "daily", isHabit: true });
    expect(template).not.toBeNull();

    const todays = store.getWorkspace().checklist.filter((item) => item.day === today);
    expect(todays.some((item) => item.templateId === template!.id && item.title === "Зарядка")).toBe(true);

    const before = store.getWorkspace().checklist.length;
    await store.ensureChecklistForDay(today);
    expect(store.getWorkspace().checklist.length).toBe(before);

    await store.removeChecklistTemplate(template!.id);
    expect(store.getWorkspace().checklistTemplates).toHaveLength(0);
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

  it("deletes a task with its sessions and cycles and unlinks checklist items and events", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const task = await store.addTask({ title: "Удаляемая задача" });
    await store.addManualSession({
      taskId: task.id,
      startedAt: "2026-06-05T10:00:00.000Z",
      endedAt: "2026-06-05T10:30:00.000Z",
    });
    await store.addSubtask(task.id, "Подзадача");
    await store.addTaskHistory(task.id, "Прогресс", "progress");
    const checklistItem = await store.addChecklistItem({
      title: "Связанный пункт",
      day: "2026-06-05",
      taskId: task.id,
    });
    const event = await store.addEvent({
      title: "Связанное событие",
      startsAt: "2026-06-05T12:00:00.000Z",
      endsAt: "2026-06-05T13:00:00.000Z",
      taskId: task.id,
    });
    await store.startPomodoro(task.id);

    expect(store.getWorkspace().sessions).toHaveLength(1);
    expect(store.getWorkspace().pomodoroCycles).toHaveLength(1);

    await store.deleteTask(task.id);

    expect(store.getWorkspace().tasks.some((entry) => entry.id === task.id)).toBe(false);
    expect(store.getWorkspace().sessions).toHaveLength(0);
    expect(store.getWorkspace().pomodoroCycles).toHaveLength(0);
    expect(store.getActiveTimer()).toBeNull();
    expect(store.getWorkspace().checklist.find((entry) => entry.id === checklistItem!.id)?.taskId).toBeNull();
    expect(store.getWorkspace().events.find((entry) => entry.id === event.id)?.taskId).toBeNull();
  });

  it("deletes a tag and strips it from tasks and notes", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const tag = await store.addTag({ name: "фокус" });
    const task = await store.addTask({ title: "Задача с тегом", tagIds: [tag.id] });
    const note = await store.addNote({ title: "Заметка с тегом", markdown: "текст", tagIds: [tag.id] });

    await store.deleteTag(tag.id);

    expect(store.getWorkspace().tags.some((item) => item.id === tag.id)).toBe(false);
    expect(store.getWorkspace().tasks.find((item) => item.id === task.id)?.tagIds).toEqual([]);
    expect(store.getWorkspace().notes.find((item) => item.id === note.id)?.tagIds).toEqual([]);
  });

  it("updates a project's name, color and description", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const project = await store.addProject({ name: "Старое имя", color: "#111111" });
    await store.updateProject({
      projectId: project.id,
      name: "Новое имя",
      color: "#222222",
      description: "Описание",
    });

    const updated = store.getWorkspace().projects.find((item) => item.id === project.id);
    expect(updated).toMatchObject({ name: "Новое имя", color: "#222222", description: "Описание" });
  });

  it("updates a tag's name and color", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const tag = await store.addTag({ name: "старый", color: "#111111" });
    await store.updateTag({ tagId: tag.id, name: "новый", color: "#333333" });

    const updated = store.getWorkspace().tags.find((item) => item.id === tag.id);
    expect(updated).toMatchObject({ name: "новый", color: "#333333" });
  });

  it("deletes a note", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const note = await store.addNote({ title: "Удаляемая заметка", markdown: "текст" });
    await store.deleteNote(note.id);

    expect(store.getWorkspace().notes.some((item) => item.id === note.id)).toBe(false);
  });
});
