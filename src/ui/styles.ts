export const sharedStyles = `
  :host {
    /* Palette tokens are defined on :root (global.css) and inherit through the
       shadow boundary, so the theme switch reaches every component. */

    /* Spacing scale */
    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-5: 1.5rem;
    --space-6: 2rem;
    --space-7: 3rem;

    /* Radius scale */
    --radius-sm: 0.5rem;
    --radius-md: 0.75rem;
    --radius-lg: 1rem;
    --radius-pill: 999px;

    /* Type scale */
    --text-xs: 0.75rem;
    --text-sm: 0.875rem;
    --text-base: 1rem;
    --text-lg: 1.25rem;
    --text-xl: 1.5rem;
    --text-2xl: 2rem;

    color: var(--ink);
    display: block;
    font-family:
      "Inter",
      "SF Pro Text",
      -apple-system,
      "Segoe UI",
      system-ui,
      sans-serif;
    font-size: var(--text-base);
    line-height: 1.5;
  }

  * {
    box-sizing: border-box;
  }

  ::selection {
    background: var(--accent-soft);
    color: var(--ink);
  }

  a {
    color: inherit;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: var(--text-xl);
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  h3 {
    font-size: var(--text-base);
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  button,
  .button {
    align-items: center;
    background: var(--accent);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: white;
    cursor: pointer;
    display: inline-flex;
    font-size: var(--text-sm);
    font-weight: 600;
    gap: var(--space-2);
    justify-content: center;
    min-height: 2.5rem;
    padding: 0 var(--space-4);
    text-decoration: none;
    transition:
      border-color 140ms ease,
      box-shadow 140ms ease,
      background 140ms ease,
      opacity 140ms ease;
  }

  button:hover,
  .button:hover {
    background: var(--accent-strong);
  }

  button:focus-visible,
  .button:focus-visible,
  a:focus-visible,
  [tabindex]:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  button.secondary,
  .button.secondary {
    background: var(--ink);
    color: var(--paper);
  }

  button.secondary:hover,
  .button.secondary:hover {
    background: var(--ink-soft);
  }

  button.ghost,
  .button.ghost {
    background: var(--paper);
    border-color: var(--line-strong);
    color: var(--ink-soft);
  }

  button.ghost:hover,
  .button.ghost:hover {
    background: var(--surface);
    border-color: var(--line-strong);
  }

  button.danger,
  .button.danger {
    background: var(--danger-soft);
    border-color: color-mix(in srgb, var(--danger) 28%, var(--paper));
    color: var(--danger);
  }

  button.danger:hover,
  .button.danger:hover {
    background: color-mix(in srgb, var(--danger) 16%, var(--paper));
  }

  button.small,
  .button.small {
    font-size: var(--text-xs);
    min-height: 2rem;
    padding: 0 var(--space-3);
  }

  input,
  select,
  textarea {
    background: var(--paper);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-md);
    color: var(--ink);
    min-width: 0;
    outline: none;
    padding: var(--space-3);
    transition:
      border-color 140ms ease,
      box-shadow 140ms ease;
    width: 100%;
  }

  select {
    appearance: none;
    background-image: var(--select-arrow);
    background-position: right 0.7rem center;
    background-repeat: no-repeat;
    background-size: 0.9rem;
    cursor: pointer;
    padding-right: 2.2rem;
  }

  input::placeholder,
  textarea::placeholder {
    color: #a3a8a5;
  }

  textarea {
    line-height: 1.55;
    min-height: 7rem;
    resize: vertical;
  }

  input:focus,
  select:focus,
  textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  input[type="color"] {
    /* Без этого color-инпут наследует width: 100% и padding текстовых
       полей и рисуется сплющенной полоской на всю ширину формы. */
    height: 2.5rem;
    padding: 0.2rem;
    width: 3.25rem;
  }

  input[type="checkbox"],
  input[type="radio"] {
    accent-color: var(--accent);
    /* Без padding: фокусные border/box-shadow выключают native appearance,
       и чекбокс внезапно раздувается на унаследованный от input padding. */
    padding: 0;
  }

  input[type="checkbox"]:focus,
  input[type="radio"]:focus {
    border-color: var(--line-strong);
    box-shadow: none;
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  label {
    /* align-content: без него лейбл, растянутый соседней колонкой,
       раздувает свой контрол (высоченные select в двухколоночных формах). */
    align-content: start;
    color: var(--ink-soft);
    display: grid;
    font-size: var(--text-sm);
    font-weight: 600;
    gap: var(--space-2);
  }

  .view-grid {
    /* Без fill-mode: "both" навсегда оставлял transform, а это stacking
       context — контент вью перекрывал фиксированные оверлеи (палитру). */
    animation: view-in 200ms ease-out;
    display: grid;
    gap: var(--space-5);
  }

  .split-grid {
    display: grid;
    gap: var(--space-4);
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .split-grid > *,
  .three-grid > * {
    align-self: stretch;
    min-width: 0;
  }

  .three-grid {
    display: grid;
    gap: var(--space-4);
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .card {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    min-width: 0;
    padding: var(--space-4);
  }

  .card.subtle {
    background: var(--surface);
    border-color: var(--line);
    box-shadow: none;
  }

  .card-header {
    align-items: start;
    display: flex;
    gap: var(--space-4);
    justify-content: space-between;
    margin-bottom: var(--space-4);
    min-width: 0;
  }

  .card-header > * {
    min-width: 0;
  }

  .muted {
    color: var(--muted);
  }

  .eyebrow {
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* View header: title block + actions */
  .view-header {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    justify-content: space-between;
  }

  .view-header .view-header-text {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .view-header h2 {
    font-size: var(--text-lg);
  }

  .view-header-actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-left: auto;
  }

  /* Metric bar: compact equal-width stats that wrap instead of squishing */
  .metric-bar {
    display: grid;
    gap: var(--space-3);
    grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
  }

  .metric {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    display: grid;
    gap: 0.1rem;
    padding: var(--space-3) var(--space-4);
  }

  .metric .metric-label {
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .metric .metric-value {
    font-size: var(--text-lg);
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .metric .metric-hint {
    color: var(--muted);
    font-size: var(--text-xs);
  }

  /* Segmented control */
  .segmented {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    display: inline-flex;
    /* Узкие экраны: сегменты переносятся, а не распирают layout вширь. */
    flex-wrap: wrap;
    gap: 0.15rem;
    padding: 0.2rem;
  }

  .segmented button {
    background: transparent;
    border: none;
    border-radius: calc(var(--radius-md) - 0.2rem);
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: 600;
    min-height: 1.9rem;
    padding: 0 var(--space-3);
  }

  .segmented button:hover {
    background: transparent;
    color: var(--ink);
  }

  .segmented button[aria-pressed="true"] {
    background: var(--paper);
    box-shadow: var(--shadow-sm);
    color: var(--ink);
  }

  .form-grid {
    align-content: start;
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }

  .inline-grid {
    display: grid;
    gap: var(--space-3);
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-width: 0;
  }

  .row-actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .item-list {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }

  .list-item {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    display: grid;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-3);
    transition:
      border-color 140ms ease,
      background 140ms ease;
  }

  .list-item:hover {
    background: var(--paper);
    border-color: var(--line-strong);
  }

  .meta-row {
    align-items: center;
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    font-size: var(--text-xs);
    gap: var(--space-2);
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .tag-pill,
  .status-pill {
    align-items: center;
    background: color-mix(in srgb, var(--tag-color, var(--accent)) 10%, var(--paper));
    border: 1px solid color-mix(in srgb, var(--tag-color, var(--accent)) 22%, var(--paper));
    border-radius: var(--radius-pill);
    color: var(--ink-soft);
    display: inline-flex;
    font-size: var(--text-xs);
    font-weight: 600;
    gap: 0.3rem;
    padding: 0.15rem 0.5rem;
  }

  .empty {
    background: var(--surface);
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius-md);
    color: var(--muted);
    font-size: var(--text-sm);
    padding: var(--space-5) var(--space-4);
    text-align: center;
  }

  /* Modal dialog (shared) */
  .modal {
    background: transparent;
    border: none;
    margin: auto;
    max-height: calc(100dvh - 2rem);
    max-width: 60rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0;
    width: min(60rem, 100%);
  }

  .modal::backdrop {
    backdrop-filter: blur(2px);
    background: var(--backdrop);
  }

  .modal[open] {
    animation: modal-in 150ms ease;
  }

  .modal-card {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
    width: 100%;
  }

  .modal.wide,
  .modal:has(.modal-card.wide) {
    max-width: 72rem;
    width: min(72rem, 100%);
  }

  .bar {
    background: var(--line);
    border-radius: var(--radius-pill);
    height: 0.38rem;
    overflow: hidden;
  }

  .bar > span {
    background: var(--accent);
    border-radius: inherit;
    display: block;
    height: 100%;
  }

  .bar.muted > span {
    background: var(--ink-soft);
  }

  .bar.vertical {
    align-items: end;
    background: var(--surface);
    border-radius: var(--radius-sm);
    display: flex;
    height: 100%;
  }

  .bar.vertical > span {
    border-radius: var(--radius-sm);
    height: auto;
    min-height: 2px;
    width: 100%;
  }

  .bar-row {
    display: grid;
    gap: var(--space-2);
  }

  .bar-row-head {
    align-items: baseline;
    display: flex;
    gap: var(--space-3);
    justify-content: space-between;
  }

  .bar-row-head span {
    color: var(--muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .quick-create {
    display: grid;
    gap: var(--space-2);
    justify-items: start;
  }

  .quick-create-fields {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  /* display: flex выше перебивает UA-правило для [hidden] — возвращаем его,
     иначе поля quick-create видны всегда, а не после «+ Новый …». */
  .quick-create-fields[hidden] {
    display: none;
  }

  .quick-create-fields input[type="color"] {
    flex: none;
    min-height: 2.25rem;
    padding: 0.15rem;
    width: 2.6rem;
  }

  .markdown-preview {
    color: var(--ink-soft);
    line-height: 1.62;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .markdown-preview a {
    color: var(--accent-strong);
  }

  .markdown-preview code {
    background: var(--paper-strong);
    border-radius: var(--radius-sm);
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 0.88em;
    padding: 0.12rem 0.28rem;
  }

  .markdown-preview a,
  .markdown-preview code,
  .markdown-preview p,
  .markdown-preview li,
  h1,
  h2,
  h3,
  p {
    overflow-wrap: anywhere;
  }

  .markdown-preview h1,
  .markdown-preview h2,
  .markdown-preview h3,
  .markdown-preview p,
  .markdown-preview ul,
  .markdown-preview blockquote {
    margin: 0 0 0.65rem;
  }

  .markdown-preview blockquote {
    border-left: 3px solid var(--accent);
    color: var(--muted);
    padding-left: var(--space-3);
  }

  .markdown-preview ol {
    margin: 0 0 0.65rem;
  }

  .markdown-preview pre {
    background: var(--paper-strong);
    border-radius: var(--radius-md);
    margin: 0 0 0.65rem;
    overflow-x: auto;
    padding: var(--space-3);
  }

  .markdown-preview pre code {
    background: none;
    font-size: 0.85em;
    padding: 0;
  }

  .markdown-preview table {
    border-collapse: collapse;
    display: block;
    margin: 0 0 0.65rem;
    overflow-x: auto;
  }

  .markdown-preview th,
  .markdown-preview td {
    border: 1px solid var(--line-strong);
    padding: 0.3rem var(--space-3);
    text-align: left;
  }

  .markdown-preview th {
    background: var(--surface);
  }

  .markdown-preview .task-item {
    align-items: baseline;
    display: flex;
    gap: 0.35rem;
    list-style: none;
    margin-left: -1.1rem;
  }

  .markdown-preview .task-item input {
    width: auto;
  }

  @keyframes view-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes modal-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 1ms !important;
      scroll-behavior: auto !important;
      transition-duration: 1ms !important;
    }
  }

  @media (max-width: 860px) {
    .split-grid,
    .three-grid,
    .inline-grid {
      grid-template-columns: 1fr;
    }
  }
`;
