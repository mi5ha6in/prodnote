import { appStore } from "../state";
import { renderShadow } from "./shadow";

type Route = "dashboard" | "tasks" | "notes" | "calendar" | "focus" | "stats" | "settings";

const ROUTES: Array<{ id: Route; label: string; icon: string; tag: string }> = [
  { id: "dashboard", label: "Обзор", icon: "⌁", tag: "pn-dashboard-view" },
  { id: "tasks", label: "Задачи", icon: "□", tag: "pn-tasks-view" },
  { id: "notes", label: "Заметки", icon: "¶", tag: "pn-notes-view" },
  { id: "calendar", label: "Календарь", icon: "◇", tag: "pn-calendar-view" },
  { id: "focus", label: "Фокус", icon: "◉", tag: "pn-focus-view" },
  { id: "stats", label: "Статистика", icon: "▧", tag: "pn-stats-view" },
  { id: "settings", label: "Настройки", icon: "⚙", tag: "pn-settings-view" },
];

function getRoute(): Route {
  const route = window.location.hash.replace("#/", "") as Route;
  return ROUTES.some((item) => item.id === route) ? route : "dashboard";
}

export class AppRoot extends HTMLElement {
  private onHashChange = () => this.render();

  connectedCallback(): void {
    window.addEventListener("hashchange", this.onHashChange);
    void appStore.init().catch((error: unknown) => {
      renderShadow(
        this,
        `<main class="app-error"><h1>Не удалось открыть ProdNote</h1><p>${String(error)}</p></main>`,
      );
    });
    this.render();
  }

  disconnectedCallback(): void {
    window.removeEventListener("hashchange", this.onHashChange);
  }

  private render(): void {
    const route = getRoute();
    const current = ROUTES.find((item) => item.id === route) ?? ROUTES[0];

    renderShadow(
      this,
      `
      <div class="app-shell">
        <aside class="sidebar">
          <a class="brand" href="#/dashboard" aria-label="ProdNote home">
            <span class="brand-mark">P</span>
            <span>
              <strong>ProdNote</strong>
              <small>локальный фокус</small>
            </span>
          </a>
          <nav class="nav-list" aria-label="Главная навигация">
            ${ROUTES.map(
              (item) => `
                <a class="nav-item ${item.id === route ? "active" : ""}" href="#/${item.id}">
                  <span aria-hidden="true">${item.icon}</span>
                  ${item.label}
                </a>
              `,
            ).join("")}
          </nav>
          <pn-mini-timer></pn-mini-timer>
        </aside>
        <main class="content-shell">
          <header class="topbar">
            <div>
              <p class="eyebrow">Рабочее пространство</p>
              <h1>${current.label}</h1>
            </div>
            <a class="focus-link" href="#/focus">Открыть фокус</a>
          </header>
          <section class="view-host">
            <${current.tag}></${current.tag}>
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
          background:
            radial-gradient(circle at 8% 12%, rgba(225, 159, 68, 0.24), transparent 26rem),
            radial-gradient(circle at 92% 8%, rgba(42, 157, 143, 0.2), transparent 24rem),
            linear-gradient(135deg, #f7f0df 0%, #fffaf0 46%, #e8dcc7 100%);
          display: grid;
          grid-template-columns: 18rem minmax(0, 1fr);
          min-height: 100vh;
        }

        .sidebar {
          border-right: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem;
          position: sticky;
          top: 0;
          height: 100vh;
        }

        .brand {
          align-items: center;
          border-radius: 1.3rem;
          display: flex;
          gap: 0.8rem;
          padding: 0.6rem;
          text-decoration: none;
        }

        .brand-mark {
          align-items: center;
          background: var(--ink);
          border-radius: 1rem;
          color: white;
          display: inline-flex;
          font-size: 1.35rem;
          font-weight: 900;
          height: 3rem;
          justify-content: center;
          width: 3rem;
        }

        .brand strong,
        .brand small {
          display: block;
        }

        .brand small {
          color: var(--muted);
          margin-top: 0.1rem;
        }

        .nav-list {
          display: grid;
          gap: 0.35rem;
        }

        .nav-item {
          align-items: center;
          border-radius: 1rem;
          color: var(--muted);
          display: flex;
          font-weight: 850;
          gap: 0.7rem;
          padding: 0.78rem 0.85rem;
          text-decoration: none;
        }

        .nav-item.active,
        .nav-item:hover {
          background: rgba(255, 255, 255, 0.68);
          color: var(--ink);
        }

        .nav-item span {
          text-align: center;
          width: 1.2rem;
        }

        .content-shell {
          display: grid;
          grid-template-rows: auto 1fr;
          min-width: 0;
        }

        .topbar {
          align-items: center;
          border-bottom: 1px solid var(--line);
          display: flex;
          gap: 1rem;
          justify-content: space-between;
          padding: 1.2rem clamp(1rem, 3vw, 2rem);
        }

        .topbar h1 {
          font-size: clamp(2rem, 5vw, 4.8rem);
          letter-spacing: -0.075em;
          line-height: 0.92;
        }

        .focus-link {
          background: var(--ink);
          border-radius: 999px;
          color: white;
          font-weight: 900;
          padding: 0.8rem 1rem;
          text-decoration: none;
          white-space: nowrap;
        }

        .view-host {
          min-width: 0;
          padding: clamp(1rem, 3vw, 2rem);
        }

        @media (max-width: 920px) {
          .app-shell {
            grid-template-columns: 1fr;
            padding-bottom: 5.5rem;
          }

          .sidebar {
            background: rgba(247, 240, 223, 0.9);
            backdrop-filter: blur(18px);
            border-right: 0;
            border-top: 1px solid var(--line);
            bottom: 0;
            flex-direction: row;
            height: auto;
            left: 0;
            overflow-x: auto;
            padding: 0.6rem;
            position: fixed;
            right: 0;
            top: auto;
            z-index: 20;
          }

          .brand,
          pn-mini-timer {
            display: none;
          }

          .nav-list {
            display: flex;
            min-width: max-content;
            width: 100%;
          }

          .nav-item {
            justify-content: center;
            min-width: 6rem;
          }
        }
      `,
    );
  }
}

customElements.define("app-root", AppRoot);
