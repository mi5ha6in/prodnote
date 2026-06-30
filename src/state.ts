import { dayKey } from "./domain/calendar";
import { materializeTemplates, shiftDayKey } from "./domain/checklist";
import {
  createCalendarEvent,
  createChecklistItem,
  createChecklistTemplate,
  createId,
  createNote,
  createProject,
  createStarterWorkspace,
  createTag,
  createTask,
  nowIso,
} from "./domain/defaults";
import {
  getActiveTimerDurationMinutes,
  getActiveTimerEndedAtIso,
  getPomodoroFocusDurationMinutes,
  getPomodoroFocusEndedAtIso,
} from "./domain/active-timer";
import {
  addMinutesIso,
  completeBreakPhase,
  completeFocusRound,
  createPomodoroCycle,
  getNextBreakPhase,
  getPhaseDurationMinutes,
} from "./domain/pomodoro";
import type {
  ActiveTimer,
  CalendarEvent,
  CalendarEventKind,
  ChecklistCadence,
  ChecklistItem,
  ChecklistTemplate,
  EntityId,
  Note,
  Project,
  Settings,
  Tag,
  Task,
  TaskHistoryEntry,
  TaskPriority,
  TaskStatus,
  TimeSession,
  Workspace,
} from "./domain/types";
import { clearActiveTimer, isActiveTimerStorageEvent, loadActiveTimer, saveActiveTimer } from "./storage/active-timer";
import { loadWorkspace, replaceWorkspace, saveWorkspace } from "./storage/idb";
import {
  pullRemoteWorkspace,
  queueWorkspacePush,
  recordSyncDeletion,
  refreshSyncSession,
  syncNow as syncWorkspaceNow,
} from "./sync/client";

type Listener = () => void;

