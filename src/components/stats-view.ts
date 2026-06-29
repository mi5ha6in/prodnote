import { escapeHtml } from "../domain/markdown";
import {
  formatDuration,
  getPlanVsActualByTask,
  getPomodoroStats,
  getProductiveHours,
  getTotalMinutes,
  groupSessionsByDay,
  groupSessionsByProject,
  groupSessionsByTag,
  groupSessionsByTask,
  type PlanActualStat,
} from "../domain/stats";
import { appStore } from "../state";
import { metricBarHtml } from "../ui/html";
import { renderShadow } from "./shadow";

export class StatsView extends HTMLElement {
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
    const totalMinutes = getTotalMinutes(workspace.sessions);
    const dayStats = groupSessionsByDay(workspace.sessions);
    const projectStats = groupSessionsByProject(workspace.sessions, workspace.tasks, workspace.projects);
    const taskStats = groupSessionsByTask(workspace.sessions, workspace.tasks);
    const tagStats = groupSessionsByTag(workspace.sessions, workspace.tasks, workspace.tags);
    const productiveHours = getProductiveHours(workspace.sessions);
    const bestHour = [...productiveHours].sort((a, b) => b.minutes - a.minutes)[0];
    const pomodoro = getPomodoroStats(workspace.sessions, workspace.pomodoroCycles);
    const planActual = getPlanVsActualByTask(workspace.events, workspace.sessions, workspace.tasks).slice(0, 8);

