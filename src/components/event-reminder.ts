import { taskDeadlineItems } from "../domain/calendar";
import { EVENT_KIND_LABELS } from "../domain/defaults";
import {
  getDueAllDayReminders,
  getDueEventReminders,
  shouldNotifyEventReminder,
  type EventReminder,
} from "../domain/event-alerts";
import { escapeHtml } from "../domain/markdown";
import type { CalendarEventKind } from "../domain/types";
import { showTimerNotification } from "../platform/notifications";
import { appStore } from "../state";
import { getAllDayReminderHour, getEventReminderMinutes } from "../storage/reminder-prefs";
import { buttonAttrs } from "../ui/html";
import { renderShadow } from "./shadow";

const AUTO_DISMISS_MS = 15000;

export class EventReminderToast extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private intervalId: number | null = null;
  private dismissId: number | null = null;
  private active: { title: string; body: string } | null = null;

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.tick());
    this.intervalId = window.setInterval(() => this.tick(), 1000);
    this.tick();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
    }
    if (this.dismissId !== null) {
      window.clearTimeout(this.dismissId);
    }
  }

  private tick(): void {
    const workspace = appStore.getWorkspace();
    const now = Date.now();

    const dueTimed = getDueEventReminders(workspace.events, now, getEventReminderMinutes());
    for (const reminder of dueTimed) {
      if (shouldNotifyEventReminder(reminder.key)) {
        this.fire(`Скоро: ${reminder.event.title}`, reminderBody(reminder));
        return;
      }
    }

    const allDayItems = [
      ...workspace.events
        .filter((event) => event.allDay)
        .map((event) => ({ id: event.id, title: event.title, kind: event.kind, startsAt: event.startsAt })),
      ...taskDeadlineItems(workspace.tasks).map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.kind,
        startsAt: item.startsAt,
      })),
    ];
    const dueAllDay = getDueAllDayReminders(allDayItems, now, getAllDayReminderHour());
    for (const reminder of dueAllDay) {
      if (shouldNotifyEventReminder(reminder.key)) {
        const kindLabel = EVENT_KIND_LABELS[reminder.kind as CalendarEventKind] ?? reminder.kind;
        this.fire(reminder.title, `Сегодня · ${kindLabel}`);
        return;
      }
    }
  }

  private fire(title: string, body: string): void {
    this.active = { title, body };
    void showTimerNotification({ title, body, tag: "prodnote-event", url: calendarUrl() });
    this.scheduleDismiss();
    this.render();
  }

  private scheduleDismiss(): void {
    if (this.dismissId !== null) {
      window.clearTimeout(this.dismissId);
    }
    this.dismissId = window.setTimeout(() => {
      this.active = null;
      this.render();
    }, AUTO_DISMISS_MS);
  }

  private render(): void {
    if (!this.active) {
      renderShadow(this, "");
      return;
    }

    const reminder = this.active;
    const root = renderShadow(
      this,
      `
        <aside class="reminder" role="status" aria-live="polite">
          <div class="reminder-dot" aria-hidden="true"></div>
          <div class="reminder-body">
            <p class="eyebrow">Напоминание</p>
            <strong>${escapeHtml(reminder.title)}</strong>
            <p class="muted">${escapeHtml(reminder.body)}</p>
          </div>
          <div class="row-actions">
            <a class="button ghost small" href="#/calendar">Открыть</a>
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "dismiss" } })}>Скрыть</button>
          </div>
        </aside>
      `,
      `
        :host {
          display: block;
          left: 50%;
          max-width: min(34rem, calc(100vw - 2rem));
          position: fixed;
          top: 1rem;
          transform: translateX(-50%);
          width: 100%;
          z-index: 110;
        }

        .reminder {
          align-items: center;
          animation: reminder-in 200ms ease-out;
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-md);
          display: grid;
          gap: var(--space-3);
          grid-template-columns: auto minmax(0, 1fr) auto;
          padding: var(--space-3) var(--space-4);
        }

        .reminder-body {
          display: grid;
          gap: 0.1rem;
          min-width: 0;
        }

        .reminder-dot {
          background: var(--accent);
          border-radius: var(--radius-pill);
          height: 0.7rem;
          width: 0.7rem;
        }

        @keyframes reminder-in {
          from {
            opacity: 0;
            transform: translateY(-0.5rem);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 680px) {
          .reminder {
            grid-template-columns: auto minmax(0, 1fr);
          }

          .row-actions {
            grid-column: 1 / -1;
          }
        }
      `,
    );

    root.querySelector<HTMLButtonElement>('[data-action="dismiss"]')?.addEventListener("click", () => {
      this.active = null;
      if (this.dismissId !== null) {
        window.clearTimeout(this.dismissId);
      }
      this.render();
    });

    root.querySelector<HTMLAnchorElement>("a")?.addEventListener("click", () => {
      this.active = null;
      this.render();
    });
  }
}

customElements.define("pn-event-reminder", EventReminderToast);

function reminderBody(reminder: EventReminder): string {
  const start = new Date(reminder.startsAt);
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(start);
  const minutes = Math.max(0, Math.round((start.getTime() - Date.now()) / 60000));
  const kind = EVENT_KIND_LABELS[reminder.event.kind];
  const lead = minutes === 0 ? "сейчас" : `через ${minutes} мин`;
  return `${kind} в ${time} · ${lead}`;
}

function calendarUrl(): string {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.hash = "/calendar";
  return url.toString();
}
