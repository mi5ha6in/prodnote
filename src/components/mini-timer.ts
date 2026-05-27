import { SESSION_MODE_LABELS } from "../domain/defaults";
import { formatDuration } from "../domain/stats";
import { appStore } from "../state";
import { escapeHtml } from "../domain/markdown";
import { renderShadow } from "./shadow";

export class MiniTimer extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private intervalId: number | null = null;

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
    const active = appStore.getActiveTimer();
    const workspace = appStore.getWorkspace();

    if (!active) {
      renderShadow(
        this,
        `
        <section class="mini-timer idle">
          <p class="eyebrow">Таймер</p>
          <strong>Нет активной сессии</strong>
          <a href="#/focus">Запустить работу</a>
        </section>
      `,
        timerStyles,
      );
      return;
    }

    const task = workspace.tasks.find((item) => item.id === active.taskId);
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - Date.parse(active.startedAt)) / 60000));
    const remainingSeconds = active.phaseEndsAt
      ? Math.max(0, Math.floor((Date.parse(active.phaseEndsAt) - Date.now()) / 1000))
      : null;
    const remainingLabel =
      remainingSeconds === null
        ? formatDuration(elapsedMinutes)
        : `${Math.floor(remainingSeconds / 60).toString().padStart(2, "0")}:${(remainingSeconds % 60)
            .toString()
            .padStart(2, "0")}`;

    const root = renderShadow(
      this,
      `
      <section class="mini-timer active">
        <p class="eyebrow">${SESSION_MODE_LABELS[active.mode]}</p>
        <strong>${escapeHtml(task?.title ?? "Задача удалена")}</strong>
        <span class="timer-readout">${remainingLabel}</span>
        <span class="phase-chip">${active.phase === "focus" ? "Фокус" : "Перерыв"}</span>
        <div class="row-actions">
          ${
            active.mode === "pomodoro"
              ? `<button type="button" class="ghost small" data-action="complete">Следующая фаза</button>`
              : ""
          }
          <button type="button" class="ghost small" data-action="stop">Стоп</button>
        </div>
      </section>
    `,
      timerStyles,
    );

    root.querySelector<HTMLButtonElement>('[data-action="stop"]')?.addEventListener("click", () => {
      void appStore.stopTimer();
    });
    root.querySelector<HTMLButtonElement>('[data-action="complete"]')?.addEventListener("click", () => {
      void appStore.completePomodoroPhase();
    });
  }
}

customElements.define("pn-mini-timer", MiniTimer);

const timerStyles = `
  :host {
    display: block;
    margin-top: auto;
  }

  .mini-timer {
    background: rgba(255, 255, 255, 0.66);
    border: 1px solid var(--line);
    border-radius: 1.35rem;
    display: grid;
    gap: 0.55rem;
    padding: 0.9rem;
  }

  .mini-timer a {
    color: var(--accent-strong);
    font-weight: 850;
    text-decoration: none;
  }

  .timer-readout {
    display: block;
    font-size: 2.25rem;
    font-weight: 950;
    letter-spacing: -0.06em;
    line-height: 1;
  }

  .phase-chip {
    color: var(--muted);
    font-weight: 800;
  }
`;
