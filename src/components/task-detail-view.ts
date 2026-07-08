import { SESSION_MODE_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "../domain/defaults";
import { escapeHtml, renderMarkdown } from "../domain/markdown";
import { presetToRule, RECURRENCE_PRESET_LABELS, type RecurrencePreset, ruleToPreset } from "../domain/recurrence";
import { formatDuration } from "../domain/stats";
import type { Note, Task, TaskStatus, TimeSession, Workspace } from "../domain/types";
import { requestTimerNotificationPermission } from "../platform/notifications";
import { appStore } from "../state";
import { confirmDestructive } from "../ui/actions";
import { ICONS } from "../ui/icons";
import { badgeHtml, buttonAttrs, emptyStateHtml, fieldHtml } from "../ui/html";
import { renderShadow } from "./shadow";
import {
  formatDate,
  formatDateTime,
  getProjectName,
  renderProjectOptions,
  renderTagPills,
  requireInput,
  requireSelect,
  requireTextArea,
} from "./view-utils";

const STATUS_ORDER: TaskStatus[] = ["backlog", "active", "blocked", "done"];
const BACK_HASH = "#/work/tasks";

export class TaskDetailView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private editing = false;

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  private get taskId(): string {
    return this.getAttribute("entity-id") ?? "";
  }

  private render(): void {
    const workspace = appStore.getWorkspace();
    const task = workspace.tasks.find((item) => item.id === this.taskId);

    if (!task) {
      const root = renderShadow(
        this,
        `
          <section class="view-grid">
            <a class="button ghost small back-link" href="${BACK_HASH}">← Ко всем задачам</a>
            ${emptyStateHtml("Задача не найдена. Возможно, она была удалена.")}
          </section>
        `,
        styles,
      );
      root.querySelector<HTMLAnchorElement>(".back-link")?.setAttribute("href", BACK_HASH);
      return;
    }

    const sessions = workspace.sessions.filter((session) => session.taskId === task.id);
    const trackedMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
    const linkedNotes = workspace.notes.filter((note) => note.linkedTaskIds.includes(task.id));
    const hasActiveTimer = Boolean(appStore.getActiveTimer());

    const root = renderShadow(
      this,
      this.editing
        ? this.renderEditor(task, workspace)
        : this.renderView(task, workspace, { sessions, trackedMinutes, linkedNotes, hasActiveTimer }),
      styles,
    );

    this.bind(root, task);
  }

  private renderView(
    task: Task,
    workspace: Workspace,
    meta: { sessions: TimeSession[]; trackedMinutes: number; linkedNotes: Note[]; hasActiveTimer: boolean },
  ): string {
    return `
      <section class="view-grid">
        <a class="button ghost small back-link" href="${BACK_HASH}">← Ко всем задачам</a>

        <article class="card">
          <div class="card-header">
            <div>
              <p class="eyebrow">Задача · ${escapeHtml(TASK_STATUS_LABELS[task.status])}</p>
              <h2>${escapeHtml(task.title)}</h2>
            </div>
            <div class="row-actions">
              <button ${buttonAttrs({ size: "small", icon: true, label: "Редактировать", data: { action: "edit-task" } })}>${ICONS.edit}</button>
              <button ${buttonAttrs({ tone: "danger", size: "small", icon: true, label: "Удалить", data: { action: "delete-task" } })}>${ICONS.trash}</button>
            </div>
          </div>

          <div class="detail-grid">
            <section class="detail-main">
              <article class="card subtle">
                <div class="card-header">
                  <div><p class="eyebrow">Контекст</p><h3>Описание</h3></div>
                </div>
                ${
                  task.description
                    ? `<div class="markdown-preview">${renderMarkdown(task.description)}</div>`
                    : emptyStateHtml("У задачи пока нет описания.")
                }
              </article>

              <article class="card subtle">
                <div class="card-header">
                  <div><p class="eyebrow">Чеклист</p><h3>Подзадачи</h3></div>
                  ${task.subtasks.length ? badgeHtml(`${task.subtasks.filter((sub) => sub.done).length}/${task.subtasks.length}`) : ""}
                </div>
                ${this.renderSubtasks(task)}
                <form class="subtask-add" data-subtask-form data-task-id="${escapeHtml(task.id)}">
                  <input name="title" placeholder="Новая подзадача" aria-label="Новая подзадача" />
                  <button ${buttonAttrs({ type: "submit", tone: "ghost", size: "small" })}>Добавить</button>
                </form>
              </article>

              <form class="card subtle form-grid" data-history-form data-task-id="${escapeHtml(task.id)}">
                <div><p class="eyebrow">Журнал</p><h3>Новая запись</h3></div>
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
                  <div><p class="eyebrow">История</p><h3>Записи журнала</h3></div>
                  ${badgeHtml(task.history.length)}
                </div>
                <div class="item-list">
                  ${
                    task.history.length
                      ? task.history
                          .map(
                            (entry) => `
                              <div class="list-item">
                                <div class="meta-row"><strong>${escapeHtml(entry.kind)}</strong><span>${formatDateTime(entry.at)}</span></div>
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

            <aside class="detail-side">
              <article class="card subtle task-quick-actions">
                <div><p class="eyebrow">Работа</p><h3>Быстрый старт</h3></div>
                <p class="muted">${
                  meta.hasActiveTimer
                    ? "Уже есть активный таймер. Остановите или отмените его перед запуском новой сессии."
                    : "Запустите работу над этой задачей."
                }</p>
                <button ${buttonAttrs({ data: { action: "start-task-timer" }, disabled: meta.hasActiveTimer })}>${ICONS.play}Таймер</button>
                <button ${buttonAttrs({ tone: "secondary", data: { action: "start-task-pomodoro" }, disabled: meta.hasActiveTimer })}>${ICONS.cycle}Помодоро</button>
              </article>

              <article class="card subtle form-grid">
                <div><p class="eyebrow">Состояние</p><h3>Параметры</h3></div>
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
                  <div class="list-item"><p class="eyebrow">Проект</p><strong>${escapeHtml(getProjectName(workspace.projects, task.projectId))}</strong></div>
                  <div class="list-item"><p class="eyebrow">Приоритет</p><strong>${escapeHtml(TASK_PRIORITY_LABELS[task.priority])}</strong></div>
                  <div class="list-item"><p class="eyebrow">Дедлайн</p><strong>${formatDate(task.dueDate)}</strong></div>
                  <div class="list-item"><p class="eyebrow">Записано времени</p><strong>${formatDuration(meta.trackedMinutes)}</strong></div>
                </div>
                <div class="meta-row">${renderTagPills(workspace.tags, task.tagIds)}</div>
              </article>

              <article class="card subtle">
                <div class="card-header">
                  <div><p class="eyebrow">Связи</p><h3>Заметки</h3></div>
                  ${badgeHtml(meta.linkedNotes.length)}
                </div>
                ${
                  meta.linkedNotes.length
                    ? `<div class="item-list">
                        ${meta.linkedNotes
                          .map(
                            (note) => `<a class="list-item note-link" href="#/notes/notes"><strong>${escapeHtml(note.title)}</strong></a>`,
                          )
                          .join("")}
                      </div>`
                    : emptyStateHtml("Нет связанных заметок.")
                }
              </article>

              <article class="card subtle">
                <div class="card-header">
                  <div><p class="eyebrow">Факт</p><h3>Последние сессии</h3></div>
                  ${badgeHtml(meta.sessions.length)}
                </div>
                <div class="item-list">
                  ${
                    meta.sessions.length
                      ? meta.sessions
                          .slice(0, 6)
                          .map(
                            (session) => `
                              <div class="list-item">
                                <div class="meta-row">
                                  <strong>${formatDuration(session.durationMinutes)}</strong>
                                  <span>${SESSION_MODE_LABELS[session.mode]}</span>
                                  <span>${formatDateTime(session.endedAt)}</span>
                                </div>
                              </div>
                            `,
                          )
                          .join("")
                      : emptyStateHtml("Сессий пока нет.")
                  }
                </div>
              </article>
            </aside>
          </div>
        </article>
      </section>
    `;
  }

  private renderEditor(task: Task, workspace: Workspace): string {
    const priorities: Array<{ value: Task["priority"]; label: string }> = [
      { value: "medium", label: "Средний" },
      { value: "high", label: "Высокий" },
      { value: "low", label: "Низкий" },
    ];

    return `
      <section class="view-grid">
        <a class="button ghost small back-link" href="${BACK_HASH}">← Ко всем задачам</a>

        <form class="card form-grid" data-form="edit-task">
          <div class="card-header">
            <div><p class="eyebrow">Редактирование</p><h2>${escapeHtml(task.title)}</h2></div>
            <div class="row-actions">
              <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "cancel-task-edit" } })}>Отмена</button>
              <button ${buttonAttrs({ type: "submit", size: "small" })}>Сохранить</button>
            </div>
          </div>

          ${fieldHtml({ label: "Название", control: `<input name="title" required value="${escapeHtml(task.title)}" />` })}
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
          ${fieldHtml({ label: "Дедлайн", control: `<input name="dueDate" type="date" value="${escapeHtml(task.dueDate ?? "")}" />` })}
          ${fieldHtml({
            label: "Повтор (от дедлайна)",
            control: `<select name="recurrence">
              ${(Object.keys(RECURRENCE_PRESET_LABELS) as RecurrencePreset[])
                .map(
                  (preset) =>
                    `<option value="${preset}" ${ruleToPreset(task.recurrence) === preset ? "selected" : ""}>${RECURRENCE_PRESET_LABELS[preset]}</option>`,
                )
                .join("")}
            </select>`,
          })}
          <fieldset class="tag-fieldset">
            <legend>Теги</legend>
            ${
              workspace.tags.length
                ? workspace.tags
                    .map(
                      (tag) => `
                        <label class="check-row">
                          <input type="checkbox" name="tagIds" value="${escapeHtml(tag.id)}" ${task.tagIds.includes(tag.id) ? "checked" : ""} />
                          <span style="--tag-color: ${escapeHtml(tag.color)}">${escapeHtml(tag.name)}</span>
                        </label>
                      `,
                    )
                    .join("")
                : `<p class="muted">Теги можно добавить в настройках.</p>`
            }
          </fieldset>
        </form>
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

  private bind(root: ShadowRoot, task: Task): void {
    root.querySelector<HTMLButtonElement>('[data-action="edit-task"]')?.addEventListener("click", () => {
      this.editing = true;
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="cancel-task-edit"]')?.addEventListener("click", () => {
      this.editing = false;
      this.render();
    });

    root.querySelector<HTMLFormElement>('[data-form="edit-task"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      const tagIds = [...form.querySelectorAll<HTMLInputElement>('input[name="tagIds"]:checked')].map((input) => input.value);
      void appStore
        .updateTask({
          taskId: task.id,
          title: requireInput(form, "title").value,
          description: requireTextArea(form, "description").value,
          projectId: requireSelect(form, "projectId").value || null,
          dueDate: requireInput(form, "dueDate").value || null,
          priority: requireSelect(form, "priority").value as Task["priority"],
          tagIds,
          recurrence: presetToRule(requireSelect(form, "recurrence").value as RecurrencePreset),
        })
        .then(() => {
          this.editing = false;
          this.render();
        });
    });

    root.querySelector<HTMLButtonElement>('[data-action="delete-task"]')?.addEventListener("click", () => {
      const workspace = appStore.getWorkspace();
      const sessionCount = workspace.sessions.filter((session) => session.taskId === task.id).length;
      const confirmed = confirmDestructive(
        `Удалить задачу «${task.title}»?\n\n` +
          `Будут безвозвратно удалены: рабочие сессии (${sessionCount}), ` +
          `записи журнала (${task.history.length}), подзадачи (${task.subtasks.length}).\n\n` +
          "Связи в чек-листе и календаре будут отвязаны, сами записи останутся.",
      );
      if (!confirmed) {
        return;
      }

      void appStore.deleteTask(task.id).then(() => {
        window.location.hash = BACK_HASH;
      });
    });

    root.querySelector<HTMLSelectElement>("[data-status]")?.addEventListener("change", (event) => {
      if (event.currentTarget instanceof HTMLSelectElement) {
        void appStore.updateTaskStatus(task.id, event.currentTarget.value as TaskStatus);
      }
    });

    root.querySelector<HTMLButtonElement>('[data-action="start-task-timer"]')?.addEventListener("click", () => {
      // Уже идёт сессия — не перезаписываем её, а показываем в фокусе.
      if (!appStore.getActiveTimer()) {
        void requestTimerNotificationPermission();
        void appStore.startTimer(task.id);
      }
      window.location.hash = "#/work/focus";
    });

    root.querySelector<HTMLButtonElement>('[data-action="start-task-pomodoro"]')?.addEventListener("click", () => {
      if (!appStore.getActiveTimer()) {
        void requestTimerNotificationPermission();
        void appStore.startPomodoro(task.id);
      }
      window.location.hash = "#/work/focus";
    });

    root.querySelector<HTMLFormElement>("[data-subtask-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      const input = requireInput(form, "title");
      if (input.value.trim()) {
        void appStore.addSubtask(task.id, input.value);
        input.value = "";
      }
    });

    root.querySelectorAll<HTMLInputElement>("[data-subtask-toggle]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const { subtaskId } = checkbox.dataset;
        if (subtaskId) {
          void appStore.toggleSubtask(task.id, subtaskId);
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-subtask-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        const subtaskId = button.dataset.subtaskDelete;
        if (subtaskId) {
          void appStore.deleteSubtask(task.id, subtaskId);
        }
      });
    });

    root.querySelector<HTMLFormElement>("[data-history-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      void appStore.addTaskHistory(
        task.id,
        requireTextArea(form, "history").value,
        requireSelect(form, "kind").value as "note" | "progress" | "decision",
      );
      form.reset();
    });
  }
}

customElements.define("pn-task-detail-view", TaskDetailView);

const styles = `
  .back-link {
    justify-self: start;
  }

  .detail-grid {
    display: grid;
    gap: var(--space-4);
    grid-template-columns: minmax(0, 1.1fr) minmax(18rem, 0.9fr);
    min-width: 0;
  }

  .detail-main,
  .detail-side {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }

  .task-quick-actions {
    display: grid;
    gap: var(--space-3);
  }

  .note-link {
    text-decoration: none;
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

  fieldset {
    align-items: center;
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

  @media (max-width: 1100px) {
    .detail-grid {
      grid-template-columns: 1fr;
    }
  }
`;
