import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { createStarterWorkspace } from "../domain/defaults";
import { migrateWorkspace } from "../domain/migrations";
import type { Workspace } from "../domain/types";
import { replaceWorkspace } from "../storage/idb";

const CONFIG_KEY = "prodnote-sync-config";
const META_KEY = "prodnote-sync-meta";
const TOMBSTONES_KEY = "prodnote-sync-tombstones";
const DEVICE_KEY = "prodnote-sync-device";

type SyncStatus = "idle" | "syncing" | "offline" | "error";

export interface SyncUser {
  id: string;
  handle: string;
}

export interface SyncState {
  authenticated: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  serverRevision: number;
  serverUrl: string;
  status: SyncStatus;
  user: SyncUser | null;
}

export interface SyncPullResult {
  changed: boolean;
  workspace: Workspace;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let pushTimer: number | null = null;
let state: SyncState = {
  authenticated: false,
  error: null,
  lastSyncedAt: readMeta().lastSyncedAt,
  serverRevision: readMeta().serverRevision,
  serverUrl: readConfig().serverUrl,
  status: "idle",
  user: null,
};

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSyncState(): SyncState {
  return state;
}

export function getSyncServerUrl(): string {
  return state.serverUrl;
}

export function setSyncServerUrl(serverUrl: string): void {
  const normalized = normalizeServerUrl(serverUrl);
  writeConfig({ serverUrl: normalized });
  setState({ serverUrl: normalized, error: null });
}

export async function refreshSyncSession(): Promise<void> {
  if (!state.serverUrl) {
    return;
  }

  try {
    const result = await api<{ authenticated: boolean; user: SyncUser | null }>("/api/me");
    setState({
      authenticated: result.authenticated,
      user: result.user,
      error: null,
      status: "idle",
    });
  } catch (error) {
    setState({
      authenticated: false,
      user: null,
      error: formatSyncError(error),
      status: "offline",
    });
  }
}

export async function registerPasskey(): Promise<void> {
  setState({ status: "syncing", error: null });
  const optionsResponse = await api<{ challengeId: string; options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>(
    "/api/auth/passkey/register/options",
    { method: "POST" },
  );
  const response = await startRegistration({ optionsJSON: optionsResponse.options });
  await api("/api/auth/passkey/register/verify", {
    method: "POST",
    body: JSON.stringify({
      challengeId: optionsResponse.challengeId,
      response,
    }),
  });
  await refreshSyncSession();
}

export async function loginPasskey(): Promise<void> {
  setState({ status: "syncing", error: null });
  const optionsResponse = await api<{ challengeId: string; options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>(
    "/api/auth/passkey/login/options",
    { method: "POST" },
  );
  const response = await startAuthentication({ optionsJSON: optionsResponse.options });
  await api("/api/auth/passkey/login/verify", {
    method: "POST",
    body: JSON.stringify({
      challengeId: optionsResponse.challengeId,
      response,
    }),
  });
  await refreshSyncSession();
}

export async function logoutSync(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
  setState({ authenticated: false, user: null, status: "idle", error: null });
}

export async function pullRemoteWorkspace(localWorkspace: Workspace): Promise<SyncPullResult> {
  if (!state.authenticated) {
    return { changed: false, workspace: localWorkspace };
  }

  try {
    setState({ status: "syncing", error: null });
    const remote = await api<{ serverRevision: number; workspace: Workspace }>("/api/workspace");
    const meta = readMeta();
    const merged = mergeWorkspaces(localWorkspace, remote.workspace, remote.serverRevision, meta.serverRevision);
    writeMeta({
      lastSyncedAt: new Date().toISOString(),
      serverRevision: remote.serverRevision,
    });
    setState({
      lastSyncedAt: readMeta().lastSyncedAt,
      serverRevision: remote.serverRevision,
      status: "idle",
    });
    return { changed: JSON.stringify(merged) !== JSON.stringify(localWorkspace), workspace: merged };
  } catch (error) {
    setState({ status: "offline", error: formatSyncError(error) });
    return { changed: false, workspace: localWorkspace };
  }
}

export async function pushWorkspace(workspace: Workspace): Promise<void> {
  if (!state.authenticated) {
    return;
  }

  try {
    setState({ status: "syncing", error: null });
    const meta = readMeta();
    const result = await api<{ serverRevision: number }>("/api/workspace", {
      method: "PUT",
      body: JSON.stringify({
        schemaVersion: workspace.schemaVersion,
        baseRevision: meta.serverRevision,
        deviceId: getDeviceId(),
        workspace,
        deletedEntities: readTombstones(),
      }),
    });
    clearTombstones();
    writeMeta({
      lastSyncedAt: new Date().toISOString(),
      serverRevision: result.serverRevision,
    });
    setState({
      lastSyncedAt: readMeta().lastSyncedAt,
      serverRevision: result.serverRevision,
      status: "idle",
    });
  } catch (error) {
    setState({ status: "offline", error: formatSyncError(error) });
  }
}

export function queueWorkspacePush(workspace: Workspace): void {
  if (!state.authenticated) {
    return;
  }

  if (pushTimer !== null) {
    window.clearTimeout(pushTimer);
  }

  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void pushWorkspace(workspace);
  }, 1500);
}

export async function syncNow(workspace: Workspace): Promise<Workspace> {
  await refreshSyncSession();
  const pulled = await pullRemoteWorkspace(workspace);
  if (pulled.changed) {
    await replaceWorkspace(pulled.workspace);
  }
  await pushWorkspace(pulled.workspace);
  return pulled.workspace;
}

export type SyncEntityType =
  | "project"
  | "tag"
  | "task"
  | "note"
  | "checklistItem"
  | "session"
  | "pomodoroCycle"
  | "plan"
  | "event";

const SYNC_ENTITY_TYPES: readonly SyncEntityType[] = [
  "project",
  "tag",
  "task",
  "note",
  "checklistItem",
  "session",
  "pomodoroCycle",
  "plan",
  "event",
];

export function recordSyncDeletion(type: SyncEntityType, id: string): void {
  if (!hasBrowserStorage()) {
    return;
  }

  const tombstones = readTombstones();
  tombstones.push({
    type,
    id,
    deletedAt: new Date().toISOString(),
  });
  localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(tombstones));
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${state.serverUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(await formatApiError(response));
  }

