import { dayKey, isMultiDay, itemsForDay, taskDeadlineItems, toCalendarItems, type CalendarItem } from "../domain/calendar";
import { shiftDayKey } from "../domain/checklist";
import { buildDayPlan, primaryDayAction, type DayPlan } from "../domain/day-plan";
import { EVENT_KIND_LABELS, TASK_STATUS_LABELS } from "../domain/defaults";
import { escapeHtml } from "../domain/markdown";
import { formatDuration, groupChecklistByDay } from "../domain/stats";
import type { CalendarEventKind, ChecklistItem, Task, Workspace } from "../domain/types";
import { appStore } from "../state";
import { badgeHtml, buttonAttrs, emptyStateHtml, metricBarHtml, viewHeaderHtml, wizardStepHtml } from "../ui/html";
import { setPendingFocusTaskId } from "./focus-intent";
import { setBodyScrollLock, wireModal } from "./modal";
import { renderShadow } from "./shadow";
import { formatDate, getProjectName, getTaskName } from "./view-utils";

const HISTORY_DAYS = 14;

function formatDayHeading(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "2-digit", month: "long" }).format(
    new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1),
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

/** Consecutive days ending today that have at least one completed item. */
function currentStreak(items: ChecklistItem[], today: string): number {
  const doneDays = new Set(items.filter((item) => item.done).map((item) => item.day));
  let cursor = today;
  // Сегодня ещё без отметок не рвёт серию — считаем со вчера (ср. habitStreak).
  if (!doneDays.has(cursor)) {
    cursor = shiftDayKey(cursor, -1);
  }
  let streak = 0;
  while (doneDays.has(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

export class TodayView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private selectedDay = dayKey(new Date());
  private focusAddInput = false;
  private editingItemId: string | null = null;
  private draggingId: string | null = null;
  /** 0 — мастер планирования закрыт; 1..3 — текущий шаг. */
  private planStep = 0;
  /** 0 — мастер закрытия дня закрыт; 1..3 — текущий шаг. */
  private shutdownStep = 0;

  connectedCallback(): void {
    // Deep link `#/planner/today/<day>`: открыть конкретный день.
    const entityId = this.getAttribute("entity-id");
    if (entityId && /^\d{4}-\d{2}-\d{2}$/.test(entityId)) {
      this.selectedDay = entityId;
    }
    this.unsubscribe = appStore.subscribe(() => this.render());
    void appStore.ensureChecklistForDay(this.selectedDay);
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    setBodyScrollLock(false);
  }

  private selectDay(day: string): void {
    this.selectedDay = day;
    void appStore.ensureChecklistForDay(day);
    this.render();
  }

  private render(): void {
    const workspace = appStore.getWorkspace();
    const today = dayKey(new Date());
    const day = this.selectedDay;

    const dayItems = workspace.checklist
      .filter((item) => item.day === day)
      .sort((a, b) => Number(a.done) - Number(b.done) || a.order - b.order || a.createdAt.localeCompare(b.createdAt));
    const doneCount = dayItems.filter((item) => item.done).length;
    const dayTasks = this.tasksForDay(workspace, day);
    const history = groupChecklistByDay(workspace.checklist).slice(-HISTORY_DAYS);
    const dayMinutes = workspace.sessions
      .filter((session) => session.startedAt.slice(0, 10) === day)
      .reduce((sum, session) => sum + session.durationMinutes, 0);
    const dayEvents = itemsForDay(
      [...toCalendarItems(workspace.events), ...taskDeadlineItems(workspace.tasks)],
      day,
    ).sort((a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.startsAt) - Date.parse(b.startsAt));
    const dayTaskIds = new Set(dayTasks.map((task) => task.id));
    const activeFlow =
      day === today ? workspace.tasks.filter((task) => task.status === "active" && !dayTaskIds.has(task.id)).slice(0, 5) : [];
    const isFreshWorkspace =
      !workspace.tasks.length && !workspace.notes.length && !workspace.sessions.length && !workspace.checklist.length;

    // Бюджет дня: ёмкость из настроек против событий и оценок задач (прошлые дни — capacity 0, метрика скрыта).
    const dayPlan = buildDayPlan(workspace, day);
    const budgetUsed = dayPlan.busyMinutes + dayPlan.plannedEstimateMinutes;
    const budgetMetric =
      dayPlan.capacityMinutes > 0
        ? [
            {
              label: "Бюджет дня",
              value: `${formatDuration(budgetUsed)} / ${formatDuration(dayPlan.capacityMinutes)}`,
              hint:
                dayPlan.freeMinutes >= 0
                  ? `свободно ${formatDuration(dayPlan.freeMinutes)}`
                  : `перегруз ${formatDuration(-dayPlan.freeMinutes)}`,
            },
          ]
        : [];
    // Вечером главная кнопка — «Закрыть день», днём — «Спланировать день».
    const primaryAction = primaryDayAction(new Date(), dayTasks.length > 0);

    const root = renderShadow(
      this,
      `
        <section class="view-grid">
          ${this.planStep > 0 ? this.renderPlanWizard(workspace, day) : ""}
          ${this.shutdownStep > 0 ? this.renderShutdownWizard(workspace, day) : ""}

          ${viewHeaderHtml({
            eyebrow: "День",
            title: "Чек-лист дня",
            actions: `
              <div class="day-nav" role="group" aria-label="Выбор дня">
                <button ${buttonAttrs({ tone: "ghost", size: "small", data: { dayShift: -1 } })} aria-label="Предыдущий день">‹</button>
                <input type="date" class="day-input" value="${escapeHtml(day)}" aria-label="Дата" />
                <button ${buttonAttrs({ tone: "ghost", size: "small", data: { dayShift: 1 } })} aria-label="Следующий день">›</button>
                ${day !== today ? `<button ${buttonAttrs({ size: "small", data: { action: "go-today" } })}>Сегодня</button>` : ""}
              </div>
              ${day >= today ? `<button ${buttonAttrs({ tone: primaryAction === "plan" ? "primary" : "ghost", data: { action: "start-plan" } })}>Спланировать день</button>` : ""}
              ${day <= today ? `<button ${buttonAttrs({ tone: primaryAction === "shutdown" ? "primary" : "ghost", data: { action: "start-shutdown" } })}>Закрыть день</button>` : ""}
            `,
          })}

          ${metricBarHtml([
            { label: "Чек-лист", value: `${doneCount}/${dayItems.length}`, hint: formatDayHeading(day) },
            { label: "Время за день", value: formatDuration(dayMinutes), hint: "Завершённые сессии" },
            { label: "Серия дней", value: currentStreak(workspace.checklist, today), hint: "Дни подряд с отметками" },
            ...budgetMetric,
          ])}
          ${
            dayPlan.capacityMinutes > 0
              ? `<div class="bar budget-bar" title="Занято ${escapeHtml(formatDuration(budgetUsed))} из ${escapeHtml(formatDuration(dayPlan.capacityMinutes))}"><span style="width: ${Math.max(0, Math.min(100, Math.round((budgetUsed / dayPlan.capacityMinutes) * 100)))}%"></span></div>`
              : ""
          }

          ${isFreshWorkspace ? this.renderOnboarding() : ""}

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">${escapeHtml(formatDayHeading(day))}</p>
                <h2>Список на день</h2>
              </div>
              <div class="row-actions">
                <a class="button ghost small" href="#/planner/habits">Настроить рутину →</a>
                <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "rollover" } })}>Перенести со вчера</button>
              </div>
            </div>

            <form class="check-add" data-add-form>
              <input name="title" placeholder="Добавить пункт на день…" aria-label="Новый пункт" autocomplete="off" />
              <button ${buttonAttrs({ type: "submit", size: "small" })}>Добавить</button>
            </form>

            <div class="check-list">
              ${
                dayItems.length
                  ? dayItems.map((item) => this.renderItem(item, workspace)).join("")
                  : emptyStateHtml("Пунктов нет. Составьте список на день.")
              }
            </div>
          </article>

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">Задачи</p>
                <h2>Запланировано на день</h2>
              </div>
              <a class="button ghost small" href="#/work/tasks">Все задачи</a>
            </div>
            <div class="check-list">
              ${
                dayTasks.length
                  ? dayTasks.map((task) => this.renderTaskRow(task)).join("")
                  : emptyStateHtml("Задач на день нет. Возьмите их через «Спланировать день» или создайте в Работа → Задачи.")
              }
            </div>
            ${
              activeFlow.length
                ? `
                  <p class="eyebrow flow-heading">В работе сейчас</p>
                  <div class="check-list">
                    ${activeFlow.map((task) => this.renderFlowRow(task, workspace)).join("")}
                  </div>
                `
                : ""
            }
          </article>

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">Расписание</p>
                <h2>События дня</h2>
              </div>
              <a class="button ghost small" href="#/planner/calendar">Календарь</a>
            </div>
            <div class="item-list">
              ${
                dayEvents.length
                  ? dayEvents.map((item) => this.renderEventRow(item, workspace)).join("")
                  : emptyStateHtml("Событий нет. Добавьте их в Планер → Календарь.")
              }
            </div>
          </article>

          <details class="card history-details">
            <summary>
              <span class="eyebrow">История</span>
              <strong>Сделано по дням</strong>
            </summary>
            <div class="history-grid">
              ${
                history.length
                  ? history
                      .map((stat) => {
                        const percent = stat.total ? Math.round((stat.done / stat.total) * 100) : 0;
                        return `
                          <button type="button" class="history-cell ${stat.date === day ? "is-selected" : ""}" data-history-day="${escapeHtml(stat.date)}">
                            <span class="history-date">${escapeHtml(stat.date.slice(5))}</span>
                            <strong>${stat.done}/${stat.total}</strong>
                            <span class="bar"><span style="width: ${percent}%"></span></span>
                          </button>
                        `;
                      })
                      .join("")
                  : emptyStateHtml("Отмечайте пункты — здесь появится история дней.")
              }
            </div>
          </details>
        </section>
      `,
      `
        .day-nav {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }

        @media (max-width: 560px) {
          .check-item {
            flex-wrap: wrap;
          }

          .check-actions {
            margin-left: auto;
          }
        }

        .day-input {
          width: auto;
        }

        .flow-heading {
          margin: var(--space-3) 0 var(--space-2);
        }

        .flow-link {
          text-decoration: none;
        }

        .flow-link:hover {
          text-decoration: underline;
        }

        .onboarding-step {
          text-decoration: none;
        }

        button.onboarding-step {
          cursor: pointer;
          font: inherit;
          text-align: left;
          width: 100%;
        }

        .onboarding-step:hover {
          border-color: var(--line-strong);
        }

        .onboarding-num {
          align-items: center;
          background: var(--accent-soft);
          border-radius: var(--radius-pill);
          color: var(--accent-strong);
          display: inline-flex;
          flex: none;
          font-size: var(--text-xs);
          font-weight: 700;
          height: 1.5rem;
          justify-content: center;
          width: 1.5rem;
        }

        .check-add {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-3);
        }

        .count-control {
          align-items: center;
          display: inline-flex;
          flex: none;
          gap: var(--space-1);
        }

        .check-item label {
          margin: 0;
        }

        .check-list {
          display: grid;
          gap: var(--space-2);
        }

        .check-item {
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          display: flex;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-3);
        }

        .check-item input[type="checkbox"] {
          width: auto;
        }

        .check-title {
          flex: 1;
          font-weight: 600;
          min-width: 0;
        }

        .check-item.is-done .check-title {
          color: var(--muted);
          text-decoration: line-through;
        }

        .check-edit-start {
          background: transparent;
          border: none;
          color: inherit;
          cursor: text;
          font: inherit;
          /* Кнопки по умолчанию центрируют контент — заголовок пункта
             должен прижиматься к чекбоксу, как обычный текст. */
          justify-content: flex-start;
          min-height: 0;
          padding: 0;
          text-align: left;
        }

        .check-edit-start:hover {
          /* Общий button:hover красит фон в акцент — для текстового
             псевдо-инпута достаточно подчёркивания. */
          background: transparent;
          text-decoration: underline;
        }

        .check-item[draggable="true"] {
          cursor: grab;
        }

        .check-item.is-drag-over {
          border-color: var(--accent);
          box-shadow: inset 0 0 0 1px var(--accent-soft);
        }

        .check-edit {
          flex: 1;
        }

        .check-edit input {
          width: 100%;
        }

        .check-time {
          color: var(--muted);
          font-size: var(--text-sm);
          font-variant-numeric: tabular-nums;
        }

        .check-actions {
          display: flex;
          gap: var(--space-1);
        }

        .history-details > summary {
          align-items: baseline;
          cursor: pointer;
          display: flex;
          gap: var(--space-2);
        }

        .history-details > summary strong {
          font-size: var(--text-lg);
          font-weight: 650;
        }

        .history-details[open] > summary {
          margin-bottom: var(--space-3);
        }

        .history-grid {
          display: grid;
          gap: var(--space-2);
          grid-template-columns: repeat(auto-fit, minmax(5rem, 1fr));
        }

        .history-cell {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          cursor: pointer;
          display: grid;
          gap: 0.25rem;
          padding: var(--space-2);
          text-align: left;
        }

        .history-cell:hover {
          border-color: var(--line-strong);
        }

        .history-cell.is-selected {
          border-color: var(--accent);
          box-shadow: inset 0 0 0 1px var(--accent-soft);
        }

        .history-date {
          color: var(--muted);
          font-size: var(--text-xs);
        }

        .history-cell strong {
          font-variant-numeric: tabular-nums;
        }

        .plan-row {
          align-items: center;
          display: flex;
          gap: var(--space-3);
          justify-content: space-between;
        }

        .plan-pick {
          align-items: center;
          display: flex;
          flex: 1;
          gap: var(--space-2);
          min-width: 0;
        }

        .plan-pick input {
          width: auto;
        }

        .plan-estimate {
          align-items: center;
          display: flex;
          flex: none;
          gap: var(--space-2);
        }

        .plan-estimate input {
          width: 5rem;
        }
      `,
    );

    this.wire(root);
    this.wirePlanWizard(root);
    this.wireShutdownWizard(root);
    setBodyScrollLock(this.planStep > 0 || this.shutdownStep > 0);
  }

  private renderItem(item: ChecklistItem, workspace: Workspace): string {
    if (this.editingItemId === item.id) {
      return `
        <div class="check-item">
          <form class="check-edit" data-edit-form>
            <input name="title" value="${escapeHtml(item.title)}" aria-label="Название пункта" autocomplete="off" />
          </form>
        </div>
      `;
    }

    const target = item.templateId
      ? Math.max(1, workspace.checklistTemplates.find((template) => template.id === item.templateId)?.targetCount ?? 1)
      : 1;

    return `
      <div class="check-item ${item.done ? "is-done" : ""}" draggable="true" data-drag-item="${escapeHtml(item.id)}">
        ${
          target > 1
            ? `<span class="count-control">
                <button ${buttonAttrs({ tone: "ghost", size: "small", data: { countDec: item.id } })} aria-label="Убавить">−</button>
                <span class="check-time">${item.count}/${target}</span>
                <button ${buttonAttrs({ tone: "ghost", size: "small", data: { countInc: item.id } })} aria-label="Прибавить">+</button>
              </span>`
            : `<input type="checkbox" data-toggle="${escapeHtml(item.id)}" ${item.done ? "checked" : ""} aria-label="Отметить выполненным" />`
        }
        <button type="button" class="check-title check-edit-start" data-edit-item="${escapeHtml(item.id)}" title="Переименовать">${escapeHtml(item.title)}</button>
        ${item.templateId ? badgeHtml("из привычки") : ""}
        ${item.rolledFrom ? badgeHtml("перенесено") : ""}
        ${item.done && item.doneAt ? `<span class="check-time">${escapeHtml(formatTime(item.doneAt))}</span>` : ""}
        <span class="check-actions">
          <button ${buttonAttrs({ tone: "ghost", size: "small", data: { focus: item.id } })} title="Начать фокус по пункту">В фокус</button>
          <button ${buttonAttrs({ tone: "ghost", size: "small", data: { remove: item.id } })} aria-label="Удалить пункт">✕</button>
        </span>
      </div>
    `;
  }

  private renderTaskRow(task: Task): string {
    const done = task.status === "done";
    return `
      <div class="check-item ${done ? "is-done" : ""}">
        <input type="checkbox" data-task-toggle="${escapeHtml(task.id)}" ${done ? "checked" : ""} aria-label="Отметить задачу выполненной" />
        <span class="check-title">${escapeHtml(task.title)}</span>
        ${badgeHtml(done ? "готово" : "в работе")}
      </div>
    `;
  }

  private renderFlowRow(task: Task, workspace: Workspace): string {
    return `
      <div class="check-item">
        <input type="checkbox" data-task-toggle="${escapeHtml(task.id)}" aria-label="Отметить задачу выполненной" />
        <a class="check-title flow-link" href="#/work/tasks/${escapeHtml(task.id)}">${escapeHtml(task.title)}</a>
        <span class="check-time">${escapeHtml(getProjectName(workspace.projects, task.projectId))}</span>
        ${badgeHtml(TASK_STATUS_LABELS[task.status])}
      </div>
    `;
  }

  private renderEventRow(item: CalendarItem, workspace: Workspace): string {
    const when = item.allDay
      ? "Весь день"
      : new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.startsAt));
    const kindLabel = EVENT_KIND_LABELS[item.kind as CalendarEventKind] ?? item.kind;
    const taskName = item.taskId ? getTaskName(workspace.tasks, item.taskId) : "";

    return `
      <div class="list-item">
        <strong>${escapeHtml(item.title)}</strong>
        <div class="meta-row">
          <span class="status-pill">${escapeHtml(kindLabel)}</span>
          <span>${escapeHtml(when)}</span>
          ${isMultiDay(item) ? `<span class="muted">до ${formatDate(item.endsAt)}</span>` : ""}
          ${taskName ? `<span>${escapeHtml(taskName)}</span>` : ""}
        </div>
      </div>
    `;
  }

  private renderPlanWizard(workspace: Workspace, day: string): string {
    const steps = ["Хвосты", "Задачи на день", "Бюджет дня"];
    const plan = buildDayPlan(workspace, day);
    const stepBody =
      this.planStep === 1
        ? this.renderPlanOverdue(plan)
        : this.planStep === 2
          ? this.renderPlanPick(plan)
          : this.renderPlanBudget(plan);

    return wizardStepHtml({
      label: "Планирование дня",
      step: this.planStep,
      totalSteps: steps.length,
      title: steps[this.planStep - 1] ?? "",
      body: stepBody,
      showBack: this.planStep > 1,
      footer:
        this.planStep < steps.length
          ? `<button ${buttonAttrs({ data: { action: "wizard-next" } })}>Далее</button>`
          : `<button ${buttonAttrs({ data: { action: "close-wizard" } })}>Готово</button>`,
    });
  }

  private renderPlanOverdue(plan: DayPlan): string {
    if (!plan.overdue.length) {
      return emptyStateHtml("Хвостов нет — чистый старт.");
    }

    return `
      <p class="muted">Просроченные дедлайны: заберите в этот день, перенесите или закройте.</p>
      <div class="item-list">
        ${plan.overdue
          .map(
            (task) => `
              <div class="list-item">
                <strong>${escapeHtml(task.title)}</strong>
                <div class="meta-row"><span>дедлайн: ${formatDate(task.dueDate)}</span></div>
                <div class="row-actions">
                  <button ${buttonAttrs({ tone: "ghost", size: "small", data: { planTake: task.id } })}>Взять в день</button>
                  <button ${buttonAttrs({ tone: "ghost", size: "small", data: { planPostpone: task.id } })}>+7 дней</button>
                  <button ${buttonAttrs({ tone: "ghost", size: "small", data: { planDone: task.id } })}>Завершить</button>
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  private renderPlanPick(plan: DayPlan): string {
    const row = (task: Task, planned: boolean): string => `
      <div class="list-item plan-row">
        <label class="plan-pick">
          <input type="checkbox" data-plan-pick="${escapeHtml(task.id)}" ${planned ? "checked" : ""} />
          <span>${escapeHtml(task.title)}</span>
        </label>
        <label class="plan-estimate">
          мин
          <input
            type="number"
            min="0"
            step="5"
            data-plan-estimate="${escapeHtml(task.id)}"
            value="${task.estimateMinutes ?? ""}"
            placeholder="—"
            aria-label="Оценка, минут"
          />
        </label>
      </div>
    `;

    return `
      <p class="muted">Отметьте, что берёте в день, и прикиньте время — без оценки бюджет слепой. Отметки и оценки сохраняются сразу.</p>
      ${plan.planned.length ? `<p class="eyebrow">Уже в плане</p><div class="item-list">${plan.planned.map((task) => row(task, true)).join("")}</div>` : ""}
      ${
        plan.candidates.length
          ? `<p class="eyebrow">Кандидаты (неделя и входящие)</p><div class="item-list">${plan.candidates.map((task) => row(task, false)).join("")}</div>`
          : ""
      }
      ${!plan.planned.length && !plan.candidates.length ? emptyStateHtml("Открытых задач нет.") : ""}
    `;
  }

  private renderPlanBudget(plan: DayPlan): string {
    const planned = plan.plannedEstimateMinutes;
    const noEstimates = plan.planned.filter((task) => !task.estimateMinutes).length;
    const verdict =
      plan.capacityMinutes === 0
        ? `<p class="muted">Бюджет выключен — задайте ёмкость дня в настройках, чтобы видеть перегруз.</p>`
        : plan.freeMinutes >= 0
          ? `<p>Остаётся свободных <strong>${formatDuration(plan.freeMinutes)}</strong> — план реалистичен.</p>`
          : `<p>План превышает день на <strong>${formatDuration(-plan.freeMinutes)}</strong> — уберите что-то или срежьте оценки.</p>`;

    return `
      ${metricBarHtml([
        { label: "Ёмкость дня", value: plan.capacityMinutes ? formatDuration(plan.capacityMinutes) : "—", hint: "Из настроек" },
        { label: "Занято событиями", value: formatDuration(plan.busyMinutes), hint: "Календарь дня" },
        { label: "Задачи по оценкам", value: formatDuration(planned), hint: `${plan.planned.length} в плане` },
      ])}
      ${verdict}
      ${noEstimates > 0 ? `<p class="muted">Без оценки: ${noEstimates} — они не учтены в бюджете.</p>` : ""}
      <a class="button ghost" href="#/planner/calendar" data-plan-to-calendar>Разложить по сетке</a>
    `;
  }

  /**
   * Оценки сохраняются на `change`, но недопечатанное значение без blur
   * потерялось бы при закрытии/переходе — дожимаем инпуты вручную.
   */
  private flushPlanEstimates(root: ShadowRoot): void {
    root.querySelectorAll<HTMLInputElement>("[data-plan-estimate]").forEach((input) => {
      const id = input.dataset.planEstimate;
      if (!id) {
        return;
      }
      const value = input.value === "" ? null : Number(input.value);
      if (value !== null && Number.isNaN(value)) {
        return;
      }
      const task = appStore.getWorkspace().tasks.find((item) => item.id === id);
      if (task && (task.estimateMinutes ?? null) !== value) {
        void appStore.setTaskEstimate(id, value);
      }
    });
  }

  private wirePlanWizard(root: ShadowRoot): void {
    if (this.planStep === 0) {
      return;
    }

    wireModal(root, {
      onClose: () => {
        this.flushPlanEstimates(root);
        this.planStep = 0;
        this.render();
      },
    });

    root.querySelectorAll<HTMLButtonElement>('[data-action="close-wizard"]').forEach((button) => {
      button.addEventListener("click", () => {
        this.flushPlanEstimates(root);
        this.planStep = 0;
        this.render();
      });
    });
    root.querySelector<HTMLButtonElement>('[data-action="wizard-next"]')?.addEventListener("click", () => {
      this.flushPlanEstimates(root);
      this.planStep += 1;
      this.render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="wizard-back"]')?.addEventListener("click", () => {
      this.flushPlanEstimates(root);
      this.planStep -= 1;
      this.render();
    });
    root.querySelector<HTMLElement>("[data-plan-to-calendar]")?.addEventListener("click", () => {
      this.flushPlanEstimates(root);
      this.planStep = 0;
      setBodyScrollLock(false);
    });

    root.querySelectorAll<HTMLButtonElement>("[data-plan-take]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.planTake;
        if (id) {
          void appStore.rescheduleTask(id, this.selectedDay);
        }
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-plan-postpone]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.planPostpone;
        if (id) {
          void appStore.rescheduleTask(id, shiftDayKey(dayKey(new Date()), 7));
        }
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-plan-done]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.planDone;
        if (id) {
          void appStore.updateTaskStatus(id, "done");
        }
      });
    });

    root.querySelectorAll<HTMLInputElement>("[data-plan-pick]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const id = checkbox.dataset.planPick;
        if (id) {
          void appStore.planTaskForDay(id, checkbox.checked ? this.selectedDay : null);
        }
      });
    });
    root.querySelectorAll<HTMLInputElement>("[data-plan-estimate]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.dataset.planEstimate;
        if (id) {
          void appStore.setTaskEstimate(id, input.value === "" ? null : Number(input.value));
        }
      });
    });
  }

  private renderShutdownWizard(workspace: Workspace, day: string): string {
    const steps = ["Итог дня", "Незакрытое", "Рефлексия"];
    const stepBody =
      this.shutdownStep === 1
        ? this.renderShutdownSummary(workspace, day)
        : this.shutdownStep === 2
          ? this.renderShutdownLeftovers(workspace, day)
          : this.renderShutdownReflection();

    return wizardStepHtml({
      label: "Закрытие дня",
      step: this.shutdownStep,
      totalSteps: steps.length,
      title: steps[this.shutdownStep - 1] ?? "",
      body: stepBody,
      showBack: this.shutdownStep > 1,
      footer:
        this.shutdownStep < steps.length
          ? `<button ${buttonAttrs({ data: { action: "wizard-next" } })}>Далее</button>`
          : `<button ${buttonAttrs({ data: { action: "shutdown-finish" } })}>Записать и закрыть</button>`,
    });
  }

  private renderShutdownSummary(workspace: Workspace, day: string): string {
    const items = workspace.checklist.filter((item) => item.day === day);
    const minutes = workspace.sessions
      .filter((session) => session.startedAt.slice(0, 10) === day)
      .reduce((sum, session) => sum + session.durationMinutes, 0);
    const closedTasks = workspace.tasks.filter((task) => task.completedAt?.slice(0, 10) === day);

    return `
      ${metricBarHtml([
        { label: "Время в фокусе", value: formatDuration(minutes), hint: "Завершённые сессии" },
        { label: "Чек-лист", value: `${items.filter((item) => item.done).length}/${items.length}`, hint: formatDayHeading(day) },
        { label: "Задач закрыто", value: closedTasks.length, hint: "За этот день" },
      ])}
      ${
        closedTasks.length
          ? `<div class="item-list">${closedTasks
              .slice(0, 6)
              .map((task) => `<div class="list-item"><strong>${escapeHtml(task.title)}</strong></div>`)
              .join("")}</div>`
          : `<p class="muted">Сегодня без закрытых задач — бывает; посмотрите, что перенести.</p>`
      }
    `;
  }

  private renderShutdownLeftovers(workspace: Workspace, day: string): string {
    const tomorrow = shiftDayKey(day, 1);
    const undoneItems = workspace.checklist.filter((item) => item.day === day && !item.done);
    const openTasks = this.tasksForDay(workspace, day).filter((task) => task.status !== "done");

    if (!undoneItems.length && !openTasks.length) {
      return emptyStateHtml("Всё закрыто. Идеальный вечер.");
    }

    return `
      ${
        undoneItems.length
          ? `
            <div class="card-header" style="margin-bottom: 0;">
              <p class="eyebrow">Чек-лист: ${undoneItems.length} не закрыто</p>
              <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "shutdown-rollover" } })}>Перенести всё на завтра</button>
            </div>
            <div class="item-list">
              ${undoneItems.map((item) => `<div class="list-item">${escapeHtml(item.title)}</div>`).join("")}
            </div>
          `
          : ""
      }
      ${
        openTasks.length
          ? `
            <p class="eyebrow">Задачи дня</p>
            <div class="item-list">
              ${openTasks
                .map(
                  (task) => `
                    <div class="list-item">
                      <strong>${escapeHtml(task.title)}</strong>
                      <div class="row-actions">
                        <button ${buttonAttrs({ tone: "ghost", size: "small", data: { shutdownTomorrow: task.id, taskDue: task.dueDate === day ? "1" : "" } })}>На завтра (${escapeHtml(formatDate(tomorrow))})</button>
                        <button ${buttonAttrs({ tone: "ghost", size: "small", data: { shutdownRelease: task.id } })}>Отпустить</button>
                        <button ${buttonAttrs({ tone: "ghost", size: "small", data: { shutdownDone: task.id } })}>Завершить</button>
                      </div>
                    </div>
                  `,
                )
                .join("")}
            </div>
          `
          : ""
      }
    `;
  }

  private renderShutdownReflection(): string {
    return `
      <p class="muted">Пара строк о дне — запись попадёт в заметку дня и останется в базе знаний.</p>
      <textarea data-shutdown-reflection placeholder="Что получилось, что мешало, что понял…" aria-label="Рефлексия дня"></textarea>
    `;
  }

  private wireShutdownWizard(root: ShadowRoot): void {
    if (this.shutdownStep === 0) {
      return;
    }

    wireModal(root, {
      onClose: () => {
        this.shutdownStep = 0;
        this.render();
      },
    });

    root.querySelectorAll<HTMLButtonElement>('[data-action="close-wizard"]').forEach((button) => {
      button.addEventListener("click", () => {
        this.shutdownStep = 0;
        this.render();
      });
    });
    root.querySelector<HTMLButtonElement>('[data-action="wizard-next"]')?.addEventListener("click", () => {
      this.shutdownStep += 1;
      this.render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="wizard-back"]')?.addEventListener("click", () => {
      this.shutdownStep -= 1;
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="shutdown-rollover"]')?.addEventListener("click", () => {
      void appStore.rolloverChecklist(this.selectedDay, shiftDayKey(this.selectedDay, 1));
    });

    root.querySelectorAll<HTMLButtonElement>("[data-shutdown-tomorrow]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.shutdownTomorrow;
        if (!id) {
          return;
        }
        const tomorrow = shiftDayKey(this.selectedDay, 1);
        // Дедлайн двигаем дедлайном, план — планом.
        if (button.dataset.taskDue === "1") {
          void appStore.rescheduleTask(id, tomorrow);
        } else {
          void appStore.planTaskForDay(id, tomorrow);
        }
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-shutdown-release]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.shutdownRelease;
        if (!id) {
          return;
        }
        void appStore.rescheduleTask(id, null);
        void appStore.planTaskForDay(id, null);
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-shutdown-done]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.shutdownDone;
        if (id) {
          void appStore.updateTaskStatus(id, "done");
        }
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="shutdown-finish"]')?.addEventListener("click", () => {
      const reflection = root.querySelector<HTMLTextAreaElement>("[data-shutdown-reflection]")?.value ?? "";
      if (reflection.trim()) {
        void appStore.appendToDayNote(this.selectedDay, `**Рефлексия:** ${reflection.trim()}`);
      }
      this.shutdownStep = 0;
      this.render();
    });
  }

  private renderOnboarding(): string {
    return `
      <article class="card">
        <div class="card-header">
          <div>
            <p class="eyebrow">Первые шаги</p>
            <h2>Цикл одного дня</h2>
          </div>
        </div>
        <div class="check-list">
          <button type="button" class="check-item onboarding-step" data-action="start-plan">
            <span class="onboarding-num">1</span>
            <span class="check-title">Спланируйте день</span>
            <span class="check-time">хвосты, задачи, бюджет</span>
          </button>
          <a class="check-item onboarding-step" href="#/work/focus">
            <span class="onboarding-num">2</span>
            <span class="check-title">Поработайте в фокусе</span>
            <span class="check-time">Работа → Фокус</span>
          </a>
          <button type="button" class="check-item onboarding-step" data-action="start-shutdown">
            <span class="onboarding-num">3</span>
            <span class="check-title">Закройте день</span>
            <span class="check-time">итог, переносы, рефлексия</span>
          </button>
          <a class="check-item onboarding-step" href="#/analytics/review">
            <span class="onboarding-num">4</span>
            <span class="check-title">Подведите итоги недели</span>
            <span class="check-time">Аналитика → Ревью</span>
          </a>
        </div>
      </article>
    `;
  }

  private tasksForDay(workspace: Workspace, day: string): Task[] {
    return workspace.tasks.filter(
      (task) => task.dueDate === day || (task.plannedAt ? task.plannedAt.slice(0, 10) === day : false),
    );
  }

  private wire(root: ShadowRoot): void {
    root.querySelectorAll<HTMLButtonElement>("[data-day-shift]").forEach((button) => {
      button.addEventListener("click", () => {
        this.selectDay(shiftDayKey(this.selectedDay, Number(button.dataset.dayShift)));
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="go-today"]')?.addEventListener("click", () => {
      this.selectDay(dayKey(new Date()));
    });

    // Кнопки есть и в шапке, и в онбординг-карточке.
    root.querySelectorAll<HTMLButtonElement>('[data-action="start-plan"]').forEach((button) => {
      button.addEventListener("click", () => {
        this.planStep = 1;
        this.render();
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-action="start-shutdown"]').forEach((button) => {
      button.addEventListener("click", () => {
        this.shutdownStep = 1;
        this.render();
      });
    });

    root.querySelector<HTMLInputElement>(".day-input")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLInputElement).value;
      if (value) {
        this.selectDay(value);
      }
    });

    root.querySelector<HTMLButtonElement>('[data-action="rollover"]')?.addEventListener("click", () => {
      void appStore.rolloverChecklist(shiftDayKey(this.selectedDay, -1), this.selectedDay);
    });

    const addForm = root.querySelector<HTMLFormElement>("[data-add-form]");
    addForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = addForm.elements.namedItem("title");
      if (!(input instanceof HTMLInputElement) || !input.value.trim()) {
        return;
      }
      this.focusAddInput = true;
      void appStore.addChecklistItem({ title: input.value, day: this.selectedDay });
    });

    if (this.focusAddInput) {
      this.focusAddInput = false;
      const input = addForm?.elements.namedItem("title");
      if (input instanceof HTMLInputElement) {
        input.focus();
      }
    }

    root.querySelectorAll<HTMLInputElement>("[data-toggle]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const id = checkbox.dataset.toggle;
        if (id) {
          void appStore.toggleChecklistItem(id);
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-count-inc]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.countInc;
        if (id) {
          void appStore.incrementChecklistItem(id, 1);
        }
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-count-dec]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.countDec;
        if (id) {
          void appStore.incrementChecklistItem(id, -1);
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.remove;
        if (id) {
          void appStore.removeChecklistItem(id);
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-focus]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.focus;
        if (id) {
          void this.startFocus(id);
        }
      });
    });

    root.querySelectorAll<HTMLInputElement>("[data-task-toggle]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const id = checkbox.dataset.taskToggle;
        if (id) {
          void appStore.updateTaskStatus(id, checkbox.checked ? "done" : "active");
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-history-day]").forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.dataset.historyDay;
        if (value) {
          this.selectDay(value);
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-edit-item]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.editItem;
        if (id) {
          this.editingItemId = id;
          this.render();
        }
      });
    });

    this.wireEditForm(root);
    this.wireDrag(root);
  }

  private wireEditForm(root: ShadowRoot): void {
    const form = root.querySelector<HTMLFormElement>("[data-edit-form]");
    const itemId = this.editingItemId;
    if (!form || !itemId) {
      return;
    }
    const input = form.elements.namedItem("title");
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    let done = false;
    const commit = (): void => {
      if (done) {
        return;
      }
      done = true;
      const value = input.value;
      this.editingItemId = null;
      void appStore.renameChecklistItem(itemId, value);
      this.render();
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      commit();
    });
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        done = true;
        this.editingItemId = null;
        this.render();
      }
    });
    input.focus();
    input.select();
  }

  private wireDrag(root: ShadowRoot): void {
    root.querySelectorAll<HTMLElement>("[data-drag-item]").forEach((row) => {
      row.addEventListener("dragstart", (event) => {
        this.draggingId = row.dataset.dragItem ?? null;
        if (event instanceof DragEvent && event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", this.draggingId ?? "");
        }
      });
      row.addEventListener("dragend", () => {
        this.draggingId = null;
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        row.classList.add("is-drag-over");
      });
      row.addEventListener("dragleave", () => row.classList.remove("is-drag-over"));
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        row.classList.remove("is-drag-over");
        const targetId = row.dataset.dragItem;
        const dragId = this.draggingId;
        this.draggingId = null;
        if (!targetId || !dragId || targetId === dragId) {
          return;
        }
        const ids = [...root.querySelectorAll<HTMLElement>("[data-drag-item]")].map((el) => el.dataset.dragItem ?? "");
        const from = ids.indexOf(dragId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) {
          return;
        }
        ids.splice(from, 1);
        ids.splice(to, 0, dragId);
        void appStore.reorderChecklist(this.selectedDay, ids);
      });
    });
  }

  private async startFocus(itemId: string): Promise<void> {
    // Уже идёт сессия — не перезаписываем её, а показываем в фокусе.
    if (appStore.getActiveTimer()) {
      window.location.hash = "#/work/focus";
      return;
    }
    const task = await appStore.promoteChecklistItemToTask(itemId);
    if (!task) {
      return;
    }
    // Переходим в фокус с уже выбранной задачей, но таймер не запускаем —
    // пользователь сам решает, когда начать сессию.
    setPendingFocusTaskId(task.id);
    window.location.hash = "#/work/focus";
  }
}

customElements.define("pn-today-view", TodayView);
