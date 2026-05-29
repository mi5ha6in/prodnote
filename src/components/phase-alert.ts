import { escapeHtml } from "../domain/markdown";
import {
  dismissPhaseAlert,
  getPhaseAlertState,
  isPhaseAlertDismissed,
  shouldNotifyPhaseAlert,
  type PhaseAlertState,
} from "../domain/timer-alerts";
import { showTimerNotification } from "../platform/notifications";
import { appStore } from "../state";
import { buttonAttrs } from "../ui/html";
import { renderShadow } from "./shadow";

export class PhaseAlert extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private intervalId: number | null = null;
  private renderedAlertKey: string | null = null;
  private alertRendered = false;

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
    const alert = getPhaseAlertState(appStore.getActiveTimer());

    if (!alert || isPhaseAlertDismissed(alert.key)) {
      this.clearAlert();
      return;
    }

    this.notifyOnce(alert);

    if (this.renderedAlertKey === alert.key) {
      return;
    }

    this.renderedAlertKey = alert.key;
    this.alertRendered = true;

    const root = renderShadow(
      this,
      `
        <aside class="phase-alert" role="alert" aria-live="assertive">
          <div class="signal-dot" aria-hidden="true"></div>
          <div>
            <p class="eyebrow">Таймер</p>
            <h2>${escapeHtml(alert.title)}</h2>
            <p class="muted">${escapeHtml(alert.message)}</p>
          </div>
          <div class="row-actions">
            <a class="button ghost small" href="#/focus">Открыть фокус</a>
            <button ${buttonAttrs({ size: "small", data: { action: "continue-phase" } })}>${escapeHtml(alert.actionLabel)}</button>
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "dismiss-alert" } })}>Скрыть</button>
          </div>
        </aside>
      `,
      `
        :host {
          bottom: 1rem;
          display: block;
          left: 50%;
          max-width: min(42rem, calc(100vw - 2rem));
          position: fixed;
          transform: translateX(-50%);
          width: 100%;
          z-index: 100;
        }

        .phase-alert {
          align-items: center;
          animation: slide-in 220ms ease-out;
          background:
            linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(255, 250, 240, 0.98)),
            var(--paper);
          border: 1px solid var(--line);
          border-radius: 1.4rem;
          box-shadow: 0 24px 80px rgba(20, 33, 61, 0.24);
          display: grid;
          gap: 1rem;
          grid-template-columns: auto minmax(0, 1fr) auto;
          padding: 1rem;
        }

        .phase-alert h2 {
          font-size: clamp(1.25rem, 3vw, 1.8rem);
        }

        .signal-dot {
          animation: pulse 900ms ease-in-out infinite;
          background: var(--gold);
          border-radius: 999px;
          box-shadow: 0 0 0 0 rgba(225, 159, 68, 0.42);
          height: 1.2rem;
          width: 1.2rem;
        }

        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateY(0.5rem);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(225, 159, 68, 0.42);
          }
          50% {
            box-shadow: 0 0 0 0.75rem rgba(225, 159, 68, 0);
          }
        }

        @media (max-width: 680px) {
          :host {
            bottom: 5.75rem;
          }

          .phase-alert {
            align-items: start;
            grid-template-columns: auto minmax(0, 1fr);
          }

          .row-actions {
            grid-column: 1 / -1;
          }
        }
      `,
    );

    root.querySelector<HTMLButtonElement>('[data-action="continue-phase"]')?.addEventListener("click", () => {
      void appStore.completePomodoroPhase();
    });

    root.querySelector<HTMLButtonElement>('[data-action="dismiss-alert"]')?.addEventListener("click", () => {
      dismissPhaseAlert(alert.key);
      this.clearAlert();
    });
  }

  private notifyOnce(alert: PhaseAlertState): void {
    if (!shouldNotifyPhaseAlert(alert.key)) {
      return;
    }

    playPhaseEndSound();
    void showTimerNotification({
      title: `ProdNote: ${alert.title}`,
      body: alert.message,
    });
  }

  private clearAlert(): void {
    if (!this.alertRendered) {
      return;
    }

    this.renderedAlertKey = null;
    this.alertRendered = false;
    renderShadow(this, "");
  }
}

function playPhaseEndSound(): void {
  const AudioContextClass =
    window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  try {
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
    gain.connect(context.destination);

    for (const [index, frequency] of [660, 880].entries()) {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + index * 0.18);
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.18);
      oscillator.stop(context.currentTime + index * 0.18 + 0.16);
    }

    window.setTimeout(() => void context.close(), 800);
  } catch {
    // Browsers can block audio without prior user activation; the visual alert still appears.
  }
}

customElements.define("pn-phase-alert", PhaseAlert);
