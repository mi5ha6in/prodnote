import { describe, expect, it } from "vitest";
import { createCalendarEvent, createNote, createTask } from "./defaults";
import { findBacklinks, searchAll, searchNotes } from "./search";

const notes = [
  createNote({ title: "TypeScript narrowing", markdown: "discriminated unions" }),
  createNote({ title: "Cooking", markdown: "pasta recipe" }),
];

describe("searchNotes", () => {
  it("returns all notes for an empty query", () => {
    expect(searchNotes(notes, "  ")).toHaveLength(2);
  });

  it("matches title and body, all terms (AND)", () => {
    expect(searchNotes(notes, "typescript").map((n) => n.title)).toEqual(["TypeScript narrowing"]);
    expect(searchNotes(notes, "pasta recipe").map((n) => n.title)).toEqual(["Cooking"]);
    expect(searchNotes(notes, "typescript pasta")).toHaveLength(0);
  });
});

describe("searchAll", () => {
  it("finds across tasks, notes and events", () => {
    const data = {
      tasks: [createTask({ title: "Ship release" })],
      notes,
      events: [createCalendarEvent({ title: "Release review", startsAt: "2026-07-01T09:00:00.000Z", endsAt: "2026-07-01T10:00:00.000Z" })],
    };

    const hits = searchAll("release", data);
    expect(hits.map((hit) => hit.kind).sort()).toEqual(["event", "task"]);
  });

  it("deep-links hits to the entity", () => {
    const task = createTask({ title: "Ship release" });
    const event = createCalendarEvent({
      title: "Release review",
      startsAt: "2026-07-01T09:00:00.000Z",
      endsAt: "2026-07-01T10:00:00.000Z",
    });
    const note = notes[0];

    const hits = searchAll("release", { tasks: [task], notes: [], events: [event] });
    expect(hits.find((hit) => hit.kind === "task")?.hash).toBe(`#/work/tasks/${task.id}`);
    expect(hits.find((hit) => hit.kind === "event")?.hash).toBe(`#/planner/calendar/${event.id}`);

    const noteHits = searchAll("typescript", { tasks: [], notes: [note], events: [] });
    expect(noteHits[0]?.hash).toBe(`#/notes/notes/${note.id}`);
  });

  it("matches tasks by journal entries and subtasks", () => {
    const byHistory = createTask({ title: "Задача" });
    byHistory.history = [{ id: "h1", at: "", kind: "note", markdown: "обсудили миграцию" }];
    const bySubtask = createTask({ title: "Другая" });
    bySubtask.subtasks = [{ id: "s1", title: "написать миграцию", done: false }];

    const hits = searchAll("миграцию", { tasks: [byHistory, bySubtask], notes: [], events: [] });
    expect(hits).toHaveLength(2);
  });

  it("returns nothing for an empty query", () => {
    expect(searchAll("", { tasks: [], notes, events: [] })).toHaveLength(0);
  });
});

describe("findBacklinks", () => {
  it("finds notes that wiki-link to the target", () => {
    const target = createNote({ title: "Architecture", markdown: "root" });
    const linker = createNote({ title: "Plan", markdown: "see [[Architecture]] for details" });
    const other = createNote({ title: "Misc", markdown: "nothing here" });

    const links = findBacklinks([target, linker, other], target);
    expect(links.map((n) => n.title)).toEqual(["Plan"]);
  });
});
