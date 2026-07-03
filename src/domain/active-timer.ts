import type { ActiveTimer } from "./types";

export function isActiveTimerPaused(active: ActiveTimer | null): boolean {
  return Boolean(active?.pausedAt);
}

export function getActiveTimerReferenceMs(active: ActiveTimer, nowMs = Date.now()): number {
  return active.pausedAt ? Date.parse(active.pausedAt) : nowMs;
}

export function getActiveTimerElapsedMs(active: ActiveTimer, nowMs = Date.now()): number {
  return Math.max(0, getActiveTimerReferenceMs(active, nowMs) - Date.parse(active.startedAt) - active.pausedTotalMs);
}

export function getActiveTimerElapsedMinutes(active: ActiveTimer, nowMs = Date.now()): number {
  return Math.floor(getActiveTimerElapsedMs(active, nowMs) / 60000);
}

export function getActiveTimerRemainingSeconds(active: ActiveTimer, nowMs = Date.now()): number | null {
  if (!active.phaseEndsAt) {
    return null;
  }

  return Math.max(0, Math.floor((Date.parse(active.phaseEndsAt) - getActiveTimerReferenceMs(active, nowMs)) / 1000));
}

/** Human label for the current session state, shared by all timer indicators. */
export function getActiveTimerPhaseLabel(active: ActiveTimer): string {
  if (isActiveTimerPaused(active)) {
    return "На паузе";
  }

  return active.phase === "focus" ? "Фокус" : "Перерыв";
}

/**
 * Clock text for the timer readouts: countdown for pomodoro phases,
 * seconds-precision elapsed time for the plain timer (so the very first
 * minute visibly ticks instead of sitting at "0 мин").
 */
export function getActiveTimerClockReadout(active: ActiveTimer, nowMs = Date.now()): string {
  const remainingSeconds = getActiveTimerRemainingSeconds(active, nowMs);
  const totalSeconds = remainingSeconds ?? Math.floor(getActiveTimerElapsedMs(active, nowMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

export function getActiveTimerEndedAtIso(active: ActiveTimer, nowMs = Date.now()): string {
  return new Date(getActiveTimerReferenceMs(active, nowMs)).toISOString();
}

export function getActiveTimerDurationMinutes(active: ActiveTimer, nowMs = Date.now()): number {
  return Math.max(1, Math.round(getActiveTimerElapsedMs(active, nowMs) / 60000));
}

export function getPomodoroFocusEndedAtIso(active: ActiveTimer, nowMs = Date.now()): string {
  const referenceMs = getActiveTimerReferenceMs(active, nowMs);
  const endedAtMs = active.phaseEndsAt ? Math.min(referenceMs, Date.parse(active.phaseEndsAt)) : referenceMs;
  return new Date(endedAtMs).toISOString();
}

export function getPomodoroFocusDurationMinutes(active: ActiveTimer, nowMs = Date.now()): number {
  const endedAtMs = Date.parse(getPomodoroFocusEndedAtIso(active, nowMs));
  return Math.max(1, Math.round((endedAtMs - Date.parse(active.startedAt) - active.pausedTotalMs) / 60000));
}
