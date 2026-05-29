import { createDefaultSettings, createId } from "./defaults";
import { SCHEMA_VERSION, type Note, type NoteEditEntry, type PomodoroCycle, type Workspace } from "./types";

type LegacyNoteEditEntry =
  | NoteEditEntry
  | {
      id?: string;
      startedAt?: string;
      endedAt?: string;
      durationMinutes?: number;
    };

type LegacyNote = Omit<Note, "editHistory"> & {
  editHistory?: LegacyNoteEditEntry[];
};

type LegacyPomodoroCycle = Omit<PomodoroCycle, "completedShortBreakCount" | "completedLongBreakCount"> &
  Partial<Pick<PomodoroCycle, "completedShortBreakCount" | "completedLongBreakCount">>;

type LegacyWorkspace = Omit<Workspace, "notes" | "pomodoroCycles" | "schemaVersion"> & {
  schemaVersion: number;
  notes: LegacyNote[];
  pomodoroCycles?: LegacyPomodoroCycle[];
};

export function migrateWorkspace(workspace: LegacyWorkspace): Workspace {
  if (workspace.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Неподдерживаемая версия схемы: ${workspace.schemaVersion}.`);
  }

  if (workspace.schemaVersion < 1) {
    throw new Error(`Неподдерживаемая версия схемы: ${workspace.schemaVersion}.`);
  }

  return {
    ...workspace,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: workspace.exportedAt ?? null,
    notes: workspace.notes.map(normalizeNote),
    pomodoroCycles: Array.isArray(workspace.pomodoroCycles) ? workspace.pomodoroCycles.map(normalizePomodoroCycle) : [],
    settings: workspace.settings ?? createDefaultSettings(),
  };
}

function normalizeNote(note: LegacyNote): Note {
  return {
    ...note,
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
