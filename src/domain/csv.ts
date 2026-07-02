import type { Project, Task, TimeSession } from "./types";

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Time sessions as a spreadsheet-friendly CSV (freelance billing, custom
 * reports). Columns are Russian to match the UI; oldest sessions first.
 */
export function sessionsToCsv(sessions: TimeSession[], tasks: Task[], projects: Project[]): string {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const projectById = new Map(projects.map((project) => [project.id, project.name]));

  const header = ["Дата", "Начало", "Конец", "Минуты", "Режим", "Задача", "Проект", "Заметка"];
  const rows = [...sessions]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((session) => {
      const task = taskById.get(session.taskId);
      const projectName = task?.projectId ? (projectById.get(task.projectId) ?? "") : "";
      return [
        session.startedAt.slice(0, 10),
        session.startedAt.slice(11, 16),
        session.endedAt.slice(11, 16),
        session.durationMinutes,
        session.mode,
        task?.title ?? "Удалённая задача",
        projectName,
        session.note,
      ]
        .map(csvCell)
        .join(",");
    });

  return [header.map(csvCell).join(","), ...rows].join("\n");
}
