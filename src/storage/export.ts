import { migrateWorkspace } from "../domain/migrations";
import { SCHEMA_VERSION, type Workspace } from "../domain/types";

export interface ImportPreview {
  schemaVersion: number;
  projects: number;
  tasks: number;
  notes: number;
  tags: number;
  checklist: number;
  checklistTemplates: number;
  sessions: number;
  plans: number;
  events: number;
}

export function createExportSnapshot(workspace: Workspace): Workspace {
  return {
    ...structuredClone(workspace),
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
  };
}

export function stringifyExport(workspace: Workspace): string {
  return JSON.stringify(createExportSnapshot(workspace), null, 2);
}

export function validateImportSnapshot(value: unknown): ImportPreview {
  if (!value || typeof value !== "object") {
    throw new Error("Файл не похож на экспорт ProdNote.");
  }

  const snapshot = value as Partial<Workspace>;

  if (typeof snapshot.schemaVersion !== "number" || snapshot.schemaVersion < 1 || snapshot.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Неподдерживаемая версия схемы: ${String(snapshot.schemaVersion)}.`);
  }

  const requiredArrays = ["projects", "tasks", "notes", "tags", "sessions", "plans"] as const;
  for (const field of requiredArrays) {
    if (!Array.isArray(snapshot[field])) {
      throw new Error(`В файле отсутствует массив ${field}.`);
    }
  }

  if (!snapshot.settings || typeof snapshot.settings !== "object") {
    throw new Error("В файле отсутствуют настройки.");
  }

  return {
    schemaVersion: snapshot.schemaVersion,
    projects: (snapshot.projects ?? []).length,
    tasks: (snapshot.tasks ?? []).length,
    notes: (snapshot.notes ?? []).length,
    tags: (snapshot.tags ?? []).length,
    checklist: (snapshot.checklist ?? []).length,
    checklistTemplates: (snapshot.checklistTemplates ?? []).length,
    sessions: (snapshot.sessions ?? []).length,
    plans: (snapshot.plans ?? []).length,
    events: (snapshot.events ?? []).length,
  };
}

export function parseWorkspaceExport(text: string): Workspace {
  const parsed = JSON.parse(text) as unknown;
  validateImportSnapshot(parsed);
  const workspace = parsed as Workspace;

  return migrateWorkspace({
    ...workspace,
    exportedAt: workspace.exportedAt ?? null,
    pomodoroCycles: Array.isArray(workspace.pomodoroCycles) ? workspace.pomodoroCycles : [],
    events: Array.isArray(workspace.events) ? workspace.events : [],
  });
}
