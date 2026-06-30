import { dayKey } from "../domain/calendar";
import { shiftDayKey } from "../domain/checklist";
import { CHECKLIST_CADENCE_LABELS } from "../domain/defaults";
import { escapeHtml } from "../domain/markdown";
import { groupChecklistByDay } from "../domain/stats";
import type { ChecklistCadence, ChecklistItem, ChecklistTemplate, Task, Workspace } from "../domain/types";
import { requestTimerNotificationPermission } from "../platform/notifications";
import { appStore } from "../state";
import { badgeHtml, buttonAttrs, emptyStateHtml, metricBarHtml, viewHeaderHtml } from "../ui/html";
import { renderShadow } from "./shadow";

const HISTORY_DAYS = 14;

const CADENCE_LABELS = CHECKLIST_CADENCE_LABELS;

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
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

export class TodayView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private selectedDay = dayKey(new Date());
  private focusAddInput = false;
  private editing: { kind: "item" | "template"; id: string } | null = null;
  private draggingId: string | null = null;

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    void appStore.ensureChecklistForDay(this.selectedDay);
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
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

          ${this.renderTemplates(workspace.checklistTemplates)}

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

        .template-form {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          margin: var(--space-2) 0 var(--space-3);
        }

        .template-form input[name="title"] {
          flex: 1;
          min-width: 12rem;
        }

        .template-form select,
        .check-item select {
          width: auto;
        }

        .template-habit {
          align-items: center;
          color: var(--muted);
          display: flex;
          flex-direction: row;
          gap: var(--space-1);
          white-space: nowrap;
        }

        .template-habit input {
          width: auto;
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
          min-height: 0;
          padding: 0;
          text-align: left;
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
    if (this.editing?.kind === "item" && this.editing.id === item.id) {
      return `
        <div class="check-item">
          <form class="check-edit" data-edit-form>
            <input name="title" value="${escapeHtml(item.title)}" aria-label="Название пункта" autocomplete="off" />
          </form>
        </div>
      `;
    }

    return `
      <div class="check-item ${item.done ? "is-done" : ""}" draggable="true" data-drag-item="${escapeHtml(item.id)}">
        <input type="checkbox" data-toggle="${escapeHtml(item.id)}" ${item.done ? "checked" : ""} aria-label="Отметить выполненным" />
        <button type="button" class="check-title check-edit-start" data-edit-item="${escapeHtml(item.id)}" title="Переименовать">${escapeHtml(item.title)}</button>
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
        this.selectDay(shiftDayKey(this.selectedDay, Number(button.dataset.dayShift)));
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="go-today"]')?.addEventListener("click", () => {
      this.selectDay(dayKey(new Date()));
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

    const templateForm = root.querySelector<HTMLFormElement>("[data-template-form]");
    templateForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = templateForm.elements.namedItem("title");
      const cadence = templateForm.elements.namedItem("cadence");
      const habit = templateForm.elements.namedItem("isHabit");
      if (!(title instanceof HTMLInputElement) || !title.value.trim()) {
        return;
      }
      void appStore.addChecklistTemplate({
        title: title.value,
        cadence: cadence instanceof HTMLSelectElement ? (cadence.value as ChecklistCadence) : "daily",
        isHabit: habit instanceof HTMLInputElement ? habit.checked : false,
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-template-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.templateRemove;
        if (id) {
          void appStore.removeChecklistTemplate(id);
        }
      });
    });

    root.querySelectorAll<HTMLInputElement>("[data-template-habit]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const id = checkbox.dataset.templateHabit;
        if (id) {
          void appStore.updateChecklistTemplate({ templateId: id, isHabit: checkbox.checked });
        }
      });
    });

    root.querySelectorAll<HTMLSelectElement>("[data-template-cadence]").forEach((select) => {
      select.addEventListener("change", () => {
        const id = select.dataset.templateCadence;
        if (id) {
          void appStore.updateChecklistTemplate({ templateId: id, cadence: select.value as ChecklistCadence });
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-edit-item]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.editItem;
        if (id) {
          this.editing = { kind: "item", id };
          this.render();
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-edit-template]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.editTemplate;
        if (id) {
          this.editing = { kind: "template", id };
          this.render();
        }
      });
    });

    this.wireEditForm(root);
    this.wireDrag(root);
  }

  private wireEditForm(root: ShadowRoot): void {
    const form = root.querySelector<HTMLFormElement>("[data-edit-form]");
    const editing = this.editing;
    if (!form || !editing) {
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
      this.editing = null;
      if (editing.kind === "item") {
        void appStore.renameChecklistItem(editing.id, value);
      } else {
        void appStore.updateChecklistTemplate({ templateId: editing.id, title: value });
      }
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
        this.editing = null;
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

  private renderTemplates(templates: ChecklistTemplate[]): string {
    const cadenceOptions = (selected: ChecklistCadence): string =>
      (Object.keys(CADENCE_LABELS) as ChecklistCadence[])
        .map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${CADENCE_LABELS[value]}</option>`)
        .join("");

    return `
      <article class="card">
        <div class="card-header">
          <div>
            <p class="eyebrow">Рутина</p>
            <h2>Повторяющиеся пункты</h2>
          </div>
        </div>
        <p class="muted">Шаблоны автоматически добавляются в список в подходящие дни.</p>

        <form class="template-form" data-template-form>
          <input name="title" placeholder="Например: зарядка" aria-label="Название шаблона" autocomplete="off" />
          <select name="cadence" aria-label="Периодичность">${cadenceOptions("daily")}</select>
          <label class="template-habit"><input type="checkbox" name="isHabit" /> привычка</label>
          <button ${buttonAttrs({ type: "submit", size: "small" })}>Добавить</button>
        </form>

        <div class="check-list">
          ${
            templates.length
              ? templates
                  .map(
                    (template) => `
                      <div class="check-item">
                        ${
                          this.editing?.kind === "template" && this.editing.id === template.id
                            ? `<form class="check-edit" data-edit-form><input name="title" value="${escapeHtml(template.title)}" aria-label="Название шаблона" autocomplete="off" /></form>`
                            : `<button type="button" class="check-title check-edit-start" data-edit-template="${escapeHtml(template.id)}" title="Переименовать">${escapeHtml(template.title)}</button>`
                        }
                        ${template.isHabit ? badgeHtml("привычка") : ""}
                        <select data-template-cadence="${escapeHtml(template.id)}" aria-label="Периодичность">${cadenceOptions(template.cadence)}</select>
                        <label class="template-habit">
                          <input type="checkbox" data-template-habit="${escapeHtml(template.id)}" ${template.isHabit ? "checked" : ""} /> привычка
                        </label>
                        <button ${buttonAttrs({ tone: "ghost", size: "small", data: { templateRemove: template.id } })} aria-label="Удалить шаблон">✕</button>
                      </div>
                    `,
                  )
                  .join("")
              : emptyStateHtml("Добавьте шаблон — он будет появляться каждый день автоматически.")
          }
        </div>
      </article>
    `;
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
