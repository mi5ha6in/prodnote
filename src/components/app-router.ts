/**
 * Navigation model and hash routing for the app shell.
 *
 * Canonical routes are `#/<hub>/<tab>`. Legacy hashes — both single-segment
 * (e.g. `#/tasks`) and two-segment paths for tabs that have since moved between
 * hubs (e.g. `#/planner/today`) — are normalized to their current hub/tab pair,
 * so older links and notifications keep working across navigation restructures.
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
  | "settings"
  | "guide";

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
    id: "work",
    label: "Работа",
    icon: "today",
    tabs: [
      {
        id: "today",
        label: "Сегодня",
        description: "Главное на день: чек-лист, события, задачи",
        tag: "pn-today-view",
        icon: "today",
        detailTag: "pn-today-view",
      },
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
    id: "planner",
    label: "Планер",
    icon: "calendar",
    tabs: [
      { id: "habits", label: "Привычки", description: "Привычки, рутины и серии", tag: "pn-habits-view", icon: "habits" },
      {
        id: "calendar",
        label: "Календарь",
        description: "Когда: план и расписание",
        tag: "pn-calendar-view",
        icon: "calendar",
        detailTag: "pn-calendar-view",
      },
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
      { id: "guide", label: "Справка", description: "Руководство пользователя", tag: "pn-guide-view", icon: "guide" },
    ],
  },
];

/**
 * Retired routes mapped to their current canonical `hub/tab` path. Keys are
 * either a single segment (old `#/<name>` links) or a full `hub/tab` pair for
 * tabs that moved between hubs (e.g. `today` left `planner` for `work`).
 */
export const LEGACY_ROUTES: Record<string, string> = {
  dashboard: "work/today",
  today: "work/today",
  overview: "work/today",
  habits: "planner/habits",
  calendar: "planner/calendar",
  tasks: "work/tasks",
  focus: "work/focus",
  notes: "notes/notes",
  stats: "analytics/stats",
  review: "analytics/review",
  settings: "settings/settings",
  guide: "settings/guide",
  "planner/today": "work/today",
  "planner/overview": "work/today",
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
  const detailId = segments[2] ?? "";

  // Remap retired routes: a full `hub/tab` pair for tabs that moved between
  // hubs, else an old single-segment `#/<name>` link. The detail segment
  // (segments[2]) rides along so deep links to a moved tab keep their entity.
  const legacy = LEGACY_ROUTES[`${hubId}/${tabId}`] ?? (segments.length <= 1 ? LEGACY_ROUTES[hubId] : undefined);
  if (legacy) {
    [hubId, tabId] = legacy.split("/");
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
