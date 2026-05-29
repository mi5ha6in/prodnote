import "./styles/global.css";
import "./components/mini-timer";
import "./components/phase-alert";
import "./components/dashboard-view";
import "./components/tasks-view";
import "./components/notes-view";
import "./components/calendar-view";
import "./components/focus-view";
import "./components/stats-view";
import "./components/settings-view";
import "./components/app-root";

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

    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=${__PRODNOTE_BUILD_ID__}`, {
      scope: import.meta.env.BASE_URL,
    });
  });
}
