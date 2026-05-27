import { escapeHtml } from "../domain/markdown";
import type { EntityId, Project, Tag, Task } from "../domain/types";

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Не задано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Не задано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function toDateTimeLocalValue(date = new Date()): string {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

export function fromDateTimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

export function getProjectName(projects: Project[], id: EntityId | null): string {
  return projects.find((project) => project.id === id)?.name ?? "Без проекта";
}

export function getTaskName(tasks: Task[], id: EntityId): string {
  return tasks.find((task) => task.id === id)?.title ?? "Удалённая задача";
}

export function renderProjectOptions(projects: Project[], selectedId: EntityId | null = null): string {
  return [
    `<option value="">Без проекта</option>`,
    ...projects.map(
      (project) =>
        `<option value="${escapeHtml(project.id)}" ${project.id === selectedId ? "selected" : ""}>${escapeHtml(project.name)}</option>`,
    ),
  ].join("");
}

export function renderTaskOptions(tasks: Task[], selectedId: EntityId | null = null): string {
  return tasks
    .map(
      (task) =>
        `<option value="${escapeHtml(task.id)}" ${task.id === selectedId ? "selected" : ""}>${escapeHtml(task.title)}</option>`,
    )
    .join("");
}

export function renderTagPills(tags: Tag[], tagIds: EntityId[]): string {
  return tagIds
    .map((tagId) => tags.find((tag) => tag.id === tagId))
    .filter((tag): tag is Tag => Boolean(tag))
    .map(
      (tag) =>
        `<span class="tag-pill" style="--tag-color: ${escapeHtml(tag.color)}">${escapeHtml(tag.name)}</span>`,
    )
    .join("");
}

export function requireInput(form: HTMLFormElement, name: string): HTMLInputElement {
  const input = form.elements.namedItem(name);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing input ${name}`);
  }

  return input;
}

export function requireSelect(form: HTMLFormElement, name: string): HTMLSelectElement {
  const input = form.elements.namedItem(name);
  if (!(input instanceof HTMLSelectElement)) {
    throw new Error(`Missing select ${name}`);
  }

  return input;
}

export function requireTextArea(form: HTMLFormElement, name: string): HTMLTextAreaElement {
  const input = form.elements.namedItem(name);
  if (!(input instanceof HTMLTextAreaElement)) {
    throw new Error(`Missing textarea ${name}`);
  }

  return input;
}
