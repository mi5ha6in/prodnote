import {
  SCHEMA_VERSION,
  type CalendarEvent,
  type CalendarEventKind,
  type CalendarPlan,
  type EntityId,
  type Note,
  type Project,
  type Settings,
  type Tag,
  type Task,
  type Workspace,
} from "./types";

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
  };
}

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
    subtasks: [],
    history: [],
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
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
    source: input.source ?? "manual",
    externalUid: input.externalUid ?? null,
    createdAt,
    updatedAt: createdAt,
  };
}
