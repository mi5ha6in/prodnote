import { createChecklistItem } from "./defaults";
import type { ChecklistItem, ChecklistTemplate } from "./types";

/** Local weekday (0 = Sunday … 6 = Saturday) for a YYYY-MM-DD day key. */
export function weekdayOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1).getDay();
}

/** Shift a YYYY-MM-DD day key by whole days, staying in local time. */
export function shiftDayKey(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const shifted = new Date(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + delta);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(shifted.getDate()).padStart(2, "0")}`;
}

export function templateAppliesToDay(template: ChecklistTemplate, day: string): boolean {
  if (template.archived) {
    return false;
  }
  const weekday = weekdayOf(day);
  switch (template.cadence) {
    case "daily":
      return true;
    case "weekdays":
      return weekday >= 1 && weekday <= 5;
    case "weekends":
      return weekday === 0 || weekday === 6;
  }
}

/** Day keys for the `count` days ending at (and including) `today`, oldest first. */
export function lastNDays(today: string, count: number): string[] {
  const days: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    days.push(shiftDayKey(today, -offset));
  }
  return days;
}

/** Days on which a template's materialized item was completed. */
export function habitDoneDays(items: ChecklistItem[], templateId: string): Set<string> {
  return new Set(items.filter((item) => item.templateId === templateId && item.done).map((item) => item.day));
}

/**
 * Consecutive scheduled days, counting back from today, on which the habit was
 * done. A pending (not-yet-done) most-recent scheduled day does not break the
 * streak; non-scheduled days are skipped.
 */
export function habitStreak(template: ChecklistTemplate, items: ChecklistItem[], today: string): number {
  const done = habitDoneDays(items, template.id);
  let streak = 0;
  let cursor = today;
  let sawScheduled = false;

  for (let step = 0; step < 400; step += 1) {
    if (templateAppliesToDay(template, cursor)) {
      if (done.has(cursor)) {
        streak += 1;
      } else if (sawScheduled) {
        break;
      }
      sawScheduled = true;
    }
    cursor = shiftDayKey(cursor, -1);
  }

  return streak;
}

/** Done-days of a habit within the week starting at `weekStart` (7 days). */
export function habitWeekProgress(template: ChecklistTemplate, items: ChecklistItem[], weekStart: string): number {
  const weekEnd = shiftDayKey(weekStart, 6);
  const done = habitDoneDays(items, template.id);
  let count = 0;
  for (const day of done) {
    if (day >= weekStart && day <= weekEnd) {
      count += 1;
    }
  }
  return count;
}

/**
 * For habits with a weekly goal: consecutive weeks meeting `targetPerWeek`,
 * counting back from the previous week. The current (unfinished) week extends
 * the streak once the goal is already met, but does not break it otherwise.
 */
export function habitWeekStreak(
  template: ChecklistTemplate,
  items: ChecklistItem[],
  weekStart: string,
): number {
  const target = template.targetPerWeek;
  if (!target || target <= 0) {
    return 0;
  }

  let streak = habitWeekProgress(template, items, weekStart) >= target ? 1 : 0;
  let cursor = shiftDayKey(weekStart, -7);
  for (let step = 0; step < 260; step += 1) {
    if (habitWeekProgress(template, items, cursor) < target) {
      break;
    }
    streak += 1;
    cursor = shiftDayKey(cursor, -7);
  }
  return streak;
}

/**
 * Build the checklist items that recurring templates should add to a day,
 * skipping templates that already have an item materialized for that day.
 */
export function materializeTemplates(
  templates: ChecklistTemplate[],
  dayItems: ChecklistItem[],
  day: string,
  startOrder: number,
): ChecklistItem[] {
  const present = new Set(dayItems.map((item) => item.templateId).filter(Boolean));
  const created: ChecklistItem[] = [];
  let order = startOrder;

  for (const template of templates) {
    if (!templateAppliesToDay(template, day) || present.has(template.id)) {
      continue;
    }
    created.push(createChecklistItem({ title: template.title, day, order, templateId: template.id }));
    order += 1;
  }

  return created;
}
