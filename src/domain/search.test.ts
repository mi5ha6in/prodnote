import { describe, expect, it } from "vitest";
import { createCalendarEvent, createNote, createTask } from "./defaults";
import { searchAll, searchNotes } from "./search";

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

  it("returns nothing for an empty query", () => {
    expect(searchAll("", { tasks: [], notes, events: [] })).toHaveLength(0);
  });
});
