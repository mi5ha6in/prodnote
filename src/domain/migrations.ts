import { createDefaultSettings, createId } from "./defaults";
import { addMinutesIso } from "./pomodoro";
import {
  SCHEMA_VERSION,
  type CalendarEvent,
  type CalendarPlan,
  type ChecklistItem,
  type ChecklistTemplate,
  type Note,
  type NoteEditEntry,
  type PomodoroCycle,
  type Task,
  type TimeSession,
  type Workspace,
} from "./types";

type LegacyNoteEditEntry =
  | NoteEditEntry
  | {
      id?: string;
      startedAt?: string;
      endedAt?: string;
      durationMinutes?: number;
    };

type LegacyNote = Omit<Note, "editHistory" | "dayKey"> & {
  editHistory?: LegacyNoteEditEntry[];
  dayKey?: string | null;
};

type LegacyPomodoroCycle = Omit<PomodoroCycle, "completedShortBreakCount" | "completedLongBreakCount"> &
  Partial<Pick<PomodoroCycle, "completedShortBreakCount" | "completedLongBreakCount">>;

type LegacyTask = Omit<Task, "subtasks" | "recurrence" | "recurrenceParentId" | "boardOrder"> & {
  subtasks?: Task["subtasks"];
  recurrence?: Task["recurrence"];
  recurrenceParentId?: Task["recurrenceParentId"];
  boardOrder?: number;
};

type LegacyChecklistItem = Omit<ChecklistItem, "templateId"> & { templateId?: string | null };

type LegacyWorkspace = Omit<
  Workspace,
  "notes" | "tasks" | "pomodoroCycles" | "events" | "checklist" | "checklistTemplates" | "schemaVersion"
> & {
  schemaVersion: number;
  tasks: LegacyTask[];
  notes: LegacyNote[];
  pomodoroCycles?: LegacyPomodoroCycle[];
  events?: Workspace["events"];
  checklist?: LegacyChecklistItem[];
  checklistTemplates?: ChecklistTemplate[];
};

export function migrateWorkspace(workspace: LegacyWorkspace): Workspace {
  if (workspace.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Неподдерживаемая версия схемы: ${workspace.schemaVersion}.`);
  }

  if (workspace.schemaVersion < 1) {
    throw new Error(`Неподдерживаемая версия схемы: ${workspace.schemaVersion}.`);
  }

  const plans = Array.isArray(workspace.plans) ? workspace.plans : [];
  const existingEvents = Array.isArray(workspace.events) ? workspace.events : [];

  return {
    ...workspace,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: workspace.exportedAt ?? null,
    checklist: Array.isArray(workspace.checklist) ? workspace.checklist.map(normalizeChecklistItem) : [],
    checklistTemplates: Array.isArray(workspace.checklistTemplates) ? workspace.checklistTemplates : [],
    tasks: workspace.tasks.map(normalizeTask),
    notes: workspace.notes.map(normalizeNote),
    pomodoroCycles: Array.isArray(workspace.pomodoroCycles) ? workspace.pomodoroCycles.map(normalizePomodoroCycle) : [],
    events: mergePlansIntoEvents(existingEvents.map(normalizeEvent), plans),
    plans: [],
    sessions: normalizeSessions(
      workspace.sessions,
      Array.isArray(workspace.pomodoroCycles) ? workspace.pomodoroCycles.map(normalizePomodoroCycle) : [],
    ),
    settings: { ...createDefaultSettings(), ...workspace.settings },
  };
}

/**
 * Fold legacy task-linked plans into the unified events list. The derived event
 * id is deterministic, so re-running the migration (e.g. on every sync pull
 * while stale plan rows linger on the server) never creates duplicates.
 */
function mergePlansIntoEvents(events: CalendarEvent[], plans: CalendarPlan[]): CalendarEvent[] {
  const existingIds = new Set(events.map((event) => event.id));
  const converted: CalendarEvent[] = [];

  for (const plan of plans) {
    const id = `evt_plan_${plan.id}`;
    if (existingIds.has(id)) {
      continue;
    }

    converted.push({
      id,
      title: plan.title,
      description: "",
      location: "",
      startsAt: plan.startsAt,
      endsAt: plan.endsAt,
      allDay: false,
      kind: plan.kind,
      taskId: plan.taskId,
      projectId: null,
      source: "manual",
      externalUid: null,
      createdAt: plan.createdAt,
      updatedAt: plan.createdAt,
    });
  }

  return [...converted, ...events];
}

function normalizeEvent(event: CalendarEvent): CalendarEvent {
  return {
    ...event,
    projectId: event.projectId ?? null,
  };
}

function normalizeTask(task: LegacyTask): Task {
  return {
    ...task,
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    recurrence: task.recurrence ?? null,
    recurrenceParentId: task.recurrenceParentId ?? null,
    // Derived from creation time so migrated boards keep newest-first order.
    boardOrder: task.boardOrder ?? -(Date.parse(task.createdAt) || 0),
  };
}

function normalizeChecklistItem(item: LegacyChecklistItem): ChecklistItem {
  return {
    ...item,
    templateId: item.templateId ?? null,
  };
}

function normalizeNote(note: LegacyNote): Note {
  return {
    ...note,
    dayKey: note.dayKey ?? null,
    editHistory: Array.isArray(note.editHistory)
      ? note.editHistory.map((entry) => normalizeNoteEditEntry(entry, note.updatedAt))
      : [],
  };
}

function normalizeNoteEditEntry(entry: LegacyNoteEditEntry, fallbackEditedAt: string): NoteEditEntry {
  if ("editedAt" in entry && typeof entry.editedAt === "string") {
    return {
      id: entry.id,
      editedAt: entry.editedAt,
    };
  }

  const legacyEntry = entry as Exclude<LegacyNoteEditEntry, NoteEditEntry>;

  return {
    id: entry.id ?? createId("note_edit"),
    editedAt: legacyEntry.endedAt ?? legacyEntry.startedAt ?? fallbackEditedAt,
  };
}

function normalizePomodoroCycle(cycle: LegacyPomodoroCycle): PomodoroCycle {
  return {
    ...cycle,
    completedShortBreakCount: cycle.completedShortBreakCount ?? 0,
    completedLongBreakCount: cycle.completedLongBreakCount ?? 0,
  };
}

function normalizeSessions(sessions: TimeSession[], cycles: PomodoroCycle[]): TimeSession[] {
  const cyclesById = new Map(cycles.map((cycle) => [cycle.id, cycle]));

  return sessions.map((session) => {
    if (session.mode !== "pomodoro" || !session.pomodoroCycleId) {
      return session;
    }

    const cycle = cyclesById.get(session.pomodoroCycleId);
    if (!cycle) {
      return session;
    }

    const maxMinutes = Math.max(1, cycle.focusMinutes);
    const currentMinutes = Number.isFinite(session.durationMinutes)
      ? session.durationMinutes
      : Math.max(0, Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 60000));

    if (currentMinutes <= maxMinutes) {
      return session;
    }

    return {
      ...session,
      durationMinutes: maxMinutes,
      endedAt: addMinutesIso(session.startedAt, maxMinutes),
    };
  });
}
