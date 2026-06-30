import { escapeHtml } from "../domain/markdown";
import { searchAll } from "../domain/search";
import { appStore } from "../state";
import { setBodyScrollLock } from "./modal";
import { renderShadow } from "./shadow";

interface PaletteItem {
  label: string;
  sub: string;
  hash: string;
}

const NAV_ITEMS: PaletteItem[] = [
  { label: "Перейти: Обзор", sub: "Навигация", hash: "#/dashboard" },
  { label: "Перейти: Сегодня", sub: "Навигация", hash: "#/today" },
  { label: "Перейти: Задачи", sub: "Навигация", hash: "#/tasks" },
  { label: "Перейти: Заметки", sub: "Навигация", hash: "#/notes" },
  { label: "Перейти: Календарь", sub: "Навигация", hash: "#/calendar" },
  { label: "Перейти: Фокус", sub: "Навигация", hash: "#/focus" },
  { label: "Перейти: Статистика", sub: "Навигация", hash: "#/stats" },
  { label: "Перейти: Настройки", sub: "Навигация", hash: "#/settings" },
  { label: "Создать: Пункт дня", sub: "Действие", hash: "#/today" },
  { label: "Создать: Задача", sub: "Действие", hash: "#/tasks" },
  { label: "Создать: Заметка", sub: "Действие", hash: "#/notes" },
  { label: "Создать: Событие", sub: "Действие", hash: "#/calendar" },
  { label: "Начать фокус", sub: "Действие", hash: "#/focus" },
];

export class CommandPalette extends HTMLElement {
  private open = false;
  private query = "";
  private selected = 0;
  private onKeydown = (event: KeyboardEvent) => this.handleGlobalKey(event);

  connectedCallback(): void {
    document.addEventListener("keydown", this.onKeydown);
    this.render();
  }

  disconnectedCallback(): void {
    document.removeEventListener("keydown", this.onKeydown);
    setBodyScrollLock(false);
  }

  private handleGlobalKey(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      this.toggle();
      return;
    }
    if (event.key === "Escape" && this.open) {
      this.close();
    }
  }

  private toggle(): void {
    this.open = !this.open;
    this.query = "";
    this.selected = 0;
    this.render();
  }

  private close(): void {
    this.open = false;
    this.render();
  }

  private items(): PaletteItem[] {
    const queryTerms = this.query.toLowerCase().split(/\s+/).filter(Boolean);
    const nav = queryTerms.length
      ? NAV_ITEMS.filter((item) => queryTerms.every((term) => item.label.toLowerCase().includes(term)))
      : NAV_ITEMS;

    const workspace = appStore.getWorkspace();
    const hits = searchAll(this.query, {
      tasks: workspace.tasks,
      notes: workspace.notes,
      events: workspace.events,
    }).map((hit) => ({ label: hit.title, sub: hit.subtitle, hash: hit.hash }));

    return [...nav, ...hits];
  }

  private render(): void {
    if (!this.open) {
      setBodyScrollLock(false);
      renderShadow(this, "");
      return;
    }

    setBodyScrollLock(true);
    const items = this.items();
    this.selected = Math.max(0, Math.min(this.selected, items.length - 1));

    const root = renderShadow(
      this,
      `
        <div class="palette-overlay" data-overlay>
          <div class="palette" role="dialog" aria-modal="true" aria-label="Командная палитра">
            <input
              class="palette-input"
              data-palette-input
              type="text"
              placeholder="Поиск и команды…"
              value="${escapeHtml(this.query)}"
              aria-label="Поиск и команды"
            />
            <div class="palette-list">
              ${
                items.length
                  ? items
                      .map(
                        (item, index) => `
                          <button class="palette-item ${index === this.selected ? "is-active" : ""}" data-index="${index}">
                            <span class="palette-label">${escapeHtml(item.label)}</span>
                            <span class="palette-sub">${escapeHtml(item.sub)}</span>
                          </button>
                        `,
                      )
                      .join("")
                  : `<div class="palette-empty">Ничего не найдено</div>`
              }
            </div>
          </div>
        </div>
      `,
      styles,
    );

    const input = root.querySelector<HTMLInputElement>("[data-palette-input]");
    input?.focus();
    input?.setSelectionRange(this.query.length, this.query.length);

    input?.addEventListener("input", () => {
      this.query = input.value;
      this.selected = 0;
      this.render();
    });

    input?.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.move(1, items.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        this.move(-1, items.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        this.activate(items[this.selected]);
      }
    });

    root.querySelectorAll<HTMLButtonElement>("[data-index]").forEach((button) => {
      button.addEventListener("click", () => this.activate(items[Number(button.dataset.index)]));
    });

    root.querySelector<HTMLElement>("[data-overlay]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        this.close();
      }
    });
  }

  private move(delta: number, total: number): void {
    if (total === 0) {
      return;
    }
    this.selected = (this.selected + delta + total) % total;
    this.render();
  }

  private activate(item: PaletteItem | undefined): void {
    if (!item) {
      return;
    }
    this.close();
    if (window.location.hash !== item.hash) {
      window.location.hash = item.hash;
    }
  }
}

customElements.define("pn-command-palette", CommandPalette);

const styles = `
  .palette-overlay {
    align-items: flex-start;
    background: rgba(20, 28, 24, 0.45);
    display: flex;
    inset: 0;
    justify-content: center;
    padding-top: 10vh;
    position: fixed;
    z-index: 120;
  }

  .palette {
    animation: palette-in 140ms ease;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    display: grid;
    max-height: 70vh;
    max-width: 40rem;
    overflow: hidden;
    width: calc(100vw - 2rem);
  }

  .palette-input {
    border: none;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    font-size: var(--text-base);
    padding: var(--space-4);
  }

  .palette-input:focus {
    box-shadow: none;
  }

  .palette-list {
    display: grid;
    gap: 0.15rem;
    overflow-y: auto;
    padding: var(--space-2);
  }

  .palette-item {
    align-items: baseline;
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: var(--ink);
    cursor: pointer;
    display: flex;
    gap: var(--space-3);
    justify-content: space-between;
    min-height: auto;
    padding: var(--space-2) var(--space-3);
    text-align: left;
  }

  .palette-item.is-active,
  .palette-item:hover {
    background: var(--surface);
  }

  .palette-label {
    font-weight: 600;
  }

  .palette-sub {
    color: var(--muted);
    font-size: var(--text-xs);
  }

  .palette-empty {
    color: var(--muted);
    padding: var(--space-4);
    text-align: center;
  }

  @keyframes palette-in {
    from {
      opacity: 0;
      transform: translateY(-0.5rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
