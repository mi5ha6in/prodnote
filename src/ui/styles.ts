export const sharedStyles = `
  :host {
    --ink: #14213d;
    --muted: #6c675e;
    --paper: #fffaf0;
    --paper-strong: #f7f0df;
    --line: rgba(20, 33, 61, 0.14);
    --accent: #2a9d8f;
    --accent-strong: #1d6f66;
    --gold: #e19f44;
    --danger: #bc4749;
    --shadow: 0 24px 70px rgba(20, 33, 61, 0.12);
    color: var(--ink);
    display: block;
    font-family:
      ui-serif,
      "Iowan Old Style",
      "Palatino Linotype",
      "Book Antiqua",
      Georgia,
      serif;
  }

  * {
    box-sizing: border-box;
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
    font-size: clamp(1.35rem, 2vw, 2rem);
    letter-spacing: -0.04em;
  }

  h3 {
    font-size: 1rem;
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
    border: 0;
    border-radius: 999px;
    color: white;
    cursor: pointer;
    display: inline-flex;
    font-weight: 800;
    gap: 0.45rem;
    justify-content: center;
    min-height: 2.65rem;
    padding: 0.75rem 1.15rem;
    text-decoration: none;
    transition:
      transform 160ms ease,
      box-shadow 160ms ease,
      background 160ms ease;
  }

  button:hover,
  .button:hover {
    box-shadow: 0 12px 24px rgba(20, 33, 61, 0.16);
    transform: translateY(-1px);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  button.secondary,
  .button.secondary {
    background: var(--accent);
  }

  button.ghost,
  .button.ghost {
    background: rgba(20, 33, 61, 0.06);
    color: var(--ink);
  }

  button.danger {
    background: var(--danger);
  }

  button.small,
  .button.small {
    font-size: 0.85rem;
    min-height: 2.1rem;
    padding: 0.5rem 0.75rem;
  }

  input,
  select,
  textarea {
    background: rgba(255, 255, 255, 0.78);
    border: 1px solid var(--line);
    border-radius: 1rem;
    color: var(--ink);
    outline: none;
    min-width: 0;
    padding: 0.78rem 0.9rem;
    width: 100%;
  }

  textarea {
    line-height: 1.45;
    min-height: 7rem;
    resize: vertical;
  }

  input:focus,
  select:focus,
  textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 4px rgba(42, 157, 143, 0.16);
  }

  label {
    color: var(--muted);
    display: grid;
    font-size: 0.84rem;
    font-weight: 800;
    gap: 0.4rem;
  }

  .view-grid {
    display: grid;
    gap: 1rem;
  }

  .split-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
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
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.86), rgba(255, 250, 240, 0.94)),
      var(--paper);
    border: 1px solid var(--line);
    border-radius: 1.5rem;
    box-shadow: var(--shadow);
    min-width: 0;
    padding: 1rem;
  }

  .card.subtle {
    box-shadow: none;
  }

  .card-header {
    align-items: start;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    margin-bottom: 1rem;
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
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .form-grid {
    display: grid;
    gap: 0.75rem;
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
    gap: 0.55rem;
  }

  .item-list {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .list-item {
    background: rgba(255, 255, 255, 0.66);
    border: 1px solid var(--line);
    border-radius: 1.1rem;
    display: grid;
    gap: 0.55rem;
    min-width: 0;
    padding: 0.9rem;
  }

  .meta-row {
    align-items: center;
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    font-size: 0.85rem;
    gap: 0.45rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .tag-pill,
  .status-pill {
    align-items: center;
    background: color-mix(in srgb, var(--tag-color, var(--accent)) 22%, white);
    border: 1px solid color-mix(in srgb, var(--tag-color, var(--accent)) 40%, white);
    border-radius: 999px;
    color: var(--ink);
    display: inline-flex;
    font-size: 0.78rem;
    font-weight: 800;
    gap: 0.35rem;
    padding: 0.25rem 0.55rem;
  }

  .empty {
    border: 1px dashed var(--line);
    border-radius: 1.25rem;
    color: var(--muted);
    padding: 1rem;
    text-align: center;
  }

  .stat-number {
    display: block;
    font-size: clamp(1.8rem, 4vw, 3rem);
    font-weight: 900;
    letter-spacing: -0.06em;
  }

  .bar {
    background: rgba(20, 33, 61, 0.08);
    border-radius: 999px;
    height: 0.75rem;
    overflow: hidden;
  }

  .bar > span {
    background: linear-gradient(90deg, var(--accent), var(--gold));
    border-radius: inherit;
    display: block;
    height: 100%;
  }

  .markdown-preview {
    color: var(--ink);
    line-height: 1.55;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
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
    border-left: 4px solid var(--accent);
    color: var(--muted);
    padding-left: 0.8rem;
  }

  @media (max-width: 860px) {
    .split-grid,
    .three-grid,
    .inline-grid {
      grid-template-columns: 1fr;
    }
  }
`;
