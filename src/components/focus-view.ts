import { escapeHtml, renderMarkdown } from "../domain/markdown";
import { formatDuration } from "../domain/stats";
import { appStore } from "../state";
import { renderShadow } from "./shadow";
import { getProjectName, renderTaskOptions, requireSelect, requireTextArea } from "./view-utils";

export class FocusView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private intervalId: number | null = null;
  private sessionNote = "";
  private historyText = "";

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.intervalId = window.setInterval(() => this.render(), 1000);
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
    const activeTask = active ? workspace.tasks.find((task) => task.id === active.taskId) : null;
    const focusableTasks = workspace.tasks.filter((task) => task.status !== "done");
    const canStart = focusableTasks.length > 0;
    const elapsedSeconds = active ? Math.max(0, Math.floor((Date.now() - Date.parse(active.startedAt)) / 1000)) : 0;
    const remainingSeconds =
      active?.phaseEndsAt === null || !active?.phaseEndsAt
        ? null
        : Math.max(0, Math.floor((Date.parse(active.phaseEndsAt) - Date.now()) / 1000));
    const readout =
      remainingSeconds === null
        ? formatDuration(Math.floor(elapsedSeconds / 60))
        : `${Math.floor(remainingSeconds / 60).toString().padStart(2, "0")}:${(remainingSeconds % 60)
            .toString()
            .padStart(2, "0")}`;

    const root = renderShadow(
      this,
      `
        <section class="focus-stage ${active ? "running" : ""}">
          <div class="focus-orb" aria-hidden="true"></div>
          <div class="focus-panel">
            <p class="eyebrow">${active ? (active.phase === "focus" ? "Фокус" : "Перерыв") : "Готов к работе"}</p>
            <h2>${activeTask ? escapeHtml(activeTask.title) : "Выберите задачу и запустите сессию"}</h2>
            <div class="focus-readout">${active ? readout : "00:00"}</div>
            ${
              activeTask
                ? `<p class="muted">${escapeHtml(getProjectName(workspace.projects, activeTask.projectId))}</p>`
                : `<p class="muted">Сессии записываются в историю выбранной задачи.</p>`
            }
          </div>
        </section>

        <section class="split-grid focus-controls">
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
                    ${
                      active.mode === "pomodoro"
                        ? `<button type="button" class="secondary" data-action="complete-phase">Завершить фазу</button>`
                        : `<button type="button" class="secondary" data-action="stop">Остановить таймер</button>`
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
                      ${renderTaskOptions(focusableTasks)}
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

          <form class="card form-grid" data-form="history">
            <div>
              <p class="eyebrow">История задачи</p>
              <h2>Конспект работы</h2>
            </div>
            <label>
              Задача
              <select name="taskId" required ${workspace.tasks.length ? "" : "disabled"}>
                ${renderTaskOptions(workspace.tasks, active?.taskId ?? null)}
              </select>
            </label>
            <label>
              Запись
              <textarea name="history" placeholder="Что сделал, какие выводы появились, что проверить дальше">${escapeHtml(this.historyText)}</textarea>
            </label>
            <button type="submit" class="ghost" ${workspace.tasks.length ? "" : "disabled"}>Добавить в историю</button>
          </form>
        </section>

        ${
          activeTask
            ? `
              <article class="card">
                <div class="card-header">
                  <div>
                    <p class="eyebrow">Контекст</p>
                    <h2>${escapeHtml(activeTask.title)}</h2>
                  </div>
                </div>
                ${activeTask.description ? `<div class="markdown-preview">${renderMarkdown(activeTask.description)}</div>` : `<p class="muted">У задачи пока нет описания.</p>`}
                <div class="item-list history-list">
                  ${
                    activeTask.history.length
                      ? activeTask.history
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
          background:
            radial-gradient(circle at 50% 42%, rgba(42, 157, 143, 0.24), transparent 18rem),
            linear-gradient(135deg, rgba(20, 33, 61, 0.98), rgba(20, 33, 61, 0.84));
          border-radius: 2rem;
          color: white;
          display: grid;
          justify-items: center;
          min-height: 22rem;
          overflow: hidden;
          padding: 2rem;
          position: relative;
          text-align: center;
        }

        .focus-stage .muted,
        .focus-stage .eyebrow {
          color: rgba(255, 255, 255, 0.72);
        }

        .focus-stage.running .focus-orb {
          animation: breathe 4s ease-in-out infinite;
        }

        .focus-orb {
          background:
            radial-gradient(circle, rgba(225, 159, 68, 0.88) 0 18%, rgba(42, 157, 143, 0.34) 19% 52%, transparent 53%),
            radial-gradient(circle, rgba(255, 255, 255, 0.18), transparent 55%);
          border-radius: 999px;
          height: min(54vw, 22rem);
          opacity: 0.9;
          position: absolute;
          width: min(54vw, 22rem);
        }

        .focus-panel {
          display: grid;
          gap: 0.75rem;
          justify-items: center;
          position: relative;
          z-index: 1;
        }

        .focus-panel h2 {
          font-size: clamp(2rem, 5vw, 4.5rem);
          line-height: 0.95;
          max-width: 13ch;
        }

        .focus-readout {
          font-size: clamp(3rem, 12vw, 8rem);
          font-weight: 950;
          letter-spacing: -0.08em;
          line-height: 0.9;
        }

        .focus-controls {
          margin-top: 1rem;
        }

        .history-list {
          margin-top: 1rem;
        }

        @keyframes breathe {
          0%,
          100% {
            transform: scale(0.92);
          }
          50% {
            transform: scale(1.08);
          }
        }
      `,
    );

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
      if (submitter.value === "pomodoro") {
        void appStore.startPomodoro(taskId);
      } else {
        void appStore.startTimer(taskId);
      }
    });

    root.querySelector<HTMLButtonElement>('[data-action="stop"]')?.addEventListener("click", () => {
      void appStore.stopTimer(this.sessionNote);
      this.sessionNote = "";
    });

    root.querySelector<HTMLButtonElement>('[data-action="complete-phase"]')?.addEventListener("click", () => {
      void appStore.completePomodoroPhase(this.sessionNote);
      this.sessionNote = "";
    });

    root.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", () => {
      appStore.cancelActiveTimer();
      this.sessionNote = "";
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
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      void appStore.addTaskHistory(requireSelect(form, "taskId").value, requireTextArea(form, "history").value, "progress");
      this.historyText = "";
      form.reset();
    });
  }
}

customElements.define("pn-focus-view", FocusView);
