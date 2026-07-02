import type { RecurrenceRule } from "./recurrence";

export const SCHEMA_VERSION = 17;

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
  /** Manual kanban position within a column; smaller sorts first. */
  boardOrder: number;
  subtasks: Subtask[];
  history: TaskHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Recurrence rule; when set and the task has a dueDate, completing it spawns the next instance. */
  recurrence: RecurrenceRule | null;
  /** Root task id shared by all instances of a recurring series. */
  recurrenceParentId: EntityId | null;
}

export interface ChecklistItem {
  id: EntityId;
  /** Local day this item belongs to, formatted YYYY-MM-DD. */
  day: string;
  title: string;
  done: boolean;
  /** When the item was checked off — the timeline of "what got done and when". */
  doneAt: string | null;
  /** Stable ordering within a day. */
  order: number;
  /** Optional link to a real task (promote to focus/kanban without coupling). */
  taskId: EntityId | null;
  /** Recurring template this item was materialized from, if any. */
  templateId: EntityId | null;
  /** Day key this item was carried over from, when rolled forward. */
  rolledFrom: string | null;
  /** Progress for quantity habits; `done` flips when count reaches the template target. */
  count: number;
  createdAt: string;
  updatedAt: string;
}

export type ChecklistCadence = "daily" | "weekdays" | "weekends";

export interface ChecklistTemplate {
  id: EntityId;
  title: string;
  cadence: ChecklistCadence;
  /** Track this template as a habit in the habit tracker. */
  isHabit: boolean;
  /** Repetitions per day for quantity habits («8 стаканов»); 1 = plain checkbox. */
  targetCount: number;
  /** Weekly goal in done-days («3 раза в неделю»); null = every scheduled day counts. */
  targetPerWeek: number | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
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
  /** When set (YYYY-MM-DD), this is the day's journal note (shutdown reflections land here). */
  dayKey: string | null;
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
  projectId: EntityId | null;
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
  /** Weekly tracked-time target in minutes; 0 disables the goal. */
  weeklyTimeGoalMinutes: number;
  /** Realistic plannable minutes per day for the day-budget check; 0 disables it. */
  dailyCapacityMinutes: number;
  /** Lead time for timed-event reminders in minutes; 0 disables them. Synced so the push server can schedule. */
  eventReminderMinutes: number;
  /** Morning hour for all-day/deadline reminders; -1 disables them. */
  allDayReminderHour: number;
}

export interface WorkspaceExport {
  schemaVersion: number;
  exportedAt: string | null;
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  tags: Tag[];
  checklist: ChecklistItem[];
  checklistTemplates: ChecklistTemplate[];
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
  /** Session intention («что хочу сделать»); device-local, shown while the timer runs. */
  goal: string | null;
}
