export const SCHEMA_VERSION = 8;

export type EntityId = string;

export type TaskStatus = "backlog" | "active" | "blocked" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type SessionMode = "timer" | "manual" | "pomodoro";
export type CalendarPlanKind = "focus" | "deadline" | "review";
export type CalendarEventKind = "event" | "focus" | "deadline" | "review" | "meeting";
export type PomodoroStatus = "running" | "paused" | "completed" | "cancelled";
export type PomodoroPhase = "focus" | "shortBreak" | "longBreak";

export interface Project {
  id: EntityId;
  name: string;
  color: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface Tag {
  id: EntityId;
  name: string;
  color: string;
}

export interface TaskHistoryEntry {
  id: EntityId;
  at: string;
  kind: "note" | "progress" | "decision";
  markdown: string;
}

export interface Subtask {
  id: EntityId;
  title: string;
  done: boolean;
}

export interface Task {
  id: EntityId;
  title: string;
  description: string;
  projectId: EntityId | null;
  status: TaskStatus;
  priority: TaskPriority;
  tagIds: EntityId[];
  dueDate: string | null;
  plannedAt: string | null;
  estimateMinutes: number | null;
  subtasks: Subtask[];
  history: TaskHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface NoteEditEntry {
  id: EntityId;
  editedAt: string;
}

export interface Note {
  id: EntityId;
  title: string;
  markdown: string;
  projectId: EntityId | null;
  linkedTaskIds: EntityId[];
  tagIds: EntityId[];
  editHistory: NoteEditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface TimeSession {
  id: EntityId;
  taskId: EntityId;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  mode: SessionMode;
  note: string;
  pomodoroCycleId: EntityId | null;
}

export interface PomodoroCycle {
  id: EntityId;
  taskId: EntityId;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number;
  startedAt: string;
  completedFocusCount: number;
  completedShortBreakCount: number;
  completedLongBreakCount: number;
  status: PomodoroStatus;
}

export interface CalendarPlan {
  id: EntityId;
  taskId: EntityId;
  title: string;
  startsAt: string;
  endsAt: string;
  kind: CalendarPlanKind;
  createdAt: string;
}

export interface CalendarEvent {
  id: EntityId;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  kind: CalendarEventKind;
  taskId: EntityId | null;
  source: "manual" | "import";
  externalUid: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  pomodoroFocusMinutes: number;
  pomodoroShortBreakMinutes: number;
  pomodoroLongBreakMinutes: number;
  pomodoroLongBreakEvery: number;
  weekStartsOn: 1 | 7;
}

export interface WorkspaceExport {
  schemaVersion: number;
  exportedAt: string | null;
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  tags: Tag[];
  sessions: TimeSession[];
  pomodoroCycles: PomodoroCycle[];
  plans: CalendarPlan[];
  events: CalendarEvent[];
  settings: Settings;
}

export interface Workspace extends WorkspaceExport {}

export interface ActiveTimer {
  taskId: EntityId;
  startedAt: string;
  mode: "timer" | "pomodoro";
  pomodoroCycleId: EntityId | null;
  phase: PomodoroPhase;
  phaseEndsAt: string | null;
  pausedAt: string | null;
  pausedTotalMs: number;
}
