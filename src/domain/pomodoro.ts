import { createId, nowIso } from "./defaults";
import type { EntityId, PomodoroCycle, PomodoroPhase, Settings } from "./types";

export function createPomodoroCycle(taskId: EntityId, settings: Settings): PomodoroCycle {
  return {
    id: createId("pomodoro"),
    taskId,
    focusMinutes: settings.pomodoroFocusMinutes,
    shortBreakMinutes: settings.pomodoroShortBreakMinutes,
    longBreakMinutes: settings.pomodoroLongBreakMinutes,
    longBreakEvery: settings.pomodoroLongBreakEvery,
    startedAt: nowIso(),
    completedFocusCount: 0,
    completedShortBreakCount: 0,
    completedLongBreakCount: 0,
    status: "running",
  };
}

export function getNextBreakPhase(cycle: Pick<PomodoroCycle, "completedFocusCount" | "longBreakEvery">): PomodoroPhase {
  if (cycle.completedFocusCount > 0 && cycle.completedFocusCount % cycle.longBreakEvery === 0) {
    return "longBreak";
  }

  return "shortBreak";
}

export function getPhaseDurationMinutes(cycle: PomodoroCycle, phase: PomodoroPhase): number {
  if (phase === "focus") {
    return cycle.focusMinutes;
  }

  return phase === "longBreak" ? cycle.longBreakMinutes : cycle.shortBreakMinutes;
}

export function addMinutesIso(startIso: string, minutes: number): string {
  const date = new Date(startIso);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

export function completeFocusRound(cycle: PomodoroCycle): PomodoroCycle {
  return {
    ...cycle,
    completedFocusCount: cycle.completedFocusCount + 1,
  };
}

export function completeBreakPhase(cycle: PomodoroCycle, phase: Exclude<PomodoroPhase, "focus">): PomodoroCycle {
  if (phase === "longBreak") {
    return {
      ...cycle,
      completedLongBreakCount: cycle.completedLongBreakCount + 1,
    };
  }

  return {
    ...cycle,
    completedShortBreakCount: cycle.completedShortBreakCount + 1,
  };
}
