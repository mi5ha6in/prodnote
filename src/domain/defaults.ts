import {
  SCHEMA_VERSION,
  type CalendarEvent,
  type CalendarEventKind,
  type CalendarPlan,
  type ChecklistCadence,
  type ChecklistItem,
  type ChecklistTemplate,
  type EntityId,
  type Note,
  type Project,
  type Settings,
  type Tag,
  type Task,
  type Workspace,
} from "./types";
import type { RecurrenceRule } from "./recurrence";

export const TASK_STATUS_LABELS = {
  backlog: "Бэклог",
  active: "В работе",
  blocked: "Заблокировано",
  done: "Готово",
} as const;

export const TASK_PRIORITY_LABELS = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
} as const;

export const PLAN_KIND_LABELS = {
  focus: "Фокус",
  deadline: "Дедлайн",
  review: "Ревью",
} as const;

export const EVENT_KIND_LABELS = {
  event: "Событие",
  focus: "Фокус",
  deadline: "Дедлайн",
  review: "Ревью",
  meeting: "Встреча",
} as const;

export const SESSION_MODE_LABELS = {
  timer: "Таймер",
  manual: "Вручную",
  pomodoro: "Помодоро",
} as const;

export const CHECKLIST_CADENCE_LABELS = {
  daily: "Каждый день",
  weekdays: "Будни",
  weekends: "Выходные",
} as const;

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): EntityId {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${randomId}`;
}

export function createDefaultSettings(): Settings {
  return {
    pomodoroFocusMinutes: 25,
    pomodoroShortBreakMinutes: 5,
    pomodoroLongBreakMinutes: 15,
    pomodoroLongBreakEvery: 4,
    weekStartsOn: 1,
    weeklyTimeGoalMinutes: 0,
    dailyCapacityMinutes: 480,
    eventReminderMinutes: 15,
    allDayReminderHour: 9,
  };
}

/** Lead-time choices for timed-event reminders (minutes; 0 = off). */
export const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60] as const;

/** Morning-hour choices for all-day/deadline reminders (-1 = off). */
export const ALLDAY_REMINDER_OPTIONS = [-1, 7, 8, 9, 10, 12] as const;

export function createStarterWorkspace(): Workspace {
  const createdAt = nowIso();
  const inboxProject: Project = {
    id: createId("project"),
    name: "Входящие",
    color: "#2a9d8f",
    description: "Быстро фиксируйте задачи и заметки, пока не разложили их по проектам.",
    createdAt,
    updatedAt: createdAt,
    archived: false,
  };
  const focusTag: Tag = {
    id: createId("tag"),
    name: "Фокус",
    color: "#e19f44",
  };
  const researchTag: Tag = {
    id: createId("tag"),
    name: "Конспект",
    color: "#457b9d",
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: null,
    projects: [inboxProject],
    tasks: [],
    notes: [],
    tags: [focusTag, researchTag],
    checklist: [],
    checklistTemplates: [],
    sessions: [],
    pomodoroCycles: [],
    plans: [],
    events: [],
    settings: createDefaultSettings(),
  };
}

export function createTask(input: {
  title: string;
  description?: string;
  projectId?: string | null;
  dueDate?: string | null;
  priority?: Task["priority"];
  tagIds?: string[];
  recurrence?: RecurrenceRule | null;
}): Task {
  const createdAt = nowIso();

  return {
    id: createId("task"),
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    projectId: input.projectId ?? null,
    status: "backlog",
    priority: input.priority ?? "medium",
    tagIds: input.tagIds ?? [],
    dueDate: input.dueDate ?? null,
    plannedAt: null,
    estimateMinutes: null,
    // Новые задачи встают наверх колонки: у более поздних меньший порядок.
    boardOrder: -Date.now(),
    subtasks: [],
    history: [],
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    recurrence: input.recurrence ?? null,
    recurrenceParentId: null,
  };
}

/** Build the next occurrence of a recurring task: fresh id/history, reset subtasks, shared series id. */
export function createRecurringTaskInstance(source: Task, dueDate: string): Task {
  const instance = createTask({
    title: source.title,
    description: source.description,
    projectId: source.projectId,
    dueDate,
    priority: source.priority,
    tagIds: [...source.tagIds],
    recurrence: source.recurrence,
  });
  instance.recurrenceParentId = source.recurrenceParentId ?? source.id;
  instance.subtasks = source.subtasks.map((subtask) => ({ id: createId("subtask"), title: subtask.title, done: false }));
  return instance;
}

export function createChecklistItem(input: {
  title: string;
  day: string;
  order?: number;
  taskId?: string | null;
  templateId?: string | null;
  rolledFrom?: string | null;
}): ChecklistItem {
  const createdAt = nowIso();

  return {
    id: createId("checklist"),
    day: input.day,
    title: input.title.trim(),
    done: false,
    doneAt: null,
    order: input.order ?? 0,
    taskId: input.taskId ?? null,
    templateId: input.templateId ?? null,
    rolledFrom: input.rolledFrom ?? null,
    createdAt,
    updatedAt: createdAt,
  };
}

export function createChecklistTemplate(input: {
  title: string;
  cadence?: ChecklistCadence;
  isHabit?: boolean;
}): ChecklistTemplate {
  const createdAt = nowIso();

  return {
    id: createId("checklist_tpl"),
    title: input.title.trim(),
    cadence: input.cadence ?? "daily",
    isHabit: input.isHabit ?? false,
    archived: false,
    createdAt,
    updatedAt: createdAt,
  };
}

export function createProject(input: { name: string; color?: string; description?: string }): Project {
  const createdAt = nowIso();

  return {
    id: createId("project"),
    name: input.name.trim(),
    color: input.color ?? "#2a9d8f",
    description: input.description?.trim() ?? "",
    createdAt,
    updatedAt: createdAt,
    archived: false,
  };
}

export function createTag(input: { name: string; color?: string }): Tag {
  return {
    id: createId("tag"),
    name: input.name.trim(),
    color: input.color ?? "#e19f44",
  };
}

export function createNote(input: {
  title: string;
  markdown: string;
  projectId?: string | null;
  linkedTaskIds?: string[];
  tagIds?: string[];
  dayKey?: string | null;
}): Note {
  const createdAt = nowIso();

  return {
    id: createId("note"),
    title: input.title.trim(),
    markdown: input.markdown.trim(),
    projectId: input.projectId ?? null,
    linkedTaskIds: input.linkedTaskIds ?? [],
    tagIds: input.tagIds ?? [],
    editHistory: [],
    dayKey: input.dayKey ?? null,
    createdAt,
    updatedAt: createdAt,
  };
}

export function createCalendarPlan(input: {
  taskId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  kind: CalendarPlan["kind"];
}): CalendarPlan {
  return {
    id: createId("plan"),
    taskId: input.taskId,
    title: input.title.trim(),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    kind: input.kind,
    createdAt: nowIso(),
  };
}

export function createCalendarEvent(input: {
  title: string;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  kind?: CalendarEventKind;
  taskId?: string | null;
  projectId?: string | null;
  description?: string;
  location?: string;
  source?: "manual" | "import";
  externalUid?: string | null;
}): CalendarEvent {
  const createdAt = nowIso();

  return {
    id: createId("event"),
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    location: input.location?.trim() ?? "",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    allDay: input.allDay ?? false,
    kind: input.kind ?? "event",
    taskId: input.taskId ?? null,
    projectId: input.projectId ?? null,
    source: input.source ?? "manual",
    externalUid: input.externalUid ?? null,
    createdAt,
    updatedAt: createdAt,
  };
}
