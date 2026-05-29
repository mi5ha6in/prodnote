import type { ActiveTimer, Workspace } from "../domain/types";

const ACTIVE_TIMER_KEY = "prodnote-active-timer";

function isStorageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

function isActiveTimer(value: unknown): value is ActiveTimer {
  if (!value || typeof value !== "object") {
    return false;
  }

  const timer = value as Partial<ActiveTimer>;
  const validPhase = timer.phase === "focus" || timer.phase === "shortBreak" || timer.phase === "longBreak";
  const validMode = timer.mode === "timer" || timer.mode === "pomodoro";

  return (
    typeof timer.taskId === "string" &&
    typeof timer.startedAt === "string" &&
    validMode &&
    (typeof timer.pomodoroCycleId === "string" || timer.pomodoroCycleId === null) &&
    validPhase &&
    (typeof timer.phaseEndsAt === "string" || timer.phaseEndsAt === null)
  );
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
    if (!isActiveTimer(parsed)) {
      localStorage.removeItem(ACTIVE_TIMER_KEY);
      return null;
    }

    const taskExists = workspace.tasks.some((task) => task.id === parsed.taskId);
    if (!taskExists) {
      localStorage.removeItem(ACTIVE_TIMER_KEY);
      return null;
    }

    return parsed;
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
