import { taskDeadlineItems } from "../src/domain/calendar";
import { EVENT_KIND_LABELS } from "../src/domain/defaults";
import { getDueAllDayReminders, getDueEventReminders } from "../src/domain/event-alerts";
import type { CalendarEventKind, Workspace } from "../src/domain/types";

export interface PushAlert {
  /** Stable per-occurrence key used for delivery deduplication. */
  key: string;
  title: string;
  body: string;
  hash: string;
}

const TIME = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

/**
 * Due reminders for a workspace at `nowMs`, using the same domain rules as the
 * in-app toast (lead times come from synced settings). Pure — unit-testable.
 */
export function collectPushAlerts(workspace: Workspace, nowMs: number): PushAlert[] {
  const alerts: PushAlert[] = [];

  for (const reminder of getDueEventReminders(workspace.events, nowMs, workspace.settings.eventReminderMinutes)) {
    const kind = EVENT_KIND_LABELS[reminder.event.kind];
    alerts.push({
      key: reminder.key,
      title: `Скоро: ${reminder.event.title}`,
      body: `${kind} в ${TIME.format(new Date(reminder.startsAt))}`,
      hash: "#/planner/calendar",
    });
  }

  const allDayItems = [
    ...workspace.events
      .filter((event) => event.allDay)
      .map((event) => ({ id: event.id, title: event.title, kind: event.kind as string, startsAt: event.startsAt })),
    ...taskDeadlineItems(workspace.tasks).map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind as string,
      startsAt: item.startsAt,
    })),
  ];
  for (const reminder of getDueAllDayReminders(allDayItems, nowMs, workspace.settings.allDayReminderHour)) {
    const kindLabel = EVENT_KIND_LABELS[reminder.kind as CalendarEventKind] ?? reminder.kind;
    alerts.push({
      key: reminder.key,
      title: reminder.title,
      body: `Сегодня · ${kindLabel}`,
      hash: "#/planner/calendar",
    });
  }

  return alerts;
}
