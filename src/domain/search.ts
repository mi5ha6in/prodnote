import type { CalendarEvent, Note, Task } from "./types";

/** Split a query into lowercased terms; all must match (AND). */
function terms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesAll(haystack: string, queryTerms: string[]): boolean {
  const text = haystack.toLowerCase();
  return queryTerms.every((term) => text.includes(term));
}

/** Notes that link to `target` via a [[Title]] wiki-link. */
export function findBacklinks(notes: Note[], target: Note): Note[] {
  const needle = `[[${target.title.toLowerCase()}]]`;
  return notes.filter((note) => note.id !== target.id && note.markdown.toLowerCase().includes(needle));
}

export function searchNotes(notes: Note[], query: string): Note[] {
  const queryTerms = terms(query);
  if (!queryTerms.length) {
    return notes;
  }
  return notes.filter((note) => matchesAll(`${note.title} ${note.markdown}`, queryTerms));
}

export type SearchHitKind = "task" | "note" | "event";

export interface SearchHit {
  kind: SearchHitKind;
  id: string;
  title: string;
  subtitle: string;
  hash: string;
}

/** Global search across tasks, notes and events for the command palette. */
export function searchAll(
  query: string,
  data: { tasks: Task[]; notes: Note[]; events: CalendarEvent[] },
  limit = 8,
): SearchHit[] {
  const queryTerms = terms(query);
  if (!queryTerms.length) {
    return [];
  }

  const hits: SearchHit[] = [];

  for (const task of data.tasks) {
    if (matchesAll(`${task.title} ${task.description}`, queryTerms)) {
      hits.push({ kind: "task", id: task.id, title: task.title, subtitle: "Задача", hash: "#/tasks" });
    }
  }
  for (const note of data.notes) {
    if (matchesAll(`${note.title} ${note.markdown}`, queryTerms)) {
      hits.push({ kind: "note", id: note.id, title: note.title, subtitle: "Заметка", hash: "#/notes" });
    }
  }
  for (const event of data.events) {
    if (matchesAll(`${event.title} ${event.description}`, queryTerms)) {
      hits.push({ kind: "event", id: event.id, title: event.title, subtitle: "Событие", hash: "#/calendar" });
    }
  }

  return hits.slice(0, limit);
}
