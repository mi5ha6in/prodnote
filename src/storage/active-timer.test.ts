import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStarterWorkspace, createTask } from "../domain/defaults";
import type { ActiveTimer } from "../domain/types";
import { clearActiveTimer, loadActiveTimer, saveActiveTimer } from "./active-timer";

function createLocalStorageMock(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("active timer storage", () => {
  const task = createTask({ title: "Таймер" });
  const workspace = {
    ...createStarterWorkspace(),
    tasks: [task],
  };
  const activeTimer: ActiveTimer = {
    taskId: task.id,
    startedAt: "2026-05-29T10:00:00.000Z",
    mode: "timer",
    pomodoroCycleId: null,
    phase: "focus",
    phaseEndsAt: null,
  };

  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves and restores an active timer", () => {
    saveActiveTimer(activeTimer);

    expect(loadActiveTimer(workspace)).toEqual(activeTimer);
  });

  it("drops active timer when linked task no longer exists", () => {
    saveActiveTimer(activeTimer);

    expect(loadActiveTimer(createStarterWorkspace())).toBeNull();
  });

  it("clears active timer", () => {
    saveActiveTimer(activeTimer);
    clearActiveTimer();

    expect(loadActiveTimer(workspace)).toBeNull();
  });
});
