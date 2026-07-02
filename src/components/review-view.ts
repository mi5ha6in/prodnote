import { dayKey, weekdayLabels } from "../domain/calendar";
import { shiftDayKey } from "../domain/checklist";
import { escapeHtml } from "../domain/markdown";
import { buildWeeklyReview, weekStartKey } from "../domain/review";
import { formatDuration } from "../domain/stats";
import { DEFAULT_TASK_FILTER, filterAndSortTasks } from "../domain/task-filter";
import type { Task, Workspace } from "../domain/types";
import { appStore } from "../state";
import { badgeHtml, buttonAttrs, emptyStateHtml, metricBarHtml, viewHeaderHtml, wizardStepHtml } from "../ui/html";
import { setBodyScrollLock, wireModal } from "./modal";
import { renderShadow } from "./shadow";
import { formatDate, renderProjectOptions } from "./view-utils";

function scoreLabel(score: number): string {
  if (score >= 90) return "Отличная неделя";
  if (score >= 70) return "Сильная неделя";
  if (score >= 40) return "Хороший ритм";
  return "Разогрев";
}

export class ReviewView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private weekStart: string | null = null;
  /** 0 — мастер закрыт; 1..3 — текущий шаг направляемого ревью. */
  private wizardStep = 0;

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    setBodyScrollLock(false);
  }

  private currentWeekStart(): string {
    return weekStartKey(new Date(), appStore.getWorkspace().settings.weekStartsOn);
  }

  private render(): void {
    const workspace = appStore.getWorkspace();
    const thisWeek = this.currentWeekStart();
    const weekStart = this.weekStart ?? thisWeek;
    const review = buildWeeklyReview(workspace, weekStart);
    const labels = weekdayLabels(workspace.settings.weekStartsOn);
    const maxMinutes = Math.max(1, ...review.perDay.map((day) => day.minutes));

    const root = renderShadow(
      this,
      `
        <section class="view-grid">
          ${this.wizardStep > 0 ? this.renderWizard(workspace, review.score) : ""}

          ${viewHeaderHtml({
            eyebrow: "Ревью",
            title: "Итоги недели",
            actions: `
              <div class="week-nav" role="group" aria-label="Выбор недели">
                <button ${buttonAttrs({ tone: "ghost", size: "small", data: { weekShift: -7 } })} aria-label="Предыдущая неделя">‹</button>
                <span class="week-range">${escapeHtml(formatDate(review.start))} — ${escapeHtml(formatDate(review.end))}</span>
                <button ${buttonAttrs({ tone: "ghost", size: "small", data: { weekShift: 7 } })} aria-label="Следующая неделя">›</button>
                ${weekStart !== thisWeek ? `<button ${buttonAttrs({ size: "small", data: { action: "this-week" } })}>Эта неделя</button>` : ""}
              </div>
              <button ${buttonAttrs({ data: { action: "start-wizard" } })}>Провести ревью</button>
            `,
          })}

          <article class="card score-card">
            <div>
              <p class="eyebrow">Индекс продуктивности</p>
              <div class="score-value">${review.score}<span>/100</span></div>
              ${badgeHtml(scoreLabel(review.score))}
            </div>
            <div class="score-bar"><span style="width: ${review.score}%"></span></div>
            <p class="muted">Складывается из активных дней (40%), выполнения чек-листа (30%) и привычек (30%).</p>
          </article>

          ${metricBarHtml([
            review.goalMinutes > 0
              ? {
                  label: "Время за неделю",
                  value: `${formatDuration(review.totalMinutes)} / ${formatDuration(review.goalMinutes)}`,
                  hint: `${Math.round((review.totalMinutes / review.goalMinutes) * 100)}% цели`,
                }
              : { label: "Время за неделю", value: formatDuration(review.totalMinutes), hint: `${review.sessionCount} сессий` },
            { label: "Задачи закрыты", value: review.tasksCompleted, hint: "Завершено за неделю" },
            { label: "Чек-лист", value: `${review.checklistDone}/${review.checklistPlanned}`, hint: "Выполнено из запланированных" },
            { label: "Активных дней", value: `${review.activeDays}/7`, hint: "С работой или отметками" },
          ])}

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">Ритм</p>
                <h2>Время по дням</h2>
              </div>
              ${review.habitsScheduled > 0 ? badgeHtml(`привычки: ${review.habitsDone}/${review.habitsScheduled}`) : ""}
            </div>
            <div class="week-chart">
              ${review.perDay
                .map(
                  (day, index) => `
                    <div class="week-col">
                      <div class="week-bar" title="${escapeHtml(formatDuration(day.minutes))}">
                        <span style="height: ${Math.round((day.minutes / maxMinutes) * 100)}%"></span>
                      </div>
                      <span class="week-label">${escapeHtml(labels[index] ?? "")}</span>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </article>
        </section>
      `,
      styles,
    );

    root.querySelectorAll<HTMLButtonElement>("[data-week-shift]").forEach((button) => {
      button.addEventListener("click", () => {
        this.weekStart = shiftDayKey(weekStart, Number(button.dataset.weekShift));
        this.render();
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="this-week"]')?.addEventListener("click", () => {
      this.weekStart = null;
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="start-wizard"]')?.addEventListener("click", () => {
      this.wizardStep = 1;
      this.render();
    });

    this.wireWizard(root);
    setBodyScrollLock(this.wizardStep > 0);
  }

  private inboxTasks(workspace: Workspace): Task[] {
    return filterAndSortTasks(workspace.tasks, { ...DEFAULT_TASK_FILTER, smartList: "inbox" }, workspace.projects);
  }

  private overdueTasks(workspace: Workspace): Task[] {
    return filterAndSortTasks(workspace.tasks, { ...DEFAULT_TASK_FILTER, smartList: "overdue", sort: "due" }, workspace.projects);
  }

  private renderWizard(workspace: Workspace, score: number): string {
    const steps = ["Входящие", "Просроченное", "Итоги"];
    const stepBody =
      this.wizardStep === 1
        ? this.renderWizardInbox(workspace)
        : this.wizardStep === 2
          ? this.renderWizardOverdue(workspace)
          : this.renderWizardSummary(score);

    return wizardStepHtml({
      label: "Недельное ревью",
      step: this.wizardStep,
      totalSteps: steps.length,
      title: steps[this.wizardStep - 1] ?? "",
      body: stepBody,
      showBack: this.wizardStep > 1,
      footer:
        this.wizardStep < steps.length
          ? `<button ${buttonAttrs({ data: { action: "wizard-next" } })}>Далее</button>`
          : `<button ${buttonAttrs({ data: { action: "close-wizard" } })}>Готово</button>`,
    });
  }

  private renderWizardInbox(workspace: Workspace): string {
    const tasks = this.inboxTasks(workspace);
    if (!tasks.length) {
      return `${emptyStateHtml("Входящие пусты — отлично!")}`;
    }

    return `
      <p class="muted">Разложите захваченное по проектам или закройте то, что уже неактуально.</p>
      <div class="item-list">
        ${tasks
          .map(
            (task) => `
              <div class="list-item wizard-row">
                <strong>${escapeHtml(task.title)}</strong>
                <div class="row-actions">
                  <select data-wizard-project="${escapeHtml(task.id)}" aria-label="Проект для задачи">
                    ${renderProjectOptions(workspace.projects, task.projectId)}
                  </select>
                  <button ${buttonAttrs({ tone: "ghost", size: "small", data: { wizardDone: task.id } })}>Завершить</button>
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  private renderWizardOverdue(workspace: Workspace): string {
    const tasks = this.overdueTasks(workspace);
    if (!tasks.length) {
      return `${emptyStateHtml("Просроченных задач нет.")}`;
    }

    return `
      <p class="muted">Решите судьбу каждого просроченного дедлайна: перенесите, снимите или закройте.</p>
      <div class="item-list">
        ${tasks
          .map(
            (task) => `
              <div class="list-item wizard-row">
                <strong>${escapeHtml(task.title)}</strong>
                <div class="meta-row"><span>дедлайн: ${formatDate(task.dueDate)}</span></div>
                <div class="row-actions">
                  <button ${buttonAttrs({ tone: "ghost", size: "small", data: { wizardPostpone: task.id } })}>+7 дней</button>
                  <button ${buttonAttrs({ tone: "ghost", size: "small", data: { wizardCleardue: task.id } })}>Снять дедлайн</button>
                  <button ${buttonAttrs({ tone: "ghost", size: "small", data: { wizardDone: task.id } })}>Завершить</button>
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  private renderWizardSummary(score: number): string {
    return `
      <div class="wizard-summary">
        <p>Индекс продуктивности этой недели — <strong>${score}/100</strong> (${escapeHtml(scoreLabel(score))}).</p>
        <p class="muted">Входящие разобраны, просроченное решено. Остался последний шаг — распланировать следующую неделю в календаре.</p>
        <a class="button ghost" href="#/planner/calendar" data-action-close-on-follow>Запланировать неделю</a>
      </div>
    `;
  }

  private wireWizard(root: ShadowRoot): void {
    if (this.wizardStep === 0) {
      return;
    }

    wireModal(root, {
      onClose: () => {
        this.wizardStep = 0;
        this.render();
      },
    });

    root.querySelectorAll<HTMLButtonElement>('[data-action="close-wizard"]').forEach((button) => {
      button.addEventListener("click", () => {
        this.wizardStep = 0;
        this.render();
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="wizard-next"]')?.addEventListener("click", () => {
      this.wizardStep += 1;
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="wizard-back"]')?.addEventListener("click", () => {
      this.wizardStep -= 1;
      this.render();
    });

    root.querySelector<HTMLElement>("[data-action-close-on-follow]")?.addEventListener("click", () => {
      this.wizardStep = 0;
      setBodyScrollLock(false);
    });

    root.querySelectorAll<HTMLSelectElement>("[data-wizard-project]").forEach((select) => {
      select.addEventListener("change", () => {
        const taskId = select.dataset.wizardProject;
        if (taskId) {
          void appStore.assignTaskProject(taskId, select.value || null);
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-wizard-done]").forEach((button) => {
      button.addEventListener("click", () => {
        const taskId = button.dataset.wizardDone;
        if (taskId) {
          void appStore.updateTaskStatus(taskId, "done");
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-wizard-postpone]").forEach((button) => {
      button.addEventListener("click", () => {
        const taskId = button.dataset.wizardPostpone;
        if (taskId) {
          void appStore.rescheduleTask(taskId, shiftDayKey(dayKey(new Date()), 7));
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-wizard-cleardue]").forEach((button) => {
      button.addEventListener("click", () => {
        const taskId = button.dataset.wizardCleardue;
        if (taskId) {
          void appStore.rescheduleTask(taskId, null);
        }
      });
    });
  }
}

customElements.define("pn-review-view", ReviewView);

const styles = `
  .week-nav {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .week-range {
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .score-card {
    display: grid;
    gap: var(--space-3);
  }

  .score-value {
    font-size: 2.4rem;
    font-weight: 700;
    line-height: 1;
  }

  .score-value span {
    color: var(--muted);
    font-size: var(--text-base);
    font-weight: 500;
  }

  .score-bar {
    background: var(--surface);
    border-radius: var(--radius-pill);
    height: 0.6rem;
    overflow: hidden;
  }

  .score-bar span {
    background: var(--accent);
    border-radius: var(--radius-pill);
    display: block;
    height: 100%;
  }

  .week-chart {
    align-items: end;
    display: grid;
    gap: var(--space-2);
    grid-template-columns: repeat(7, 1fr);
    height: 9rem;
  }

  .week-col {
    display: grid;
    gap: var(--space-1);
    height: 100%;
    grid-template-rows: 1fr auto;
  }

  .week-bar {
    align-items: end;
    background: var(--surface);
    border-radius: var(--radius-sm);
    display: flex;
    overflow: hidden;
  }

  .week-bar span {
    background: var(--accent);
    border-radius: var(--radius-sm);
    display: block;
    min-height: 2px;
    width: 100%;
  }

  .week-label {
    color: var(--muted);
    font-size: var(--text-xs);
    text-align: center;
  }

  .wizard-row .row-actions select {
    width: auto;
  }

  .wizard-summary {
    display: grid;
    gap: var(--space-3);
    justify-items: start;
  }
`;
