import type { Project, Task, TaskPriority, TaskStatus } from "./types";

export type TaskSort = "created" | "due" | "priority" | "project" | "title";

export const TASK_SORT_LABELS: Record<TaskSort, string> = {
  created: "Сначала новые",
  due: "По дедлайну",
  priority: "По приоритету",
  project: "По проекту",
  title: "По названию",
};

export interface TaskFilterCriteria {
  search: string;
  /** null = any project; "none" = tasks without a project; otherwise a project id. */
  projectId: string | null;
  /** null = any tag; otherwise a tag id that must be present. */
  tagId: string | null;
  priority: TaskPriority | null;
  status: TaskStatus | null;
  sort: TaskSort;
}

export const DEFAULT_TASK_FILTER: TaskFilterCriteria = {
  search: "",
  projectId: null,
  tagId: null,
  priority: null,
  status: null,
  sort: "created",
};

/** Any filter (search or facet) narrows the list; sort alone does not count as active. */
export function isTaskFilterActive(criteria: TaskFilterCriteria): boolean {
  return Boolean(
    criteria.search.trim() || criteria.projectId || criteria.tagId || criteria.priority || criteria.status,
  );
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
/** Sorts tasks without a project name after all named projects. */
const NO_PROJECT_SORT_KEY = "￿";

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
): Task[] {
  const projectName = new Map(projects.map((project) => [project.id, project.name]));

  const filtered = tasks.filter((task) => {
    if (!matchesSearch(task, criteria.search)) {
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
