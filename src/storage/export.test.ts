import { describe, expect, it } from "vitest";
import { createStarterWorkspace } from "../domain/defaults";
import { SCHEMA_VERSION } from "../domain/types";
import { parseWorkspaceExport, stringifyExport, validateImportSnapshot } from "./export";

describe("workspace export", () => {
  it("stringifies, validates and parses workspace snapshots", () => {
    const workspace = createStarterWorkspace();
    const text = stringifyExport(workspace);
    const parsed = JSON.parse(text) as unknown;
    const preview = validateImportSnapshot(parsed);

    expect(preview.schemaVersion).toBe(SCHEMA_VERSION);
    expect(preview.projects).toBe(1);
    expect(parseWorkspaceExport(text).settings.pomodoroFocusMinutes).toBe(25);
  });

  it("rejects unsupported schema versions", () => {
    expect(() => validateImportSnapshot({ schemaVersion: 999 })).toThrow("Неподдерживаемая версия схемы");
  });

  it("migrates schema v1 notes to current note edit history shape", () => {
    const workspace = createStarterWorkspace();
    const legacyNote = {
      id: "note_legacy",
      title: "Старая заметка",
      markdown: "Текст",
      projectId: null,
      linkedTaskIds: [],
      tagIds: [],
      createdAt: "2026-05-27T10:00:00.000Z",
      updatedAt: "2026-05-27T10:00:00.000Z",
    };
    const text = JSON.stringify({
      ...workspace,
      schemaVersion: 1,
      notes: [legacyNote],
    });

    const parsed = parseWorkspaceExport(text);

    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.notes[0]?.editHistory).toEqual([]);
  });

  it("migrates old note edit durations to edit timestamps", () => {
    const workspace = createStarterWorkspace();
    const text = JSON.stringify({
      ...workspace,
      schemaVersion: 2,
      notes: [
        {
          id: "note_legacy",
          title: "Старая заметка",
          markdown: "Текст",
          projectId: null,
          linkedTaskIds: [],
          tagIds: [],
          editHistory: [
            {
              id: "note_edit_legacy",
              startedAt: "2026-05-27T10:00:00.000Z",
              endedAt: "2026-05-27T10:05:00.000Z",
              durationMinutes: 5,
            },
          ],
          createdAt: "2026-05-27T09:00:00.000Z",
          updatedAt: "2026-05-27T10:05:00.000Z",
        },
      ],
    });

    const parsed = parseWorkspaceExport(text);

    expect(parsed.notes[0]?.editHistory).toEqual([
      {
        id: "note_edit_legacy",
        editedAt: "2026-05-27T10:05:00.000Z",
      },
    ]);
  });

  it("fills missing pomodoro break counters for old exports", () => {
    const workspace = createStarterWorkspace();
    const text = JSON.stringify({
      ...workspace,
      schemaVersion: 3,
      pomodoroCycles: [
        {
          id: "pomodoro_legacy",
          taskId: "task_1",
          focusMinutes: 25,
          shortBreakMinutes: 5,
          longBreakMinutes: 15,
          longBreakEvery: 4,
          startedAt: "2026-05-27T10:00:00.000Z",
          completedFocusCount: 2,
          status: "running",
        },
      ],
    });

    const parsed = parseWorkspaceExport(text);

    expect(parsed.pomodoroCycles[0]).toMatchObject({
      completedFocusCount: 2,
      completedShortBreakCount: 0,
      completedLongBreakCount: 0,
    });
  });
});
