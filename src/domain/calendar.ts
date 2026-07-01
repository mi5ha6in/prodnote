import type { CalendarEvent, EntityId, Task } from "./types";

export type CalendarItemSource = "event" | "plan" | "deadline";

export interface CalendarItem {
  id: EntityId;
  source: CalendarItemSource;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  kind: string;
  taskId: EntityId | null;
  projectId: EntityId | null;
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
    projectId: event.projectId,
  };
}

export function toCalendarItems(events: CalendarEvent[]): CalendarItem[] {
  return events.map(eventToItem).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** Derive read-only all-day calendar items from the due dates of open tasks. */
export function taskDeadlineItems(tasks: Task[]): CalendarItem[] {
  return tasks
    .filter((task) => task.dueDate && task.status !== "done")
    .map((task) => {
      const [year, month, day] = (task.dueDate as string).split("-").map(Number);
      const iso = new Date(year, month - 1, day).toISOString();
      return {
        id: `deadline_${task.id}`,
        source: "deadline" as const,
        title: `Дедлайн: ${task.title}`,
        startsAt: iso,
        endsAt: iso,
        allDay: true,
        kind: "deadline",
        taskId: task.id,
        projectId: task.projectId,
      };
    });
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

export interface WeekSegment {
  item: CalendarItem;
  startCol: number;
  span: number;
  continuesLeft: boolean;
  continuesRight: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lay out events as horizontal bars across one week row (7 cells), Google-style.
 * Each returned lane holds non-overlapping segments; multi-day events span
 * multiple columns and flag continuation past the week edges.
 */
export function layoutWeekSegments(weekCells: MonthCell[], items: CalendarItem[]): WeekSegment[][] {
  const weekStart = startOfDay(weekCells[0].date).getTime();
  const weekEnd = startOfDay(weekCells[6].date).getTime();

  const segments = items
    .map((item) => {
      const start = startOfDay(new Date(item.startsAt)).getTime();
      const end = Math.max(start, startOfDay(new Date(item.endsAt)).getTime());
      return { item, start, end };
    })
    .filter(({ start, end }) => start <= weekEnd && end >= weekStart)
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || a.item.title.localeCompare(b.item.title))
    .map(({ item, start, end }) => {
      const startIdx = Math.round((start - weekStart) / DAY_MS);
      const endIdx = Math.round((end - weekStart) / DAY_MS);
      const startCol = Math.max(0, startIdx);
      const endCol = Math.min(6, endIdx);
      return {
        item,
        startCol,
        span: endCol - startCol + 1,
        continuesLeft: startIdx < 0,
        continuesRight: endIdx > 6,
      } satisfies WeekSegment;
    });

  const lanes: WeekSegment[][] = [];
  for (const segment of segments) {
    const segEnd = segment.startCol + segment.span - 1;
    const lane = lanes.find((existing) =>
      existing.every((other) => segEnd < other.startCol || segment.startCol > other.startCol + other.span - 1),
    );
    if (lane) {
      lane.push(segment);
    } else {
      lanes.push([segment]);
    }
  }

  return lanes;
}

/** Count of segments covering a given column across lanes beyond `visibleLanes`. */
export function overflowForColumn(lanes: WeekSegment[][], col: number, visibleLanes: number): number {
  return lanes
    .slice(visibleLanes)
    .flat()
    .filter((segment) => col >= segment.startCol && col <= segment.startCol + segment.span - 1).length;
}

/** The 7 days of the week containing `ref`, honoring the configured first day. */
export function buildWeekDays(ref: Date, weekStartsOn: 1 | 7): MonthCell[] {
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - weekStartOffset(ref, weekStartsOn));
  const todayKey = dayKey(new Date());

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return {
      date,
      dateKey: dayKey(date),
      day: date.getDate(),
      inMonth: true,
      isToday: dayKey(date) === todayKey,
    };
  });
}

/** Local minutes since midnight for an ISO timestamp (0..1439). */
export function minutesIntoDay(iso: string): number {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

/** Build a start/end ISO pair for a time block on `dateKey` at `minutes` into the day. */
export function buildTimeBlock(
  dateKey: string,
  minutes: number,
  durationMinutes = 60,
): { startsAt: string; endsAt: string } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, Math.max(0, minutes), 0);
  const end = new Date(start.getTime() + Math.max(1, durationMinutes) * 60000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

export function weekdayLabels(weekStartsOn: 1 | 7): string[] {
  const base = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  return weekStartsOn === 7 ? [base[6], ...base.slice(0, 6)] : base;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
