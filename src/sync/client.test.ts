import { describe, expect, it } from "vitest";
import { createStarterWorkspace, createTask } from "../domain/defaults";
import { mergeWorkspaces } from "./client";

describe("sync client", () => {
  it("keeps unauthenticated local data when remote has no newer revision", () => {
    const local = createStarterWorkspace();
    local.tasks = [createTask({ title: "Локальная задача" })];
    const remote = createStarterWorkspace();

    const merged = mergeWorkspaces(local, remote, 0, 0);

    expect(merged.tasks.map((task) => task.title)).toContain("Локальная задача");
  });

  it("uses entity-level last-write-wins for tasks", () => {
    const task = createTask({ title: "Старое название" });
    const local = createStarterWorkspace();
    local.tasks = [
      {
        ...task,
        title: "Локальная версия",
        updatedAt: "2026-05-29T10:00:00.000Z",
      },
    ];
    const remote = createStarterWorkspace();
    remote.tasks = [
      {
        ...task,
        title: "Серверная версия",
        updatedAt: "2026-05-29T09:00:00.000Z",
      },
    ];

    const merged = mergeWorkspaces(local, remote, 2, 1);

    expect(merged.tasks.find((item) => item.id === task.id)?.title).toBe("Локальная версия");
  });

  it("accepts newer remote settings after server revision advances", () => {
    const local = createStarterWorkspace();
    const remote = {
      ...createStarterWorkspace(),
      settings: {
        ...local.settings,
        pomodoroFocusMinutes: 45,
      },
    };

    const merged = mergeWorkspaces(local, remote, 2, 1);

    expect(merged.settings.pomodoroFocusMinutes).toBe(45);
  });
});
