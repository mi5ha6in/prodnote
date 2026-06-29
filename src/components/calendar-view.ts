import { PLAN_KIND_LABELS, SESSION_MODE_LABELS } from "../domain/defaults";
import { escapeHtml } from "../domain/markdown";
import { formatDuration } from "../domain/stats";
import type { CalendarPlanKind, Workspace } from "../domain/types";
import { appStore } from "../state";
import { buttonAttrs, fieldHtml, modalHtml, viewHeaderHtml } from "../ui/html";
import { wireModal } from "./modal";
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
  private creating: "plan" | "manual" | null = null;

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
    const sortedPlans = [...workspace.plans].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    const sortedSessions = [...workspace.sessions].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    const hasTasks = workspace.tasks.length > 0;

    const root = renderShadow(
      this,
      `
        <section class="view-grid">
          ${this.renderModal(workspace, now)}

          ${viewHeaderHtml({
            actions: `
              <button ${buttonAttrs({ tone: "ghost", data: { action: "open-plan" }, disabled: !hasTasks })}>+ Запланировать</button>
              <button ${buttonAttrs({ data: { action: "open-manual" }, disabled: !hasTasks })}>+ Записать время</button>
            `,
          })}

          ${hasTasks ? "" : `<p class="muted">Сначала создайте задачу в разделе «Задачи».</p>`}

          <div class="split-grid">
            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">План и дедлайны</p>
                  <h2>Запланировано</h2>
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
          gap: var(--space-3);
          position: relative;
        }

        .timeline-item {
          display: grid;
          gap: var(--space-2);
          grid-template-columns: 0.9rem minmax(0, 1fr);
        }

        .timeline-dot {
          background: var(--accent);
          border: 3px solid var(--paper);
          border-radius: var(--radius-pill);
          box-shadow: 0 0 0 1px var(--line-strong);
          height: 0.9rem;
          margin-top: 0.75rem;
          width: 0.9rem;
        }

        .timeline-dot.fact {
          background: var(--ink);
        }
      `,
    );

    this.bindActions(root);
  }

  private renderModal(workspace: Workspace, now: Date): string {
    if (this.creating === "plan") {
      return this.renderPlanModal(workspace, now);
    }

    if (this.creating === "manual") {
      return this.renderManualModal(workspace, now);
    }

    return "";
  }

  private renderPlanModal(workspace: Workspace, now: Date): string {
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

    return modalHtml({
      label: "Запланировать слот",
      body: `
        <form class="form-grid" data-form="plan">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <p class="eyebrow">План</p>
              <h2>Запланировать слот</h2>
            </div>
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-modal" } })}>Закрыть</button>
          </div>
          ${fieldHtml({
            label: "Задача",
            control: `<select name="taskId" required>${renderTaskOptions(workspace.tasks)}</select>`,
          })}
          ${fieldHtml({
            label: "Название",
            control: `<input name="title" required placeholder="Фокус по задаче" />`,
          })}
          <div class="inline-grid">
            ${fieldHtml({
              label: "Начало",
              control: `<input name="startsAt" type="datetime-local" required value="${toDateTimeLocalValue(now)}" />`,
            })}
            ${fieldHtml({
              label: "Конец",
              control: `<input name="endsAt" type="datetime-local" required value="${toDateTimeLocalValue(inOneHour)}" />`,
            })}
          </div>
          ${fieldHtml({
            label: "Тип",
            control: `<select name="kind">
              <option value="focus">Фокус</option>
              <option value="deadline">Дедлайн</option>
              <option value="review">Ревью</option>
            </select>`,
          })}
          <button ${buttonAttrs({ type: "submit" })}>Добавить в календарь</button>
        </form>
      `,
    });
  }

  private renderManualModal(workspace: Workspace, now: Date): string {
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    return modalHtml({
      label: "Ручная сессия",
      body: `
        <form class="form-grid" data-form="manual">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <p class="eyebrow">История</p>
              <h2>Записать время</h2>
            </div>
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-modal" } })}>Закрыть</button>
          </div>
          ${fieldHtml({
            label: "Задача",
            control: `<select name="taskId" required>${renderTaskOptions(workspace.tasks)}</select>`,
          })}
          <div class="inline-grid">
            ${fieldHtml({
              label: "Начало",
              control: `<input name="startedAt" type="datetime-local" required value="${toDateTimeLocalValue(thirtyMinutesAgo)}" />`,
            })}
            ${fieldHtml({
              label: "Конец",
              control: `<input name="endedAt" type="datetime-local" required value="${toDateTimeLocalValue(now)}" />`,
            })}
          </div>
          ${fieldHtml({
            label: "Заметка к сессии",
            control: `<textarea name="note" placeholder="Что было сделано за это время"></textarea>`,
          })}
          <button ${buttonAttrs({ type: "submit" })}>Записать время</button>
        </form>
      `,
    });
  }

  private bindActions(root: ShadowRoot): void {
    root.querySelector<HTMLButtonElement>('[data-action="open-plan"]')?.addEventListener("click", () => {
      this.creating = "plan";
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="open-manual"]')?.addEventListener("click", () => {
      this.creating = "manual";
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="close-modal"]')?.addEventListener("click", () => {
      this.creating = null;
      this.render();
    });

    if (this.creating) {
      wireModal(root, {
        onClose: () => {
          this.creating = null;
          this.render();
        },
      });
    }

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
      this.creating = null;
      this.render();
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
      this.creating = null;
      this.render();
    });
  }
}

customElements.define("pn-calendar-view", CalendarView);