  return (await response.json()) as T;
}

async function formatApiError(response: Response): Promise<string> {
  const fallback = `Sync request failed: ${response.status}`;

  try {
    const body = (await response.json()) as Partial<{ details: string; error: string }>;
    const message = body.details ?? body.error;
    return message ? `${fallback} (${message})` : fallback;
  } catch {
    return fallback;
  }
}

export function mergeWorkspaces(local: Workspace, remote: Workspace, remoteRevision: number, lastRevision: number): Workspace {
  return migrateWorkspace({
    ...createStarterWorkspace(),
    ...local,
    schemaVersion: Math.max(local.schemaVersion, remote.schemaVersion),
    exportedAt: null,
    projects: mergeById(local.projects, remote.projects, (item) => item.updatedAt),
    tags: mergeById(local.tags, remote.tags, (item) => item.id),
    tasks: mergeById(local.tasks, remote.tasks, (item) => item.updatedAt),
    notes: mergeById(local.notes, remote.notes, (item) => item.updatedAt),
    checklist: mergeById(local.checklist ?? [], remote.checklist ?? [], (item) => item.updatedAt),
    sessions: mergeById(local.sessions, remote.sessions, (item) => item.endedAt),
    pomodoroCycles: mergeById(local.pomodoroCycles, remote.pomodoroCycles, (item) => item.startedAt),
    plans: mergeById(local.plans, remote.plans, (item) => item.createdAt),
    events: mergeById(local.events ?? [], remote.events ?? [], (item) => item.updatedAt),
    settings: remoteRevision > lastRevision ? remote.settings : local.settings,
  });
}

function mergeById<T extends { id: string }>(local: T[], remote: T[], getTimestamp: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of remote) {
    map.set(item.id, item);
  }
  for (const item of local) {
    const existing = map.get(item.id);
    if (!existing || Date.parse(getTimestamp(item)) > Date.parse(getTimestamp(existing))) {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
}

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

function readConfig(): { serverUrl: string } {
  if (!hasBrowserStorage()) {
    return { serverUrl: "" };
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "{}") as Partial<{ serverUrl: string }>;
    return { serverUrl: normalizeConfiguredServerUrl(parsed.serverUrl ?? getDefaultServerUrl()) };
  } catch {
    return { serverUrl: getDefaultServerUrl() };
  }
}

function writeConfig(config: { serverUrl: string }): void {
  if (!hasBrowserStorage()) {
    return;
  }

  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function readMeta(): { lastSyncedAt: string | null; serverRevision: number } {
  if (!hasBrowserStorage()) {
    return { lastSyncedAt: null, serverRevision: 0 };
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(META_KEY) ?? "{}") as Partial<{
      lastSyncedAt: string | null;
      serverRevision: number;
    }>;
    return {
      lastSyncedAt: parsed.lastSyncedAt ?? null,
      serverRevision: parsed.serverRevision ?? 0,
    };
  } catch {
    return { lastSyncedAt: null, serverRevision: 0 };
  }
}

function writeMeta(meta: { lastSyncedAt: string; serverRevision: number }): void {
  if (!hasBrowserStorage()) {
    return;
  }

  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function readTombstones(): Array<{ type: SyncEntityType; id: string; deletedAt: string }> {
  if (!hasBrowserStorage()) {
    return [];
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(TOMBSTONES_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is { type: SyncEntityType; id: string; deletedAt: string } =>
        SYNC_ENTITY_TYPES.includes(item?.type) && typeof item.id === "string" && typeof item.deletedAt === "string",
    );
  } catch {
    return [];
  }
}

function clearTombstones(): void {
  if (!hasBrowserStorage()) {
    return;
  }

  localStorage.removeItem(TOMBSTONES_KEY);
}

function getDeviceId(): string {
  if (!hasBrowserStorage()) {
    return "server-test-device";
  }

  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function normalizeConfiguredServerUrl(value: string): string {
  const normalized = normalizeServerUrl(value);
  if (typeof window === "undefined") {
    return normalized;
  }

  if (window.location.hostname === "localhost" && normalized === "http://127.0.0.1:8787") {
    return "http://localhost:8787";
  }

  if (import.meta.env.DEV && isViteDevServer(window.location) && normalized === window.location.origin) {
    return getDefaultServerUrl();
  }

  return normalized;
}

function formatSyncError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasBrowserStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function getDefaultServerUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }

  if (import.meta.env.DEV && isViteDevServer(window.location)) {
    return "http://localhost:8787";
  }

  return window.location.origin;
}

function isViteDevServer(location: Location): boolean {
  return ["5173", "5174", "5175", "5176", "5177", "5178", "5179"].includes(location.port);
}
