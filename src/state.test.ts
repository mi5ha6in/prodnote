import { afterEach, describe, expect, it, vi } from "vitest";
import { dayKey } from "./domain/calendar";
import { presetToRule } from "./domain/recurrence";
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

  it("archives a template so it stops materializing, and unarchives it back", async () => {
    const store = new ProdNoteStore();
    await store.init();
    const today = dayKey(new Date());

    const template = await store.addChecklistTemplate({ title: "Растяжка", cadence: "daily" });
    await store.updateChecklistTemplate({ templateId: template!.id, archived: true });
    expect(store.getWorkspace().checklistTemplates[0]?.archived).toBe(true);

    // Архивный шаблон не материализуется в новый день.
    const materialized = store.getWorkspace().checklist.find((item) => item.templateId === template!.id);
    if (materialized) {
      await store.removeChecklistItem(materialized.id);
    }
    await store.ensureChecklistForDay(today);
    expect(store.getWorkspace().checklist.some((item) => item.templateId === template!.id)).toBe(false);

    await store.updateChecklistTemplate({ templateId: template!.id, archived: false });
    expect(store.getWorkspace().checklistTemplates[0]?.archived).toBe(false);
  });

  it("retro-marks a template day: creates a done item for a past day, toggles existing, ignores future", async () => {
    const store = new ProdNoteStore();
    await store.init();
    const today = dayKey(new Date());
    const pastDay = "2026-01-05";
    const futureDay = "2999-01-01";

    const template = await store.addChecklistTemplate({ title: "Чтение", cadence: "daily", targetCount: 2 });

    // Прошлый день: пункта нет — создаётся сразу выполненным, с целевым count.
    await store.toggleTemplateItemForDay(template!.id, pastDay);
    const created = store.getWorkspace().checklist.find(
      (item) => item.templateId === template!.id && item.day === pastDay,
    );
    expect(created?.done).toBe(true);
    expect(created?.count).toBe(2);
    expect(created?.doneAt).toBeTruthy();
    // Другие шаблоны в прошлый день не материализуются.
    expect(store.getWorkspace().checklist.filter((item) => item.day === pastDay)).toHaveLength(1);

    // Повторный клик по существующему пункту — обычный toggle (снимает отметку).
    await store.toggleTemplateItemForDay(template!.id, pastDay);
    expect(
      store.getWorkspace().checklist.find((item) => item.templateId === template!.id && item.day === pastDay)?.done,
    ).toBe(false);

    // Сегодняшний materialized пункт тоже переключается, а не дублируется.
    const before = store.getWorkspace().checklist.filter((item) => item.day === today).length;
    await store.toggleTemplateItemForDay(template!.id, today);
    expect(store.getWorkspace().checklist.filter((item) => item.day === today)).toHaveLength(before);
    expect(
      store.getWorkspace().checklist.find((item) => item.templateId === template!.id && item.day === today)?.done,
    ).toBe(true);

    // Будущие дни игнорируются.
    await store.toggleTemplateItemForDay(template!.id, futureDay);
    expect(store.getWorkspace().checklist.some((item) => item.day === futureDay)).toBe(false);
  });

  it("reassigns a task's project and reschedules its due date without touching other fields", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const project = await store.addProject({ name: "Ревью", color: "#123456", description: "" });
    const task = await store.addTask({ title: "Разобрать", description: "тело", dueDate: "2026-06-01" });

    await store.assignTaskProject(task.id, project.id);
    let updated = store.getWorkspace().tasks.find((item) => item.id === task.id);
    expect(updated?.projectId).toBe(project.id);
    expect(updated?.dueDate).toBe("2026-06-01");

    await store.rescheduleTask(task.id, "2026-07-09");
    updated = store.getWorkspace().tasks.find((item) => item.id === task.id);
    expect(updated?.dueDate).toBe("2026-07-09");
    expect(updated?.title).toBe("Разобрать");

    await store.rescheduleTask(task.id, null);
    expect(store.getWorkspace().tasks.find((item) => item.id === task.id)?.dueDate).toBeNull();

    await store.assignTaskProject(task.id, null);
    expect(store.getWorkspace().tasks.find((item) => item.id === task.id)?.projectId).toBeNull();
  });

  it("steps quantity habits by count and flips done at the daily target", async () => {
    const store = new ProdNoteStore();
    await store.init();
    const template = await store.addChecklistTemplate({ title: "Вода", isHabit: true, targetCount: 3 });
    const today = dayKey(new Date());
    await store.ensureChecklistForDay(today);
    const item = store.getWorkspace().checklist.find((entry) => entry.templateId === template!.id && entry.day === today);
    expect(item).toBeTruthy();

    await store.incrementChecklistItem(item!.id, 1);
    await store.incrementChecklistItem(item!.id, 1);
    let current = store.getWorkspace().checklist.find((entry) => entry.id === item!.id);
    expect(current?.count).toBe(2);
    expect(current?.done).toBe(false);

    await store.incrementChecklistItem(item!.id, 1);
    current = store.getWorkspace().checklist.find((entry) => entry.id === item!.id);
    expect(current?.done).toBe(true);
    expect(current?.doneAt).toBeTruthy();

    await store.incrementChecklistItem(item!.id, -1);
    current = store.getWorkspace().checklist.find((entry) => entry.id === item!.id);
    expect(current?.done).toBe(false);
    expect(current?.count).toBe(2);
  });

  it("reorders kanban tasks and moves them across columns keeping manual order", async () => {
    const store = new ProdNoteStore();
    await store.init();
    const a = await store.addTask({ title: "A" });
    const b = await store.addTask({ title: "B" });
    const c = await store.addTask({ title: "C" });
    // Новые добавляются наверх: порядок в бэклоге C, B, A.

    const backlog = () =>
      store
        .getWorkspace()
        .tasks.filter((task) => task.status === "backlog")
        .sort((x, y) => x.boardOrder - y.boardOrder)
        .map((task) => task.title);
    expect(backlog()).toEqual(["C", "B", "A"]);

    // A перед C → A, C, B.
    await store.reorderTask(a.id, "backlog", c.id);
    expect(backlog()).toEqual(["A", "C", "B"]);

    // B в конец другой колонки со сменой статуса.
    await store.reorderTask(b.id, "active", null);
    expect(backlog()).toEqual(["A", "C"]);
    expect(store.getWorkspace().tasks.find((task) => task.id === b.id)?.status).toBe("active");
  });

  it("reconciles ICS subscription events: upsert by uid, drop vanished, keep manual", async () => {
    const store = new ProdNoteStore();
    await store.init();
    const manual = await store.addEvent({
      title: "Ручное",
      startsAt: "2026-07-03T10:00:00",
      endsAt: "2026-07-03T11:00:00",
    });

    const first = await store.syncSubscribedEvents("sub1", [
      { title: "Встреча A", startsAt: "2026-07-03T12:00:00", endsAt: "2026-07-03T13:00:00", allDay: false, externalUid: "a" },
      { title: "Встреча B", startsAt: "2026-07-04T12:00:00", endsAt: "2026-07-04T13:00:00", allDay: false, externalUid: "b" },
    ]);
    expect(first).toEqual({ imported: 2, removed: 0 });
    expect(store.getWorkspace().events).toHaveLength(3);

    const second = await store.syncSubscribedEvents("sub1", [
      { title: "Встреча A (новое время)", startsAt: "2026-07-03T14:00:00", endsAt: "2026-07-03T15:00:00", allDay: false, externalUid: "a" },
    ]);
    expect(second.removed).toBe(1);

    const events = store.getWorkspace().events;
    expect(events).toHaveLength(2);
    expect(events.some((event) => event.id === manual.id)).toBe(true);
    const updated = events.find((event) => event.externalUid === "ics-sub:sub1:a");
    expect(updated?.title).toBe("Встреча A (новое время)");
    expect(updated?.startsAt).toBe("2026-07-03T14:00:00");
  });

  it("appends reflections to a per-day journal note, creating it once", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const first = await store.appendToDayNote("2026-07-02", "Утро прошло в фокусе.");
    expect(first?.title).toBe("День 02.07.2026");
    expect(first?.dayKey).toBe("2026-07-02");

    const second = await store.appendToDayNote("2026-07-02", "Вечером закрыл хвосты.");
    expect(second?.id).toBe(first?.id);
    expect(second?.markdown).toBe("Утро прошло в фокусе.\n\nВечером закрыл хвосты.");
    // Запись через updateNote — история правок растёт.
    expect(second?.editHistory.length).toBe(1);

    expect(await store.appendToDayNote("2026-07-02", "   ")).toBeNull();
    expect(store.getWorkspace().notes.filter((note) => note.dayKey === "2026-07-02")).toHaveLength(1);
  });

  it("extracts unchecked note checkboxes into linked inbox tasks without duplicates", async () => {
    const store = new ProdNoteStore();
    await store.init();
    await store.addTask({ title: "Уже есть" });
    const note = await store.addNote({
      title: "План встречи",
      markdown: "- [ ] Написать протокол\n- [x] Сделано\n- [ ] Уже есть",
    });

    const created = await store.extractTasksFromNote(note.id);
    expect(created.map((task) => task.title)).toEqual(["Написать протокол"]);

    const updatedNote = store.getWorkspace().notes.find((item) => item.id === note.id);
    expect(updatedNote?.linkedTaskIds).toContain(created[0]?.id);

    // Повторное извлечение не плодит дубли.
    expect(await store.extractTasksFromNote(note.id)).toHaveLength(0);
  });

  it("plans a task for a day and sets its estimate independently", async () => {
    const store = new ProdNoteStore();
    await store.init();
    const task = await store.addTask({ title: "Планируемая" });

    await store.planTaskForDay(task.id, "2026-07-02");
    let updated = store.getWorkspace().tasks.find((item) => item.id === task.id);
    expect(updated?.plannedAt).toBe("2026-07-02T00:00:00");

    await store.setTaskEstimate(task.id, 90);
    updated = store.getWorkspace().tasks.find((item) => item.id === task.id);
    expect(updated?.estimateMinutes).toBe(90);
    expect(updated?.plannedAt).toBe("2026-07-02T00:00:00");

    await store.setTaskEstimate(task.id, 0);
    expect(store.getWorkspace().tasks.find((item) => item.id === task.id)?.estimateMinutes).toBeNull();

    await store.planTaskForDay(task.id, null);
    expect(store.getWorkspace().tasks.find((item) => item.id === task.id)?.plannedAt).toBeNull();
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

  it("spawns the next occurrence when a recurring task with a deadline is completed", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const task = await store.addTask({
      title: "Полить цветы",
      dueDate: "2026-07-01",
      recurrence: presetToRule("daily"),
    });
    await store.addSubtask(task.id, "Взять лейку");

    const before = store.getWorkspace().tasks.length;
    await store.updateTaskStatus(task.id, "done");

    const next = store.getWorkspace().tasks.find((item) => item.id !== task.id && item.recurrenceParentId === task.id);
    expect(store.getWorkspace().tasks.length).toBe(before + 1);
    expect(next?.dueDate).toBe("2026-07-02");
    expect(next?.status).toBe("backlog");
    expect(next?.recurrence).not.toBeNull();
    expect(next?.subtasks).toHaveLength(1);
    expect(next?.subtasks[0]?.done).toBe(false);

    // Completing again must not duplicate the next occurrence.
    await store.updateTaskStatus(task.id, "done");
    expect(store.getWorkspace().tasks.length).toBe(before + 1);
  });

  it("does not spawn a next occurrence without both recurrence and a deadline", async () => {
    const store = new ProdNoteStore();
    await store.init();

    const noRule = await store.addTask({ title: "Обычная", dueDate: "2026-07-01" });
    const noDue = await store.addTask({ title: "Без дедлайна", recurrence: presetToRule("daily") });
    const before = store.getWorkspace().tasks.length;

    await store.updateTaskStatus(noRule.id, "done");
    await store.updateTaskStatus(noDue.id, "done");

    expect(store.getWorkspace().tasks.length).toBe(before);
  });
});
