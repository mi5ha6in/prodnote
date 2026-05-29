import { describe, expect, it } from "vitest";
import type { ActiveTimer } from "./types";
import { getPhaseAlertState } from "./timer-alerts";

const active: ActiveTimer = {
  taskId: "task_1",
  startedAt: "2026-05-29T10:00:00.000Z",
  mode: "pomodoro",
  pomodoroCycleId: "pomodoro_1",
  phase: "focus",
  phaseEndsAt: "2026-05-29T10:25:00.000Z",
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
});
