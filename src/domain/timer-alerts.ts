import type { ActiveTimer } from "./types";

export type PhaseAlertState = {
  key: string;
  title: string;
  message: string;
  actionLabel: string;
};

const notifiedPhaseAlertKeys = new Set<string>();
const dismissedPhaseAlertKeys = new Set<string>();

export function getPhaseAlertState(active: ActiveTimer | null, nowMs = Date.now()): PhaseAlertState | null {
  if (!active?.phaseEndsAt || active.mode !== "pomodoro" || active.pausedAt) {
    return null;
  }

  if (Date.parse(active.phaseEndsAt) > nowMs) {
    return null;
  }

  const isFocus = active.phase === "focus";

  return {
    key: `${active.taskId}:${active.startedAt}:${active.phase}:${active.phaseEndsAt}`,
    title: isFocus ? "Фокус завершён" : "Перерыв завершён",
    message: isFocus ? "Можно сохранить сессию и перейти к перерыву." : "Можно вернуться к следующему фокусному раунду.",
    actionLabel: isFocus ? "Продолжить к перерыву" : "Продолжить фокус",
  };
}

export function shouldNotifyPhaseAlert(key: string): boolean {
  if (notifiedPhaseAlertKeys.has(key)) {
    return false;
  }

  notifiedPhaseAlertKeys.add(key);
  return true;
}

export function dismissPhaseAlert(key: string): void {
  dismissedPhaseAlertKeys.add(key);
}

export function isPhaseAlertDismissed(key: string): boolean {
  return dismissedPhaseAlertKeys.has(key);
}

export function resetPhaseAlertNotifications(): void {
  notifiedPhaseAlertKeys.clear();
  dismissedPhaseAlertKeys.clear();
}
