import "./styles/global.css";
import { initTheme } from "./storage/theme";
import "./components/mini-timer";
import "./components/phase-alert";
import "./components/event-reminder";
import "./components/command-palette";
import "./components/dashboard-view";
import "./components/today-view";
import "./components/habits-view";
import "./components/tasks-view";
import "./components/notes-view";
import "./components/calendar-view";
import "./components/focus-view";
import "./components/stats-view";
import "./components/settings-view";
import "./components/app-root";

initTheme();

function openAppUrlFromServiceWorker(url: string, hash?: string | null): void {
  try {
    const target = new URL(url, window.location.origin);
    const current = new URL(window.location.href);

    if (target.origin === current.origin && target.pathname === current.pathname) {
      if (hash && window.location.hash !== hash) {
        window.location.hash = hash;
      }
      window.focus();
      return;
    }

    window.location.assign(target.toString());
  } catch {
    if (hash && window.location.hash !== hash) {
      window.location.hash = hash;
    }
    window.focus();
  }
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) {
        return;
      }

      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const data = event.data as Partial<{ type: string; url: string; hash: string | null }> | null;
      if (!data || data.type !== "prodnote-open-url" || typeof data.url !== "string") {
        return;
      }

      openAppUrlFromServiceWorker(data.url, typeof data.hash === "string" ? data.hash : null);
    });

    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=${__PRODNOTE_BUILD_ID__}`, {
      scope: import.meta.env.BASE_URL,
    });
  });
}
