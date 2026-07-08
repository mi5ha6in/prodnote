import { isActiveTimerPaused } from "../domain/active-timer";
import type { ActiveTimer } from "../domain/types";
import { ICONS } from "../ui/icons";

interface TimerControl {
  action: string;
  icon: string;
  caption: string;
  title: string;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
}

function getTimerControls(active: ActiveTimer): TimerControl[] {
  const paused = isActiveTimerPaused(active);
  const controls: TimerControl[] = [
    {
      action: "toggle-pause",
      icon: paused ? ICONS.play : ICONS.pause,
      caption: paused ? "Продолжить" : "Пауза",
      title: paused ? "Продолжить сессию" : "Поставить на паузу",
      primary: true,
    },
  ];

  if (active.mode === "pomodoro") {
    const isFocus = active.phase === "focus";
    controls.push({
      action: "complete-phase",
      icon: ICONS.skip,
      caption: isFocus ? "Перерыв" : "Фокус",
      title: isFocus ? "Завершить фокус с записью и начать перерыв" : "Завершить перерыв и вернуться к фокусу",
      disabled: paused,
    });
  }

  controls.push(
    {
      action: "stop",
      icon: ICONS.stop,
      caption: "Стоп",
      title: getStopTitle(active),
    },
    {
      action: "cancel",
      icon: ICONS.close,
      caption: "Отмена",
      title: "Отменить без записи",
      danger: true,
    },
  );

  return controls;
}

function getStopTitle(active: ActiveTimer): string {
  if (active.mode !== "pomodoro") {
    return "Остановить и сохранить сессию";
  }

  return active.phase === "focus"
    ? "Остановить цикл: фокус сохранится в историю"
    : "Остановить цикл (перерыв не записывается)";
}

/**
 * Icon buttons for the running timer, shared by the focus screen and the
 * sidebar mini widget. `compact` drops the captions and shrinks the buttons;
 * click handling stays in the host component via the data-action attributes.
 */
export function renderTimerControls(active: ActiveTimer, options: { compact?: boolean } = {}): string {
  const compact = options.compact ?? false;
  const buttons = getTimerControls(active)
    .map((control) => {
      const classes = ["icon"];
      if (control.danger) {
        classes.push("danger");
      } else if (!control.primary || compact) {
        classes.push("ghost");
      }
      if (compact) {
        classes.push("small");
      }

      return `
        <span class="timer-control">
          <button type="button" class="${classes.join(" ")}" data-action="${control.action}" title="${control.title}" aria-label="${control.title}" ${control.disabled ? "disabled" : ""}>${control.icon}</button>
          ${compact ? "" : `<span class="timer-control-caption">${control.caption}</span>`}
        </span>
      `;
    })
    .join("");

  return `<div class="timer-controls${compact ? " compact" : ""}">${buttons}</div>`;
}

export const timerControlStyles = `
  .timer-controls {
    align-items: start;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    justify-content: center;
  }

  .timer-controls.compact {
    gap: var(--space-2);
    justify-content: start;
  }

  .timer-control {
    display: grid;
    gap: var(--space-1);
    justify-items: center;
  }

  .timer-control-caption {
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: 600;
  }
`;
