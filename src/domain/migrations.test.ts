import { describe, expect, it } from "vitest";
import { createStarterWorkspace, createTask } from "./defaults";
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

  it("converts legacy plans into events and clears plans (idempotently)", () => {
    const workspace = createStarterWorkspace();
    const plan = {
      id: "plan_1",
      taskId: "task_1",
      title: "Focus slot",
      startsAt: "2026-06-01T10:00:00.000Z",
      endsAt: "2026-06-01T11:00:00.000Z",
      kind: "focus" as const,
      createdAt: "2026-05-30T08:00:00.000Z",
    };

    const migrated = migrateWorkspace({ ...workspace, schemaVersion: 6, plans: [plan] });

    expect(migrated.plans).toHaveLength(0);
    expect(migrated.events).toHaveLength(1);
    expect(migrated.events[0]).toMatchObject({
      id: "evt_plan_plan_1",
      taskId: "task_1",
      title: "Focus slot",
      kind: "focus",
      allDay: false,
    });

    // Re-running with the same plan still present must not duplicate the event.
    const again = migrateWorkspace({ ...workspace, schemaVersion: 6, plans: [plan], events: migrated.events });
    expect(again.events).toHaveLength(1);
  });

  it("defaults missing subtasks on legacy tasks", () => {
    const workspace = createStarterWorkspace();
    const { subtasks: _omit, ...legacyTask } = createTask({ title: "Legacy" });
    const migrated = migrateWorkspace({ ...workspace, schemaVersion: 7, tasks: [legacyTask as never] });
    expect(migrated.tasks[0]?.subtasks).toEqual([]);
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
