/**
 * Navigation model and hash routing for the app shell.
 *
 * Canonical routes are `#/<hub>/<tab>`. Legacy single-segment hashes
 * (e.g. `#/tasks`) are still understood and normalized to their hub/tab pair,
 * so older links and notifications keep working after the 5-hub restructure.
 *
 * This module is intentionally free of DOM/rendering concerns so the routing
 * logic can be unit tested in isolation (see app-router.test.ts).
 */

export type HubId = "planner" | "work" | "notes" | "analytics" | "settings";

export type IconName =
  | "today"
  | "habits"
  | "tasks"
  | "notes"
  | "calendar"
  | "focus"
  | "stats"
  | "review"
  | "settings";

export interface TabDef {
  id: string;
  label: string;
  description: string;
  /** Custom element tag rendered for this tab. */
  tag: string;
  icon: IconName;
  /** When set, `#/<hub>/<tab>/<id>` renders this element with an `entity-id` attribute. */
  detailTag?: string;
}

export interface HubDef {
  id: HubId;
  label: string;
  icon: IconName;
  tabs: TabDef[];
}

export const HUBS: HubDef[] = [
  {
    id: "planner",
    label: "Планер",
    icon: "today",
    tabs: [
      { id: "today", label: "Сегодня", description: "Главное на день: чек-лист, события, задачи", tag: "pn-today-view", icon: "today" },
      { id: "habits", label: "Привычки", description: "Трекер привычек и серии", tag: "pn-habits-view", icon: "habits" },
      {
        id: "calendar",
        label: "Календарь",
        description: "План и история времени",
        tag: "pn-calendar-view",
        icon: "calendar",
        detailTag: "pn-calendar-view",
      },
    ],
  },
  {
    id: "work",
    label: "Работа",
    icon: "tasks",
    tabs: [
      {
        id: "tasks",
        label: "Задачи",
        description: "Планы и текущая работа",
        tag: "pn-tasks-view",
        icon: "tasks",
        detailTag: "pn-task-detail-view",
      },
      { id: "focus", label: "Фокус", description: "Таймер и помодоро", tag: "pn-focus-view", icon: "focus" },
    ],
  },
  {
    id: "notes",
    label: "Заметки",
    icon: "notes",
    tabs: [
      {
        id: "notes",
        label: "Заметки",
        description: "Markdown-заметки и база знаний",
        tag: "pn-notes-view",
        icon: "notes",
        detailTag: "pn-notes-view",
      },
    ],
  },
  {
    id: "analytics",
    label: "Аналитика",
    icon: "stats",
    tabs: [
      { id: "stats", label: "Статистика", description: "Ритм и распределение времени", tag: "pn-stats-view", icon: "stats" },
      { id: "review", label: "Ревью", description: "Итоги недели и продуктивность", tag: "pn-review-view", icon: "review" },
    ],
  },
  {
    id: "settings",
    label: "Настройки",
    icon: "settings",
    tabs: [
      { id: "settings", label: "Настройки", description: "Данные, синхронизация и проекты", tag: "pn-settings-view", icon: "settings" },
    ],
  },
];

/** Old single-segment routes mapped to their canonical `hub/tab` path. */
export const LEGACY_ROUTES: Record<string, string> = {
  dashboard: "planner/today",
  today: "planner/today",
  habits: "planner/habits",
  calendar: "planner/calendar",
  tasks: "work/tasks",
  focus: "work/focus",
  notes: "notes/notes",
  stats: "analytics/stats",
  review: "analytics/review",
  settings: "settings/settings",
};

export interface ResolvedRoute {
  hubId: HubId;
  tabId: string;
  /** Entity id for a detail route (`#/<hub>/<tab>/<id>`), or "" when not a detail view. */
  detailId: string;
  /** Canonical hash for the resolved route, e.g. `#/planner/today` or `#/work/tasks/<id>`. */
  canonical: string;
}

/** Resolve any hash (canonical, legacy, detail, hub-only, empty or unknown) to a hub/tab. */
export function resolveRoute(hash: string): ResolvedRoute {
  const segments = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  let hubId = segments[0] ?? "";
  let tabId = segments[1] ?? "";
  let detailId = segments[2] ?? "";

  if (segments.length <= 1 && LEGACY_ROUTES[hubId]) {
    const [legacyHub, legacyTab] = LEGACY_ROUTES[hubId].split("/");
    hubId = legacyHub;
    tabId = legacyTab;
    detailId = "";
  }

  const hub = HUBS.find((item) => item.id === hubId) ?? HUBS[0];
  const tab = hub.tabs.find((item) => item.id === tabId) ?? hub.tabs[0];
  const resolvedDetailId = tab.detailTag ? detailId : "";
  const canonical = `#/${hub.id}/${tab.id}${resolvedDetailId ? `/${resolvedDetailId}` : ""}`;
  return { hubId: hub.id, tabId: tab.id, detailId: resolvedDetailId, canonical };
}

/** Canonical hash for a hub's default (first) tab — used by the sidebar. */
export function hubDefaultHash(hub: HubDef): string {
  return `#/${hub.id}/${hub.tabs[0].id}`;
}
