import { describe, expect, it } from "vitest";
import { createStarterWorkspace } from "./defaults";
import { migrateWorkspace } from "./migrations";
import { SCHEMA_VERSION } from "./types";

describe("workspace migrations", () => {
  it("rejects future and invalid schema versions", () => {
    const workspace = createStarterWorkspace();

    expect(() => migrateWorkspace({ ...workspace, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(
      "Неподдерживаемая версия схемы",
    );
    expect(() => migrateWorkspace({ ...workspace, schemaVersion: 0 })).toThrow(
      "Неподдерживаемая версия схемы",
    );
  });

  it("caps legacy overdue pomodoro sessions to configured focus duration", () => {
    const workspace = createStarterWorkspace();
    const cycle = {
      id: "pomodoro_legacy",
      taskId: "task_1",
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakEvery: 4,
      startedAt: "2026-06-01T10:00:00.000Z",
      completedFocusCount: 1,
      completedShortBreakCount: 0,
      completedLongBreakCount: 0,
      status: "running" as const,
    };

    const migrated = migrateWorkspace({
      ...workspace,
      schemaVersion: 3,
      pomodoroCycles: [cycle],
      sessions: [
        {
          id: "session_legacy",
          taskId: cycle.taskId,
          startedAt: cycle.startedAt,
          endedAt: "2026-06-01T12:00:00.000Z",
          durationMinutes: 120,
          mode: "pomodoro",
          note: "",
          pomodoroCycleId: cycle.id,
        },
      ],
    });

    expect(migrated.sessions[0]).toMatchObject({
      durationMinutes: 25,
      endedAt: "2026-06-01T10:25:00.000Z",
    });
  });

  it("leaves non-pomodoro sessions unchanged", () => {
    const workspace = createStarterWorkspace();
    const session = {
      id: "session_manual",
      taskId: "task_1",
      startedAt: "2026-06-01T10:00:00.000Z",
      endedAt: "2026-06-01T12:00:00.000Z",
      durationMinutes: 120,
      mode: "manual" as const,
      note: "",
      pomodoroCycleId: null,
    };

    const migrated = migrateWorkspace({ ...workspace, schemaVersion: 3, sessions: [session] });

    expect(migrated.sessions[0]).toEqual(session);
  });
});
