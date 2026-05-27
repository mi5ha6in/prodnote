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

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
