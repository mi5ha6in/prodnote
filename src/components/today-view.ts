import { dayKey } from "../domain/calendar";
import { escapeHtml } from "../domain/markdown";
import { groupChecklistByDay } from "../domain/stats";
import type { ChecklistItem, Task, Workspace } from "../domain/types";
import { requestTimerNotificationPermission } from "../platform/notifications";
import { appStore } from "../state";
import { badgeHtml, buttonAttrs, emptyStateHtml, metricBarHtml, viewHeaderHtml } from "../ui/html";
import { renderShadow } from "./shadow";

const HISTORY_DAYS = 14;

function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return dayKey(new Date(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + delta));
}

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
  let streak = 0;
  let cursor = today;
  while (doneDays.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

export class TodayView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private selectedDay = dayKey(new Date());
  private focusAddInput = false;

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
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

    const root = renderShadow(
      this,
      `
        <section class="view-grid">
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
            `,
          })}

          ${metricBarHtml([
            { label: "Выполнено за день", value: `${doneCount}/${dayItems.length}`, hint: formatDayHeading(day) },
            { label: "Серия дней", value: currentStreak(workspace.checklist, today), hint: "Дни подряд с отметками" },
            { label: "Всего пунктов", value: workspace.checklist.length, hint: "За всё время" },
          ])}

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">${escapeHtml(formatDayHeading(day))}</p>
                <h2>Список на день</h2>
              </div>
              <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "rollover" } })}>Перенести со вчера</button>
            </div>

            <form class="check-add" data-add-form>
              <input name="title" placeholder="Добавить пункт на день…" aria-label="Новый пункт" autocomplete="off" />
              <button ${buttonAttrs({ type: "submit", size: "small" })}>Добавить</button>
            </form>

            <div class="check-list">
              ${
                dayItems.length
                  ? dayItems.map((item) => this.renderItem(item)).join("")
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
              <a class="button ghost small" href="#/tasks">Все задачи</a>
            </div>
            <div class="check-list">
              ${
                dayTasks.length
                  ? dayTasks.map((task) => this.renderTaskRow(task)).join("")
                  : emptyStateHtml("Задач с дедлайном на этот день нет.")
              }
            </div>
          </article>

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">История</p>
                <h2>Сделано по дням</h2>
              </div>
            </div>
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
          </article>
        </section>
      `,
      `
        .day-nav {
          align-items: center;
          display: flex;
          gap: var(--space-2);
        }

        .day-input {
          width: auto;
        }

        .check-add {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-3);
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

        .check-time {
          color: var(--muted);
          font-size: var(--text-sm);
          font-variant-numeric: tabular-nums;
        }

        .check-actions {
          display: flex;
          gap: var(--space-1);
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
      `,
    );

    this.wire(root);
  }

  private renderItem(item: ChecklistItem): string {
    return `
      <div class="check-item ${item.done ? "is-done" : ""}">
        <input type="checkbox" data-toggle="${escapeHtml(item.id)}" ${item.done ? "checked" : ""} aria-label="Отметить выполненным" />
        <span class="check-title">${escapeHtml(item.title)}</span>
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

  private tasksForDay(workspace: Workspace, day: string): Task[] {
    return workspace.tasks.filter(
      (task) => task.dueDate === day || (task.plannedAt ? task.plannedAt.slice(0, 10) === day : false),
    );
  }

  private wire(root: ShadowRoot): void {
    root.querySelectorAll<HTMLButtonElement>("[data-day-shift]").forEach((button) => {
      button.addEventListener("click", () => {
        this.selectedDay = shiftDay(this.selectedDay, Number(button.dataset.dayShift));
        this.render();
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="go-today"]')?.addEventListener("click", () => {
      this.selectedDay = dayKey(new Date());
      this.render();
    });

    root.querySelector<HTMLInputElement>(".day-input")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLInputElement).value;
      if (value) {
        this.selectedDay = value;
        this.render();
      }
    });

    root.querySelector<HTMLButtonElement>('[data-action="rollover"]')?.addEventListener("click", () => {
      void appStore.rolloverChecklist(shiftDay(this.selectedDay, -1), this.selectedDay);
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
          this.selectedDay = value;
          this.render();
        }
      });
    });
  }

  private async startFocus(itemId: string): Promise<void> {
    if (appStore.getActiveTimer()) {
      return;
    }
    const task = await appStore.promoteChecklistItemToTask(itemId);
    if (!task) {
      return;
    }
    void requestTimerNotificationPermission();
    await appStore.startTimer(task.id);
    window.location.hash = "#/focus";
  }
}

customElements.define("pn-today-view", TodayView);
