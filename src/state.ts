import { dayKey } from "./domain/calendar";
import { materializeTemplates, shiftDayKey } from "./domain/checklist";
import {
  createCalendarEvent,
  createChecklistItem,
  createChecklistTemplate,
  createId,
  createNote,
  createProject,
  createRecurringTaskInstance,
  createStarterWorkspace,
  createTag,
  createTask,
  nowIso,
} from "./domain/defaults";
import { dayNoteTitle, extractOpenCheckboxes } from "./domain/note-tasks";
import { nextRecurrenceDate, type RecurrenceRule } from "./domain/recurrence";
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
import { maybeWriteBackup } from "./storage/backups";
import { loadWorkspace, replaceWorkspace, saveWorkspace } from "./storage/idb";
import {
  getSyncState,
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
    await this.adoptLegacyReminderPrefs();
    await this.prepareToday();
    this.emit();
    void this.pullRemoteWorkspace();
    this.startAutoPull();
  }

  /**
   * One-time adoption of the pre-v15 per-device reminder prefs (localStorage)
   * into synced settings, so upgrading users keep their lead times.
   */
  private async adoptLegacyReminderPrefs(): Promise<void> {
    if (typeof localStorage === "undefined") {
      return;
    }

    const lead = localStorage.getItem("prodnote-event-reminder-minutes");
    const hour = localStorage.getItem("prodnote-allday-reminder-hour");
    if (lead === null && hour === null) {
      return;
    }

    await this.commit((workspace) => {
      if (lead !== null && Number.isFinite(Number(lead))) {
        workspace.settings.eventReminderMinutes = Math.max(0, Math.round(Number(lead)));
      }
      if (hour !== null && Number.isFinite(Number(hour))) {
        workspace.settings.allDayReminderHour = Math.max(-1, Math.min(23, Math.round(Number(hour))));
      }
    });
    localStorage.removeItem("prodnote-event-reminder-minutes");
    localStorage.removeItem("prodnote-allday-reminder-hour");
  }

  /** Keep other devices' changes flowing in: pull every minute and on window focus. */
  private startAutoPull(): void {
    if (typeof window === "undefined" || import.meta.env.MODE === "test") {
      return;
    }

    window.setInterval(() => void this.pullRemoteWorkspace(), 60_000);
    window.addEventListener("focus", () => void this.pullRemoteWorkspace());
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

  async updateProject(input: {
    projectId: EntityId;
    name: string;
    color?: string;
    description?: string;
  }): Promise<void> {
    await this.commit((workspace) => {
      const project = workspace.projects.find((item) => item.id === input.projectId);
      if (!project) {
        return;
      }

      const name = input.name.trim();
      if (name) {
        project.name = name;
      }
      if (input.color !== undefined) {
        project.color = input.color;
      }
      if (input.description !== undefined) {
        project.description = input.description.trim();
      }
      project.updatedAt = nowIso();
    });
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

  async updateTag(input: { tagId: EntityId; name: string; color?: string }): Promise<void> {
    await this.commit((workspace) => {
      const tag = workspace.tags.find((item) => item.id === input.tagId);
      if (!tag) {
        return;
      }

      const name = input.name.trim();
      if (name) {
        tag.name = name;
      }
      if (input.color !== undefined) {
        tag.color = input.color;
      }
    });
  }

  /** Delete a tag and safely strip it from every task and note that referenced it. */
  async deleteTag(tagId: EntityId): Promise<void> {
    await this.commit((workspace) => {
      workspace.tags = workspace.tags.filter((tag) => tag.id !== tagId);

      for (const task of workspace.tasks) {
        if (task.tagIds.includes(tagId)) {
          task.tagIds = task.tagIds.filter((id) => id !== tagId);
          task.updatedAt = nowIso();
        }
      }

      for (const note of workspace.notes) {
        if (note.tagIds.includes(tagId)) {
          note.tagIds = note.tagIds.filter((id) => id !== tagId);
          note.updatedAt = nowIso();
        }
      }
    });
    recordSyncDeletion("tag", tagId);
  }

  async addTask(input: {
    title: string;
    description?: string;
    projectId?: string | null;
    dueDate?: string | null;
    priority?: TaskPriority;
    tagIds?: string[];
    recurrence?: RecurrenceRule | null;
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
      const target = this.checklistItemTarget(workspace, item);
      item.done = !item.done;
      item.count = item.done ? target : 0;
      item.doneAt = item.done ? nowIso() : null;
      item.updatedAt = nowIso();
    });
  }

  /** Step a quantity habit's progress; `done` flips when the daily target is reached. */
  async incrementChecklistItem(itemId: EntityId, delta: 1 | -1): Promise<void> {
    await this.commit((workspace) => {
      const item = workspace.checklist.find((entry) => entry.id === itemId);
      if (!item) {
        return;
      }
      const target = this.checklistItemTarget(workspace, item);
      item.count = Math.max(0, Math.min(target, item.count + delta));
      const wasDone = item.done;
      item.done = item.count >= target;
      if (item.done && !wasDone) {
        item.doneAt = nowIso();
      } else if (!item.done) {
        item.doneAt = null;
      }
      item.updatedAt = nowIso();
    });
  }

  private checklistItemTarget(workspace: Workspace, item: ChecklistItem): number {
    const template = item.templateId
      ? workspace.checklistTemplates.find((entry) => entry.id === item.templateId)
      : undefined;
    return Math.max(1, template?.targetCount ?? 1);
  }

  async renameChecklistItem(itemId: EntityId, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }

    await this.commit((workspace) => {
      const item = workspace.checklist.find((entry) => entry.id === itemId);
      if (!item || item.title === trimmed) {
        return;
      }
      item.title = trimmed;
      item.updatedAt = nowIso();
    });
  }

  /** Persist a new manual order for a day's items from an ordered list of ids. */
  async reorderChecklist(day: string, orderedIds: EntityId[]): Promise<void> {
    await this.commit((workspace) => {
      const position = new Map(orderedIds.map((id, index) => [id, index]));
      for (const item of workspace.checklist) {
        if (item.day === day && position.has(item.id)) {
          item.order = position.get(item.id) ?? item.order;
          item.updatedAt = nowIso();
        }
      }
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

  async addChecklistTemplate(input: {
    title: string;
    cadence?: ChecklistCadence;
    isHabit?: boolean;
    targetCount?: number;
    targetPerWeek?: number | null;
  }): Promise<ChecklistTemplate | null> {
    const trimmed = input.title.trim();
    if (!trimmed) {
      return null;
    }

    const template = createChecklistTemplate({
      title: trimmed,
      cadence: input.cadence,
      isHabit: input.isHabit,
      targetCount: input.targetCount,
      targetPerWeek: input.targetPerWeek,
    });
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
    targetCount?: number;
    targetPerWeek?: number | null;
    archived?: boolean;
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
      if (input.targetCount !== undefined) {
        template.targetCount = Math.max(1, Math.round(input.targetCount));
      }
      if (input.targetPerWeek !== undefined) {
        template.targetPerWeek =
          input.targetPerWeek !== null && input.targetPerWeek > 0 ? Math.round(input.targetPerWeek) : null;
      }
      if (input.isHabit !== undefined) {
        template.isHabit = input.isHabit;
      }
      if (input.archived !== undefined) {
        template.archived = input.archived;
      }
      template.updatedAt = nowIso();
    });
  }

  /**
   * Toggle a template's materialized item for a day (retro-marking in the habit
   * grid). A missing item is created already done in the same commit; future
   * days are ignored. Past days are deliberately not materialized via
   * `ensureChecklistForDay` — that would flood history with every template.
   */
  async toggleTemplateItemForDay(templateId: EntityId, day: string): Promise<void> {
    if (day > dayKey(new Date())) {
      return;
    }

    const existing = this.workspace.checklist.find((item) => item.templateId === templateId && item.day === day);
    if (existing) {
      await this.toggleChecklistItem(existing.id);
      return;
    }

    const template = this.workspace.checklistTemplates.find((entry) => entry.id === templateId);
    if (!template) {
      return;
    }

    const nextOrder =
      this.workspace.checklist
        .filter((item) => item.day === day)
        .reduce((max, item) => Math.max(max, item.order), -1) + 1;
    const item = createChecklistItem({ title: template.title, day, order: nextOrder, templateId });
    item.done = true;
    item.count = Math.max(1, template.targetCount);
    item.doneAt = nowIso();

    await this.commit((workspace) => {
      workspace.checklist.push(item);
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

  async deleteNote(noteId: EntityId): Promise<void> {
    await this.commit((workspace) => {
      workspace.notes = workspace.notes.filter((note) => note.id !== noteId);
    });
    recordSyncDeletion("note", noteId);
  }

  /** Append markdown to the day's journal note, creating it on first write. */
  async appendToDayNote(day: string, markdown: string): Promise<Note | null> {
    const text = markdown.trim();
    if (!text) {
      return null;
    }

    const existing = this.workspace.notes.find((note) => note.dayKey === day);
    if (!existing) {
      const note = createNote({ title: dayNoteTitle(day), markdown: text, dayKey: day });
      await this.commit((workspace) => {
        workspace.notes.unshift(note);
      });
      return note;
    }

    await this.updateNote({
      noteId: existing.id,
      title: existing.title,
      markdown: existing.markdown ? `${existing.markdown}\n\n${text}` : text,
      projectId: existing.projectId,
      linkedTaskIds: existing.linkedTaskIds,
      tagIds: existing.tagIds,
    });
    return this.workspace.notes.find((note) => note.id === existing.id) ?? null;
  }

  /**
   * Turn every unchecked `- [ ]` line of a note into an inbox task and link
   * the created tasks back to the note. Returns the created tasks.
   */
  async extractTasksFromNote(noteId: EntityId): Promise<Task[]> {
    const note = this.workspace.notes.find((item) => item.id === noteId);
    if (!note) {
      return [];
    }

    const titles = extractOpenCheckboxes(note.markdown);
    // Не создавать дубли: пропускаем строки, уже существующие открытыми задачами.
    const openTitles = new Set(
      this.workspace.tasks.filter((task) => task.status !== "done").map((task) => task.title.toLowerCase()),
    );
    const created = titles
      .filter((title) => !openTitles.has(title.toLowerCase()))
      .map((title) => createTask({ title, projectId: note.projectId }));
    if (!created.length) {
      return [];
    }

    await this.commit((workspace) => {
      workspace.tasks.unshift(...created);
      const target = workspace.notes.find((item) => item.id === noteId);
      if (target) {
        target.linkedTaskIds = [...new Set([...target.linkedTaskIds, ...created.map((task) => task.id)])];
        target.updatedAt = nowIso();
      }
    });
    return created;
  }

  async addEvent(input: {
    title: string;
    startsAt: string;
    endsAt: string;
    allDay?: boolean;
    kind?: CalendarEventKind;
    taskId?: string | null;
    projectId?: string | null;
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
      projectId?: string | null;
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
    projectId?: string | null;
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
      event.projectId = input.projectId ?? null;
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

  /**
   * Reconcile events of one ICS subscription: upsert by prefixed externalUid,
   * remove events that vanished from the feed. Manual/other events untouched.
   */
  async syncSubscribedEvents(
    subscriptionId: string,
    events: Array<{
      title: string;
      startsAt: string;
      endsAt: string;
      allDay: boolean;
      description?: string;
      location?: string;
      externalUid: string | null;
    }>,
  ): Promise<{ imported: number; removed: number }> {
    const prefix = `ics-sub:${subscriptionId}:`;
    const incoming = events.map((event) => ({
      ...event,
      externalUid: `${prefix}${event.externalUid ?? `${event.startsAt}|${event.title}`}`,
    }));
    const incomingUids = new Set(incoming.map((event) => event.externalUid));
    const removedIds: EntityId[] = [];

    await this.commit((workspace) => {
      workspace.events = workspace.events.filter((event) => {
        const stale = event.externalUid?.startsWith(prefix) && !incomingUids.has(event.externalUid);
        if (stale) {
          removedIds.push(event.id);
        }
        return !stale;
      });

      for (const item of incoming) {
        const existing = workspace.events.find((event) => event.externalUid === item.externalUid);
        if (existing) {
          existing.title = item.title.trim();
          existing.startsAt = item.startsAt;
          existing.endsAt = item.endsAt;
          existing.allDay = item.allDay;
          existing.description = item.description?.trim() ?? "";
          existing.location = item.location?.trim() ?? "";
          existing.updatedAt = nowIso();
        } else {
          workspace.events.unshift(createCalendarEvent({ ...item, source: "import" }));
        }
      }
    });

    for (const id of removedIds) {
      recordSyncDeletion("event", id);
    }
    return { imported: incoming.length, removed: removedIds.length };
  }

  async updateTask(input: {
    taskId: EntityId;
    title: string;
    description: string;
    projectId?: EntityId | null;
    dueDate?: string | null;
    priority: TaskPriority;
    tagIds?: EntityId[];
    recurrence?: RecurrenceRule | null;
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
      if (input.recurrence !== undefined) {
        task.recurrence = input.recurrence;
      }
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

      // Completing a recurring task with a deadline spawns the next occurrence.
      if (status === "done" && task.recurrence && task.dueDate) {
        const nextDue = nextRecurrenceDate(task.dueDate, task.recurrence);
        if (nextDue) {
          const familyId = task.recurrenceParentId ?? task.id;
          const alreadyExists = workspace.tasks.some(
            (item) => (item.recurrenceParentId ?? item.id) === familyId && item.dueDate === nextDue,
          );
          if (!alreadyExists) {
            workspace.tasks.unshift(createRecurringTaskInstance(task, nextDue));
          }
        }
      }
    });
  }

  /** Move a task to another project (or out of any) without touching its other fields. */
  async assignTaskProject(taskId: EntityId, projectId: EntityId | null): Promise<void> {
    await this.commit((workspace) => {
      const task = workspace.tasks.find((item) => item.id === taskId);
      if (!task) {
        return;
      }
      task.projectId = projectId;
      task.updatedAt = nowIso();
    });
  }

  /** Change only the due date of a task (null clears the deadline). */
  async rescheduleTask(taskId: EntityId, dueDate: string | null): Promise<void> {
    await this.commit((workspace) => {
      const task = workspace.tasks.find((item) => item.id === taskId);
      if (!task) {
        return;
      }
      task.dueDate = dueDate;
      task.updatedAt = nowIso();
    });
  }

  /**
   * Place a task before `beforeTaskId` in the kanban (same or another column);
   * `beforeTaskId === null` drops it to the end of the target column.
   */
  async reorderTask(taskId: EntityId, status: TaskStatus, beforeTaskId: EntityId | null): Promise<void> {
    await this.commit((workspace) => {
      const task = workspace.tasks.find((item) => item.id === taskId);
      if (!task || taskId === beforeTaskId) {
        return;
      }

      const column = workspace.tasks
        .filter((item) => item.status === status && item.id !== taskId)
        .sort((a, b) => a.boardOrder - b.boardOrder);

      let order: number;
      if (beforeTaskId === null) {
        order = column.length ? (column.at(-1)?.boardOrder ?? 0) + 1000 : 0;
      } else {
        const index = column.findIndex((item) => item.id === beforeTaskId);
        if (index < 0) {
          return;
        }
        const before = column[index - 1]?.boardOrder;
        const target = column[index]?.boardOrder ?? 0;
        order = before === undefined ? target - 1000 : (before + target) / 2;
      }

      task.boardOrder = order;
      if (task.status !== status) {
        task.status = status;
        task.completedAt = status === "done" ? nowIso() : null;
      }
      task.updatedAt = nowIso();
    });
  }

  /** Commit a task to a day (YYYY-MM-DD) via plannedAt, or clear the commitment. */
  async planTaskForDay(taskId: EntityId, day: string | null): Promise<void> {
    await this.commit((workspace) => {
      const task = workspace.tasks.find((item) => item.id === taskId);
      if (!task) {
        return;
      }
      task.plannedAt = day ? `${day}T00:00:00` : null;
      task.updatedAt = nowIso();
    });
  }

  /** Change only the effort estimate (minutes; null clears it). */
  async setTaskEstimate(taskId: EntityId, estimateMinutes: number | null): Promise<void> {
    await this.commit((workspace) => {
      const task = workspace.tasks.find((item) => item.id === taskId);
      if (!task) {
        return;
      }
      task.estimateMinutes = estimateMinutes !== null && estimateMinutes > 0 ? Math.round(estimateMinutes) : null;
      task.updatedAt = nowIso();
    });
  }

  /**
   * Delete a task and its dependent time data (sessions, pomodoro cycles, plans),
   * unlink it from checklist items and calendar events, and stop a running timer for it.
   * Time sessions must stay linked to a task, so they are removed with the task.
   */
  async deleteTask(taskId: EntityId): Promise<void> {
    const removedSessionIds: EntityId[] = [];
    const removedCycleIds: EntityId[] = [];
    const removedPlanIds: EntityId[] = [];

    await this.commit((workspace) => {
      workspace.tasks = workspace.tasks.filter((task) => task.id !== taskId);

      for (const session of workspace.sessions) {
        if (session.taskId === taskId) {
          removedSessionIds.push(session.id);
        }
      }
      workspace.sessions = workspace.sessions.filter((session) => session.taskId !== taskId);

      for (const cycle of workspace.pomodoroCycles) {
        if (cycle.taskId === taskId) {
          removedCycleIds.push(cycle.id);
        }
      }
      workspace.pomodoroCycles = workspace.pomodoroCycles.filter((cycle) => cycle.taskId !== taskId);

      for (const plan of workspace.plans) {
        if (plan.taskId === taskId) {
          removedPlanIds.push(plan.id);
        }
      }
      workspace.plans = workspace.plans.filter((plan) => plan.taskId !== taskId);

      for (const item of workspace.checklist) {
        if (item.taskId === taskId) {
          item.taskId = null;
          item.updatedAt = nowIso();
        }
      }

      for (const event of workspace.events) {
        if (event.taskId === taskId) {
          event.taskId = null;
          event.updatedAt = nowIso();
        }
      }
    });

    if (this.activeTimer?.taskId === taskId) {
      this.cancelActiveTimer();
    }

    recordSyncDeletion("task", taskId);
    for (const id of removedSessionIds) {
      recordSyncDeletion("session", id);
    }
    for (const id of removedCycleIds) {
      recordSyncDeletion("pomodoroCycle", id);
    }
    for (const id of removedPlanIds) {
      recordSyncDeletion("plan", id);
    }
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

  async startTimer(taskId: EntityId, goal: string | null = null): Promise<void> {
    this.activeTimer = {
      taskId,
      startedAt: nowIso(),
      mode: "timer",
      pomodoroCycleId: null,
      phase: "focus",
      phaseEndsAt: null,
      pausedAt: null,
      pausedTotalMs: 0,
      goal: goal?.trim() || null,
    };
    saveActiveTimer(this.activeTimer);
    this.emit();
  }

  async startPomodoro(taskId: EntityId, goal: string | null = null): Promise<void> {
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
      goal: goal?.trim() || null,
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
        goal: active.goal,
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
      goal: active.goal,
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
    // Fire-and-forget: hourly-throttled local snapshot for disaster recovery.
    void maybeWriteBackup(this.workspace).catch(() => undefined);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async pullRemoteWorkspace(): Promise<void> {
    // /api/me only when the session is not established yet; steady-state pulls go straight to the workspace.
    if (!getSyncState().authenticated) {
      await refreshSyncSession();
    }
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
