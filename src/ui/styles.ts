export const sharedStyles = `
  :host {
    --ink: #18211c;
    --ink-soft: #34443a;
    --muted: #748078;
    --paper: #ffffff;
    --paper-strong: #f3f6f3;
    --surface: #f8faf8;
    --line: #e2e8e3;
    --line-strong: #cdd8cf;
    --accent: #2f7d5c;
    --accent-strong: #205d43;
    --accent-soft: #e4f1e9;
    --gold: #c98b38;
    --danger: #b84b4b;
    --danger-soft: #f8eaea;
    --shadow: 0 1px 2px rgba(24, 33, 28, 0.04), 0 10px 30px rgba(24, 33, 28, 0.05);
    --shadow-raised: 0 18px 50px rgba(24, 33, 28, 0.12);
    color: var(--ink);
    display: block;
    font-family:
      "Avenir Next",
      "SF Pro Display",
      ui-rounded,
      sans-serif;
    font-size: 15px;
    line-height: 1.45;
  }

  * {
    box-sizing: border-box;
  }

  ::selection {
    background: #cde6d7;
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
    font-size: clamp(1.25rem, 2vw, 1.65rem);
    font-weight: 700;
    letter-spacing: -0.035em;
    line-height: 1.15;
  }

  h3 {
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.02em;
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
    background: var(--ink);
    border: 1px solid transparent;
    border-radius: 0.75rem;
    color: white;
    cursor: pointer;
    display: inline-flex;
    font-size: 0.88rem;
    font-weight: 700;
    gap: 0.45rem;
    justify-content: center;
    min-height: 2.55rem;
    padding: 0.65rem 1rem;
    text-decoration: none;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease,
      transform 150ms ease,
      background 150ms ease;
  }

  button:hover,
  .button:hover {
    box-shadow: 0 6px 16px rgba(24, 33, 28, 0.12);
    transform: translateY(-1px);
  }

  button:focus-visible,
  .button:focus-visible,
  a:focus-visible {
    outline: 3px solid rgba(47, 125, 92, 0.22);
    outline-offset: 2px;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.42;
    transform: none;
  }

  button.secondary,
  .button.secondary {
    background: var(--accent);
  }

  button.ghost,
  .button.ghost {
    background: var(--paper);
    border-color: var(--line);
    color: var(--ink-soft);
  }

  button.danger,
  .button.danger {
    background: var(--danger-soft);
    border-color: #efd0d0;
    color: var(--danger);
  }

  button.small,
  .button.small {
    font-size: 0.78rem;
    min-height: 2rem;
    padding: 0.42rem 0.68rem;
  }

  input,
  select,
  textarea {
    background: var(--paper);
    border: 1px solid var(--line-strong);
    border-radius: 0.72rem;
    color: var(--ink);
    min-width: 0;
    outline: none;
    padding: 0.72rem 0.82rem;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease;
    width: 100%;
  }

  input::placeholder,
  textarea::placeholder {
    color: #a1aaa4;
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
    box-shadow: 0 0 0 3px rgba(47, 125, 92, 0.13);
  }

  input[type="checkbox"],
  input[type="radio"] {
    accent-color: var(--accent);
  }

  label {
    color: var(--ink-soft);
    display: grid;
    font-size: 0.78rem;
    font-weight: 700;
    gap: 0.38rem;
  }

  .view-grid {
    animation: view-in 220ms ease-out both;
    display: grid;
    gap: 1rem;
  }

  .split-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .split-grid > *,
  .three-grid > * {
    align-self: start;
    min-width: 0;
  }

  .three-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .card {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 1rem;
    box-shadow: var(--shadow);
    min-width: 0;
    padding: 1rem;
  }

  .card.subtle {
    background: var(--surface);
    box-shadow: none;
  }

  .card-header {
    align-items: start;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    margin-bottom: 0.9rem;
    min-width: 0;
  }

  .card-header > * {
    min-width: 0;
  }

  .muted {
    color: var(--muted);
  }

  .eyebrow {
    color: var(--accent-strong);
    font-size: 0.67rem;
    font-weight: 800;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .form-grid {
    display: grid;
    gap: 0.8rem;
    min-width: 0;
  }

  .inline-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-width: 0;
  }

  .row-actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .item-list {
    display: grid;
    gap: 0.55rem;
    min-width: 0;
  }

  .list-item {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 0.78rem;
    display: grid;
    gap: 0.45rem;
    min-width: 0;
    padding: 0.78rem;
    transition:
      border-color 150ms ease,
      background 150ms ease;
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
    font-size: 0.76rem;
    gap: 0.4rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .tag-pill,
  .status-pill {
    align-items: center;
    background: color-mix(in srgb, var(--tag-color, var(--accent)) 12%, white);
    border: 1px solid color-mix(in srgb, var(--tag-color, var(--accent)) 24%, white);
    border-radius: 999px;
    color: var(--ink-soft);
    display: inline-flex;
    font-size: 0.7rem;
    font-weight: 700;
    gap: 0.3rem;
    padding: 0.2rem 0.48rem;
  }

  .empty {
    background: var(--surface);
    border: 1px dashed var(--line-strong);
    border-radius: 0.8rem;
    color: var(--muted);
    padding: 1.25rem 1rem;
    text-align: center;
  }

  .stat-number {
    display: block;
    font-size: clamp(1.65rem, 3vw, 2.45rem);
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    letter-spacing: -0.055em;
    line-height: 1.1;
    margin: 0.3rem 0 0.15rem;
  }

  .bar {
    background: var(--line);
    border-radius: 999px;
    height: 0.38rem;
    overflow: hidden;
  }

  .bar > span {
    background: var(--accent);
    border-radius: inherit;
    display: block;
    height: 100%;
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
    border-radius: 0.3rem;
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
    padding-left: 0.8rem;
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
