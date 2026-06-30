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
