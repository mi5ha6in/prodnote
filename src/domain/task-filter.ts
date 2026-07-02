import type { Project, Task, TaskPriority, TaskStatus } from "./types";

export type TaskSort = "created" | "due" | "priority" | "project" | "title";

export const TASK_SORT_LABELS: Record<TaskSort, string> = {
  created: "Сначала новые",
  due: "По дедлайну",
  priority: "По приоритету",
  project: "По проекту",
  title: "По названию",
};

/** Preset views over due dates and the inbox, like TickTick/Todoist smart lists. */
export type TaskSmartList = "today" | "week" | "overdue" | "inbox";

// «На сегодня», не «Сегодня» — чтобы не путать с одноимённым табом планера.
export const TASK_SMART_LIST_LABELS: Record<TaskSmartList, string> = {
  today: "На сегодня",
  week: "Неделя",
  overdue: "Просрочено",
  inbox: "Входящие",
};

export interface TaskFilterCriteria {
  search: string;
  /** null = any project; "none" = tasks without a project; otherwise a project id. */
  projectId: string | null;
  /** null = any tag; otherwise a tag id that must be present. */
  tagId: string | null;
  priority: TaskPriority | null;
  status: TaskStatus | null;
  smartList: TaskSmartList | null;
  sort: TaskSort;
}

export const DEFAULT_TASK_FILTER: TaskFilterCriteria = {
  search: "",
  projectId: null,
  tagId: null,
  priority: null,
  status: null,
  smartList: null,
  sort: "created",
};

/** Any filter (search or facet) narrows the list; sort alone does not count as active. */
export function isTaskFilterActive(criteria: TaskFilterCriteria): boolean {
  return Boolean(
    criteria.search.trim() ||
      criteria.projectId ||
      criteria.tagId ||
      criteria.priority ||
      criteria.status ||
      criteria.smartList,
  );
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
/** Sorts tasks without a project name after all named projects. */
const NO_PROJECT_SORT_KEY = "￿";
/** The starter workspace ships an inbox project with this name; the inbox smart list keys off it. */
const INBOX_PROJECT_NAME = "входящие";

function toLocalDateString(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function matchesSmartList(task: Task, list: TaskSmartList, projects: Project[], now: Date): boolean {
  if (list === "inbox") {
    if (task.status === "done") {
      return false;
    }
    if (task.projectId === null) {
      return true;
    }
    const project = projects.find((item) => item.id === task.projectId);
    return (project?.name.trim().toLowerCase() ?? "") === INBOX_PROJECT_NAME;
  }

  if (task.status === "done" || !task.dueDate) {
    return false;
  }

  const due = task.dueDate.slice(0, 10);
  const today = toLocalDateString(now);
  switch (list) {
    case "today":
      // Includes overdue: what demands attention today.
      return due <= today;
    case "week":
      return due <= toLocalDateString(addDays(now, 6));
    case "overdue":
      return due < today;
  }
}

function matchesSearch(task: Task, query: string): boolean {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!queryTerms.length) {
    return true;
  }

  const haystack = [
    task.title,
    task.description,
    ...task.history.map((entry) => entry.markdown),
    ...task.subtasks.map((subtask) => subtask.title),
  ]
    .join(" ")
    .toLowerCase();
  return queryTerms.every((term) => haystack.includes(term));
}

function compareDueAsc(a: string | null, b: string | null): number {
  if (a === b) {
    return 0;
  }
  if (!a) {
    return 1; // tasks without a deadline sort last
  }
  if (!b) {
    return -1;
  }
  return a.localeCompare(b);
}

/** Filter tasks by the criteria, then return a sorted copy (input array is untouched). */
export function filterAndSortTasks(
  tasks: Task[],
  criteria: TaskFilterCriteria,
  projects: Project[] = [],
  now: Date = new Date(),
): Task[] {
  const projectName = new Map(projects.map((project) => [project.id, project.name]));

  const filtered = tasks.filter((task) => {
    if (!matchesSearch(task, criteria.search)) {
      return false;
    }
    if (criteria.smartList && !matchesSmartList(task, criteria.smartList, projects, now)) {
      return false;
    }
    if (criteria.projectId === "none" && task.projectId !== null) {
      return false;
    }
    if (criteria.projectId && criteria.projectId !== "none" && task.projectId !== criteria.projectId) {
      return false;
    }
    if (criteria.tagId && !task.tagIds.includes(criteria.tagId)) {
      return false;
    }
    if (criteria.priority && task.priority !== criteria.priority) {
      return false;
    }
    if (criteria.status && task.status !== criteria.status) {
      return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    switch (criteria.sort) {
      case "due":
        return compareDueAsc(a.dueDate, b.dueDate);
      case "priority":
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      case "project":
        return (projectName.get(a.projectId ?? "") ?? NO_PROJECT_SORT_KEY).localeCompare(
          projectName.get(b.projectId ?? "") ?? NO_PROJECT_SORT_KEY,
          "ru",
        );
      case "title":
        return a.title.localeCompare(b.title, "ru");
      case "created":
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  });
}
