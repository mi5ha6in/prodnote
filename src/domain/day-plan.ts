import { dayKey, itemsForDay, toCalendarItems } from "./calendar";
import type { Task, Workspace } from "./types";

export interface DayPlan {
  /** Open tasks whose deadline is strictly before the day (carry-over candidates). */
  overdue: Task[];
  /** Open tasks already committed to the day (due or planned on it). */
  planned: Task[];
  /** Open tasks worth considering: due within a week or unsorted, not yet planned. */
  candidates: Task[];
  /** Minutes already blocked by timed calendar events on the day. */
  busyMinutes: number;
  /** Sum of estimates of the planned tasks (estimateMinutes, missing = 0). */
  plannedEstimateMinutes: number;
  /** Daily capacity from settings; 0 = budgeting disabled. */
  capacityMinutes: number;
  /** capacity − busy − planned estimates. Negative = the day is overbooked. */
  freeMinutes: number;
}

function isOpen(task: Task): boolean {
  return task.status !== "done";
}

/**
 * Which of the two day rituals is the primary action right now:
 * morning/afternoon — plan the day; evening (17:00+) — close it.
 * An evening with nothing planned keeps planning primary — there is nothing to close.
 */
export function primaryDayAction(now: Date, hasPlannedTasks: boolean): "plan" | "shutdown" {
  return now.getHours() >= 17 && hasPlannedTasks ? "shutdown" : "plan";
}

/** A task counts as planned for the day when its deadline or planned slot is on it. */
export function isPlannedForDay(task: Task, day: string): boolean {
  return task.dueDate === day || (task.plannedAt ? task.plannedAt.slice(0, 10) === day : false);
}

/** Everything the morning planning wizard needs, computed from the workspace. */
export function buildDayPlan(workspace: Workspace, day: string, now: Date = new Date()): DayPlan {
  const today = dayKey(now);
  const open = workspace.tasks.filter(isOpen);

  const overdue = open.filter((task) => task.dueDate !== null && task.dueDate < day && !isPlannedForDay(task, day));
  const planned = open.filter((task) => isPlannedForDay(task, day));

  const weekAhead = new Date(now);
  weekAhead.setDate(weekAhead.getDate() + 6);
  const weekEnd = dayKey(weekAhead);
  const candidates = open.filter(
    (task) =>
      !isPlannedForDay(task, day) &&
      !overdue.includes(task) &&
      (task.dueDate === null || (task.dueDate > day && task.dueDate <= weekEnd)),
  );

  const dayStart = new Date(`${day}T00:00:00`).getTime();
  const dayEnd = dayStart + 24 * 60 * 60000;
  const busyMinutes = itemsForDay(toCalendarItems(workspace.events), day)
    .filter((item) => !item.allDay)
    .reduce((sum, item) => {
      // Clamp to the day so overnight/multi-day events only count their share.
      const start = Math.max(Date.parse(item.startsAt), dayStart);
      const end = Math.min(Date.parse(item.endsAt), dayEnd);
      return sum + Math.max(0, Math.round((end - start) / 60000));
    }, 0);

  const plannedEstimateMinutes = planned.reduce((sum, task) => sum + (task.estimateMinutes ?? 0), 0);
  const capacityMinutes = day >= today ? workspace.settings.dailyCapacityMinutes : 0;

  return {
    overdue,
    planned,
    candidates,
    busyMinutes,
    plannedEstimateMinutes,
    capacityMinutes,
    freeMinutes: capacityMinutes - busyMinutes - plannedEstimateMinutes,
  };
}
