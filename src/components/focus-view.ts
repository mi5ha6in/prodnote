import { getActiveTimerElapsedMinutes, getActiveTimerRemainingSeconds, isActiveTimerPaused } from "../domain/active-timer";
import { escapeHtml, renderMarkdown } from "../domain/markdown";
import { formatDuration } from "../domain/stats";
import type { ActiveTimer, Workspace } from "../domain/types";
import { requestTimerNotificationPermission } from "../platform/notifications";
import { appStore } from "../state";
import { renderShadow } from "./shadow";
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
        <section class="focus-stage">
          <div class="focus-panel">
            <p class="eyebrow">${active ? getFocusEyebrow(active) : "Готов к работе"}</p>
            <h2>${contextTask ? escapeHtml(contextTask.title) : "Выберите задачу и запустите сессию"}</h2>
            <div class="focus-readout" data-focus-readout>${active ? getFocusReadout(active) : "00:00"}</div>
            ${
              contextTask
                ? `<p class="muted">${escapeHtml(getProjectName(workspace.projects, contextTask.projectId))}</p>`
                : `<p class="muted">Сессии записываются в историю выбранной задачи.</p>`
            }
          </div>
        </section>

        ${
          active
            ? `
              <article class="card form-grid">
                <div>
                  <p class="eyebrow">Активная сессия</p>
                  <h2>${active.mode === "pomodoro" ? "Помодоро" : "Таймер"}</h2>
                </div>
                <label>
                  Заметка к сессии
                  <textarea name="sessionNote" data-session-note placeholder="Что сделано за эту сессию">${escapeHtml(this.sessionNote)}</textarea>
                </label>
                <div class="row-actions">
                  <button type="button" class="ghost" data-action="toggle-pause">${active.pausedAt ? "Продолжить" : "Пауза"}</button>
                  ${
                    active.mode === "pomodoro"
                      ? `<button type="button" class="secondary" data-action="complete-phase" ${active.pausedAt ? "disabled" : ""}>Завершить фазу</button>`
                      : `<button type="button" class="secondary" data-action="stop">Остановить и сохранить</button>`
                  }
                  <button type="button" class="ghost" data-action="cancel">Отменить без записи</button>
                </div>
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
                <div class="row-actions">
                  <button type="submit" name="mode" value="timer" ${canStart ? "" : "disabled"}>Запустить таймер</button>
                  <button type="submit" class="secondary" name="mode" value="pomodoro" ${canStart ? "" : "disabled"}>Помодоро</button>
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

        .history-list {
          margin-top: var(--space-4);
        }
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
      this.selectedTaskId = taskId;
      if (submitter.value === "pomodoro") {
        void requestTimerNotificationPermission();
        void appStore.startPomodoro(taskId);
      } else {
        void requestTimerNotificationPermission();
        void appStore.startTimer(taskId);
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
      this.historyOpen = true;
      this.focusHistoryAfterRender = true;
      void appStore.completePomodoroPhase(this.sessionNote);
      this.sessionNote = "";
    });

    root.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", () => {
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
    readout.textContent = active ? getFocusReadout(active) : "00:00";
  }
}

customElements.define("pn-focus-view", FocusView);

function getFocusReadout(active: ActiveTimer): string {
  const remainingSeconds = getActiveTimerRemainingSeconds(active);

  return remainingSeconds === null
    ? formatDuration(getActiveTimerElapsedMinutes(active))
    : `${Math.floor(remainingSeconds / 60).toString().padStart(2, "0")}:${(remainingSeconds % 60)
        .toString()
        .padStart(2, "0")}`;
}

function getFocusEyebrow(active: ActiveTimer): string {
  if (isActiveTimerPaused(active)) {
    return "На паузе";
  }

  return active.phase === "focus" ? "Фокус" : "Перерыв";
}
