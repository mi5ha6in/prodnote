import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "../domain/defaults";
import { escapeHtml, renderMarkdown } from "../domain/markdown";
import { formatDuration } from "../domain/stats";
import type { Task, TaskStatus } from "../domain/types";
import { requestTimerNotificationPermission } from "../platform/notifications";
import { appStore } from "../state";
import { confirmDestructive } from "../ui/actions";
import { badgeHtml, buttonAttrs, emptyStateHtml, fieldHtml, metricBarHtml, modalHtml, viewHeaderHtml } from "../ui/html";
import { setBodyScrollLock, wireModal } from "./modal";
import { renderShadow } from "./shadow";
import {
  formatDate,
  getProjectName,
  renderProjectOptions,
  renderTagPills,
  requireInput,
  requireSelect,
  requireTextArea,
} from "./view-utils";

const STATUS_ORDER: TaskStatus[] = ["backlog", "active", "blocked", "done"];

export class TasksView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private mode: "kanban" | "list" = "kanban";
  private openedTaskId: string | null = null;
  private detailsMode: "view" | "edit" = "view";
  private creating = false;
  private draggingTaskId: string | null = null;

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    setBodyScrollLock(false);
  }

  private render(): void {
    const workspace = appStore.getWorkspace();
    const activeTasks = workspace.tasks.filter((task) => task.status !== "done").length;
    const totalMinutesByTask = new Map<string, number>();
    for (const session of workspace.sessions) {
      totalMinutesByTask.set(session.taskId, (totalMinutesByTask.get(session.taskId) ?? 0) + session.durationMinutes);
    }

    const root = renderShadow(
      this,
      `
        <section class="view-grid">
          ${this.renderTaskDetails(totalMinutesByTask)}
          ${this.creating ? this.renderCreateModal(workspace) : ""}

          ${viewHeaderHtml({
            actions: `
              <div class="segmented" role="group" aria-label="Режим просмотра">
                <button type="button" data-mode="kanban" aria-pressed="${this.mode === "kanban"}">Канбан</button>
                <button type="button" data-mode="list" aria-pressed="${this.mode === "list"}">Список</button>
              </div>
              <button ${buttonAttrs({ data: { action: "open-create" } })}>+ Новая задача</button>
            `,
          })}

          ${metricBarHtml([
            { label: "Всего задач", value: workspace.tasks.length, hint: "Включая завершённые" },
            { label: "Активный поток", value: activeTasks, hint: "Требуют внимания" },
            {
              label: "Записей в журнале",
              value: workspace.tasks.reduce((sum, task) => sum + task.history.length, 0),
              hint: "Прогресс и решения",
            },
          ])}

          ${
            this.mode === "kanban"
              ? this.renderKanban(workspace.tasks, totalMinutesByTask)
              : this.renderList(workspace.tasks, totalMinutesByTask)
          }
        </section>
      `,
      `
        .kanban {
          display: grid;
          gap: var(--space-3);
          grid-template-columns: repeat(4, minmax(15rem, 1fr));
          overflow-x: auto;
          padding-bottom: var(--space-1);
        }

        .kanban-column {
          align-content: start;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          display: grid;
          gap: var(--space-2);
          min-width: 0;
          padding: var(--space-3);
        }

        .task-card {
          cursor: pointer;
          overflow: hidden;
        }

        .task-card:focus-visible {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
          outline: none;
        }

        .task-details {
          display: grid;
          gap: var(--space-4);
        }

        .task-details-grid {
          display: grid;
          gap: var(--space-4);
          grid-template-columns: minmax(0, 1.1fr) minmax(18rem, 0.9fr);
          min-width: 0;
        }

        .task-details-main,
        .task-details-side {
          display: grid;
          gap: var(--space-4);
          min-width: 0;
        }

        .task-quick-actions {
          display: grid;
          gap: var(--space-3);
        }

        .task-card .card-header {
          margin-bottom: var(--space-2);
        }

        .task-card .card-header > div {
          min-width: 0;
        }

        .task-card h3 {
          font-size: var(--text-base);
          line-height: 1.2;
        }

        .task-history {
          background: var(--surface);
          border-radius: var(--radius-md);
          min-width: 0;
          padding: var(--space-3);
        }

        .kanban-column.is-drop-target {
          border-color: var(--accent);
          box-shadow: inset 0 0 0 2px var(--accent-soft);
        }

        .kanban .task-card {
          background: var(--paper);
          box-shadow: var(--shadow-sm);
          cursor: grab;
        }

        .kanban .task-card:hover {
          border-color: var(--line-strong);
        }

        .kanban .task-card label {
          margin-top: var(--space-1);
        }

        .kanban .markdown-preview {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 5;
          overflow: hidden;
        }

        .history-entry {
          border-top: 1px solid var(--line);
          margin-top: var(--space-3);
          padding-top: var(--space-3);
        }

        fieldset {
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          margin: 0;
          padding: var(--space-3);
        }

        legend {
          color: var(--muted);
          font-size: var(--text-sm);
          font-weight: 700;
          padding: 0 var(--space-1);
        }

        .check-row {
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          display: flex;
          gap: var(--space-2);
          padding: 0.3rem var(--space-3);
        }

        .check-row input {
          width: auto;
        }

        .check-row span {
          color: var(--ink);
          font-weight: 600;
        }

        .subtask-list {
          display: grid;
          gap: var(--space-1);
          margin-bottom: var(--space-2);
        }

        .subtask-row {
          align-items: center;
          display: flex;
          gap: var(--space-2);
          justify-content: space-between;
        }

        .subtask-check {
          align-items: center;
          color: var(--ink);
          display: flex;
          flex-direction: row;
          font-weight: 500;
          gap: var(--space-2);
        }

        .subtask-check input {
          width: auto;
        }

        .subtask-row.is-done .subtask-check span {
          color: var(--muted);
          text-decoration: line-through;
        }

        .subtask-add {
          display: flex;
          gap: var(--space-2);
        }

        .subtask-progress {
          align-items: center;
          display: grid;
          gap: var(--space-2);
          grid-template-columns: minmax(0, 1fr) auto;
        }

        .subtask-progress .muted {
          font-size: var(--text-xs);
          font-variant-numeric: tabular-nums;
        }

        @media (max-width: 1100px) {
          .kanban {
            grid-template-columns: repeat(4, 15rem);
          }

          .task-details-grid {
            grid-template-columns: 1fr;
          }
        }
      `,
    );

    setBodyScrollLock(this.creating || this.openedTaskId !== null);

    root.querySelector<HTMLFormElement>('[data-form="task"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      const tagIds = [...form.querySelectorAll<HTMLInputElement>('input[name="tagIds"]:checked')].map(
        (input) => input.value,
      );
      const projectId = requireSelect(form, "projectId").value || null;
      void appStore.addTask({
        title: requireInput(form, "title").value,
        description: requireTextArea(form, "description").value,
        projectId,
        dueDate: requireInput(form, "dueDate").value || null,
        priority: requireSelect(form, "priority").value as Task["priority"],
        tagIds,
      });
      form.reset();
      this.creating = false;
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="open-create"]')?.addEventListener("click", () => {
      this.creating = true;
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="close-create"]')?.addEventListener("click", () => {
      this.creating = false;
      this.render();
    });

    if (this.creating) {
      wireModal(root, {
        onClose: () => {
          this.creating = false;
          this.render();
        },
      });
    }

    root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        this.mode = button.dataset.mode === "list" ? "list" : "kanban";
        this.render();
      });
    });

    root.querySelectorAll<HTMLElement>("[data-open-task]").forEach((card) => {
      card.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("button, a, input, select, textarea, label, form")) {
          return;
        }

        const taskId = card.dataset.openTask;
        if (!taskId) {
          return;
        }

        this.openedTaskId = taskId;
        this.detailsMode = "view";
        this.render();
      });

      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        const taskId = card.dataset.openTask;
        if (!taskId) {
          return;
        }

        this.openedTaskId = taskId;
        this.detailsMode = "view";
        this.render();
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="close-task-details"]')?.addEventListener("click", () => {
      this.openedTaskId = null;
      this.detailsMode = "view";
      this.render();
    });

    const dialog = root.querySelector<HTMLDialogElement>("[data-task-modal]");
    if (dialog) {
      if (!dialog.open) {
        dialog.showModal();
      }

      dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) {
          return;
        }

        this.openedTaskId = null;
        this.detailsMode = "view";
        this.render();
      });

      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        if (this.detailsMode === "edit") {
          this.detailsMode = "view";
        } else {
          this.openedTaskId = null;
        }
        this.render();
      });
    }

    root.querySelector<HTMLButtonElement>('[data-action="edit-task"]')?.addEventListener("click", () => {
      if (!this.openedTaskId) {
        return;
      }

      this.detailsMode = "edit";
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="cancel-task-edit"]')?.addEventListener("click", () => {
      this.detailsMode = "view";
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="delete-task"]')?.addEventListener("click", () => {
      const taskId = this.openedTaskId;
      const workspace = appStore.getWorkspace();
      const task = workspace.tasks.find((item) => item.id === taskId);
      if (!taskId || !task) {
        return;
      }

      const sessionCount = workspace.sessions.filter((session) => session.taskId === taskId).length;
      const confirmed = confirmDestructive(
        `Удалить задачу «${task.title}»?\n\n` +
          `Будут безвозвратно удалены: рабочие сессии (${sessionCount}), ` +
          `записи журнала (${task.history.length}), подзадачи (${task.subtasks.length}).\n\n` +
          "Связи в чек-листе и календаре будут отвязаны, сами записи останутся.",
      );
      if (!confirmed) {
        return;
      }

      void appStore.deleteTask(taskId).then(() => {
        this.openedTaskId = null;
        this.detailsMode = "view";
        this.render();
      });
    });

    root.querySelector<HTMLFormElement>('[data-form="edit-task"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement) || !this.openedTaskId) {
        return;
      }

      const tagIds = [...form.querySelectorAll<HTMLInputElement>('input[name="tagIds"]:checked')].map(
        (input) => input.value,
      );
      const taskId = this.openedTaskId;
      void appStore
        .updateTask({
          taskId,
          title: requireInput(form, "title").value,
          description: requireTextArea(form, "description").value,
          projectId: requireSelect(form, "projectId").value || null,
          dueDate: requireInput(form, "dueDate").value || null,
          priority: requireSelect(form, "priority").value as Task["priority"],
          tagIds,
        })
        .then(() => {
          this.openedTaskId = taskId;
          this.detailsMode = "view";
          this.render();
        });
    });

    root.querySelector<HTMLButtonElement>('[data-action="start-task-timer"]')?.addEventListener("click", () => {
      const taskId = this.openedTaskId;
      if (!taskId || appStore.getActiveTimer()) {
        return;
      }

      void requestTimerNotificationPermission();
      void appStore.startTimer(taskId);
      window.location.hash = "#/focus";
    });

    root.querySelector<HTMLButtonElement>('[data-action="start-task-pomodoro"]')?.addEventListener("click", () => {
      const taskId = this.openedTaskId;
      if (!taskId || appStore.getActiveTimer()) {
        return;
      }

      void requestTimerNotificationPermission();
      void appStore.startPomodoro(taskId);
      window.location.hash = "#/focus";
    });

    root.querySelectorAll<HTMLSelectElement>("[data-status]").forEach((select) => {
      select.addEventListener("change", () => {
        const taskId = select.dataset.taskId;
        if (taskId) {
          void appStore.updateTaskStatus(taskId, select.value as TaskStatus);
        }
      });
    });

    root.querySelectorAll<HTMLElement>("[data-drag-task]").forEach((card) => {
      card.addEventListener("dragstart", (event) => {
        this.draggingTaskId = card.dataset.dragTask ?? null;
        if (event instanceof DragEvent && event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", this.draggingTaskId ?? "");
        }
      });
      card.addEventListener("dragend", () => {
        this.draggingTaskId = null;
      });
    });

    root.querySelectorAll<HTMLElement>("[data-drop-status]").forEach((column) => {
      column.addEventListener("dragover", (event) => {
        event.preventDefault();
        column.classList.add("is-drop-target");
      });
      column.addEventListener("dragleave", () => column.classList.remove("is-drop-target"));
      column.addEventListener("drop", (event) => {
        event.preventDefault();
        column.classList.remove("is-drop-target");
        const status = column.dataset.dropStatus as TaskStatus | undefined;
        const taskId = this.draggingTaskId;
        this.draggingTaskId = null;
        if (status && taskId) {
          void appStore.updateTaskStatus(taskId, status);
        }
      });
    });

    root.querySelector<HTMLFormElement>("[data-subtask-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      const taskId = form.dataset.taskId;
      const input = requireInput(form, "title");
      if (taskId && input.value.trim()) {
        void appStore.addSubtask(taskId, input.value);
        input.value = "";
      }
    });

    root.querySelectorAll<HTMLInputElement>("[data-subtask-toggle]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const { taskId, subtaskId } = checkbox.dataset;
        if (taskId && subtaskId) {
          void appStore.toggleSubtask(taskId, subtaskId);
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-subtask-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        const taskId = button.dataset.taskId;
        const subtaskId = button.dataset.subtaskDelete;
        if (taskId && subtaskId) {
          void appStore.deleteSubtask(taskId, subtaskId);
        }
      });
    });

    root.querySelectorAll<HTMLFormElement>("[data-history-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const taskId = form.dataset.taskId;
        if (!taskId) {
          return;
        }

        void appStore.addTaskHistory(
          taskId,
          requireTextArea(form, "history").value,
          requireSelect(form, "kind").value as "note" | "progress" | "decision",
        );
        form.reset();
        this.render();
      });
    });

  }

  private renderCreateModal(workspace: ReturnType<typeof appStore.getWorkspace>): string {
    return modalHtml({
      label: "Новая задача",
      body: `
        <form class="form-grid" data-form="task">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <p class="eyebrow">Новая задача</p>
              <h2>Зафиксировать работу</h2>
            </div>
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-create" } })}>Закрыть</button>
          </div>
          ${fieldHtml({
            label: "Название",
            control: `<input name="title" required placeholder="Например: написать конспект по архитектуре" />`,
          })}
          ${fieldHtml({
            label: "Описание",
            control: `<textarea name="description" placeholder="Контекст, критерии готовности, ссылки"></textarea>`,
          })}
          <div class="inline-grid">
            ${fieldHtml({
              label: "Проект",
              control: `<select name="projectId">${renderProjectOptions(workspace.projects)}</select>`,
            })}
            ${fieldHtml({
              label: "Приоритет",
              control: `<select name="priority">
                <option value="medium">Средний</option>
                <option value="high">Высокий</option>
                <option value="low">Низкий</option>
              </select>`,
            })}
          </div>
          ${fieldHtml({
            label: "Дедлайн",
            control: `<input name="dueDate" type="date" />`,
          })}
          <fieldset class="tag-fieldset">
            <legend>Теги</legend>
            ${
              workspace.tags.length
                ? workspace.tags
                    .map(
                      (tag) => `
                        <label class="check-row">
                          <input type="checkbox" name="tagIds" value="${escapeHtml(tag.id)}" />
                          <span style="--tag-color: ${escapeHtml(tag.color)}">${escapeHtml(tag.name)}</span>
                        </label>
                      `,
                    )
                    .join("")
                : `<p class="muted">Теги можно добавить в настройках.</p>`
            }
          </fieldset>
          <button ${buttonAttrs({ type: "submit" })}>Создать задачу</button>
        </form>
      `,
    });
  }

  private renderTaskDetails(totalMinutesByTask: Map<string, number>): string {
    if (!this.openedTaskId) {
      return "";
    }

    const workspace = appStore.getWorkspace();
    const task = workspace.tasks.find((item) => item.id === this.openedTaskId);
    const active = appStore.getActiveTimer();
    const hasActiveTimer = Boolean(active);

    if (!task) {
      return "";
    }

    const content =
      this.detailsMode === "edit"
        ? this.renderTaskEditor(task, workspace)
        : this.renderTaskView(task, workspace, totalMinutesByTask, hasActiveTimer);

    return `<dialog class="modal" data-task-modal>${content}</dialog>`;
  }

  private renderTaskView(
    task: Task,
    workspace: ReturnType<typeof appStore.getWorkspace>,
    totalMinutesByTask: Map<string, number>,
    hasActiveTimer: boolean,
  ): string {
    return `
      <article class="card task-details" role="dialog" aria-modal="true" aria-label="Подробности задачи">
        <div class="card-header">
          <div>
            <p class="eyebrow">Задача</p>
            <h2>${escapeHtml(task.title)}</h2>
          </div>
          <div class="row-actions">
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-task-details" } })}>Закрыть</button>
            <button ${buttonAttrs({ size: "small", data: { action: "edit-task" } })}>Редактировать</button>
            <button ${buttonAttrs({ tone: "danger", size: "small", data: { action: "delete-task" } })}>Удалить</button>
          </div>
        </div>

        <div class="task-details-grid">
          <section class="task-details-main">
            <article class="card subtle">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Контекст</p>
                  <h3>Описание</h3>
                </div>
              </div>
              ${
                task.description
                  ? `<div class="markdown-preview">${renderMarkdown(task.description)}</div>`
                  : emptyStateHtml("У задачи пока нет описания.")
              }
            </article>

            <article class="card subtle">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Чеклист</p>
                  <h3>Подзадачи</h3>
                </div>
                ${task.subtasks.length ? badgeHtml(`${task.subtasks.filter((sub) => sub.done).length}/${task.subtasks.length}`) : ""}
              </div>
              ${this.renderSubtasks(task)}
              <form class="subtask-add" data-subtask-form data-task-id="${escapeHtml(task.id)}">
                <input name="title" placeholder="Новая подзадача" aria-label="Новая подзадача" />
                <button ${buttonAttrs({ type: "submit", tone: "ghost", size: "small" })}>Добавить</button>
              </form>
            </article>

            <form class="card subtle form-grid" data-history-form data-task-id="${escapeHtml(task.id)}">
              <div>
                <p class="eyebrow">Журнал</p>
                <h3>Новая запись</h3>
              </div>
              <div class="inline-grid">
                ${fieldHtml({
                  label: "Тип записи",
                  control: `<select name="kind">
                    <option value="progress">Прогресс</option>
                    <option value="note">Заметка</option>
                    <option value="decision">Решение</option>
                  </select>`,
                })}
                ${fieldHtml({
                  label: "Запись",
                  control: `<textarea name="history" placeholder="Что сделал, понял или решил"></textarea>`,
                })}
              </div>
              <button ${buttonAttrs({ type: "submit", tone: "ghost", size: "small" })}>Добавить запись</button>
            </form>

            <article class="card subtle">
              <div class="card-header">
                <div>
                  <p class="eyebrow">История</p>
                  <h3>Последние записи</h3>
                </div>
                ${badgeHtml(task.history.length)}
              </div>
              <div class="item-list">
                ${
                  task.history.length
                    ? task.history
                        .map(
                          (entry) => `
                            <div class="list-item">
                              <div class="meta-row"><strong>${escapeHtml(entry.kind)}</strong><span>${formatDate(entry.at)}</span></div>
                              <div class="markdown-preview">${renderMarkdown(entry.markdown)}</div>
                            </div>
                          `,
                        )
                        .join("")
                    : emptyStateHtml("Записей пока нет.")
                }
              </div>
            </article>
          </section>

          <aside class="task-details-side">
            <article class="card subtle task-quick-actions">
              <div>
                <p class="eyebrow">Работа</p>
                <h3>Быстрый старт</h3>
              </div>
              <p class="muted">${
                hasActiveTimer
                  ? "Уже есть активный таймер. Остановите или отмените его перед запуском новой сессии."
                  : "Запустите работу над этой задачей без перехода через выбор задачи."
              }</p>
              <button ${buttonAttrs({ data: { action: "start-task-timer" }, disabled: hasActiveTimer })}>Запустить таймер</button>
              <button ${buttonAttrs({ tone: "secondary", data: { action: "start-task-pomodoro" }, disabled: hasActiveTimer })}>Запустить помодоро</button>
            </article>

            <article class="card subtle form-grid">
              <div>
                <p class="eyebrow">Состояние</p>
                <h3>Параметры</h3>
              </div>
              ${fieldHtml({
                label: "Статус",
                control: `<select data-status data-task-id="${escapeHtml(task.id)}">
                  ${STATUS_ORDER.map(
                    (status) =>
                      `<option value="${status}" ${task.status === status ? "selected" : ""}>${TASK_STATUS_LABELS[status]}</option>`,
                  ).join("")}
                </select>`,
              })}
              <div class="item-list">
                <div class="list-item">
                  <p class="eyebrow">Проект</p>
                  <strong>${escapeHtml(getProjectName(workspace.projects, task.projectId))}</strong>
                </div>
                <div class="list-item">
                  <p class="eyebrow">Приоритет</p>
                  <strong>${escapeHtml(TASK_PRIORITY_LABELS[task.priority])}</strong>
                </div>
                <div class="list-item">
                  <p class="eyebrow">Дедлайн</p>
                  <strong>${formatDate(task.dueDate)}</strong>
                </div>
                <div class="list-item">
                  <p class="eyebrow">Время</p>
                  <strong>${formatDuration(totalMinutesByTask.get(task.id) ?? 0)}</strong>
                </div>
              </div>
              <div class="meta-row">${renderTagPills(workspace.tags, task.tagIds)}</div>
            </article>
          </aside>
        </div>
      </article>
    `;
  }

  private renderTaskEditor(task: Task, workspace: ReturnType<typeof appStore.getWorkspace>): string {
    const priorities: Array<{ value: Task["priority"]; label: string }> = [
      { value: "medium", label: "Средний" },
      { value: "high", label: "Высокий" },
      { value: "low", label: "Низкий" },
    ];

    return `
      <form class="card task-details form-grid" data-form="edit-task" role="dialog" aria-modal="true" aria-label="Редактирование задачи">
        <div class="card-header">
          <div>
            <p class="eyebrow">Редактирование</p>
            <h2>${escapeHtml(task.title)}</h2>
          </div>
          <div class="row-actions">
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "cancel-task-edit" } })}>Отмена</button>
            <button ${buttonAttrs({ type: "submit", size: "small" })}>Сохранить</button>
          </div>
        </div>

        ${fieldHtml({
          label: "Название",
          control: `<input name="title" required value="${escapeHtml(task.title)}" />`,
        })}
        ${fieldHtml({
          label: "Описание",
          control: `<textarea name="description" placeholder="Контекст, критерии готовности, ссылки">${escapeHtml(task.description)}</textarea>`,
        })}
        <div class="inline-grid">
          ${fieldHtml({
            label: "Проект",
            control: `<select name="projectId">${renderProjectOptions(workspace.projects, task.projectId)}</select>`,
          })}
          ${fieldHtml({
            label: "Приоритет",
            control: `<select name="priority">
              ${priorities
                .map(
                  (priority) =>
                    `<option value="${priority.value}" ${task.priority === priority.value ? "selected" : ""}>${priority.label}</option>`,
                )
                .join("")}
            </select>`,
          })}
        </div>
        ${fieldHtml({
          label: "Дедлайн",
          control: `<input name="dueDate" type="date" value="${escapeHtml(task.dueDate ?? "")}" />`,
        })}
        <fieldset class="tag-fieldset">
          <legend>Теги</legend>
          ${
            workspace.tags.length
              ? workspace.tags
                  .map(
                    (tag) => `
                      <label class="check-row">
                        <input
                          type="checkbox"
                          name="tagIds"
                          value="${escapeHtml(tag.id)}"
                          ${task.tagIds.includes(tag.id) ? "checked" : ""}
                        />
                        <span style="--tag-color: ${escapeHtml(tag.color)}">${escapeHtml(tag.name)}</span>
                      </label>
                    `,
                  )
                  .join("")
              : `<p class="muted">Теги можно добавить в настройках.</p>`
          }
        </fieldset>
      </form>
    `;
  }

  private renderKanban(tasks: Task[], totalMinutesByTask: Map<string, number>): string {
    return `
      <section class="kanban" aria-label="Канбан задач">
        ${STATUS_ORDER.map(
          (status) => `
            <div class="kanban-column" data-drop-status="${status}" role="group" aria-label="${TASK_STATUS_LABELS[status]}">
              <div class="card-header">
                <h3>${TASK_STATUS_LABELS[status]}</h3>
                ${badgeHtml(tasks.filter((task) => task.status === status).length)}
              </div>
              ${
                tasks.filter((task) => task.status === status).length
                  ? tasks
                      .filter((task) => task.status === status)
                      .map((task) => this.renderTaskCard(task, totalMinutesByTask, "kanban"))
                      .join("")
                  : emptyStateHtml("Нет задач")
              }
            </div>
          `,
        ).join("")}
      </section>
    `;
  }

  private renderList(tasks: Task[], totalMinutesByTask: Map<string, number>): string {
    return `
      <section class="card">
        <div class="card-header">
          <div>
            <p class="eyebrow">Список</p>
            <h2>Все задачи</h2>
          </div>
        </div>
        <div class="item-list">
          ${tasks.length ? tasks.map((task) => this.renderTaskCard(task, totalMinutesByTask, "list")).join("") : emptyStateHtml("Задач пока нет.")}
        </div>
      </section>
    `;
  }

  private renderSubtasks(task: Task): string {
    if (!task.subtasks.length) {
      return `<p class="muted">Разбейте задачу на шаги.</p>`;
    }

    return `
      <div class="subtask-list">
        ${task.subtasks
          .map(
            (sub) => `
              <div class="subtask-row ${sub.done ? "is-done" : ""}">
                <label class="subtask-check">
                  <input type="checkbox" data-subtask-toggle data-task-id="${escapeHtml(task.id)}" data-subtask-id="${escapeHtml(sub.id)}" ${sub.done ? "checked" : ""} />
                  <span>${escapeHtml(sub.title)}</span>
                </label>
                <button ${buttonAttrs({ tone: "ghost", size: "small", data: { subtaskDelete: sub.id, taskId: task.id } })} aria-label="Удалить подзадачу">✕</button>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  private renderTaskCard(task: Task, totalMinutesByTask: Map<string, number>, variant: "kanban" | "list"): string {
    const workspace = appStore.getWorkspace();
    const recentHistory = task.history.slice(0, 2);

    const dragAttrs = variant === "kanban" ? `draggable="true" data-drag-task="${escapeHtml(task.id)}"` : "";

    return `
      <article class="list-item task-card" data-open-task="${escapeHtml(task.id)}" ${dragAttrs} tabindex="0">
        <div class="card-header">
          <div>
            <h3>${escapeHtml(task.title)}</h3>
            <div class="meta-row">
              ${badgeHtml(TASK_PRIORITY_LABELS[task.priority])}
              <span>${escapeHtml(getProjectName(workspace.projects, task.projectId))}</span>
              <span>дедлайн: ${formatDate(task.dueDate)}</span>
              <span>время: ${formatDuration(totalMinutesByTask.get(task.id) ?? 0)}</span>
            </div>
          </div>
        </div>
        ${task.description ? `<div class="markdown-preview">${renderMarkdown(task.description)}</div>` : ""}
        ${
          task.subtasks.length
            ? `<div class="subtask-progress">
                <div class="bar"><span style="width: ${Math.round((task.subtasks.filter((sub) => sub.done).length / task.subtasks.length) * 100)}%"></span></div>
                <span class="muted">${task.subtasks.filter((sub) => sub.done).length}/${task.subtasks.length}</span>
              </div>`
            : ""
        }
        <div class="meta-row">${renderTagPills(workspace.tags, task.tagIds)}</div>
        ${fieldHtml({
          label: "Статус",
          control: `<select data-status data-task-id="${escapeHtml(task.id)}">
            ${STATUS_ORDER.map(
              (status) =>
                `<option value="${status}" ${task.status === status ? "selected" : ""}>${TASK_STATUS_LABELS[status]}</option>`,
            ).join("")}
          </select>`,
        })}
        ${
          variant === "list"
            ? `
              <form class="task-history form-grid" data-history-form data-task-id="${escapeHtml(task.id)}">
                <div class="inline-grid">
                  ${fieldHtml({
                    label: "Тип записи",
                    control: `<select name="kind">
                      <option value="progress">Прогресс</option>
                      <option value="note">Заметка</option>
                      <option value="decision">Решение</option>
                    </select>`,
                  })}
                  ${fieldHtml({
                    label: "Журнал",
                    control: `<textarea name="history" placeholder="Что сделал, понял или решил"></textarea>`,
                  })}
                </div>
                <button ${buttonAttrs({ type: "submit", tone: "ghost", size: "small" })}>Добавить запись</button>
              </form>
            `
            : `<p class="muted">Журнал задачи доступен в режиме списка.</p>`
        }
        ${
          recentHistory.length
            ? recentHistory
                .map(
                  (entry) => `
                    <div class="history-entry">
                      <div class="meta-row"><strong>${escapeHtml(entry.kind)}</strong><span>${formatDate(entry.at)}</span></div>
                      <div class="markdown-preview">${renderMarkdown(entry.markdown)}</div>
                    </div>
                  `,
                )
                .join("")
            : ""
        }
      </article>
    `;
  }
}

customElements.define("pn-tasks-view", TasksView);
