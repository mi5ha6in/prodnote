import { describe, expect, it } from "vitest";
import type { ActiveTimer } from "./types";
import {
  dismissPhaseAlert,
  getPhaseAlertState,
  isPhaseAlertDismissed,
  resetPhaseAlertNotifications,
  shouldNotifyPhaseAlert,
} from "./timer-alerts";

const active: ActiveTimer = {
  taskId: "task_1",
  startedAt: "2026-05-29T10:00:00.000Z",
  mode: "pomodoro",
  pomodoroCycleId: "pomodoro_1",
  phase: "focus",
  phaseEndsAt: "2026-05-29T10:25:00.000Z",
  pausedAt: null,
  pausedTotalMs: 0,
  goal: null,
};

describe("timer alerts", () => {
  it("does not alert before pomodoro phase ends", () => {
    expect(getPhaseAlertState(active, Date.parse("2026-05-29T10:24:59.000Z"))).toBeNull();
  });

  it("alerts when pomodoro phase ends", () => {
    expect(getPhaseAlertState(active, Date.parse("2026-05-29T10:25:00.000Z"))?.title).toBe("Фокус завершён");
  });

  it("does not alert for open-ended timer sessions", () => {
    expect(getPhaseAlertState({ ...active, mode: "timer", phaseEndsAt: null })).toBeNull();
  });

  it("does not alert while pomodoro is paused", () => {
    expect(getPhaseAlertState({ ...active, pausedAt: "2026-05-29T10:24:00.000Z" }, Date.parse("2026-05-29T10:30:00.000Z"))).toBeNull();
  });

  it("notifies only once for the same completed phase", () => {
    resetPhaseAlertNotifications();

    const alert = getPhaseAlertState(active, Date.parse("2026-05-29T10:25:00.000Z"));
    expect(alert).not.toBeNull();
    expect(shouldNotifyPhaseAlert(alert?.key ?? "")).toBe(true);
    expect(shouldNotifyPhaseAlert(alert?.key ?? "")).toBe(false);
  });

  it("tracks dismissed phase alerts", () => {
    resetPhaseAlertNotifications();

    const alert = getPhaseAlertState(active, Date.parse("2026-05-29T10:25:00.000Z"));
    expect(alert).not.toBeNull();
    expect(isPhaseAlertDismissed(alert?.key ?? "")).toBe(false);

    dismissPhaseAlert(alert?.key ?? "");

    expect(isPhaseAlertDismissed(alert?.key ?? "")).toBe(true);
  });
});
