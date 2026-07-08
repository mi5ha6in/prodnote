import { getActiveTimerClockReadout, getActiveTimerPhaseLabel } from "../domain/active-timer";
import { escapeHtml, renderMarkdown } from "../domain/markdown";
import type { ActiveTimer, Workspace } from "../domain/types";
import { requestTimerNotificationPermission } from "../platform/notifications";
import { appStore } from "../state";
import { confirmDestructive } from "../ui/actions";
import { takePendingFocusTaskId } from "./focus-intent";
import { renderShadow } from "./shadow";
import { ICONS } from "../ui/icons";
import { renderTimerControls, timerControlStyles } from "./timer-controls";
import { getProjectName, renderTaskOptions, requireSelect, requireTextArea } from "./view-utils";

export class FocusView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private intervalId: number | null = null;
  private sessionNote = "";
  private historyText = "";
  private historyOpen = false;
  private selectedTaskId: string | null = null;
  private focusHistoryAfterRender = false;

  connectedCallback(): void {
    const pendingTaskId = takePendingFocusTaskId();
    if (pendingTaskId) {
      this.selectedTaskId = pendingTaskId;
    }
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.intervalId = window.setInterval(() => this.syncReadout(), 1000);
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
    }
  }

  private render(): void {
    const workspace = appStore.getWorkspace();
    const active = appStore.getActiveTimer();
    const contextTaskId = this.resolveContextTaskId(workspace, active);
    const contextTask = contextTaskId ? workspace.tasks.find((task) => task.id === contextTaskId) ?? null : null;
    const focusableTasks = workspace.tasks.filter((task) => task.status !== "done");
    const canStart = focusableTasks.length > 0;
    const startTaskId = this.resolveStartTaskId(focusableTasks);

    const root = renderShadow(
      this,
      `
        <div class="view-grid">
        <section class="focus-stage">
          <div class="focus-panel">
            <p class="eyebrow">${active ? getActiveTimerPhaseLabel(active) : "Готов к работе"}</p>
            <h2>${contextTask ? escapeHtml(contextTask.title) : "Выберите задачу и запустите сессию"}</h2>
            <div class="focus-readout" data-focus-readout>${active ? getActiveTimerClockReadout(active) : "00:00"}</div>
            ${
              contextTask
                ? `<p class="muted">${escapeHtml(getProjectName(workspace.projects, contextTask.projectId))}</p>`
                : `<p class="muted">Сессии записываются в историю выбранной задачи.</p>`
            }
            ${active ? renderTimerControls(active) : ""}
          </div>
        </section>

        ${
          active
            ? `
              <article class="card form-grid">
                <div>
                  <p class="eyebrow">Активная сессия · ${active.mode === "pomodoro" ? "Помодоро" : "Таймер"}</p>
                  ${active.goal ? `<p class="session-goal">Цель: ${escapeHtml(active.goal)}</p>` : ""}
                </div>
                <label>
                  Заметка к сессии
                  <textarea name="sessionNote" data-session-note placeholder="Что сделано за эту сессию">${escapeHtml(this.sessionNote)}</textarea>
                </label>
                <p class="muted">${getSessionNoteHint(active)}</p>
              </article>
            `
            : `
              <form class="card form-grid" data-form="start">
                <div>
                  <p class="eyebrow">Старт</p>
                  <h2>Новая сессия</h2>
                </div>
                <label>
                  Задача
                  <select name="taskId" required ${canStart ? "" : "disabled"}>
                    ${renderTaskOptions(focusableTasks, startTaskId)}
                  </select>
                </label>
                <label>
                  Цель сессии (необязательно)
                  <input name="goal" placeholder="Что хочу сделать за эту сессию" autocomplete="off" ${canStart ? "" : "disabled"} />
                </label>
                <div class="row-actions">
                  <button type="submit" name="mode" value="timer" ${canStart ? "" : "disabled"}>${ICONS.play}Таймер</button>
                  <button type="submit" class="secondary" name="mode" value="pomodoro" ${canStart ? "" : "disabled"}>${ICONS.cycle}Помодоро</button>
                </div>
                ${canStart ? "" : `<p class="muted">Сначала создайте незавершённую задачу.</p>`}
              </form>
            `
        }

        ${
          contextTask
            ? `
              <article class="card">
                <div class="card-header">
                  <div>
                    <p class="eyebrow">Контекст</p>
                    <h2>${escapeHtml(contextTask.title)}</h2>
                  </div>
                  <button type="button" class="ghost small" data-action="toggle-history">${this.historyOpen ? "Отмена" : "+ Запись"}</button>
                </div>
                ${contextTask.description ? `<div class="markdown-preview">${renderMarkdown(contextTask.description)}</div>` : `<p class="muted">У задачи пока нет описания.</p>`}
                ${
                  this.historyOpen
                    ? `
                      <form class="form-grid history-form" data-form="history">
                        <label>
                          Запись в историю задачи
                          <textarea name="history" placeholder="Что сделал, какие выводы появились, что проверить дальше">${escapeHtml(this.historyText)}</textarea>
                        </label>
                        <div class="row-actions">
                          <button type="submit" class="ghost">Добавить в историю</button>
                        </div>
                      </form>
                    `
                    : ""
                }
                <div class="item-list history-list">
                  ${
                    contextTask.history.length
                      ? contextTask.history
                          .slice(0, 4)
                          .map(
                            (entry) => `
                              <div class="list-item">
                                <div class="meta-row"><span>${escapeHtml(entry.kind)}</span><span>${new Date(entry.at).toLocaleString("ru-RU")}</span></div>
                                <div class="markdown-preview">${renderMarkdown(entry.markdown)}</div>
                              </div>
                            `,
                          )
                          .join("")
                      : `<div class="empty">История задачи появится после первых записей.</div>`
                  }
                </div>
              </article>
            `
            : ""
        }
        </div>
      `,
      `
        .focus-stage {
          align-items: center;
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
          display: grid;
          justify-items: center;
          min-height: 16rem;
          padding: var(--space-6);
          text-align: center;
        }

        .focus-panel {
          display: grid;
          gap: var(--space-3);
          justify-items: center;
        }

        .focus-panel h2 {
          font-size: var(--text-xl);
          line-height: 1.2;
          max-width: 22ch;
        }

        .focus-readout {
          font-size: clamp(3rem, 9vw, 5.5rem);
          font-variant-numeric: tabular-nums;
          font-weight: 650;
          letter-spacing: -0.04em;
          line-height: 1;
        }

        .history-form {
          margin-top: var(--space-2);
        }

        .session-goal {
          background: var(--accent-soft);
          border-radius: var(--radius-md);
          color: var(--accent-strong);
          font-weight: 600;
          padding: var(--space-2) var(--space-3);
        }

        .history-list {
          margin-top: var(--space-4);
        }

        ${timerControlStyles}
      `,
    );

    if (this.focusHistoryAfterRender) {
      this.focusHistoryAfterRender = false;
      root.querySelector<HTMLTextAreaElement>('textarea[name="history"]')?.focus();
    }

    root.querySelector<HTMLTextAreaElement>("[data-session-note]")?.addEventListener("input", (event) => {
      const target = event.currentTarget;
      if (target instanceof HTMLTextAreaElement) {
        this.sessionNote = target.value;
      }
    });

    root.querySelector<HTMLFormElement>('[data-form="start"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submitter = event.submitter;
      if (!(form instanceof HTMLFormElement) || !(submitter instanceof HTMLButtonElement)) {
        return;
      }

      const taskId = requireSelect(form, "taskId").value;
      const goalField = form.elements.namedItem("goal");
      const goal = goalField instanceof HTMLInputElement ? goalField.value : null;
      this.selectedTaskId = taskId;
      if (submitter.value === "pomodoro") {
        void requestTimerNotificationPermission();
        void appStore.startPomodoro(taskId, goal);
      } else {
        void requestTimerNotificationPermission();
        void appStore.startTimer(taskId, goal);
      }
    });

    root.querySelector<HTMLButtonElement>('[data-action="stop"]')?.addEventListener("click", () => {
      const current = appStore.getActiveTimer();
      this.selectedTaskId = current?.taskId ?? this.selectedTaskId;
      this.historyOpen = true;
      this.focusHistoryAfterRender = true;
      void appStore.stopTimer(this.sessionNote);
      this.sessionNote = "";
    });

    root.querySelector<HTMLButtonElement>('[data-action="toggle-pause"]')?.addEventListener("click", () => {
      if (appStore.getActiveTimer()?.pausedAt) {
        appStore.resumeActiveTimer();
        return;
      }

      appStore.pauseActiveTimer();
    });

    root.querySelector<HTMLButtonElement>('[data-action="complete-phase"]')?.addEventListener("click", () => {
      const current = appStore.getActiveTimer();
      this.selectedTaskId = current?.taskId ?? this.selectedTaskId;
      if (current?.phase !== "focus") {
        // Перерыв не создаёт сессию — заметка ждёт следующего фокуса.
        void appStore.completePomodoroPhase();
        return;
      }

      this.historyOpen = true;
      this.focusHistoryAfterRender = true;
      void appStore.completePomodoroPhase(this.sessionNote);
      this.sessionNote = "";
    });

    root.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", () => {
      if (!confirmDestructive("Отменить сессию без записи?")) {
        return;
      }

      const current = appStore.getActiveTimer();
      this.selectedTaskId = current?.taskId ?? this.selectedTaskId;
      appStore.cancelActiveTimer();
      this.sessionNote = "";
    });

    root.querySelector<HTMLButtonElement>('[data-action="toggle-history"]')?.addEventListener("click", () => {
      this.historyOpen = !this.historyOpen;
      if (!this.historyOpen) {
        this.historyText = "";
      }
      this.render();
    });

    root.querySelector<HTMLTextAreaElement>('textarea[name="history"]')?.addEventListener("input", (event) => {
      const target = event.currentTarget;
      if (target instanceof HTMLTextAreaElement) {
        this.historyText = target.value;
      }
    });

    root.querySelector<HTMLFormElement>('[data-form="history"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement) || !contextTaskId) {
        return;
      }

      void appStore.addTaskHistory(contextTaskId, requireTextArea(form, "history").value, "progress");
      this.historyText = "";
      this.historyOpen = false;
      form.reset();
      this.render();
    });
  }

  private resolveContextTaskId(workspace: Workspace, active: ActiveTimer | null): string | null {
    if (active?.taskId) {
      this.selectedTaskId = active.taskId;
      return active.taskId;
    }

    if (this.selectedTaskId && workspace.tasks.some((task) => task.id === this.selectedTaskId)) {
      return this.selectedTaskId;
    }

    this.selectedTaskId = workspace.tasks[0]?.id ?? null;
    return this.selectedTaskId;
  }

  private resolveStartTaskId(tasks: Array<{ id: string }>): string | null {
    if (this.selectedTaskId && tasks.some((task) => task.id === this.selectedTaskId)) {
      return this.selectedTaskId;
    }

    return tasks[0]?.id ?? null;
  }

  private syncReadout(): void {
    const root = this.shadowRoot;
    if (!root) {
      return;
    }

    const readout = root.querySelector<HTMLElement>("[data-focus-readout]");
    if (!readout) {
      return;
    }

    const active = appStore.getActiveTimer();
    readout.textContent = active ? getActiveTimerClockReadout(active) : "00:00";
  }
}

function getSessionNoteHint(active: ActiveTimer): string {
  if (active.mode !== "pomodoro") {
    return "Заметка сохранится при нажатии «Стоп».";
  }

  return active.phase === "focus"
    ? "Заметка сохранится при «Стоп» или переходе к перерыву."
    : "Перерыв не записывается — заметка дождётся следующего фокуса.";
}

customElements.define("pn-focus-view", FocusView);
