import { PLAN_KIND_LABELS, SESSION_MODE_LABELS } from "../domain/defaults";
import { escapeHtml } from "../domain/markdown";
import { formatDuration } from "../domain/stats";
import type { CalendarPlanKind } from "../domain/types";
import { appStore } from "../state";
import { renderShadow } from "./shadow";
import {
  formatDateTime,
  fromDateTimeLocalValue,
  getTaskName,
  renderTaskOptions,
  requireInput,
  requireSelect,
  requireTextArea,
  toDateTimeLocalValue,
} from "./view-utils";

export class CalendarView extends HTMLElement {
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
    const now = new Date();
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const sortedPlans = [...workspace.plans].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    const sortedSessions = [...workspace.sessions].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

    const root = renderShadow(
      this,
      `
        <section class="view-grid">
          <div class="split-grid">
            <form class="card form-grid" data-form="plan">
              <div>
                <p class="eyebrow">План</p>
                <h2>Запланировать слот</h2>
              </div>
              <label>
                Задача
                <select name="taskId" required ${workspace.tasks.length ? "" : "disabled"}>
                  ${renderTaskOptions(workspace.tasks)}
                </select>
              </label>
              <label>
                Название
                <input name="title" required placeholder="Фокус по задаче" />
              </label>
              <div class="inline-grid">
                <label>
                  Начало
                  <input name="startsAt" type="datetime-local" required value="${toDateTimeLocalValue(now)}" />
                </label>
                <label>
                  Конец
                  <input name="endsAt" type="datetime-local" required value="${toDateTimeLocalValue(inOneHour)}" />
                </label>
              </div>
              <label>
                Тип
                <select name="kind">
                  <option value="focus">Фокус</option>
                  <option value="deadline">Дедлайн</option>
                  <option value="review">Ревью</option>
                </select>
              </label>
              <button type="submit" ${workspace.tasks.length ? "" : "disabled"}>Добавить в календарь</button>
              ${workspace.tasks.length ? "" : `<p class="muted">Сначала создайте задачу.</p>`}
            </form>

            <form class="card form-grid" data-form="manual">
              <div>
                <p class="eyebrow">История</p>
                <h2>Ручная сессия</h2>
              </div>
              <label>
                Задача
                <select name="taskId" required ${workspace.tasks.length ? "" : "disabled"}>
                  ${renderTaskOptions(workspace.tasks)}
                </select>
              </label>
              <div class="inline-grid">
                <label>
                  Начало
                  <input name="startedAt" type="datetime-local" required value="${toDateTimeLocalValue(thirtyMinutesAgo)}" />
                </label>
                <label>
                  Конец
                  <input name="endedAt" type="datetime-local" required value="${toDateTimeLocalValue(now)}" />
                </label>
              </div>
              <label>
                Заметка к сессии
                <textarea name="note" placeholder="Что было сделано за это время"></textarea>
              </label>
              <button type="submit" ${workspace.tasks.length ? "" : "disabled"}>Записать время</button>
            </form>
          </div>

          <div class="split-grid">
            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">План и дедлайны</p>
                  <h2>Календарь</h2>
                </div>
                <span class="status-pill">${sortedPlans.length}</span>
              </div>
              <div class="timeline">
                ${
                  sortedPlans.length
                    ? sortedPlans
                        .map(
                          (plan) => `
                            <div class="timeline-item">
                              <span class="timeline-dot"></span>
                              <div class="list-item">
                                <div class="meta-row">
                                  <span class="status-pill">${PLAN_KIND_LABELS[plan.kind]}</span>
                                  <span>${formatDateTime(plan.startsAt)} - ${formatDateTime(plan.endsAt)}</span>
                                </div>
                                <strong>${escapeHtml(plan.title)}</strong>
                                <p class="muted">${escapeHtml(getTaskName(workspace.tasks, plan.taskId))}</p>
                              </div>
                            </div>
                          `,
                        )
                        .join("")
                    : `<div class="empty">Запланированные фокус-сессии и дедлайны появятся здесь.</div>`
                }
              </div>
            </article>

            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Факт</p>
                  <h2>Рабочие сессии</h2>
                </div>
                <span class="status-pill">${sortedSessions.length}</span>
              </div>
              <div class="timeline">
                ${
                  sortedSessions.length
                    ? sortedSessions
                        .map(
                          (session) => `
                            <div class="timeline-item">
                              <span class="timeline-dot fact"></span>
                              <div class="list-item">
                                <div class="meta-row">
                                  <span class="status-pill">${SESSION_MODE_LABELS[session.mode]}</span>
                                  <span>${formatDuration(session.durationMinutes)}</span>
                                  <span>${formatDateTime(session.startedAt)}</span>
                                </div>
                                <strong>${escapeHtml(getTaskName(workspace.tasks, session.taskId))}</strong>
                                ${session.note ? `<p class="muted">${escapeHtml(session.note)}</p>` : ""}
                              </div>
                            </div>
                          `,
                        )
                        .join("")
                    : `<div class="empty">Остановите таймер или добавьте ручную сессию.</div>`
                }
              </div>
            </article>
          </div>
        </section>
      `,
      `
        .timeline {
          display: grid;
          gap: 0.85rem;
          position: relative;
        }

        .timeline-item {
          display: grid;
          gap: 0.65rem;
          grid-template-columns: 0.9rem minmax(0, 1fr);
        }

        .timeline-dot {
          background: var(--gold);
          border: 3px solid var(--paper);
          border-radius: 999px;
          box-shadow: 0 0 0 1px var(--line);
          height: 0.9rem;
          margin-top: 0.75rem;
          width: 0.9rem;
        }

        .timeline-dot.fact {
          background: var(--accent);
        }
      `,
    );

    root.querySelector<HTMLFormElement>('[data-form="plan"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      void appStore.addPlan({
        taskId: requireSelect(form, "taskId").value,
        title: requireInput(form, "title").value,
        startsAt: fromDateTimeLocalValue(requireInput(form, "startsAt").value),
        endsAt: fromDateTimeLocalValue(requireInput(form, "endsAt").value),
        kind: requireSelect(form, "kind").value as CalendarPlanKind,
      });
      form.reset();
    });

    root.querySelector<HTMLFormElement>('[data-form="manual"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      void appStore.addManualSession({
        taskId: requireSelect(form, "taskId").value,
        startedAt: fromDateTimeLocalValue(requireInput(form, "startedAt").value),
        endedAt: fromDateTimeLocalValue(requireInput(form, "endedAt").value),
        note: requireTextArea(form, "note").value,
      });
      form.reset();
    });
  }
}

customElements.define("pn-calendar-view", CalendarView);
