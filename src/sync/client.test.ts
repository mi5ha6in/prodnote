import { describe, expect, it } from "vitest";
import { createNote, createStarterWorkspace, createTask } from "../domain/defaults";
import { applyRemoteDeletions, diffWorkspaceForPush, mergeWorkspaces } from "./client";

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

  describe("applyRemoteDeletions", () => {
    it("drops entities deleted on another device", () => {
      const workspace = createStarterWorkspace();
      const task = createTask({ title: "Удалена на другом устройстве" });
      task.updatedAt = "2026-06-01T10:00:00.000Z";
      workspace.tasks = [task];

      const result = applyRemoteDeletions(workspace, [
        { type: "task", id: task.id, deletedAt: "2026-06-02T10:00:00.000Z" },
      ]);

      expect(result.tasks).toHaveLength(0);
    });

    it("keeps an entity edited after the remote deletion (edit wins by LWW)", () => {
      const workspace = createStarterWorkspace();
      const task = createTask({ title: "Отредактирована позже удаления" });
      task.updatedAt = "2026-06-03T10:00:00.000Z";
      workspace.tasks = [task];

      const result = applyRemoteDeletions(workspace, [
        { type: "task", id: task.id, deletedAt: "2026-06-02T10:00:00.000Z" },
      ]);

      expect(result.tasks).toHaveLength(1);
    });

    it("ignores tombstones for entities that are not present locally", () => {
      const workspace = createStarterWorkspace();
      const result = applyRemoteDeletions(workspace, [
        { type: "note", id: "note_missing", deletedAt: "2026-06-02T10:00:00.000Z" },
      ]);
      expect(result.notes).toHaveLength(0);
    });
  });

  describe("diffWorkspaceForPush", () => {
    it("pushes everything on the first push of a session", () => {
      const workspace = createStarterWorkspace();
      workspace.tasks = [createTask({ title: "A" })];

      const diff = diffWorkspaceForPush(workspace, null);

      expect(diff.payload.tasks).toHaveLength(1);
      expect(diff.payload.projects).toHaveLength(workspace.projects.length);
      expect(diff.changedCount).toBeGreaterThan(0);
    });

    it("sends only entities that changed since the previous push", () => {
      const workspace = createStarterWorkspace();
      const stable = createTask({ title: "Не менялась" });
      const edited = createTask({ title: "Старый текст" });
      workspace.tasks = [stable, edited];
      workspace.notes = [createNote({ title: "Заметка", markdown: "текст" })];

      const first = diffWorkspaceForPush(workspace, null);

      const next = {
        ...workspace,
        tasks: [stable, { ...edited, title: "Новый текст", updatedAt: "2026-06-05T10:00:00.000Z" }],
      };
      const second = diffWorkspaceForPush(next, first.nextIndex);

      expect(second.payload.tasks.map((task) => task.title)).toEqual(["Новый текст"]);
      expect(second.payload.notes).toHaveLength(0);
      expect(second.payload.projects).toHaveLength(0);
      expect(second.changedCount).toBe(1);
      // Settings ride along with every push.
      expect(second.payload.settings).toEqual(workspace.settings);
    });

    it("reports zero changes when nothing moved", () => {
      const workspace = createStarterWorkspace();
      const first = diffWorkspaceForPush(workspace, null);
      const second = diffWorkspaceForPush(workspace, first.nextIndex);
      expect(second.changedCount).toBe(0);
    });
  });
});
