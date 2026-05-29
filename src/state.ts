import {
  createCalendarPlan,
  createId,
  createNote,
  createProject,
  createStarterWorkspace,
  createTag,
  createTask,
  nowIso,
} from "./domain/defaults";
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
  CalendarPlan,
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
    this.emit();
    void this.pullRemoteWorkspace();
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

  async addPlan(input: {
    taskId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    kind: CalendarPlan["kind"];
  }): Promise<CalendarPlan> {
    const plan = createCalendarPlan(input);
    await this.commit((workspace) => {
      workspace.plans.push(plan);
    });
    return plan;
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
    };
    saveActiveTimer(this.activeTimer);
    this.emit();
  }

  async stopTimer(note = ""): Promise<void> {
    const active = this.activeTimer;
    if (!active) {
      return;
    }

    const endedAt = nowIso();
    const durationMinutes = Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(active.startedAt)) / 60000));

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
      const endedAt = nowIso();
      const durationMinutes = Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(active.startedAt)) / 60000));
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
