import type { ActiveTimer, Workspace } from "../domain/types";

const ACTIVE_TIMER_KEY = "prodnote-active-timer";

type StoredActiveTimer = Omit<ActiveTimer, "pausedAt" | "pausedTotalMs" | "goal"> &
  Partial<Pick<ActiveTimer, "pausedAt" | "pausedTotalMs" | "goal">>;

function isStorageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

function isStoredActiveTimer(value: unknown): value is StoredActiveTimer {
  if (!value || typeof value !== "object") {
    return false;
  }

  const timer = value as Partial<StoredActiveTimer>;
  const validPhase = timer.phase === "focus" || timer.phase === "shortBreak" || timer.phase === "longBreak";
  const validMode = timer.mode === "timer" || timer.mode === "pomodoro";

  return (
    typeof timer.taskId === "string" &&
    typeof timer.startedAt === "string" &&
    validMode &&
    (typeof timer.pomodoroCycleId === "string" || timer.pomodoroCycleId === null) &&
    validPhase &&
    (typeof timer.phaseEndsAt === "string" || timer.phaseEndsAt === null) &&
    (typeof timer.pausedAt === "string" || timer.pausedAt === null || typeof timer.pausedAt === "undefined") &&
    (typeof timer.pausedTotalMs === "number" || typeof timer.pausedTotalMs === "undefined")
  );
}

function normalizeStoredActiveTimer(timer: StoredActiveTimer): ActiveTimer {
  return {
    ...timer,
    pausedAt: timer.pausedAt ?? null,
    pausedTotalMs: timer.pausedTotalMs ?? 0,
    goal: typeof timer.goal === "string" && timer.goal.trim() ? timer.goal : null,
  };
}

export function loadActiveTimer(workspace: Workspace): ActiveTimer | null {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    const raw = localStorage.getItem(ACTIVE_TIMER_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isStoredActiveTimer(parsed)) {
      localStorage.removeItem(ACTIVE_TIMER_KEY);
      return null;
    }

    const normalized = normalizeStoredActiveTimer(parsed);

    const taskExists = workspace.tasks.some((task) => task.id === normalized.taskId);
    if (!taskExists) {
      localStorage.removeItem(ACTIVE_TIMER_KEY);
      return null;
    }

    return normalized;
  } catch {
    localStorage.removeItem(ACTIVE_TIMER_KEY);
    return null;
  }
}

export function saveActiveTimer(activeTimer: ActiveTimer): void {
  if (!isStorageAvailable()) {
    return;
  }

  localStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify(activeTimer));
}

export function clearActiveTimer(): void {
  if (!isStorageAvailable()) {
    return;
  }

  localStorage.removeItem(ACTIVE_TIMER_KEY);
}

export function isActiveTimerStorageEvent(event: StorageEvent): boolean {
  return event.key === ACTIVE_TIMER_KEY;
}
