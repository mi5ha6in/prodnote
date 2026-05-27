import { createStarterWorkspace } from "../domain/defaults";
import { migrateWorkspace } from "../domain/migrations";
import type { Workspace } from "../domain/types";

const DB_NAME = "prodnote-db";
const DB_VERSION = 1;
const META_KEY = "workspace";
const SETTINGS_KEY = "settings";

const ENTITY_STORES = ["projects", "tasks", "notes", "tags", "sessions", "pomodoroCycles", "plans"] as const;

type EntityStoreName = (typeof ENTITY_STORES)[number];

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      for (const storeName of ENTITY_STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }

      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Cannot open IndexedDB"));
  });
}

async function readStore<T>(db: IDBDatabase, storeName: EntityStoreName): Promise<T[]> {
  const transaction = db.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  return requestToPromise<T[]>(store.getAll());
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export async function loadWorkspace(): Promise<Workspace> {
  if (!isIndexedDbAvailable()) {
    return createStarterWorkspace();
  }

  const db = await openDatabase();
  const metaTransaction = db.transaction(["meta", "settings"], "readonly");
  const metaRequest = metaTransaction.objectStore("meta").get(META_KEY);
  const settingsRequest = metaTransaction.objectStore("settings").get(SETTINGS_KEY);
  const [meta, settings] = await Promise.all([
    requestToPromise<{ schemaVersion: number; exportedAt: string | null } | undefined>(metaRequest),
    requestToPromise<Workspace["settings"] | undefined>(settingsRequest),
  ]);

  if (!meta) {
    const workspace = createStarterWorkspace();
    await saveWorkspace(workspace);
    return workspace;
  }

  const [projects, tasks, notes, tags, sessions, pomodoroCycles, plans] = await Promise.all([
    readStore<Workspace["projects"][number]>(db, "projects"),
    readStore<Workspace["tasks"][number]>(db, "tasks"),
    readStore<Workspace["notes"][number]>(db, "notes"),
    readStore<Workspace["tags"][number]>(db, "tags"),
    readStore<Workspace["sessions"][number]>(db, "sessions"),
    readStore<Workspace["pomodoroCycles"][number]>(db, "pomodoroCycles"),
    readStore<Workspace["plans"][number]>(db, "plans"),
  ]);

  const workspace = migrateWorkspace({
    schemaVersion: meta.schemaVersion,
    exportedAt: meta.exportedAt ?? null,
    projects,
    tasks,
    notes,
    tags,
    sessions,
    pomodoroCycles,
    plans,
    settings: settings ?? createStarterWorkspace().settings,
  });

  if (workspace.schemaVersion !== meta.schemaVersion) {
    await saveWorkspace(workspace);
  }

  return workspace;
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  if (!isIndexedDbAvailable()) {
    return;
  }

  const db = await openDatabase();
  const transaction = db.transaction([...ENTITY_STORES, "settings", "meta"], "readwrite");

  for (const storeName of ENTITY_STORES) {
    const store = transaction.objectStore(storeName);
    store.clear();
    for (const item of workspace[storeName]) {
      store.put(item);
    }
  }

  transaction.objectStore("settings").put(workspace.settings, SETTINGS_KEY);
  transaction.objectStore("meta").put(
    {
      schemaVersion: workspace.schemaVersion,
      exportedAt: workspace.exportedAt,
    },
    META_KEY,
  );

  await transactionDone(transaction);
}

export async function replaceWorkspace(workspace: Workspace): Promise<void> {
  await saveWorkspace(workspace);
}
