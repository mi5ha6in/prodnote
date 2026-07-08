/**
 * Shared inline SVG icon set. Stroke-based, styled by the design-system
 * `button svg` rule (currentColor, stroke-width 1.7). Icon-only buttons must
 * carry `title` + `aria-label` — use `buttonAttrs({ icon: true, label })`.
 */
export const ICONS = {
  play: `<svg viewBox="0 0 24 24"><path d="M8.5 5.5v13l9.5-6.5-9.5-6.5Z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24"><path d="M8.5 5.5v13M15.5 5.5v13"/></svg>`,
  stop: `<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/></svg>`,
  skip: `<svg viewBox="0 0 24 24"><path d="M6 5.5v13l8.5-6.5L6 5.5ZM17.5 5.5v13"/></svg>`,
  close: `<svg viewBox="0 0 24 24"><path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/></svg>`,
  cycle: `<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 3.5V7H16"/></svg>`,
  edit: `<svg viewBox="0 0 24 24"><path d="M5 19h4L19.5 8.5a2.1 2.1 0 0 0-3-3L6 16v3ZM14 7l3 3"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10.5 10.5v6M13.5 10.5v6"/></svg>`,
};
