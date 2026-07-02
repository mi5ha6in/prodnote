import { describe, expect, it } from "vitest";
import { createCalendarEvent, createStarterWorkspace, createTask } from "../src/domain/defaults";
import { collectPushAlerts } from "./push-alerts";

describe("collectPushAlerts", () => {
  it("collects timed events inside the lead window and all-day deadlines after the morning hour", () => {
    const workspace = createStarterWorkspace();
    workspace.settings.eventReminderMinutes = 15;
    workspace.settings.allDayReminderHour = 9;

    const now = new Date("2026-07-02T10:00:00");
    workspace.events = [
      createCalendarEvent({ title: "Скоро начнётся", startsAt: "2026-07-02T10:10:00", endsAt: "2026-07-02T11:00:00" }),
      createCalendarEvent({ title: "Ещё далеко", startsAt: "2026-07-02T13:00:00", endsAt: "2026-07-02T14:00:00" }),
    ];
    workspace.tasks = [createTask({ title: "Дедлайн сегодня", dueDate: "2026-07-02" })];

    const alerts = collectPushAlerts(workspace, now.getTime());
    expect(alerts.map((alert) => alert.title)).toEqual(["Скоро: Скоро начнётся", "Дедлайн: Дедлайн сегодня"]);
    expect(alerts[0]?.body).toContain("10:10");
  });

  it("respects disabled reminders in settings", () => {
    const workspace = createStarterWorkspace();
    workspace.settings.eventReminderMinutes = 0;
    workspace.settings.allDayReminderHour = -1;
    workspace.events = [
      createCalendarEvent({ title: "Событие", startsAt: "2026-07-02T10:05:00", endsAt: "2026-07-02T11:00:00" }),
    ];
    workspace.tasks = [createTask({ title: "Дедлайн", dueDate: "2026-07-02" })];

    expect(collectPushAlerts(workspace, new Date("2026-07-02T10:00:00").getTime())).toHaveLength(0);
  });

  it("keys are stable per occurrence for deduplication", () => {
    const workspace = createStarterWorkspace();
    workspace.settings.eventReminderMinutes = 15;
    workspace.events = [
      createCalendarEvent({ title: "Событие", startsAt: "2026-07-02T10:10:00", endsAt: "2026-07-02T11:00:00" }),
    ];

    const nowMs = new Date("2026-07-02T10:00:00").getTime();
    const first = collectPushAlerts(workspace, nowMs);
    const second = collectPushAlerts(workspace, nowMs + 60000);
    expect(first[0]?.key).toBe(second[0]?.key);
  });
});
