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
