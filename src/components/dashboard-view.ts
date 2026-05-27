import { TASK_STATUS_LABELS } from "../domain/defaults";
import { escapeHtml } from "../domain/markdown";
import { formatDuration, getTotalMinutes, groupSessionsByDay, groupSessionsByProject } from "../domain/stats";
import { appStore } from "../state";
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
          <div class="hero-card">
            <div>
              <p class="eyebrow">Сегодня</p>
              <h2>План, фокус и рабочий журнал в одном месте.</h2>
              <p class="muted">Данные остаются в браузере. Экспортируйте файл в настройках для бэкапа.</p>
            </div>
            <a class="button secondary" href="#/focus">Начать фокус</a>
          </div>

          <div class="three-grid">
            <article class="card">
              <p class="eyebrow">Время сегодня</p>
              <span class="stat-number">${formatDuration(todayMinutes)}</span>
              <p class="muted">Фактически завершённые сессии.</p>
            </article>
            <article class="card">
              <p class="eyebrow">Активные задачи</p>
              <span class="stat-number">${activeTasks.length}</span>
              <p class="muted">Бэклог, в работе и заблокированные.</p>
            </article>
            <article class="card">
              <p class="eyebrow">Всего времени</p>
              <span class="stat-number">${formatDuration(getTotalMinutes(workspace.sessions))}</span>
              <p class="muted">${workspace.sessions.length} сессий в журнале.</p>
            </article>
          </div>

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
        .hero-card {
          align-items: end;
          background:
            linear-gradient(135deg, rgba(20, 33, 61, 0.96), rgba(20, 33, 61, 0.78)),
            radial-gradient(circle at 85% 20%, rgba(225, 159, 68, 0.42), transparent 16rem);
          border-radius: 2rem;
          color: white;
          display: flex;
          gap: 1rem;
          justify-content: space-between;
          overflow: hidden;
          padding: clamp(1.2rem, 4vw, 2.2rem);
        }

        .hero-card .muted,
        .hero-card .eyebrow {
          color: rgba(255, 255, 255, 0.72);
        }

        .hero-card h2 {
          font-size: clamp(2rem, 5vw, 4.4rem);
          line-height: 0.95;
          max-width: 12ch;
        }

        .hero-card p:last-child {
          margin-top: 1rem;
          max-width: 42rem;
        }

        .day-strip {
          display: grid;
          gap: 0.75rem;
          grid-template-columns: repeat(auto-fit, minmax(5.2rem, 1fr));
        }

        .day-cell {
          background: rgba(42, 157, 143, 0.12);
          border: 1px solid rgba(42, 157, 143, 0.2);
          border-radius: 1rem;
          display: grid;
          gap: 0.25rem;
          padding: 0.8rem;
        }

        .day-cell span {
          color: var(--muted);
          font-size: 0.85rem;
        }

        @media (max-width: 720px) {
          .hero-card {
            align-items: start;
            flex-direction: column;
          }
        }
      `,
    );
  }
}

customElements.define("pn-dashboard-view", DashboardView);
