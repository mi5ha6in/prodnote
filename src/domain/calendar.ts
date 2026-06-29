import type { CalendarEvent, CalendarPlan, EntityId } from "./types";

export type CalendarItemSource = "event" | "plan";

export interface CalendarItem {
  id: EntityId;
  source: CalendarItemSource;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  kind: string;
  taskId: EntityId | null;
}

export type HorizonKey = "overdue" | "today" | "tomorrow" | "thisWeek" | "thisMonth" | "thisYear" | "later";

export interface HorizonSection {
  key: HorizonKey;
  label: string;
  items: CalendarItem[];
}

export interface MonthCell {
  date: Date;
  dateKey: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

const HORIZON_LABELS: Record<HorizonKey, string> = {
  overdue: "Просрочено",
  today: "Сегодня",
  tomorrow: "Завтра",
  thisWeek: "Эта неделя",
  thisMonth: "Этот месяц",
  thisYear: "Этот год",
  later: "Позже",
};

const HORIZON_ORDER: HorizonKey[] = ["overdue", "today", "tomorrow", "thisWeek", "thisMonth", "thisYear", "later"];

export function eventToItem(event: CalendarEvent): CalendarItem {
  return {
    id: event.id,
    source: "event",
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    kind: event.kind,
    taskId: event.taskId,
  };
}

export function planToItem(plan: CalendarPlan): CalendarItem {
  return {
    id: plan.id,
    source: "plan",
    title: plan.title,
    startsAt: plan.startsAt,
    endsAt: plan.endsAt,
    allDay: false,
    kind: plan.kind,
    taskId: plan.taskId,
  };
}

export function toCalendarItems(events: CalendarEvent[], plans: CalendarPlan[]): CalendarItem[] {
  return [...events.map(eventToItem), ...plans.map(planToItem)].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function weekStartOffset(date: Date, weekStartsOn: 1 | 7): number {
  const startDow = weekStartsOn === 7 ? 0 : 1;
  return (date.getDay() - startDow + 7) % 7;
}

export function groupByHorizon(items: CalendarItem[], now: Date, weekStartsOn: 1 | 7): HorizonSection[] {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 6 - weekStartOffset(now, weekStartsOn));
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const yearEnd = new Date(now.getFullYear(), 11, 31);

  const buckets = new Map<HorizonKey, CalendarItem[]>();
  for (const key of HORIZON_ORDER) {
    buckets.set(key, []);
  }

  for (const item of items) {
    const itemDay = startOfDay(new Date(item.startsAt));
    const key = resolveHorizon(itemDay, { today, tomorrow, weekEnd, monthEnd, yearEnd });
    buckets.get(key)?.push(item);
  }

  return HORIZON_ORDER.map((key) => ({ key, label: HORIZON_LABELS[key], items: buckets.get(key) ?? [] })).filter(
    (section) => section.items.length > 0,
  );
}

function resolveHorizon(
  itemDay: Date,
  bounds: { today: Date; tomorrow: Date; weekEnd: Date; monthEnd: Date; yearEnd: Date },
): HorizonKey {
  const time = itemDay.getTime();
  if (time < bounds.today.getTime()) {
    return "overdue";
  }
  if (time === bounds.today.getTime()) {
    return "today";
  }
  if (time === bounds.tomorrow.getTime()) {
    return "tomorrow";
  }
  if (time <= bounds.weekEnd.getTime()) {
    return "thisWeek";
  }
  if (time <= bounds.monthEnd.getTime()) {
    return "thisMonth";
  }
  if (time <= bounds.yearEnd.getTime()) {
    return "thisYear";
  }
  return "later";
}

export function buildMonthMatrix(year: number, month: number, weekStartsOn: 1 | 7, now: Date): MonthCell[][] {
  const firstOfMonth = new Date(year, month, 1);
  const offset = weekStartOffset(firstOfMonth, weekStartsOn);
  const gridStart = new Date(year, month, 1 - offset);
  const todayKey = dayKey(now);

  const weeks: MonthCell[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const cells: MonthCell[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + week * 7 + weekday);
      cells.push({
        date,
        dateKey: dayKey(date),
        day: date.getDate(),
        inMonth: date.getMonth() === month,
        isToday: dayKey(date) === todayKey,
      });
    }
    weeks.push(cells);
  }

  return weeks;
}

/** Items whose date range (start..end inclusive, by local day) covers the given day. */
export function itemsForDay(items: CalendarItem[], dateKey: string): CalendarItem[] {
  const target = startOfDay(parseDateKey(dateKey)).getTime();
  return items.filter((item) => {
    const start = startOfDay(new Date(item.startsAt)).getTime();
    const end = startOfDay(new Date(item.endsAt)).getTime();
    return target >= start && target <= Math.max(start, end);
  });
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Whether an item spans more than one calendar day. */
export function isMultiDay(item: CalendarItem): boolean {
  return dayKey(new Date(item.startsAt)) !== dayKey(new Date(item.endsAt));
}

export function weekdayLabels(weekStartsOn: 1 | 7): string[] {
  const base = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  return weekStartsOn === 7 ? [base[6], ...base.slice(0, 6)] : base;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
