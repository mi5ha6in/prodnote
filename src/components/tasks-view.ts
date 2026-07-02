import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "../domain/defaults";
import { escapeHtml, renderMarkdown } from "../domain/markdown";
import { formatDuration } from "../domain/stats";
import {
  presetToRule,
  RECURRENCE_PRESET_LABELS,
  type RecurrencePreset,
  ruleToPreset,
} from "../domain/recurrence";
import { parseQuickAdd } from "../domain/quick-add";
import { PENDING_ACTION_KEY } from "../platform/launch-params";
import {
  DEFAULT_TASK_FILTER,
  filterAndSortTasks,
  isTaskFilterActive,
  TASK_SMART_LIST_LABELS,
  TASK_SORT_LABELS,
  type TaskFilterCriteria,
  type TaskSmartList,
  type TaskSort,
} from "../domain/task-filter";
import type { Task, TaskPriority, TaskStatus } from "../domain/types";
import { requestTimerNotificationPermission } from "../platform/notifications";
import { appStore } from "../state";
import { confirmDestructive } from "../ui/actions";
import { badgeHtml, buttonAttrs, emptyStateHtml, fieldHtml, modalHtml, viewHeaderHtml } from "../ui/html";
import { setBodyScrollLock, wireModal } from "./modal";
import { quickCreateHtml, wireQuickCreate, type QuickCreateKind } from "./quick-create";
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
  private filter: TaskFilterCriteria = { ...DEFAULT_TASK_FILTER };
  private focusSearch = false;
  private captureFocus = false;
  private selectMode = false;
  private selectedIds = new Set<string>();
  /**
   * Черновик открытой модалки (create/edit): quick-create проекта/тега пишет в
   * store, store эмитит, view перерисовывается — без черновика набранные поля
   * формы стёрлись бы.
   */
  private taskDraft: {
    title: string;
    description: string;
    projectId: string;
    priority: string;
    dueDate: string;
    recurrence: string;
    tagIds: string[];
  } | null = null;

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    document.addEventListener("keydown", this.onHotkey);
    // Ярлык PWA «Новая задача» оставляет отложенное действие.
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(PENDING_ACTION_KEY) === "new-task") {
      sessionStorage.removeItem(PENDING_ACTION_KEY);
      this.creating = true;
    }
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    document.removeEventListener("keydown", this.onHotkey);
    setBodyScrollLock(false);
  }

  /** Снять значения открытой формы задачи (create или edit) в черновик. */
  private snapshotTaskForm(root: ShadowRoot): void {
    const form = root.querySelector<HTMLFormElement>('[data-form="task"], [data-form="edit-task"]');
    if (!form) {
      return;
    }
    this.taskDraft = {
      title: requireInput(form, "title").value,
      description: requireTextArea(form, "description").value,
      projectId: requireSelect(form, "projectId").value,
      priority: requireSelect(form, "priority").value,
      dueDate: requireInput(form, "dueDate").value,
      recurrence: requireSelect(form, "recurrence").value,
      tagIds: [...form.querySelectorAll<HTMLInputElement>('input[name="tagIds"]:checked')].map((input) => input.value),
    };
  }

  /** n — новая задача, / — поиск. Не срабатывает, когда фокус в поле ввода или открыта модалка. */
  private onHotkey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const target = event.composedPath()[0];
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    ) {
      return;
    }
    if (this.creating || this.openedTaskId !== null) {
      return;
    }

    if (event.key === "n" || event.key === "т") {
      event.preventDefault();
      this.creating = true;
      this.render();
    } else if (event.key === "/") {
      event.preventDefault();
      this.focusSearch = true;
      this.render();
    }
  };

  private render(): void {
    const workspace = appStore.getWorkspace();
    const totalMinutesByTask = new Map<string, number>();
    for (const session of workspace.sessions) {
      totalMinutesByTask.set(session.taskId, (totalMinutesByTask.get(session.taskId) ?? 0) + session.durationMinutes);
    }

    // Kanban already groups by status, so the status facet only applies in list mode.
    const effectiveFilter = this.mode === "kanban" ? { ...this.filter, status: null } : this.filter;
    const visibleTasks = filterAndSortTasks(workspace.tasks, effectiveFilter, workspace.projects);

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
              <button ${buttonAttrs({ tone: "ghost", data: { action: "toggle-select" } })}>${this.selectMode ? "Готово" : "Выбрать"}</button>
              <button ${buttonAttrs({ data: { action: "open-create" } })}>+ Новая задача</button>
            `,
          })}

          ${this.renderToolbar(workspace, visibleTasks.length)}

          ${this.selectMode ? this.renderBatchBar(workspace) : ""}

          ${
            this.mode === "kanban"
              ? this.renderKanban(visibleTasks, totalMinutesByTask)
              : this.renderList(visibleTasks, totalMinutesByTask)
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

        .batch-bar {
          align-items: center;
          background: var(--accent-soft);
          border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--paper));
          border-radius: var(--radius-md);
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
        }

        .batch-bar select {
          min-height: 2.25rem;
          width: auto;
        }

        .batch-count {
          font-size: var(--text-sm);
          font-weight: 600;
        }

        .select-box {
          flex: none;
          width: auto;
        }

        .task-card.is-selected {
          border-color: var(--accent);
          box-shadow: inset 0 0 0 1px var(--accent-soft);
        }

        .task-card.is-drop-before {
          box-shadow: 0 -2px 0 0 var(--accent);
        }

        /* Touch devices cannot drag cards between columns — show arrow controls instead. */
        .move-controls {
          display: none;
          flex: none;
          gap: var(--space-1);
        }

        @media (hover: none), (pointer: coarse) {
          .move-controls {
            display: flex;
          }
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

        /* Capture + filters live in one panel so the top of the view reads
           as a single toolbar instead of loose stacked strips. */
        .task-toolbar {
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
          display: grid;
          gap: var(--space-3);
          padding: var(--space-3);
        }

        .task-toolbar > * + * {
          border-top: 1px solid var(--line);
          padding-top: var(--space-3);
        }

        .quick-capture {
          display: flex;
          gap: var(--space-2);
        }

        .quick-capture input {
          flex: 1;
        }

        .quick-syntax {
          margin-top: var(--space-2);
        }

        .quick-syntax summary {
          color: var(--muted);
          cursor: pointer;
          font-size: var(--text-xs);
          font-weight: 600;
          width: fit-content;
        }

        .quick-syntax p {
          font-size: var(--text-xs);
          margin-top: var(--space-1);
        }

        .quick-syntax code {
          background: var(--surface);
          border-radius: var(--radius-sm);
          padding: 0 0.25rem;
        }

        .task-filter {
          display: grid;
          gap: var(--space-2);
        }

        .filter-row {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }

        .task-filter-search {
          flex: 1 1 13rem;
          min-height: 2.25rem;
          padding-bottom: 0.4rem;
          padding-top: 0.4rem;
          width: auto;
        }

        /* Equal-width selects that wrap into tidy columns. */
        .filter-selects {
          display: grid;
          gap: var(--space-2);
          grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
        }

        .filter-selects select {
          min-height: 2.25rem;
          padding-bottom: 0.4rem;
          padding-left: 0.65rem;
          padding-top: 0.4rem;
        }

        .filter-meta {
          align-items: center;
          display: flex;
          gap: var(--space-2);
          justify-content: space-between;
        }

        .task-filter-count {
          color: var(--muted);
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
        recurrence: presetToRule(requireSelect(form, "recurrence").value as RecurrencePreset),
      });
      form.reset();
      this.creating = false;
      this.taskDraft = null;
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="open-create"]')?.addEventListener("click", () => {
      this.creating = true;
      this.taskDraft = null;
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="close-create"]')?.addEventListener("click", () => {
      this.creating = false;
      this.taskDraft = null;
      this.render();
    });

    if (this.creating) {
      wireModal(root, {
        onClose: () => {
          this.creating = false;
          this.taskDraft = null;
          this.render();
        },
      });
    }

    // Quick-create проекта/тега внутри открытой формы задачи.
    if (this.creating || (this.openedTaskId !== null && this.detailsMode === "edit")) {
      wireQuickCreate(root, {
        beforeCreate: () => this.snapshotTaskForm(root),
        onCreated: (kind: QuickCreateKind, id: string) => {
          if (!this.taskDraft) {
            return;
          }
          if (kind === "project") {
            this.taskDraft.projectId = id;
          } else if (!this.taskDraft.tagIds.includes(id)) {
            this.taskDraft.tagIds = [...this.taskDraft.tagIds, id];
          }
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

    root.querySelectorAll<HTMLButtonElement>("[data-smart]").forEach((button) => {
      button.addEventListener("click", () => {
        this.filter = { ...this.filter, smartList: (button.dataset.smart || null) as TaskSmartList | null };
        this.render();
      });
    });

    const searchInput = root.querySelector<HTMLInputElement>("[data-filter-search]");
    searchInput?.addEventListener("input", () => {
      this.filter = { ...this.filter, search: searchInput.value };
      this.focusSearch = true;
      this.render();
    });

    const projectSelect = root.querySelector<HTMLSelectElement>("[data-filter-project]");
    projectSelect?.addEventListener("change", () => {
      this.filter = { ...this.filter, projectId: projectSelect.value || null };
      this.render();
    });

    const tagSelect = root.querySelector<HTMLSelectElement>("[data-filter-tag]");
    tagSelect?.addEventListener("change", () => {
      this.filter = { ...this.filter, tagId: tagSelect.value || null };
      this.render();
    });

    const prioritySelect = root.querySelector<HTMLSelectElement>("[data-filter-priority]");
    prioritySelect?.addEventListener("change", () => {
      this.filter = { ...this.filter, priority: (prioritySelect.value || null) as TaskPriority | null };
      this.render();
    });

    const statusSelect = root.querySelector<HTMLSelectElement>("[data-filter-status]");
    statusSelect?.addEventListener("change", () => {
      this.filter = { ...this.filter, status: (statusSelect.value || null) as TaskStatus | null };
      this.render();
    });

    const sortSelect = root.querySelector<HTMLSelectElement>("[data-filter-sort]");
    sortSelect?.addEventListener("change", () => {
      this.filter = { ...this.filter, sort: sortSelect.value as TaskSort };
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="reset-filter"]')?.addEventListener("click", () => {
      this.filter = { ...DEFAULT_TASK_FILTER };
      this.render();
    });

    // Re-rendering on each keystroke recreates the input, so restore focus and caret.
    if (this.focusSearch && searchInput) {
      const caret = searchInput.value.length;
      searchInput.focus();
      searchInput.setSelectionRange(caret, caret);
      this.focusSearch = false;
    }

    const captureForm = root.querySelector<HTMLFormElement>("[data-quick-capture]");
    captureForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = requireInput(captureForm, "capture");
      const value = input.value.trim();
      if (!value) {
        return;
      }

      const parsed = parseQuickAdd(value, { projects: workspace.projects, tags: workspace.tags });
      this.captureFocus = true;
      void appStore.addTask({
        title: parsed.title || value,
        dueDate: parsed.dueDate,
        priority: parsed.priority ?? undefined,
        projectId: parsed.projectId,
        tagIds: parsed.tagIds,
      });
    });

    // Keep focus on the capture field after the task is added and the view re-renders.
    if (this.captureFocus) {
      captureForm?.querySelector<HTMLInputElement>('input[name="capture"]')?.focus();
      this.captureFocus = false;
    }

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

        if (this.selectMode) {
          this.toggleSelected(taskId);
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
      this.taskDraft = null;
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
        this.taskDraft = null;
        this.render();
      });

      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        if (this.detailsMode === "edit") {
          this.detailsMode = "view";
        } else {
          this.openedTaskId = null;
        }
        this.taskDraft = null;
        this.render();
      });
    }

    root.querySelector<HTMLButtonElement>('[data-action="edit-task"]')?.addEventListener("click", () => {
      if (!this.openedTaskId) {
        return;
      }

      this.detailsMode = "edit";
      this.taskDraft = null;
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="cancel-task-edit"]')?.addEventListener("click", () => {
      this.detailsMode = "view";
      this.taskDraft = null;
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
          recurrence: presetToRule(requireSelect(form, "recurrence").value as RecurrencePreset),
        })
        .then(() => {
          this.openedTaskId = taskId;
          this.detailsMode = "view";
          this.taskDraft = null;
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
      window.location.hash = "#/work/focus";
    });

    root.querySelector<HTMLButtonElement>('[data-action="start-task-pomodoro"]')?.addEventListener("click", () => {
      const taskId = this.openedTaskId;
      if (!taskId || appStore.getActiveTimer()) {
        return;
      }

      void requestTimerNotificationPermission();
      void appStore.startPomodoro(taskId);
      window.location.hash = "#/work/focus";
    });

    root.querySelector<HTMLButtonElement>('[data-action="toggle-select"]')?.addEventListener("click", () => {
      this.selectMode = !this.selectMode;
      this.selectedIds.clear();
      this.render();
    });

    root.querySelectorAll<HTMLInputElement>("[data-select-task]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const id = checkbox.dataset.selectTask;
        if (id) {
          this.toggleSelected(id);
        }
      });
    });

    root.querySelector<HTMLSelectElement>("[data-batch-status]")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value as TaskStatus | "";
      if (value) {
        void this.applyBatch((id) => appStore.updateTaskStatus(id, value));
      }
    });

    root.querySelector<HTMLSelectElement>("[data-batch-project]")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      if (value) {
        void this.applyBatch((id) => appStore.assignTaskProject(id, value === "none" ? null : value));
      }
    });

    root.querySelector<HTMLButtonElement>('[data-action="batch-done"]')?.addEventListener("click", () => {
      void this.applyBatch((id) => appStore.updateTaskStatus(id, "done"));
    });

    root.querySelector<HTMLButtonElement>('[data-action="batch-delete"]')?.addEventListener("click", () => {
      const count = this.selectedIds.size;
      if (!count) {
        return;
      }
      const confirmed = confirmDestructive(
        `Удалить выбранные задачи (${count})?\n\nВместе с ними удалятся их сессии и история; ссылки в чек-листе и календаре будут сняты.`,
      );
      if (!confirmed) {
        return;
      }
      void this.applyBatch((id) => appStore.deleteTask(id));
    });

    root.querySelectorAll<HTMLButtonElement>("[data-move-task]").forEach((button) => {
      button.addEventListener("click", () => {
        const taskId = button.dataset.moveTask;
        const dir = Number(button.dataset.moveDir);
        const task = appStore.getWorkspace().tasks.find((item) => item.id === taskId);
        if (!taskId || !task || !dir) {
          return;
        }
        const next = STATUS_ORDER[STATUS_ORDER.indexOf(task.status) + dir];
        if (next) {
          void appStore.updateTaskStatus(taskId, next);
        }
      });
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
      // Drop на карточку — встать перед ней (ручной порядок в колонке).
      card.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.stopPropagation();
        card.classList.add("is-drop-before");
      });
      card.addEventListener("dragleave", () => card.classList.remove("is-drop-before"));
      card.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        card.classList.remove("is-drop-before");
        const beforeId = card.dataset.dragTask;
        const status = card.closest<HTMLElement>("[data-drop-status]")?.dataset.dropStatus as TaskStatus | undefined;
        const taskId = this.draggingTaskId;
        this.draggingTaskId = null;
        if (status && taskId && beforeId && taskId !== beforeId) {
          void appStore.reorderTask(taskId, status, beforeId);
        }
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
          // Drop мимо карточек — в конец колонки.
          void appStore.reorderTask(taskId, status, null);
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
    const draft = this.taskDraft;

    return modalHtml({
      label: "Новая задача",
      body: `
        <form class="form-grid" data-form="task">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <p class="eyebrow">Задачи</p>
              <h2>Новая задача</h2>
            </div>
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-create" } })}>Закрыть</button>
          </div>
          ${fieldHtml({
            label: "Название",
            control: `<input name="title" required value="${escapeHtml(draft?.title ?? "")}" placeholder="Например: написать конспект по архитектуре" />`,
          })}
          ${fieldHtml({
            label: "Описание",
            control: `<textarea name="description" placeholder="Контекст, критерии готовности, ссылки">${escapeHtml(draft?.description ?? "")}</textarea>`,
          })}
          <div class="inline-grid">
            <div class="form-grid" style="gap: var(--space-2);">
              ${fieldHtml({
                label: "Проект",
                control: `<select name="projectId">${renderProjectOptions(workspace.projects, draft?.projectId || null)}</select>`,
              })}
              ${quickCreateHtml("project")}
            </div>
            ${fieldHtml({
              label: "Приоритет",
              control: `<select name="priority">
                ${(["medium", "high", "low"] as const)
                  .map(
                    (priority) =>
                      `<option value="${priority}" ${(draft?.priority ?? "medium") === priority ? "selected" : ""}>${TASK_PRIORITY_LABELS[priority]}</option>`,
                  )
                  .join("")}
              </select>`,
            })}
          </div>
          ${fieldHtml({
            label: "Дедлайн",
            control: `<input name="dueDate" type="date" value="${escapeHtml(draft?.dueDate ?? "")}" />`,
          })}
          ${fieldHtml({
            label: "Повтор (от дедлайна)",
            control: `<select name="recurrence">
              ${(Object.keys(RECURRENCE_PRESET_LABELS) as RecurrencePreset[])
                .map(
                  (preset) =>
                    `<option value="${preset}" ${draft?.recurrence === preset ? "selected" : ""}>${RECURRENCE_PRESET_LABELS[preset]}</option>`,
                )
                .join("")}
            </select>`,
          })}
          <fieldset class="tag-fieldset">
            <legend>Теги</legend>
            ${workspace.tags
              .map(
                (tag) => `
                  <label class="check-row">
                    <input type="checkbox" name="tagIds" value="${escapeHtml(tag.id)}" ${draft?.tagIds.includes(tag.id) ? "checked" : ""} />
                    <span style="--tag-color: ${escapeHtml(tag.color)}">${escapeHtml(tag.name)}</span>
                  </label>
                `,
              )
              .join("")}
            ${quickCreateHtml("tag")}
          </fieldset>
          <button ${buttonAttrs({ type: "submit" })}>Создать задачу</button>
        </form>
      `,
    });
  }

  private renderToolbar(workspace: ReturnType<typeof appStore.getWorkspace>, shownCount: number): string {
    const { filter } = this;
    const priorities: TaskPriority[] = ["high", "medium", "low"];

    return `
      <div class="task-toolbar" role="group" aria-label="Добавление и фильтры задач">
        <div class="capture-block">
          <form class="quick-capture" data-quick-capture>
            <input
              name="capture"
              type="text"
              autocomplete="off"
              placeholder="Быстрый ввод: Купить молоко завтра #дом !высокий"
              aria-label="Быстрое добавление задачи"
            />
            <button ${buttonAttrs({ type: "submit", size: "small" })}>Добавить</button>
          </form>
          <details class="quick-syntax">
            <summary>Синтаксис быстрого ввода</summary>
            <p class="muted">
              <code>!высокий</code> / <code>!средний</code> / <code>!низкий</code> — приоритет ·
              <code>#проект</code> · <code>@тег</code> ·
              даты: <code>сегодня</code>, <code>завтра</code>, <code>пт</code>, <code>через 3 дня</code>, <code>15.07</code>
            </p>
          </details>
        </div>
        <div class="task-filter" role="group" aria-label="Фильтры задач">
          <div class="filter-row">
            <div class="segmented" role="group" aria-label="Умные списки">
              <button type="button" data-smart="" aria-pressed="${filter.smartList === null}">Все</button>
              ${(Object.keys(TASK_SMART_LIST_LABELS) as TaskSmartList[])
                .map(
                  (list) =>
                    `<button type="button" data-smart="${list}" aria-pressed="${filter.smartList === list}">${TASK_SMART_LIST_LABELS[list]}</button>`,
                )
                .join("")}
            </div>
            <input
              data-filter-search
              type="search"
              class="task-filter-search"
              placeholder="Поиск по задачам…"
              aria-label="Поиск по задачам"
              value="${escapeHtml(filter.search)}"
            />
          </div>
          <div class="filter-selects">
            <select data-filter-project aria-label="Проект">
              <option value="" ${filter.projectId === null ? "selected" : ""}>Все проекты</option>
              <option value="none" ${filter.projectId === "none" ? "selected" : ""}>Без проекта</option>
              ${workspace.projects
                .map(
                  (project) =>
                    `<option value="${escapeHtml(project.id)}" ${filter.projectId === project.id ? "selected" : ""}>${escapeHtml(project.name)}</option>`,
                )
                .join("")}
            </select>
            <select data-filter-tag aria-label="Тег">
              <option value="" ${filter.tagId === null ? "selected" : ""}>Все теги</option>
              ${workspace.tags
                .map(
                  (tag) => `<option value="${escapeHtml(tag.id)}" ${filter.tagId === tag.id ? "selected" : ""}>${escapeHtml(tag.name)}</option>`,
                )
                .join("")}
            </select>
            <select data-filter-priority aria-label="Приоритет">
              <option value="" ${filter.priority === null ? "selected" : ""}>Любой приоритет</option>
              ${priorities
                .map(
                  (priority) =>
                    `<option value="${priority}" ${filter.priority === priority ? "selected" : ""}>${TASK_PRIORITY_LABELS[priority]}</option>`,
                )
                .join("")}
            </select>
            ${
              this.mode === "list"
                ? `<select data-filter-status aria-label="Статус">
                    <option value="" ${filter.status === null ? "selected" : ""}>Любой статус</option>
                    ${STATUS_ORDER.map(
                      (status) =>
                        `<option value="${status}" ${filter.status === status ? "selected" : ""}>${TASK_STATUS_LABELS[status]}</option>`,
                    ).join("")}
                  </select>`
                : ""
            }
            <select data-filter-sort aria-label="Сортировка">
              ${(Object.keys(TASK_SORT_LABELS) as TaskSort[])
                .map((sort) => `<option value="${sort}" ${filter.sort === sort ? "selected" : ""}>${TASK_SORT_LABELS[sort]}</option>`)
                .join("")}
            </select>
          </div>
          ${
            isTaskFilterActive(filter)
              ? `<div class="filter-meta">
                  <span class="task-filter-count">Показано: ${shownCount} из ${workspace.tasks.length}</span>
                  <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "reset-filter" } })}>Сбросить</button>
                </div>`
              : ""
          }
        </div>
      </div>
    `;
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
            <a class="button ghost small" href="#/work/tasks/${escapeHtml(task.id)}">Открыть страницу</a>
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
    // Черновик переживает re-render после quick-create проекта/тега.
    const draft = this.taskDraft ?? {
      title: task.title,
      description: task.description,
      projectId: task.projectId ?? "",
      priority: task.priority,
      dueDate: task.dueDate ?? "",
      recurrence: ruleToPreset(task.recurrence),
      tagIds: task.tagIds,
    };

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
          control: `<input name="title" required value="${escapeHtml(draft.title)}" />`,
        })}
        ${fieldHtml({
          label: "Описание",
          control: `<textarea name="description" placeholder="Контекст, критерии готовности, ссылки">${escapeHtml(draft.description)}</textarea>`,
        })}
        <div class="inline-grid">
          <div class="form-grid" style="gap: var(--space-2);">
            ${fieldHtml({
              label: "Проект",
              control: `<select name="projectId">${renderProjectOptions(workspace.projects, draft.projectId || null)}</select>`,
            })}
            ${quickCreateHtml("project")}
          </div>
          ${fieldHtml({
            label: "Приоритет",
            control: `<select name="priority">
              ${priorities
                .map(
                  (priority) =>
                    `<option value="${priority.value}" ${draft.priority === priority.value ? "selected" : ""}>${priority.label}</option>`,
                )
                .join("")}
            </select>`,
          })}
        </div>
        ${fieldHtml({
          label: "Дедлайн",
          control: `<input name="dueDate" type="date" value="${escapeHtml(draft.dueDate)}" />`,
        })}
        ${fieldHtml({
          label: "Повтор (от дедлайна)",
          control: `<select name="recurrence">
            ${(Object.keys(RECURRENCE_PRESET_LABELS) as RecurrencePreset[])
              .map(
                (preset) =>
                  `<option value="${preset}" ${draft.recurrence === preset ? "selected" : ""}>${RECURRENCE_PRESET_LABELS[preset]}</option>`,
              )
              .join("")}
          </select>`,
        })}
        <fieldset class="tag-fieldset">
          <legend>Теги</legend>
          ${workspace.tags
            .map(
              (tag) => `
                <label class="check-row">
                  <input
                    type="checkbox"
                    name="tagIds"
                    value="${escapeHtml(tag.id)}"
                    ${draft.tagIds.includes(tag.id) ? "checked" : ""}
                  />
                  <span style="--tag-color: ${escapeHtml(tag.color)}">${escapeHtml(tag.name)}</span>
                </label>
              `,
            )
            .join("")}
          ${quickCreateHtml("tag")}
        </fieldset>
      </form>
    `;
  }

  private toggleSelected(taskId: string): void {
    if (this.selectedIds.has(taskId)) {
      this.selectedIds.delete(taskId);
    } else {
      this.selectedIds.add(taskId);
    }
    this.render();
  }

  private async applyBatch(operation: (taskId: string) => Promise<void>): Promise<void> {
    const ids = [...this.selectedIds];
    for (const id of ids) {
      await operation(id);
    }
    this.selectedIds.clear();
    this.render();
  }

  private renderBatchBar(workspace: ReturnType<typeof appStore.getWorkspace>): string {
    const count = this.selectedIds.size;
    return `
      <div class="batch-bar" role="group" aria-label="Действия с выбранными">
        <span class="batch-count">Выбрано: ${count}</span>
        <select data-batch-status aria-label="Статус для выбранных" ${count ? "" : "disabled"}>
          <option value="">Статус…</option>
          ${STATUS_ORDER.map((status) => `<option value="${status}">${TASK_STATUS_LABELS[status]}</option>`).join("")}
        </select>
        <select data-batch-project aria-label="Проект для выбранных" ${count ? "" : "disabled"}>
          <option value="">Проект…</option>
          <option value="none">Без проекта</option>
          ${workspace.projects
            .map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`)
            .join("")}
        </select>
        <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "batch-done" }, disabled: !count })}>Завершить</button>
        <button ${buttonAttrs({ tone: "danger", size: "small", data: { action: "batch-delete" }, disabled: !count })}>Удалить</button>
      </div>
    `;
  }

  private renderKanban(tasks: Task[], totalMinutesByTask: Map<string, number>): string {
    // Дефолтная сортировка «Сначала новые» уступает ручному порядку доски;
    // явно выбранная сортировка применяется и к канбану.
    const columnTasks = (status: TaskStatus): Task[] => {
      const column = tasks.filter((task) => task.status === status);
      return this.filter.sort === "created" ? [...column].sort((a, b) => a.boardOrder - b.boardOrder) : column;
    };

    return `
      <section class="kanban" aria-label="Канбан задач">
        ${STATUS_ORDER.map((status) => {
          const column = columnTasks(status);
          return `
            <div class="kanban-column" data-drop-status="${status}" role="group" aria-label="${TASK_STATUS_LABELS[status]}">
              <div class="card-header">
                <h3>${TASK_STATUS_LABELS[status]}</h3>
                ${badgeHtml(column.length)}
              </div>
              ${
                column.length
                  ? column.map((task) => this.renderTaskCard(task, totalMinutesByTask, "kanban")).join("")
                  : emptyStateHtml("Нет задач")
              }
            </div>
          `;
        }).join("")}
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
    const statusIndex = STATUS_ORDER.indexOf(task.status);
    // Touch fallback for drag-and-drop: arrows walk the card across kanban columns.
    const moveControls =
      variant === "kanban"
        ? `
          <div class="move-controls">
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { moveTask: task.id, moveDir: "-1" }, disabled: statusIndex <= 0 })} aria-label="В колонку левее">‹</button>
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { moveTask: task.id, moveDir: "1" }, disabled: statusIndex >= STATUS_ORDER.length - 1 })} aria-label="В колонку правее">›</button>
          </div>
        `
        : "";

    return `
      <article class="list-item task-card ${this.selectedIds.has(task.id) ? "is-selected" : ""}" data-open-task="${escapeHtml(task.id)}" ${dragAttrs} tabindex="0">
        <div class="card-header">
          ${
            this.selectMode
              ? `<input type="checkbox" class="select-box" data-select-task="${escapeHtml(task.id)}" ${this.selectedIds.has(task.id) ? "checked" : ""} aria-label="Выбрать задачу" />`
              : ""
          }
          <div>
            <h3>${escapeHtml(task.title)}</h3>
            <div class="meta-row">
              ${badgeHtml(TASK_PRIORITY_LABELS[task.priority])}
              <span>${escapeHtml(getProjectName(workspace.projects, task.projectId))}</span>
              ${task.dueDate ? `<span>дедлайн: ${formatDate(task.dueDate)}</span>` : ""}
              ${(totalMinutesByTask.get(task.id) ?? 0) > 0 ? `<span>время: ${formatDuration(totalMinutesByTask.get(task.id) ?? 0)}</span>` : ""}
            </div>
          </div>
          ${moveControls}
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
        ${task.tagIds.length ? `<div class="meta-row">${renderTagPills(workspace.tags, task.tagIds)}</div>` : ""}
        ${
          variant === "list"
            ? `
              ${fieldHtml({
                label: "Статус",
                control: `<select data-status data-task-id="${escapeHtml(task.id)}">
                  ${STATUS_ORDER.map(
                    (status) =>
                      `<option value="${status}" ${task.status === status ? "selected" : ""}>${TASK_STATUS_LABELS[status]}</option>`,
                  ).join("")}
                </select>`,
              })}
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
              ${recentHistory
                .map(
                  (entry) => `
                    <div class="history-entry">
                      <div class="meta-row"><strong>${escapeHtml(entry.kind)}</strong><span>${formatDate(entry.at)}</span></div>
                      <div class="markdown-preview">${renderMarkdown(entry.markdown)}</div>
                    </div>
                  `,
                )
                .join("")}
            `
            : ""
        }
      </article>
    `;
  }
}

customElements.define("pn-tasks-view", TasksView);
