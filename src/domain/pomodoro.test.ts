import { describe, expect, it } from "vitest";
import { createDefaultSettings } from "./defaults";
import { addMinutesIso, completeFocusRound, createPomodoroCycle, getNextBreakPhase, getPhaseDurationMinutes } from "./pomodoro";

describe("pomodoro", () => {
  it("creates cycle from settings and switches to long break after configured focus count", () => {
    const cycle = createPomodoroCycle("task-1", createDefaultSettings());

    expect(cycle.focusMinutes).toBe(25);
    expect(getPhaseDurationMinutes(cycle, "focus")).toBe(25);
    expect(getPhaseDurationMinutes(cycle, "shortBreak")).toBe(5);
    expect(getPhaseDurationMinutes(cycle, "longBreak")).toBe(15);

    const afterFourFocusRounds = completeFocusRound({
      ...cycle,
      completedFocusCount: 3,
    });

    expect(getNextBreakPhase(afterFourFocusRounds)).toBe("longBreak");
  });

  it("adds minutes to iso dates", () => {
    expect(addMinutesIso("2026-05-27T10:00:00.000Z", 25)).toBe("2026-05-27T10:25:00.000Z");
  });
});
