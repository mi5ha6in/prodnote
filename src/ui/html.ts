import { escapeHtml } from "../domain/markdown";

type ButtonTone = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "normal" | "small";

export function buttonAttrs(options: {
  tone?: ButtonTone;
  size?: ButtonSize;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  data?: Record<string, string | number | boolean | null | undefined>;
  className?: string;
} = {}): string {
  const classes = [
    options.tone && options.tone !== "primary" ? options.tone : "",
    options.size === "small" ? "small" : "",
    options.className ?? "",
  ].filter(Boolean);
  const dataAttrs = Object.entries(options.data ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== false)
    .map(([key, value]) => `data-${toKebabCase(key)}="${escapeHtml(String(value))}"`)
    .join(" ");

  return [
    `type="${options.type ?? "button"}"`,
    classes.length ? `class="${classes.join(" ")}"` : "",
    options.disabled ? "disabled" : "",
    dataAttrs,
  ]
    .filter(Boolean)
    .join(" ");
}

export function badgeHtml(content: string | number, options: { className?: string; color?: string } = {}): string {
  const classes = ["status-pill", options.className ?? ""].filter(Boolean).join(" ");
  const style = options.color ? ` style="--tag-color: ${escapeHtml(options.color)}"` : "";
  return `<span class="${classes}"${style}>${escapeHtml(String(content))}</span>`;
}

export function emptyStateHtml(message: string): string {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

/** Thin progress bar (horizontal by default); percent is clamped to 0–100. */
export function barHtml(
  percent: number,
  options: { tone?: "accent" | "muted"; vertical?: boolean; title?: string } = {},
): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const classes = ["bar", options.tone === "muted" ? "muted" : "", options.vertical ? "vertical" : ""]
    .filter(Boolean)
    .join(" ");
  const titleAttr = options.title ? ` title="${escapeHtml(options.title)}"` : "";
  const size = options.vertical ? `height: ${clamped}%` : `width: ${clamped}%`;
  return `<div class="${classes}"${titleAttr}><span style="${size}"></span></div>`;
}

/** Labeled stat row: name and value above a horizontal bar. */
export function barRowHtml(options: {
  label: string;
  value: string;
  percent: number;
  tone?: "accent" | "muted";
}): string {
  return `
    <div class="bar-row">
      <div class="bar-row-head">
        <strong>${escapeHtml(options.label)}</strong>
        <span>${escapeHtml(options.value)}</span>
      </div>
      ${barHtml(options.percent, { tone: options.tone })}
    </div>
  `;
}

export function fieldHtml(options: {
  label: string;
  control: string;
  className?: string;
}): string {
  const classAttr = options.className ? ` class="${options.className}"` : "";

  return `
    <label${classAttr}>
      ${escapeHtml(options.label)}
      ${options.control}
    </label>
  `;
}

export function viewHeaderHtml(options: { eyebrow?: string; title?: string; actions?: string }): string {
  const hasText = Boolean(options.eyebrow || options.title);
  return `
    <header class="view-header">
      ${
        hasText
          ? `<div class="view-header-text">
              ${options.eyebrow ? `<p class="eyebrow">${escapeHtml(options.eyebrow)}</p>` : ""}
              ${options.title ? `<h2>${escapeHtml(options.title)}</h2>` : ""}
            </div>`
          : ""
      }
      ${options.actions ? `<div class="view-header-actions">${options.actions}</div>` : ""}
    </header>
  `;
}

export function metricBarHtml(items: Array<{ label: string; value: string | number; hint?: string }>): string {
  return `
    <div class="metric-bar">
      ${items
        .map(
          (item) => `
            <div class="metric">
              <span class="metric-label">${escapeHtml(item.label)}</span>
              <span class="metric-value">${escapeHtml(String(item.value))}</span>
              ${item.hint ? `<span class="metric-hint">${escapeHtml(item.hint)}</span>` : ""}
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

/**
 * One step of a modal wizard (weekly review, day planning): header with a
 * step counter and close button, the step body, and a footer with back/next.
 * Wire `[data-action=...]` handlers in the host component.
 */
export function wizardStepHtml(options: {
  step: number;
  totalSteps: number;
  title: string;
  eyebrow?: string;
  body: string;
  /** Markup for the footer's primary actions (next/done buttons). */
  footer: string;
  showBack: boolean;
  label: string;
}): string {
  return modalHtml({
    label: options.label,
    body: `
      <div class="card-header" style="margin-bottom: 0;">
        <div>
          <p class="eyebrow">${escapeHtml(options.eyebrow ?? `Шаг ${options.step} из ${options.totalSteps}`)}</p>
          <h2>${escapeHtml(options.title)}</h2>
        </div>
        <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-wizard" } })}>Закрыть</button>
      </div>
      ${options.body}
      <div class="row-actions" style="justify-content: flex-end;">
        ${options.showBack ? `<button ${buttonAttrs({ tone: "ghost", data: { action: "wizard-back" } })}>Назад</button>` : ""}
        ${options.footer}
      </div>
    `,
  });
}

/**
 * Shared quick-add syntax cheatsheet, shown wherever natural-language capture
 * happens (task toolbar, command palette) so the grammar reads identically
 * everywhere. Mirrors the parser in domain/quick-add.ts — keep both in sync.
 * Hosts must ship the matching `.quick-syntax` styles (see quickAddSyntaxCss).
 */
export function quickAddSyntaxHtml(): string {
  return `
    <details class="quick-syntax">
      <summary>Синтаксис быстрого ввода</summary>
      <p class="muted">
        <code>!высокий</code> / <code>!средний</code> / <code>!низкий</code> — приоритет ·
        <code>#проект</code> · <code>@тег</code> ·
        даты: <code>сегодня</code>, <code>завтра</code>, <code>пт</code>, <code>через 3 дня</code>, <code>15.07</code>
      </p>
    </details>
  `;
}

/** Styles for `quickAddSyntaxHtml`, inlined into each host's shadow root. */
export const quickAddSyntaxCss = `
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
`;

export function modalHtml(options: { body: string; wide?: boolean; label?: string }): string {
  const labelAttr = options.label ? ` aria-label="${escapeHtml(options.label)}"` : "";
  return `
    <dialog class="modal" data-modal${labelAttr}>
      <div class="modal-card${options.wide ? " wide" : ""}">
        ${options.body}
      </div>
    </dialog>
  `;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
