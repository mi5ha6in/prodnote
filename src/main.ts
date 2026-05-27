import "./styles/global.css";
import "./components/mini-timer";
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
    void navigator.serviceWorker.register("/sw.js");
  });
}
