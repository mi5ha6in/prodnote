import type { ActiveTimer } from "./types";

export type PhaseAlertState = {
  key: string;
  title: string;
  message: string;
  actionLabel: string;
};

export function getPhaseAlertState(active: ActiveTimer | null, nowMs = Date.now()): PhaseAlertState | null {
  if (!active?.phaseEndsAt || active.mode !== "pomodoro") {
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
