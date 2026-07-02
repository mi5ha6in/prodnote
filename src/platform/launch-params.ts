/**
 * PWA entry points beyond a plain open: manifest shortcuts
 * (`?action=new-task`) and the Web Share Target (`?title=&text=&url=`).
 * Parsing is pure for tests; side effects live in `handleLaunchParams`.
 */

import { parseQuickAdd } from "../domain/quick-add";
import { appStore } from "../state";

export type LaunchIntent = { kind: "new-task" } | { kind: "share"; raw: string } | null;

export function parseLaunchParams(search: string): LaunchIntent {
  const params = new URLSearchParams(search);

  if (params.get("action") === "new-task") {
    return { kind: "new-task" };
  }

  const raw = [params.get("title"), params.get("text"), params.get("url")]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();
  return raw ? { kind: "share", raw } : null;
}

export const PENDING_ACTION_KEY = "prodnote-pending-action";

/** Consume launch query params: queue the intent, then clean the URL. */
export function handleLaunchParams(): void {
  const intent = parseLaunchParams(window.location.search);
  if (!intent) {
    return;
  }

  // Query params must not survive reloads/navigation.
  history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);

  if (intent.kind === "new-task") {
    sessionStorage.setItem(PENDING_ACTION_KEY, "new-task");
    window.location.hash = "#/work/tasks";
    return;
  }

  void appStore.init().then(async () => {
    const workspace = appStore.getWorkspace();
    const parsed = parseQuickAdd(intent.raw, { projects: workspace.projects, tags: workspace.tags });
    await appStore.addTask({
      title: parsed.title || intent.raw,
      dueDate: parsed.dueDate,
      priority: parsed.priority ?? undefined,
      projectId: parsed.projectId,
      tagIds: parsed.tagIds,
    });
    window.location.hash = "#/planner/today";
  });
}
