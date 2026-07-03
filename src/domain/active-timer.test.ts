import { describe, expect, it } from "vitest";
import {
  getActiveTimerClockReadout,
  getActiveTimerDurationMinutes,
  getActiveTimerElapsedMinutes,
  getActiveTimerRemainingSeconds,
  getPomodoroFocusDurationMinutes,
  getPomodoroFocusEndedAtIso,
  isActiveTimerPaused,
} from "./active-timer";
import type { ActiveTimer } from "./types";

describe("active timer helpers", () => {
  it("freezes elapsed time while timer is paused", () => {
    const active: ActiveTimer = {
      taskId: "task_1",
      startedAt: "2026-06-05T10:00:00.000Z",
      mode: "timer",
      pomodoroCycleId: null,
      phase: "focus",
      phaseEndsAt: null,
      pausedAt: "2026-06-05T10:10:00.000Z",
      pausedTotalMs: 0,
      goal: null,
    };

    expect(isActiveTimerPaused(active)).toBe(true);
    expect(getActiveTimerElapsedMinutes(active, Date.parse("2026-06-05T11:30:00.000Z"))).toBe(10);
    expect(getActiveTimerDurationMinutes(active, Date.parse("2026-06-05T11:30:00.000Z"))).toBe(10);
  });

  it("caps overdue pomodoro focus sessions at the scheduled phase end", () => {
    const active: ActiveTimer = {
      taskId: "task_1",
      startedAt: "2026-06-05T10:00:00.000Z",
      mode: "pomodoro",
      pomodoroCycleId: "pomodoro_1",
      phase: "focus",
      phaseEndsAt: "2026-06-05T10:25:00.000Z",
      pausedAt: null,
      pausedTotalMs: 0,
      goal: null,
    };

    expect(getActiveTimerRemainingSeconds(active, Date.parse("2026-06-05T10:40:00.000Z"))).toBe(0);
    expect(getPomodoroFocusEndedAtIso(active, Date.parse("2026-06-05T10:40:00.000Z"))).toBe("2026-06-05T10:25:00.000Z");
    expect(getPomodoroFocusDurationMinutes(active, Date.parse("2026-06-05T10:40:00.000Z"))).toBe(25);
  });

  it("ticks the plain-timer clock readout every second from the start", () => {
    const active: ActiveTimer = {
      taskId: "task_1",
      startedAt: "2026-06-05T10:00:00.000Z",
      mode: "timer",
      pomodoroCycleId: null,
      phase: "focus",
      phaseEndsAt: null,
      pausedAt: null,
      pausedTotalMs: 0,
      goal: null,
    };

    expect(getActiveTimerClockReadout(active, Date.parse("2026-06-05T10:00:00.000Z"))).toBe("00:00");
    expect(getActiveTimerClockReadout(active, Date.parse("2026-06-05T10:00:03.000Z"))).toBe("00:03");
    expect(getActiveTimerClockReadout(active, Date.parse("2026-06-05T10:01:07.000Z"))).toBe("01:07");
    expect(getActiveTimerClockReadout(active, Date.parse("2026-06-05T11:02:05.000Z"))).toBe("1:02:05");
  });

  it("counts the pomodoro clock readout down to the phase end", () => {
    const active: ActiveTimer = {
      taskId: "task_1",
      startedAt: "2026-06-05T10:00:00.000Z",
      mode: "pomodoro",
      pomodoroCycleId: "pomodoro_1",
      phase: "focus",
      phaseEndsAt: "2026-06-05T10:25:00.000Z",
      pausedAt: null,
      pausedTotalMs: 0,
      goal: null,
    };

    expect(getActiveTimerClockReadout(active, Date.parse("2026-06-05T10:00:01.000Z"))).toBe("24:59");
    expect(getActiveTimerClockReadout(active, Date.parse("2026-06-05T10:30:00.000Z"))).toBe("00:00");
  });
});
