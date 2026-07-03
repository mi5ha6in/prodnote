import { dayKey } from "../domain/calendar";
import { escapeHtml } from "../domain/markdown";
import { parseQuickAdd } from "../domain/quick-add";
import { searchAll } from "../domain/search";
import { appStore } from "../state";
import { quickAddSyntaxCss, quickAddSyntaxHtml } from "../ui/html";
import { setBodyScrollLock } from "./modal";
import { renderShadow } from "./shadow";

interface PaletteItem {
  label: string;
  sub: string;
  hash?: string;
  run?: () => void | Promise<void>;
}

const NAV_ITEMS: PaletteItem[] = [
  { label: "Перейти: Сегодня", sub: "Навигация", hash: "#/work/today" },
  { label: "Перейти: Привычки", sub: "Навигация", hash: "#/planner/habits" },
  { label: "Перейти: Задачи", sub: "Навигация", hash: "#/work/tasks" },
  { label: "Перейти: Заметки", sub: "Навигация", hash: "#/notes/notes" },
  { label: "Перейти: Календарь", sub: "Навигация", hash: "#/planner/calendar" },
  { label: "Перейти: Фокус", sub: "Навигация", hash: "#/work/focus" },
  { label: "Перейти: Статистика", sub: "Навигация", hash: "#/analytics/stats" },
  { label: "Перейти: Ревью", sub: "Навигация", hash: "#/analytics/review" },
  { label: "Перейти: Настройки", sub: "Навигация", hash: "#/settings/settings" },
  { label: "Перейти: Справка", sub: "Навигация", hash: "#/settings/guide" },
  { label: "Создать: Событие", sub: "Действие", hash: "#/planner/calendar" },
  { label: "Начать фокус", sub: "Действие", hash: "#/work/focus" },
];

export class CommandPalette extends HTMLElement {
  private open = false;
  private query = "";
  private selected = 0;
  private onKeydown = (event: KeyboardEvent) => this.handleGlobalKey(event);
  private onOpenRequest = () => this.openPalette();

  connectedCallback(): void {
    document.addEventListener("keydown", this.onKeydown);
    // Кнопка в топбаре (и любой другой UI) открывает палитру этим событием.
    document.addEventListener("pn:open-palette", this.onOpenRequest);
    this.render();
  }

  disconnectedCallback(): void {
    document.removeEventListener("keydown", this.onKeydown);
    document.removeEventListener("pn:open-palette", this.onOpenRequest);
    setBodyScrollLock(false);
  }

  private handleGlobalKey(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      this.toggle();
      return;
    }
    if (event.key === "Escape" && this.open) {
      // preventDefault: иначе браузерный close request после удаления палитры
      // достанется следующему открытому <dialog> и закроет ещё и его.
      event.preventDefault();
      this.close();
    }
  }

  private toggle(): void {
    this.open = !this.open;
    this.query = "";
    this.selected = 0;
    this.render();
  }

  /** Открыть (не переключить) — для внешних вызовов вроде кнопки в топбаре. */
  private openPalette(): void {
    if (!this.open) {
      this.toggle();
    }
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
    }).map((hit): PaletteItem => ({ label: hit.title, sub: hit.subtitle, hash: hit.hash }));

    return [...nav, ...this.createActions(), ...hits];
  }

  /** Query-driven quick creation: turn whatever was typed into a new entity. */
  private createActions(): PaletteItem[] {
    const raw = this.query.trim();
    if (!raw) {
      return [];
    }

    const workspace = appStore.getWorkspace();
    const parsed = parseQuickAdd(raw, { projects: workspace.projects, tags: workspace.tags });
    const taskTitle = parsed.title || raw;

    return [
      {
        label: `Создать задачу: «${taskTitle}»`,
        sub: "Создание",
        run: async () => {
          await appStore.addTask({
            title: taskTitle,
            dueDate: parsed.dueDate,
            priority: parsed.priority ?? undefined,
            projectId: parsed.projectId,
            tagIds: parsed.tagIds,
          });
          this.go("#/work/tasks");
        },
      },
      {
        label: `Создать пункт дня: «${raw}»`,
        sub: "Создание",
        run: async () => {
          await appStore.addChecklistItem({ title: raw, day: dayKey(new Date()) });
          this.go("#/work/today");
        },
      },
      {
        label: `Создать заметку: «${raw}»`,
        sub: "Создание",
        run: async () => {
          await appStore.addNote({ title: raw, markdown: "" });
          this.go("#/notes/notes");
        },
      },
    ];
  }

  private go(hash: string): void {
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
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
        <dialog class="palette-overlay" data-overlay aria-label="Командная палитра">
          <div class="palette">
            <input
              class="palette-input"
              data-palette-input
              type="text"
              placeholder="Найти или создать… (!приоритет #проект @тег завтра)"
              value="${escapeHtml(this.query)}"
              aria-label="Поиск и команды"
            />
            <div class="palette-syntax">${quickAddSyntaxHtml()}</div>
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
        </dialog>
      `,
      styles,
    );

    // Палитра живёт в top layer, как и остальные модалки (<dialog>): иначе
    // открытый визард/форма рисуется поверх неё независимо от z-index.
    const dialog = root.querySelector<HTMLDialogElement>("[data-overlay]");
    if (dialog && !dialog.open && typeof dialog.showModal === "function") {
      try {
        dialog.showModal();
      } catch {
        // jsdom и старые движки могут не уметь showModal — палитра всё равно видна.
      }
    }
    dialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.close();
    });

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
    if (item.run) {
      void item.run();
      return;
    }
    if (item.hash) {
      this.go(item.hash);
    }
  }
}

customElements.define("pn-command-palette", CommandPalette);

const styles = `
  /* Нативный <dialog>: сбрасываем UA-стили и растягиваем на весь экран,
     затемнение рисуем самим диалогом (клик по нему закрывает палитру). */
  .palette-overlay {
    background: var(--backdrop);
    border: none;
    height: 100dvh;
    inset: 0;
    margin: 0;
    max-height: none;
    max-width: none;
    padding: 10vh var(--space-4) var(--space-4);
    position: fixed;
    width: 100vw;
  }

  .palette-overlay[open] {
    align-items: flex-start;
    display: flex;
    justify-content: center;
  }

  .palette-overlay::backdrop {
    background: transparent;
  }

  .palette {
    animation: palette-in 140ms ease;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    display: grid;
    max-height: 70vh;
    overflow: hidden;
    width: min(40rem, 100%);
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

  .palette-syntax {
    border-bottom: 1px solid var(--line);
    padding: 0 var(--space-4) var(--space-2);
  }

  ${quickAddSyntaxCss}

  .palette-syntax .quick-syntax {
    margin-top: 0;
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