export class ProdNoteStore {
  private workspace: Workspace = createStarterWorkspace();
  private activeTimer: ActiveTimer | null = null;
  private listeners = new Set<Listener>();
  private initialized = false;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (event) => {
        if (!isActiveTimerStorageEvent(event)) {
          return;
        }

        this.activeTimer = loadActiveTimer(this.workspace);
        this.emit();
      });
    }
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.workspace = await loadWorkspace();
    this.activeTimer = loadActiveTimer(this.workspace);
    this.initialized = true;
    await this.prepareToday();
    this.emit();
    void this.pullRemoteWorkspace();
  }

  /** Carry unfinished items from yesterday and materialize today's recurring templates. */
  private async prepareToday(): Promise<void> {
    const today = dayKey(new Date());
    await this.rolloverChecklist(shiftDayKey(today, -1), today);
    await this.ensureChecklistForDay(today);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getWorkspace(): Workspace {
    return this.workspace;
  }

  getActiveTimer(): ActiveTimer | null {
    return this.activeTimer;
  }

  async addProject(input: { name: string; color?: string; description?: string }): Promise<Project> {
    const project = createProject(input);
    await this.commit((workspace) => {
      workspace.projects.unshift(project);
    });
    return project;
  }

  async deleteProject(projectId: EntityId): Promise<void> {
    await this.commit((workspace) => {
      workspace.projects = workspace.projects.filter((project) => project.id !== projectId);

      for (const task of workspace.tasks) {
        if (task.projectId === projectId) {
          task.projectId = null;
          task.updatedAt = nowIso();
        }
      }

      for (const note of workspace.notes) {
        if (note.projectId === projectId) {
          note.projectId = null;
          note.updatedAt = nowIso();
        }
      }
    });
    recordSyncDeletion("project", projectId);
  }

  async addTag(input: { name: string; color?: string }): Promise<Tag> {
    const tag = createTag(input);
    await this.commit((workspace) => {
      workspace.tags.push(tag);
    });
    return tag;
  }

  async addTask(input: {
    title: string;
    description?: string;
    projectId?: string | null;
    dueDate?: string | null;
    priority?: TaskPriority;
    tagIds?: string[];
  }): Promise<Task> {
    const task = createTask(input);
    await this.commit((workspace) => {
      workspace.tasks.unshift(task);
    });
    return task;
  }

  async addChecklistItem(input: { title: string; day: string; taskId?: string | null }): Promise<ChecklistItem | null> {
    const trimmed = input.title.trim();
    if (!trimmed) {
      return null;
    }

    const nextOrder =
      this.workspace.checklist
        .filter((item) => item.day === input.day)
        .reduce((max, item) => Math.max(max, item.order), -1) + 1;
    const item = createChecklistItem({
      title: trimmed,
      day: input.day,
      order: nextOrder,
      taskId: input.taskId ?? null,
    });

    await this.commit((workspace) => {
      workspace.checklist.push(item);
    });
    return item;
  }

  async toggleChecklistItem(itemId: EntityId): Promise<void> {
    await this.commit((workspace) => {
      const item = workspace.checklist.find((entry) => entry.id === itemId);
      if (!item) {
        return;
      }
      item.done = !item.done;
      item.doneAt = item.done ? nowIso() : null;
      item.updatedAt = nowIso();
    });
  }

  async removeChecklistItem(itemId: EntityId): Promise<void> {
    await this.commit((workspace) => {
      workspace.checklist = workspace.checklist.filter((entry) => entry.id !== itemId);
    });
    recordSyncDeletion("checklistItem", itemId);
  }

  /** Copy unfinished items from one day forward, skipping ones already carried over. */
  async rolloverChecklist(fromDay: string, toDay: string): Promise<number> {
    let carried = 0;

    await this.commit((workspace) => {
      const existingKeys = new Set(
        workspace.checklist
          .filter((item) => item.day === toDay)
          .map((item) => `${item.taskId ?? ""}::${item.title.toLowerCase()}`),
      );
      let nextOrder =
        workspace.checklist
          .filter((item) => item.day === toDay)
          .reduce((max, item) => Math.max(max, item.order), -1) + 1;

      for (const item of workspace.checklist) {
        if (item.day !== fromDay || item.done) {
          continue;
        }
        const key = `${item.taskId ?? ""}::${item.title.toLowerCase()}`;
        if (existingKeys.has(key)) {
          continue;
        }
        existingKeys.add(key);
        workspace.checklist.push(
          createChecklistItem({
            title: item.title,
            day: toDay,
            order: nextOrder,
            taskId: item.taskId,
            rolledFrom: fromDay,
          }),
        );
        nextOrder += 1;
        carried += 1;
      }
    });

    return carried;
  }

  /** Promote a checklist item to a real task and link them, so it can join focus/kanban. */
  async promoteChecklistItemToTask(itemId: EntityId): Promise<Task | null> {
    const existing = this.workspace.checklist.find((entry) => entry.id === itemId);
    if (!existing) {
      return null;
    }
    if (existing.taskId) {
      return this.workspace.tasks.find((task) => task.id === existing.taskId) ?? null;
    }

    const task = createTask({ title: existing.title });
    await this.commit((workspace) => {
      workspace.tasks.unshift(task);
      const item = workspace.checklist.find((entry) => entry.id === itemId);
      if (item) {
        item.taskId = task.id;
        item.updatedAt = nowIso();
      }
    });
    return task;
  }

  /** Add any recurring template items still missing from the given day. */
  async ensureChecklistForDay(day: string): Promise<void> {
    const dayItems = this.workspace.checklist.filter((item) => item.day === day);
    const startOrder = dayItems.reduce((max, item) => Math.max(max, item.order), -1) + 1;
    const created = materializeTemplates(this.workspace.checklistTemplates, dayItems, day, startOrder);
    if (!created.length) {
      return;
    }

    await this.commit((workspace) => {
      workspace.checklist.push(...created);
    });
  }

  async addChecklistTemplate(input: { title: string; cadence?: ChecklistCadence; isHabit?: boolean }): Promise<ChecklistTemplate | null> {
    const trimmed = input.title.trim();
    if (!trimmed) {
      return null;
    }

    const template = createChecklistTemplate({ title: trimmed, cadence: input.cadence, isHabit: input.isHabit });
    await this.commit((workspace) => {
      workspace.checklistTemplates.push(template);
    });
    await this.ensureChecklistForDay(dayKey(new Date()));
    return template;
  }

  async updateChecklistTemplate(input: {
    templateId: EntityId;
    title?: string;
    cadence?: ChecklistCadence;
    isHabit?: boolean;
  }): Promise<void> {
    await this.commit((workspace) => {
      const template = workspace.checklistTemplates.find((entry) => entry.id === input.templateId);
      if (!template) {
        return;
      }
      if (input.title !== undefined && input.title.trim()) {
        template.title = input.title.trim();
      }
      if (input.cadence !== undefined) {
        template.cadence = input.cadence;
      }
      if (input.isHabit !== undefined) {
        template.isHabit = input.isHabit;
      }
      template.updatedAt = nowIso();
    });
  }

  async removeChecklistTemplate(templateId: EntityId): Promise<void> {
    await this.commit((workspace) => {
      workspace.checklistTemplates = workspace.checklistTemplates.filter((entry) => entry.id !== templateId);
    });
    recordSyncDeletion("checklistTemplate", templateId);
  }

  async addNote(input: {
    title: string;
    markdown: string;
    projectId?: string | null;
    linkedTaskIds?: string[];
    tagIds?: string[];
  }): Promise<Note> {
    const note = createNote(input);
    await this.commit((workspace) => {
      workspace.notes.unshift(note);
    });
    return note;
  }

  async updateNote(input: {
    noteId: EntityId;
    title: string;
    markdown: string;
    projectId?: EntityId | null;
    linkedTaskIds?: EntityId[];
    tagIds?: EntityId[];
  }): Promise<void> {
    const editedAt = nowIso();

    await this.commit((workspace) => {
      const note = workspace.notes.find((item) => item.id === input.noteId);
      if (!note) {
        return;
      }

      note.title = input.title.trim();
      note.markdown = input.markdown.trim();
      note.projectId = input.projectId ?? null;
      note.linkedTaskIds = input.linkedTaskIds ?? [];
      note.tagIds = input.tagIds ?? [];
      note.updatedAt = editedAt;
      note.editHistory ??= [];
      note.editHistory.unshift({
        id: createId("note_edit"),
        editedAt,
      });
    });
  }

  async addEvent(input: {
    title: string;
    startsAt: string;
    endsAt: string;
    allDay?: boolean;
    kind?: CalendarEventKind;
    taskId?: string | null;
    description?: string;
    location?: string;
  }): Promise<CalendarEvent> {
    const event = createCalendarEvent(input);
    await this.commit((workspace) => {
      workspace.events.unshift(event);
    });
    return event;
  }

  async addEvents(
    inputs: Array<{
      title: string;
      startsAt: string;
      endsAt: string;
      allDay?: boolean;
      kind?: CalendarEventKind;
      taskId?: string | null;
      description?: string;
      location?: string;
    }>,
  ): Promise<void> {
    if (!inputs.length) {
      return;
    }
    await this.commit((workspace) => {
      for (const input of inputs) {
        workspace.events.unshift(createCalendarEvent(input));
      }
    });
  }

  async updateEvent(input: {
    eventId: EntityId;
    title: string;
    startsAt: string;
    endsAt: string;
    allDay: boolean;
    kind: CalendarEventKind;
    taskId: string | null;
    description?: string;
    location?: string;
  }): Promise<void> {
    await this.commit((workspace) => {
      const event = workspace.events.find((item) => item.id === input.eventId);
      if (!event) {
        return;
      }

      event.title = input.title.trim();
      event.startsAt = input.startsAt;
      event.endsAt = input.endsAt;
      event.allDay = input.allDay;
      event.kind = input.kind;
      event.taskId = input.taskId;
      event.description = input.description?.trim() ?? "";
      event.location = input.location?.trim() ?? "";
      event.updatedAt = nowIso();
    });
  }

  async deleteEvent(eventId: EntityId): Promise<void> {
    await this.commit((workspace) => {
      workspace.events = workspace.events.filter((event) => event.id !== eventId);
    });
    recordSyncDeletion("event", eventId);
  }

  async importEvents(
    events: Array<{
      title: string;
      startsAt: string;
      endsAt: string;
      allDay: boolean;
      description?: string;
      location?: string;
      externalUid: string | null;
    }>,
  ): Promise<number> {
    let imported = 0;

    await this.commit((workspace) => {
      for (const incoming of events) {
        const existing = incoming.externalUid
          ? workspace.events.find((event) => event.externalUid === incoming.externalUid)
          : undefined;

        if (existing) {
          existing.title = incoming.title.trim();
          existing.startsAt = incoming.startsAt;
          existing.endsAt = incoming.endsAt;
          existing.allDay = incoming.allDay;
          existing.description = incoming.description?.trim() ?? "";
          existing.location = incoming.location?.trim() ?? "";
          existing.source = "import";
          existing.updatedAt = nowIso();
        } else {
          workspace.events.unshift(createCalendarEvent({ ...incoming, source: "import" }));
        }
        imported += 1;
      }
    });

    return imported;
  }

  async updateTask(input: {
    taskId: EntityId;
    title: string;
    description: string;
    projectId?: EntityId | null;
    dueDate?: string | null;
    priority: TaskPriority;
    tagIds?: EntityId[];
  }): Promise<void> {
    await this.commit((workspace) => {
      const task = workspace.tasks.find((item) => item.id === input.taskId);
      if (!task) {
        return;
      }

      task.title = input.title.trim();
      task.description = input.description.trim();
      task.projectId = input.projectId ?? null;
      task.dueDate = input.dueDate ?? null;
      task.priority = input.priority;
      task.tagIds = input.tagIds ?? [];
      task.updatedAt = nowIso();
    });
  }

  async updateTaskStatus(taskId: EntityId, status: TaskStatus): Promise<void> {
    await this.commit((workspace) => {
      const task = workspace.tasks.find((item) => item.id === taskId);
      if (!task) {
        return;
      }

      task.status = status;
      task.updatedAt = nowIso();
      task.completedAt = status === "done" ? nowIso() : null;
    });
  }

  async addSubtask(taskId: EntityId, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }

    await this.commit((workspace) => {
      const task = workspace.tasks.find((item) => item.id === taskId);
      if (!task) {
        return;
      }
      task.subtasks.push({ id: createId("subtask"), title: trimmed, done: false });
      task.updatedAt = nowIso();
    });
  }

  async toggleSubtask(taskId: EntityId, subtaskId: EntityId): Promise<void> {
    await this.commit((workspace) => {
      const subtask = workspace.tasks.find((item) => item.id === taskId)?.subtasks.find((sub) => sub.id === subtaskId);
      if (subtask) {
        subtask.done = !subtask.done;
        const task = workspace.tasks.find((item) => item.id === taskId);
        if (task) {
          task.updatedAt = nowIso();
        }
      }
    });
  }

  async deleteSubtask(taskId: EntityId, subtaskId: EntityId): Promise<void> {
    await this.commit((workspace) => {
      const task = workspace.tasks.find((item) => item.id === taskId);
      if (task) {
        task.subtasks = task.subtasks.filter((sub) => sub.id !== subtaskId);
        task.updatedAt = nowIso();
      }
    });
  }

  async addTaskHistory(taskId: EntityId, markdown: string, kind: TaskHistoryEntry["kind"]): Promise<void> {
    const entry: TaskHistoryEntry = {
      id: createId("history"),
      at: nowIso(),
      kind,
      markdown: markdown.trim(),
    };

    await this.commit((workspace) => {
      const task = workspace.tasks.find((item) => item.id === taskId);
      if (!task || !entry.markdown) {
        return;
      }

      task.history.unshift(entry);
      task.updatedAt = entry.at;
    });
  }

  async addManualSession(input: {
    taskId: EntityId;
    startedAt: string;
    endedAt: string;
    note?: string;
  }): Promise<void> {
    const durationMinutes = Math.max(
      1,
      Math.round((Date.parse(input.endedAt) - Date.parse(input.startedAt)) / 60000),
    );

    await this.commit((workspace) => {
      workspace.sessions.unshift({
        id: createId("session"),
        taskId: input.taskId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        durationMinutes,
        mode: "manual",
        note: input.note?.trim() ?? "",
        pomodoroCycleId: null,
      });
    });
  }

  async updateSettings(settings: Settings): Promise<void> {
    await this.commit((workspace) => {
      workspace.settings = settings;
    });
  }

  async importWorkspace(workspace: Workspace): Promise<void> {
    this.workspace = workspace;
    this.activeTimer = null;
    clearActiveTimer();
    await replaceWorkspace(workspace);
    this.emit();
    queueWorkspacePush(this.workspace);
  }

  async syncNow(): Promise<void> {
    this.workspace = await syncWorkspaceNow(this.workspace);
    await saveWorkspace(this.workspace);
    this.emit();
  }

  async startTimer(taskId: EntityId): Promise<void> {
    this.activeTimer = {
      taskId,
      startedAt: nowIso(),
      mode: "timer",
      pomodoroCycleId: null,
      phase: "focus",
      phaseEndsAt: null,
      pausedAt: null,
      pausedTotalMs: 0,
    };
    saveActiveTimer(this.activeTimer);
    this.emit();
  }

  async startPomodoro(taskId: EntityId): Promise<void> {
    const cycle = createPomodoroCycle(taskId, this.workspace.settings);

    await this.commit((workspace) => {
      workspace.pomodoroCycles.unshift(cycle);
    });

    this.activeTimer = {
      taskId,
      startedAt: cycle.startedAt,
      mode: "pomodoro",
      pomodoroCycleId: cycle.id,
      phase: "focus",
      phaseEndsAt: addMinutesIso(cycle.startedAt, cycle.focusMinutes),
      pausedAt: null,
      pausedTotalMs: 0,
    };
    saveActiveTimer(this.activeTimer);
    this.emit();
  }

  pauseActiveTimer(): void {
    const active = this.activeTimer;
    if (!active || active.pausedAt) {
      return;
    }

    this.activeTimer = {
      ...active,
      pausedAt: nowIso(),
    };
    saveActiveTimer(this.activeTimer);
    this.emit();
  }

  resumeActiveTimer(): void {
    const active = this.activeTimer;
    if (!active?.pausedAt) {
      return;
    }

    const resumedAt = nowIso();
    const pauseMs = Math.max(0, Date.parse(resumedAt) - Date.parse(active.pausedAt));
    this.activeTimer = {
      ...active,
      pausedAt: null,
      pausedTotalMs: active.pausedTotalMs + pauseMs,
      phaseEndsAt: active.phaseEndsAt ? new Date(Date.parse(active.phaseEndsAt) + pauseMs).toISOString() : null,
    };
    saveActiveTimer(this.activeTimer);
    this.emit();
  }

  async stopTimer(note = ""): Promise<void> {
    const active = this.activeTimer;
    if (!active) {
      return;
    }

    const endedAt = getActiveTimerEndedAtIso(active);
    const durationMinutes = getActiveTimerDurationMinutes(active);

    this.activeTimer = null;
    clearActiveTimer();

    if (active.phase !== "focus") {
      this.emit();
      return;
    }

    await this.commit((workspace) => {
      workspace.sessions.unshift({
        id: createId("session"),
        taskId: active.taskId,
        startedAt: active.startedAt,
        endedAt,
        durationMinutes,
        mode: active.mode,
        note: note.trim(),
        pomodoroCycleId: active.pomodoroCycleId,
      });
    });
  }

  async completePomodoroPhase(note = ""): Promise<void> {
    const active = this.activeTimer;
    if (!active || active.mode !== "pomodoro" || !active.pomodoroCycleId) {
      return;
    }

    const cycle = this.workspace.pomodoroCycles.find((item) => item.id === active.pomodoroCycleId);
    if (!cycle) {
      this.activeTimer = null;
      clearActiveTimer();
      this.emit();
      return;
    }

    if (active.phase === "focus") {
      const endedAt = getPomodoroFocusEndedAtIso(active);
      const durationMinutes = getPomodoroFocusDurationMinutes(active);
      const nextCycle = completeFocusRound(cycle);
      const nextBreak = getNextBreakPhase(nextCycle);
      const nextStartedAt = nowIso();

      await this.commit((workspace) => {
        const storedCycle = workspace.pomodoroCycles.find((item) => item.id === cycle.id);
        if (storedCycle) {
          storedCycle.completedFocusCount = nextCycle.completedFocusCount;
        }

        const session: TimeSession = {
          id: createId("session"),
          taskId: active.taskId,
          startedAt: active.startedAt,
          endedAt,
          durationMinutes,
          mode: "pomodoro",
          note: note.trim(),
          pomodoroCycleId: cycle.id,
        };
        workspace.sessions.unshift(session);
      });

      this.activeTimer = {
        taskId: active.taskId,
        startedAt: nextStartedAt,
        mode: "pomodoro",
        pomodoroCycleId: cycle.id,
        phase: nextBreak,
        phaseEndsAt: addMinutesIso(nextStartedAt, getPhaseDurationMinutes(nextCycle, nextBreak)),
        pausedAt: null,
        pausedTotalMs: 0,
      };
      saveActiveTimer(this.activeTimer);
      this.emit();
      return;
    }

    const nextCycle = completeBreakPhase(cycle, active.phase);
    await this.commit((workspace) => {
      const storedCycle = workspace.pomodoroCycles.find((item) => item.id === cycle.id);
      if (!storedCycle) {
        return;
      }

      storedCycle.completedShortBreakCount = nextCycle.completedShortBreakCount;
      storedCycle.completedLongBreakCount = nextCycle.completedLongBreakCount;
    });

    const nextStartedAt = nowIso();
    this.activeTimer = {
      taskId: active.taskId,
      startedAt: nextStartedAt,
      mode: "pomodoro",
      pomodoroCycleId: active.pomodoroCycleId,
      phase: "focus",
      phaseEndsAt: addMinutesIso(nextStartedAt, nextCycle.focusMinutes),
      pausedAt: null,
      pausedTotalMs: 0,
    };
    saveActiveTimer(this.activeTimer);
    this.emit();
  }

  cancelActiveTimer(): void {
    this.activeTimer = null;
    clearActiveTimer();
    this.emit();
  }

  private async commit(mutator: (workspace: Workspace) => void): Promise<void> {
    mutator(this.workspace);
    await saveWorkspace(this.workspace);
    this.emit();
    queueWorkspacePush(this.workspace);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async pullRemoteWorkspace(): Promise<void> {
    await refreshSyncSession();
    const result = await pullRemoteWorkspace(this.workspace);
    if (!result.changed) {
      return;
    }

    this.workspace = result.workspace;
    await saveWorkspace(this.workspace);
    this.emit();
  }
}

export const appStore = new ProdNoteStore();
