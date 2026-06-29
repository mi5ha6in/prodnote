import { getActiveTimerElapsedMinutes, getActiveTimerRemainingSeconds, isActiveTimerPaused } from "../domain/active-timer";
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
    const root = renderShadow(
      this,
      `
      <section class="mini-timer active">
        <p class="eyebrow">${SESSION_MODE_LABELS[active.mode]}</p>
        <strong>${escapeHtml(task?.title ?? "Задача удалена")}</strong>
        <span class="timer-readout" data-mini-readout>${getMiniTimerReadout(active)}</span>
        <span class="phase-chip" data-mini-phase>${getMiniTimerPhaseLabel(active)}</span>
        <div class="row-actions">
          <button type="button" class="ghost small" data-action="toggle-pause">${active.pausedAt ? "Продолжить" : "Пауза"}</button>
          ${
            active.mode === "pomodoro"
              ? `<button type="button" class="ghost small" data-action="complete" ${active.pausedAt ? "disabled" : ""}>Следующая фаза</button>`
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
    root.querySelector<HTMLButtonElement>('[data-action="toggle-pause"]')?.addEventListener("click", () => {
      if (appStore.getActiveTimer()?.pausedAt) {
        appStore.resumeActiveTimer();
        return;
      }

      appStore.pauseActiveTimer();
    });
  }

  private syncReadout(): void {
    const active = appStore.getActiveTimer();
    if (!active) {
      return;
    }

    const readout = this.shadowRoot?.querySelector<HTMLElement>("[data-mini-readout]");
    if (readout) {
      readout.textContent = getMiniTimerReadout(active);
    }

    const phase = this.shadowRoot?.querySelector<HTMLElement>("[data-mini-phase]");
    if (phase) {
      phase.textContent = getMiniTimerPhaseLabel(active);
    }
  }
}

customElements.define("pn-mini-timer", MiniTimer);

function getMiniTimerReadout(active: ReturnType<typeof appStore.getActiveTimer>): string {
  if (!active) {
    return "00:00";
  }

  const elapsedMinutes = getActiveTimerElapsedMinutes(active);
  const remainingSeconds = getActiveTimerRemainingSeconds(active);

  if (remainingSeconds === null) {
    return formatDuration(elapsedMinutes);
  }

  return `${Math.floor(remainingSeconds / 60)
    .toString()
    .padStart(2, "0")}:${(remainingSeconds % 60).toString().padStart(2, "0")}`;
}

function getMiniTimerPhaseLabel(active: NonNullable<ReturnType<typeof appStore.getActiveTimer>>): string {
  if (isActiveTimerPaused(active)) {
    return "На паузе";
  }

  return active.phase === "focus" ? "Фокус" : "Перерыв";
}

const timerStyles = `
  :host {
    display: block;
    margin-top: auto;
  }

  .mini-timer {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
  }

  .mini-timer a {
    color: var(--accent-strong);
    font-weight: 600;
    text-decoration: none;
  }

  .timer-readout {
    display: block;
    font-size: var(--text-xl);
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .phase-chip {
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: 600;
  }
`;
