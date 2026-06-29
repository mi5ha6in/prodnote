import { TASK_STATUS_LABELS } from "../domain/defaults";
import { escapeHtml } from "../domain/markdown";
import { formatDuration, getTotalMinutes, groupSessionsByDay, groupSessionsByProject } from "../domain/stats";
import { appStore } from "../state";
import { metricBarHtml } from "../ui/html";
import { renderShadow } from "./shadow";
import { formatDate, formatDateTime, getProjectName, getTaskName } from "./view-utils";

export class DashboardView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  private render(): void {
    const workspace = appStore.getWorkspace();
    const today = new Date().toISOString().slice(0, 10);
    const todayMinutes = workspace.sessions
      .filter((session) => session.startedAt.slice(0, 10) === today)
      .reduce((sum, session) => sum + session.durationMinutes, 0);
    const activeTasks = workspace.tasks.filter((task) => task.status !== "done");
    const dayStats = groupSessionsByDay(workspace.sessions);
    const projectStats = groupSessionsByProject(workspace.sessions, workspace.tasks, workspace.projects).slice(0, 4);
    const recentSessions = workspace.sessions.slice(0, 5);
    const recentNotes = workspace.notes.slice(0, 4);

    renderShadow(
      this,
      `
        <section class="view-grid">
          ${metricBarHtml([
            { label: "Время сегодня", value: formatDuration(todayMinutes), hint: "Завершённые сессии" },
            { label: "Активные задачи", value: activeTasks.length, hint: "В работе и бэклоге" },
            {
              label: "Всего времени",
              value: formatDuration(getTotalMinutes(workspace.sessions)),
              hint: `${workspace.sessions.length} сессий`,
            },
          ])}

          <div class="split-grid">
            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Задачи</p>
                  <h2>Текущий поток</h2>
                </div>
                <a class="button ghost small" href="#/tasks">Все задачи</a>
              </div>
              <div class="item-list">
                ${
                  activeTasks.slice(0, 6).length
                    ? activeTasks
                        .slice(0, 6)
                        .map(
                          (task) => `
                            <div class="list-item">
                              <strong>${escapeHtml(task.title)}</strong>
                              <div class="meta-row">
                                <span class="status-pill">${TASK_STATUS_LABELS[task.status]}</span>
                                <span>${escapeHtml(getProjectName(workspace.projects, task.projectId))}</span>
                                <span>дедлайн: ${formatDate(task.dueDate)}</span>
                              </div>
                            </div>
                          `,
                        )
                        .join("")
                    : `<div class="empty">Создайте первую задачу в разделе «Задачи».</div>`
                }
              </div>
            </article>

            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Журнал</p>
                  <h2>Последние сессии</h2>
                </div>
                <a class="button ghost small" href="#/calendar">Календарь</a>
              </div>
              <div class="item-list">
                ${
                  recentSessions.length
                    ? recentSessions
                        .map(
                          (session) => `
                            <div class="list-item">
                              <strong>${escapeHtml(getTaskName(workspace.tasks, session.taskId))}</strong>
                              <div class="meta-row">
                                <span>${formatDuration(session.durationMinutes)}</span>
                                <span>${formatDateTime(session.startedAt)}</span>
                                <span>${escapeHtml(session.mode)}</span>
                              </div>
                            </div>
                          `,
                        )
                        .join("")
                    : `<div class="empty">Сессии появятся после остановки таймера.</div>`
                }
              </div>
            </article>
          </div>

          <div class="split-grid">
            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Проекты</p>
                  <h2>Распределение времени</h2>
                </div>
              </div>
              <div class="item-list">
                ${
                  projectStats.length
                    ? projectStats
                        .map((project) => {
                          const width = Math.max(6, Math.round((project.minutes / Math.max(1, getTotalMinutes(workspace.sessions))) * 100));
                          return `
                            <div class="list-item">
                              <div class="meta-row"><strong>${escapeHtml(project.name)}</strong><span>${formatDuration(project.minutes)}</span></div>
                              <div class="bar"><span style="width: ${width}%"></span></div>
                            </div>
                          `;
                        })
                        .join("")
                    : `<div class="empty">Пока нет статистики по проектам.</div>`
                }
              </div>
            </article>

            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Заметки</p>
                  <h2>Свежие конспекты</h2>
                </div>
                <a class="button ghost small" href="#/notes">Все заметки</a>
              </div>
              <div class="item-list">
                ${
                  recentNotes.length
                    ? recentNotes
                        .map(
                          (note) => `
                            <div class="list-item">
                              <strong>${escapeHtml(note.title)}</strong>
                              <div class="meta-row">
                                <span>${escapeHtml(getProjectName(workspace.projects, note.projectId))}</span>
                                <span>${formatDate(note.updatedAt)}</span>
                              </div>
                            </div>
                          `,
                        )
                        .join("")
                    : `<div class="empty">Markdown-конспекты появятся здесь.</div>`
                }
              </div>
            </article>
          </div>

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">Ритм</p>
                <h2>Последние рабочие дни</h2>
              </div>
            </div>
            <div class="day-strip">
              ${
                dayStats.slice(-10).length
                  ? dayStats
                      .slice(-10)
                      .map(
                        (day) => `
                          <div class="day-cell">
                            <strong>${formatDuration(day.minutes)}</strong>
                            <span>${day.date.slice(5)}</span>
                          </div>
                        `,
                      )
                      .join("")
                  : `<div class="empty">После нескольких сессий здесь появится недельный ритм.</div>`
              }
            </div>
          </article>
        </section>
      `,
      `
        .day-strip {
          display: grid;
          gap: var(--space-2);
          grid-template-columns: repeat(auto-fit, minmax(5.2rem, 1fr));
        }

        .day-cell {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          display: grid;
          gap: 0.15rem;
          padding: var(--space-3);
        }

        .day-cell strong {
          font-variant-numeric: tabular-nums;
        }

        .day-cell span {
          color: var(--muted);
          font-size: var(--text-sm);
        }
      `,
    );
  }
}

customElements.define("pn-dashboard-view", DashboardView);
