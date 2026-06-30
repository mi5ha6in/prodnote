import { dayKey } from "./calendar";
import { shiftDayKey } from "./checklist";
import { getSessionMinutes } from "./stats";
import type { Workspace } from "./types";

export interface ReviewDay {
  date: string;
  minutes: number;
}

export interface WeeklyReview {
  start: string;
  end: string;
  totalMinutes: number;
  sessionCount: number;
  tasksCompleted: number;
  checklistDone: number;
  checklistPlanned: number;
  habitsDone: number;
  habitsScheduled: number;
  activeDays: number;
  goalMinutes: number;
  perDay: ReviewDay[];
  /** 0–100 composite of consistency, checklist, habit and (if set) time-goal completion. */
  score: number;
}

/** Day key of the week start containing `ref`, honouring the week-start setting. */
export function weekStartKey(ref: Date, weekStartsOn: 1 | 7): string {
  const day = ref.getDay();
  const diff = weekStartsOn === 1 ? (day === 0 ? -6 : 1 - day) : -day;
  return dayKey(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + diff));
}

function inRange(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}

export function buildWeeklyReview(workspace: Workspace, weekStart: string): WeeklyReview {
  const days = Array.from({ length: 7 }, (_, offset) => shiftDayKey(weekStart, offset));
  const end = days[6] ?? weekStart;
  const habitTemplateIds = new Set(
    workspace.checklistTemplates.filter((template) => template.isHabit).map((template) => template.id),
  );

  const perDayMinutes = new Map<string, number>(days.map((day) => [day, 0]));
  let totalMinutes = 0;
  let sessionCount = 0;
  const activeDays = new Set<string>();

  for (const session of workspace.sessions) {
    const day = session.startedAt.slice(0, 10);
    if (!inRange(day, weekStart, end)) {
      continue;
    }
    const minutes = getSessionMinutes(session);
    totalMinutes += minutes;
    sessionCount += 1;
    perDayMinutes.set(day, (perDayMinutes.get(day) ?? 0) + minutes);
    activeDays.add(day);
  }

  let tasksCompleted = 0;
  for (const task of workspace.tasks) {
    if (task.completedAt && inRange(task.completedAt.slice(0, 10), weekStart, end)) {
      tasksCompleted += 1;
    }
  }

  let checklistDone = 0;
  let checklistPlanned = 0;
  let habitsDone = 0;
  let habitsScheduled = 0;
  for (const item of workspace.checklist) {
    if (!inRange(item.day, weekStart, end)) {
      continue;
    }
    checklistPlanned += 1;
    if (item.done) {
      checklistDone += 1;
      activeDays.add(item.day);
    }
    if (item.templateId && habitTemplateIds.has(item.templateId)) {
      habitsScheduled += 1;
      if (item.done) {
        habitsDone += 1;
      }
    }
  }

  const goalMinutes = workspace.settings.weeklyTimeGoalMinutes;
  const terms: Array<{ weight: number; value: number }> = [{ weight: 0.4, value: activeDays.size / 7 }];
  if (checklistPlanned > 0) {
    terms.push({ weight: 0.3, value: checklistDone / checklistPlanned });
  }
  if (habitsScheduled > 0) {
    terms.push({ weight: 0.3, value: habitsDone / habitsScheduled });
  }
  if (goalMinutes > 0) {
    terms.push({ weight: 0.3, value: Math.min(1, totalMinutes / goalMinutes) });
  }
  const weightSum = terms.reduce((sum, term) => sum + term.weight, 0);
  const score = weightSum > 0 ? Math.round((100 * terms.reduce((sum, term) => sum + term.weight * term.value, 0)) / weightSum) : 0;

  return {
    start: weekStart,
    end,
    totalMinutes,
    sessionCount,
    tasksCompleted,
    checklistDone,
    checklistPlanned,
    habitsDone,
    habitsScheduled,
    activeDays: activeDays.size,
    goalMinutes,
    perDay: days.map((day) => ({ date: day, minutes: perDayMinutes.get(day) ?? 0 })),
    score,
  };
}
