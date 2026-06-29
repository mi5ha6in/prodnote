import type { CalendarEvent, PomodoroCycle, Project, Tag, Task, TimeSession } from "./types";

export interface NamedStat {
  id: string;
  name: string;
  minutes: number;
  color?: string;
}

export interface DayStat {
  date: string;
  minutes: number;
  sessions: number;
}

export interface HourStat {
  hour: number;
  minutes: number;
}

export interface PomodoroStat {
  total: number;
  focusMinutes: number;
  breakMinutes: number;
  totalMinutes: number;
}

export function getSessionMinutes(session: Pick<TimeSession, "durationMinutes" | "startedAt" | "endedAt">): number {
  if (Number.isFinite(session.durationMinutes) && session.durationMinutes >= 0) {
    return session.durationMinutes;
  }

  return Math.max(0, Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 60000));
}

export function getTotalMinutes(sessions: TimeSession[]): number {
  return sessions.reduce((sum, session) => sum + getSessionMinutes(session), 0);
}

export function groupSessionsByDay(sessions: TimeSession[]): DayStat[] {
  const map = new Map<string, DayStat>();

  for (const session of sessions) {
    const date = session.startedAt.slice(0, 10);
    const current = map.get(date) ?? { date, minutes: 0, sessions: 0 };
    current.minutes += getSessionMinutes(session);
    current.sessions += 1;
    map.set(date, current);
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function groupSessionsByTask(sessions: TimeSession[], tasks: Task[]): NamedStat[] {
  const names = new Map(tasks.map((task) => [task.id, task.title]));
  const map = new Map<string, NamedStat>();

  for (const session of sessions) {
    const current = map.get(session.taskId) ?? {
      id: session.taskId,
      name: names.get(session.taskId) ?? "Без задачи",
      minutes: 0,
    };
    current.minutes += getSessionMinutes(session);
    map.set(session.taskId, current);
  }

  return [...map.values()].sort((a, b) => b.minutes - a.minutes);
}

export function groupSessionsByProject(sessions: TimeSession[], tasks: Task[], projects: Project[]): NamedStat[] {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const map = new Map<string, NamedStat>();

  for (const session of sessions) {
    const task = tasksById.get(session.taskId);
    const projectId = task?.projectId ?? "none";
    const project = projectId === "none" ? null : projectsById.get(projectId);
    const current = map.get(projectId) ?? {
      id: projectId,
      name: project?.name ?? "Без проекта",
      minutes: 0,
      color: project?.color,
    };
    current.minutes += getSessionMinutes(session);
    map.set(projectId, current);
  }

  return [...map.values()].sort((a, b) => b.minutes - a.minutes);
}

export function groupSessionsByTag(sessions: TimeSession[], tasks: Task[], tags: Tag[]): NamedStat[] {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
  const map = new Map<string, NamedStat>();

  for (const session of sessions) {
    const task = tasksById.get(session.taskId);
    const tagIds = task?.tagIds.length ? task.tagIds : ["none"];

    for (const tagId of tagIds) {
      const tag = tagId === "none" ? null : tagsById.get(tagId);
      const current = map.get(tagId) ?? {
        id: tagId,
        name: tag?.name ?? "Без тега",
        minutes: 0,
        color: tag?.color,
      };
      current.minutes += getSessionMinutes(session);
      map.set(tagId, current);
    }
  }

  return [...map.values()].sort((a, b) => b.minutes - a.minutes);
}

export interface PlanActualStat {
  id: string;
  name: string;
  plannedMinutes: number;
  actualMinutes: number;
}

/** Planned (task-linked timed events) vs actual (sessions) minutes per task. */
export function getPlanVsActualByTask(
  events: CalendarEvent[],
  sessions: TimeSession[],
  tasks: Task[],
): PlanActualStat[] {
  const names = new Map(tasks.map((task) => [task.id, task.title]));
  const stats = new Map<string, PlanActualStat>();

  const ensure = (taskId: string): PlanActualStat => {
    let stat = stats.get(taskId);
    if (!stat) {
      stat = { id: taskId, name: names.get(taskId) ?? "Без задачи", plannedMinutes: 0, actualMinutes: 0 };
      stats.set(taskId, stat);
    }
    return stat;
  };

  for (const event of events) {
    if (!event.taskId || event.allDay) {
      continue;
    }
    const minutes = Math.max(0, Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000));
    ensure(event.taskId).plannedMinutes += minutes;
  }

  for (const session of sessions) {
    ensure(session.taskId).actualMinutes += getSessionMinutes(session);
  }

  return [...stats.values()]
    .filter((stat) => stat.plannedMinutes > 0 || stat.actualMinutes > 0)
    .sort((a, b) => b.plannedMinutes + b.actualMinutes - (a.plannedMinutes + a.actualMinutes));
}

export function getProductiveHours(sessions: TimeSession[]): HourStat[] {
  const map = new Map<number, HourStat>();

  for (const session of sessions) {
    const hour = new Date(session.startedAt).getHours();
    const current = map.get(hour) ?? { hour, minutes: 0 };
    current.minutes += getSessionMinutes(session);
    map.set(hour, current);
  }

  return [...Array.from({ length: 24 }, (_, hour) => map.get(hour) ?? { hour, minutes: 0 })];
}

export function getPomodoroStats(sessions: TimeSession[], pomodoroCycles: PomodoroCycle[] = []): PomodoroStat {
  const pomodoroSessions = sessions.filter((session) => session.mode === "pomodoro");
  const completedFocusRounds = pomodoroCycles.reduce((sum, cycle) => sum + cycle.completedFocusCount, 0);
  const focusMinutes = getTotalMinutes(pomodoroSessions);
  const breakMinutes = pomodoroCycles.reduce(
    (sum, cycle) =>
      sum + cycle.completedShortBreakCount * cycle.shortBreakMinutes + cycle.completedLongBreakCount * cycle.longBreakMinutes,
    0,
  );

  return {
    total: completedFocusRounds,
    focusMinutes,
    breakMinutes,
    totalMinutes: focusMinutes + breakMinutes,
  };
}

export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;

  if (hours === 0) {
    return `${rest} мин`;
  }

  if (rest === 0) {
    return `${hours} ч`;
  }

  return `${hours} ч ${rest} мин`;
}
