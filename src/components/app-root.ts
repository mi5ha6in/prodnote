import { getActiveTimerClockReadout, getActiveTimerPhaseLabel, isActiveTimerPaused } from "../domain/active-timer";
import { escapeHtml } from "../domain/markdown";
import { appStore } from "../state";
import { HUBS, hubDefaultHash, type IconName, resolveRoute } from "./app-router";
import { renderShadow } from "./shadow";

const ICONS = {
  today: `<svg viewBox="0 0 24 24"><path d="M5 5h14v15H5V5Zm0 5h14M8 3v4M16 3v4m-7 9 2 2 4-4"/></svg>`,
  habits: `<svg viewBox="0 0 24 24"><path d="M4 5h4v4H4V5Zm6 0h4v4h-4V5Zm6 0h4v4h-4V5ZM4 11h4v4H4v-4Zm6 0h4v4h-4v-4Zm6 0h4v4h-4v-4ZM4 17h4v4H4v-4Zm6 0h4v4h-4v-4Z"/></svg>`,
  tasks: `<svg viewBox="0 0 24 24"><path d="m5 12 2.2 2.2L11 10.4M5 6l2.2 2.2L11 4.4M5 18l2.2 2.2 3.8-3.8M14 6h5M14 12h5M14 18h5"/></svg>`,
  notes: `<svg viewBox="0 0 24 24"><path d="M6 3.5h9l3 3V20.5H6v-17Zm8.5 0v4h4M9 11h6M9 15h6"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24"><path d="M5 5h14v15H5V5Zm0 5h14M8 3v4M16 3v4M8 14h3M13 14h3M8 17h3"/></svg>`,
  focus: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
  stats: `<svg viewBox="0 0 24 24"><path d="M5 20V10h4v10H5Zm5 0V4h4v16h-4Zm5 0v-7h4v7h-4Z"/></svg>`,
  review: `<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9h-9V3Z"/><path d="M14 3.5a8 8 0 0 1 6.5 6.5H14V3.5Z"/></svg>`,
  settings: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>`,
} satisfies Record<IconName, string>;

export class AppRoot extends HTMLElement {
  private onHashChange = () => this.render();
  private unsubscribe: (() => void) | null = null;
  private intervalId: number | null = null;

  connectedCallback(): void {
    window.addEventListener("hashchange", this.onHashChange);
    void appStore.init().catch((error: unknown) => {
      renderShadow(
        this,
        `<main class="app-error"><h1>Не удалось открыть ProdNote</h1><p>${String(error)}</p></main>`,
      );
    });
    this.unsubscribe = appStore.subscribe(() => {
      this.updateAppBadge();
      this.syncFocusIndicator();
    });
    this.intervalId = window.setInterval(() => this.syncFocusIndicator(), 1000);
    this.render();
  }

  disconnectedCallback(): void {
    window.removeEventListener("hashchange", this.onHashChange);
    this.unsubscribe?.();
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
    }
  }

  /**
   * Live session state on the topbar focus link, patched in place: a full
   * re-render here would remount the current view and drop its local state.
   */
  private syncFocusIndicator(): void {
    const link = this.shadowRoot?.querySelector<HTMLElement>("[data-focus-link]");
    if (!link) {
      return;
    }

    const active = appStore.getActiveTimer();
    link.classList.toggle("is-active", Boolean(active));
    link.classList.toggle("is-paused", isActiveTimerPaused(active));

    const label = link.querySelector<HTMLElement>("[data-focus-link-label]");
    if (label) {
      label.textContent = active
        ? `${getActiveTimerPhaseLabel(active)} · ${getActiveTimerClockReadout(active)}`
        : "Начать фокус";
    }
  }

  /** Число просроченных задач на иконке приложения (Badging API, если есть). */
  private updateAppBadge(): void {
    const nav = navigator as Navigator & {
      setAppBadge?: (count: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge || !nav.clearAppBadge) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const overdue = appStore
      .getWorkspace()
      .tasks.filter((task) => task.status !== "done" && task.dueDate !== null && task.dueDate < today).length;
    void (overdue > 0 ? nav.setAppBadge(overdue) : nav.clearAppBadge()).catch(() => undefined);
  }

  private render(): void {
    const { hubId, tabId, detailId, canonical } = resolveRoute(window.location.hash);
    // Normalize legacy/bare hashes silently (no extra history entry, no re-render loop).
    if (window.location.hash !== canonical) {
      history.replaceState(null, "", canonical);
    }

    const hub = HUBS.find((item) => item.id === hubId) ?? HUBS[0];
    const tab = hub.tabs.find((item) => item.id === tabId) ?? hub.tabs[0];
    const showSubnav = hub.tabs.length > 1;
    const viewMarkup =
      detailId && tab.detailTag
        ? `<${tab.detailTag} entity-id="${escapeHtml(detailId)}"></${tab.detailTag}>`
        : `<${tab.tag}></${tab.tag}>`;

    const isMac = /mac|iphone|ipad/i.test(navigator.platform);
    const paletteKey = isMac ? "⌘K" : "Ctrl+K";
    const searchIcon = `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m15.5 15.5 4.5 4.5"/></svg>`;

    const root = renderShadow(
      this,
      `
      <div class="app-shell">
        <aside class="sidebar">
          <a class="brand" href="#/planner/today" aria-label="ProdNote home">
            <img class="brand-mark" src="${import.meta.env.BASE_URL}icons/icon.svg" alt="" />
            <span>
              <strong>ProdNote</strong>
              <small>Рабочее пространство</small>
            </span>
          </a>
          <nav class="nav-list" aria-label="Главная навигация">
            ${HUBS.map(
              (item) => `
                <a class="nav-item ${item.id === hub.id ? "active" : ""}" href="${hubDefaultHash(item)}">
                  <span class="nav-icon" aria-hidden="true">${ICONS[item.icon]}</span>
                  <span class="nav-label">${item.label}</span>
                </a>
              `,
            ).join("")}
          </nav>
          <pn-mini-timer></pn-mini-timer>
        </aside>
        <pn-phase-alert></pn-phase-alert>
        <pn-event-reminder></pn-event-reminder>
        <pn-command-palette></pn-command-palette>
        <main class="content-shell">
          <header class="topbar">
            <div>
              <h1>${tab.label}</h1>
              <p>${tab.description}</p>
            </div>
            <div class="topbar-actions">
              <button type="button" class="palette-button" data-open-palette title="Поиск и команды (${paletteKey})">
                ${searchIcon}<span class="palette-button-label">Поиск и команды</span><kbd class="palette-key">${paletteKey}</kbd>
              </button>
              ${
                tab.tag === "pn-focus-view"
                  ? ""
                  : `<a class="focus-link" href="#/work/focus" data-focus-link>
                      ${ICONS.focus}<span class="session-dot" aria-hidden="true"></span><span data-focus-link-label>Начать фокус</span>
                    </a>`
              }
            </div>
          </header>
          ${
            showSubnav
              ? `<nav class="subnav" aria-label="Разделы: ${hub.label}">
                  ${hub.tabs
                    .map(
                      (item) => `
                        <a class="subnav-item ${item.id === tab.id ? "active" : ""}" href="#/${hub.id}/${item.id}">
                          <span class="subnav-icon" aria-hidden="true">${ICONS[item.icon]}</span>
                          <span>${item.label}</span>
                        </a>
                      `,
                    )
                    .join("")}
                </nav>`
              : ""
          }
          <section class="view-host">
            ${viewMarkup}
          </section>
        </main>
      </div>
    `,
      `
        :host {
          display: block;
          min-height: 100vh;
        }

        .app-shell {
          background: var(--bg);
          display: grid;
          grid-template-columns: 15.5rem minmax(0, 1fr);
          min-height: 100vh;
        }

        .app-shell > pn-phase-alert {
          position: fixed;
          z-index: 100;
        }

        .app-shell > pn-event-reminder,
        .app-shell > pn-command-palette {
          /* fixed сам по себе создаёт stacking context: без z-index здесь
             внутренние z-index оверлеев не участвуют в общем порядке слоёв. */
          position: fixed;
          z-index: 110;
        }

        .sidebar {
          background: var(--paper);
          border-right: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
          padding: var(--space-4) var(--space-3);
          position: sticky;
          top: 0;
          height: 100vh;
        }

        .brand {
          align-items: center;
          display: flex;
          gap: var(--space-3);
          padding: var(--space-2);
          text-decoration: none;
        }

        .brand-mark {
          border-radius: var(--radius-md);
          height: 2.25rem;
          width: 2.25rem;
        }

        .brand strong,
        .brand small {
          display: block;
        }

        .brand strong {
          font-size: var(--text-base);
          font-weight: 650;
        }

        .brand small {
          color: var(--muted);
          font-size: var(--text-xs);
        }

        .nav-list {
          display: grid;
          gap: 0.15rem;
        }

        .nav-item {
          align-items: center;
          border-radius: var(--radius-md);
          color: var(--muted);
          display: flex;
          font-size: var(--text-sm);
          font-weight: 600;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-3);
          text-decoration: none;
          transition:
            background 140ms ease,
            color 140ms ease;
        }

        .nav-item:hover {
          background: var(--surface);
          color: var(--ink);
        }

        .nav-item.active {
          background: var(--accent-soft);
          color: var(--accent-strong);
        }

        .nav-icon {
          display: grid;
          place-items: center;
        }

        .nav-icon svg,
        .subnav-icon svg,
        .focus-link svg {
          fill: none;
          height: 1.05rem;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 1.7;
          width: 1.05rem;
        }

        .content-shell {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .topbar {
          align-items: center;
          border-bottom: 1px solid var(--line);
          display: flex;
          gap: var(--space-4);
          justify-content: space-between;
          padding: var(--space-5) clamp(var(--space-4), 3vw, var(--space-6)) var(--space-4);
        }

        .topbar h1 {
          font-size: var(--text-xl);
          font-weight: 650;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .topbar p {
          color: var(--muted);
          font-size: var(--text-sm);
          margin-top: 0.15rem;
        }

        .topbar-actions {
          align-items: center;
          display: flex;
          flex: none;
          gap: var(--space-2);
        }

        .palette-button {
          align-items: center;
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          color: var(--muted);
          cursor: pointer;
          display: flex;
          font-size: var(--text-sm);
          font-weight: 600;
          gap: var(--space-2);
          min-height: 2.5rem;
          padding: 0 var(--space-3);
          white-space: nowrap;
        }

        .palette-button:hover {
          border-color: var(--line-strong);
          color: var(--ink);
        }

        .palette-button svg {
          fill: none;
          height: 1.05rem;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 1.7;
          width: 1.05rem;
        }

        .palette-key {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          font-family: inherit;
          font-size: var(--text-xs);
          padding: 0.05rem 0.35rem;
        }

        .focus-link {
          align-items: center;
          background: var(--accent);
          border-radius: var(--radius-md);
          color: white;
          display: flex;
          font-size: var(--text-sm);
          font-weight: 600;
          gap: var(--space-2);
          min-height: 2.5rem;
          padding: 0 var(--space-4);
          text-decoration: none;
          white-space: nowrap;
        }

        .focus-link:hover {
          background: var(--accent-strong);
        }

        .focus-link [data-focus-link-label] {
          font-variant-numeric: tabular-nums;
        }

        .focus-link .session-dot {
          display: none;
        }

        .focus-link.is-active svg {
          display: none;
        }

        .focus-link.is-active .session-dot {
          animation: session-pulse 1.2s ease-in-out infinite;
          background: currentColor;
          border-radius: var(--radius-pill);
          display: block;
          height: 0.55rem;
          width: 0.55rem;
        }

        .focus-link.is-paused .session-dot {
          animation: none;
          opacity: 0.6;
        }

        @keyframes session-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }

        .subnav {
          border-bottom: 1px solid var(--line);
          display: flex;
          gap: var(--space-1);
          overflow-x: auto;
          padding: var(--space-2) clamp(var(--space-4), 3vw, var(--space-6));
        }

        .subnav-item {
          align-items: center;
          border-radius: var(--radius-md);
          color: var(--muted);
          display: flex;
          font-size: var(--text-sm);
          font-weight: 600;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          text-decoration: none;
          white-space: nowrap;
          transition:
            background 140ms ease,
            color 140ms ease;
        }

        .subnav-item:hover {
          background: var(--surface);
          color: var(--ink);
        }

        .subnav-item.active {
          background: var(--accent-soft);
          color: var(--accent-strong);
        }

        .view-host {
          flex: 1;
          min-width: 0;
          padding: var(--space-5) clamp(var(--space-4), 3vw, var(--space-6)) var(--space-6);
        }

        .view-host > * {
          margin: 0 auto;
          max-width: 80rem;
        }

        @media (max-width: 920px) {
          .app-shell {
            grid-template-columns: 1fr;
            padding-bottom: 5.5rem;
          }

          .sidebar {
            background: var(--paper);
            border-right: 0;
            border-top: 1px solid var(--line);
            bottom: 0;
            flex-direction: row;
            height: auto;
            left: 0;
            overflow-x: auto;
            padding: var(--space-2);
            position: fixed;
            right: 0;
            top: auto;
            z-index: 20;
          }

          .brand,
          pn-mini-timer {
            display: none;
          }

          .palette-button-label,
          .palette-key {
            display: none;
          }

          .nav-list {
            display: flex;
            justify-content: space-around;
            min-width: max-content;
            width: 100%;
          }

          .nav-item {
            display: grid;
            font-size: var(--text-xs);
            gap: 0.15rem;
            justify-content: center;
            justify-items: center;
            min-width: 4.65rem;
            padding: var(--space-2);
          }

          .nav-icon svg {
            height: 1.15rem;
            width: 1.15rem;
          }
        }

        @media (max-width: 620px) {
          .nav-list {
            min-width: 100%;
          }

          .nav-item {
            min-width: 2.75rem;
          }

          .nav-label {
            display: none;
          }

          .subnav-icon {
            display: none;
          }
        }
      `,
    );

    root.querySelector<HTMLButtonElement>("[data-open-palette]")?.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("pn:open-palette"));
    });

    // Восстановленная из localStorage сессия должна быть видна сразу, не через секунду.
    this.syncFocusIndicator();
  }
}

customElements.define("app-root", AppRoot);