    renderShadow(
      this,
      `
        <section class="view-grid">
          ${metricBarHtml([
            { label: "Всего", value: formatDuration(totalMinutes), hint: `${workspace.sessions.length} сессий` },
            {
              label: "Помодоро",
              value: pomodoro.total,
              hint: `Работа ${formatDuration(pomodoro.focusMinutes)}, отдых ${formatDuration(pomodoro.breakMinutes)}`,
            },
            {
              label: "Лучший час",
              value: bestHour && bestHour.minutes > 0 ? `${bestHour.hour}:00` : "—",
              hint: bestHour && bestHour.minutes > 0 ? formatDuration(bestHour.minutes) : "Недостаточно данных",
            },
          ])}

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">Heatmap</p>
                <h2>Последние 28 дней</h2>
              </div>
            </div>
            ${this.renderHeatmap(dayStats)}
          </article>

          <div class="split-grid">
            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Проекты</p>
                  <h2>Где уходит время</h2>
                </div>
              </div>
              ${this.renderBars(projectStats, totalMinutes)}
            </article>
            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Задачи</p>
                  <h2>Главные фокусы</h2>
                </div>
              </div>
              ${this.renderBars(taskStats.slice(0, 8), totalMinutes)}
            </article>
          </div>

          <div class="split-grid">
            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Теги</p>
                  <h2>Контексты</h2>
                </div>
              </div>
              ${this.renderBars(tagStats, totalMinutes)}
            </article>
            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Продуктивные часы</p>
                  <h2>Когда получается работать</h2>
                </div>
              </div>
              <div class="hour-grid">
                ${productiveHours
                  .map((hour) => {
                    const opacity = totalMinutes === 0 ? 0 : Math.max(0.08, hour.minutes / Math.max(1, bestHour?.minutes ?? 1));
                    return `
                      <div class="hour-cell" title="${hour.hour}:00 - ${formatDuration(hour.minutes)}">
                        <span style="opacity: ${opacity}"></span>
                        <small>${hour.hour}</small>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            </article>
          </div>

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">План и факт</p>
                <h2>Запланировано против отработанного</h2>
              </div>
            </div>
            ${this.renderPlanActual(planActual)}
          </article>
        </section>
      `,
      `
        .plan-actual {
          display: grid;
          gap: var(--space-3);
        }

        .plan-actual-row {
          display: grid;
          gap: var(--space-2);
        }

        .plan-actual-head {
          align-items: baseline;
          display: flex;
          gap: var(--space-3);
          justify-content: space-between;
        }

        .plan-actual-bars {
          display: grid;
          gap: 0.3rem;
        }

        .pa-track {
          align-items: center;
          display: grid;
          gap: var(--space-2);
          grid-template-columns: 3rem minmax(0, 1fr) auto;
        }

        .pa-track .pa-label {
          color: var(--muted);
          font-size: var(--text-xs);
        }

        .pa-track .pa-value {
          color: var(--muted);
          font-size: var(--text-xs);
          font-variant-numeric: tabular-nums;
        }

        .pa-bar {
          background: var(--line);
          border-radius: var(--radius-pill);
          height: 0.5rem;
          overflow: hidden;
        }

        .pa-bar > span {
          border-radius: inherit;
          display: block;
          height: 100%;
        }

        .pa-bar.plan > span {
          background: var(--ink-soft);
        }

        .pa-bar.actual > span {
          background: var(--accent);
        }

        .heatmap {
          display: grid;
          gap: var(--space-2);
          grid-template-columns: repeat(14, minmax(0, 1fr));
        }

        .heat-cell {
          aspect-ratio: 1;
          background: color-mix(in srgb, var(--accent) calc(var(--heat) * 82%), var(--paper-strong));
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          display: grid;
          place-items: center;
        }

        .heat-cell small {
          color: var(--ink);
          font-size: var(--text-xs);
          font-weight: 700;
        }

        .bars {
          display: grid;
          gap: var(--space-3);
        }

        .hour-grid {
          display: grid;
          gap: var(--space-2);
          grid-template-columns: repeat(12, minmax(0, 1fr));
        }

        .hour-cell {
          display: grid;
          gap: var(--space-1);
          justify-items: center;
        }

        .hour-cell span {
          aspect-ratio: 1;
          background: var(--accent);
          border-radius: var(--radius-sm);
          display: block;
          width: 100%;
        }

        .hour-cell small {
          color: var(--muted);
          font-size: var(--text-xs);
        }

        @media (max-width: 720px) {
          .heatmap {
            grid-template-columns: repeat(7, minmax(0, 1fr));
          }

          .hour-grid {
            grid-template-columns: repeat(6, minmax(0, 1fr));
          }
        }
      `,
    );
  }

  private renderPlanActual(items: PlanActualStat[]): string {
    if (!items.length) {
      return `<div class="empty">Свяжите события с задачами и поработайте по таймеру, чтобы увидеть план и факт.</div>`;
    }

    const max = Math.max(1, ...items.map((item) => Math.max(item.plannedMinutes, item.actualMinutes)));

    return `
      <div class="plan-actual">
        ${items
          .map((item) => {
            const planWidth = Math.round((item.plannedMinutes / max) * 100);
            const actualWidth = Math.round((item.actualMinutes / max) * 100);
            return `
              <div class="plan-actual-row">
                <div class="plan-actual-head">
                  <strong>${escapeHtml(item.name)}</strong>
                </div>
                <div class="plan-actual-bars">
                  <div class="pa-track">
                    <span class="pa-label">План</span>
                    <div class="pa-bar plan"><span style="width: ${planWidth}%"></span></div>
                    <span class="pa-value">${formatDuration(item.plannedMinutes)}</span>
                  </div>
                  <div class="pa-track">
                    <span class="pa-label">Факт</span>
                    <div class="pa-bar actual"><span style="width: ${actualWidth}%"></span></div>
                    <span class="pa-value">${formatDuration(item.actualMinutes)}</span>
                  </div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  private renderBars(items: Array<{ id: string; name: string; minutes: number }>, totalMinutes: number): string {
    if (!items.length) {
      return `<div class="empty">Недостаточно данных для графика.</div>`;
    }

    return `
      <div class="bars">
        ${items
          .map((item) => {
            const width = Math.max(4, Math.round((item.minutes / Math.max(1, totalMinutes)) * 100));
            return `
              <div class="list-item">
                <div class="meta-row">
                  <strong>${escapeHtml(item.name)}</strong>
                  <span>${formatDuration(item.minutes)}</span>
                </div>
                <div class="bar"><span style="width: ${width}%"></span></div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  private renderHeatmap(dayStats: Array<{ date: string; minutes: number }>): string {
    const map = new Map(dayStats.map((day) => [day.date, day.minutes]));
    const dates = Array.from({ length: 28 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (27 - index));
      return date.toISOString().slice(0, 10);
    });
    const maxMinutes = Math.max(1, ...dates.map((date) => map.get(date) ?? 0));

    return `
      <div class="heatmap">
        ${dates
          .map((date) => {
            const minutes = map.get(date) ?? 0;
            const heat = minutes === 0 ? 0 : Math.max(0.12, minutes / maxMinutes);
            return `
              <div class="heat-cell" style="--heat: ${heat}" title="${date}: ${formatDuration(minutes)}">
                <small>${date.slice(8)}</small>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }
}

customElements.define("pn-stats-view", StatsView);
