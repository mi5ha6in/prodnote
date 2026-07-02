/**
 * Automatic local snapshots of the workspace, stored in the same IndexedDB.
 * A local-first app must survive a dead browser profile step short of losing
 * everything: snapshots rotate (recent daily + older weekly) and can be
 * restored from settings via the regular import path.
 */

import type { Workspace } from "../domain/types";
import { stringifyExport } from "./export";
import { isIndexedDbAvailable, openDatabase, requestToPromise, transactionDone } from "./idb";

export interface BackupRecord {
  id: string;
  createdAt: string;
  /** Full `.prodnote.json` payload. */
  payload: string;
}

export interface BackupSummary {
  id: string;
  createdAt: string;
  sizeBytes: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const DAILY_KEEP = 7;
export const WEEKLY_KEEP = 4;

let lastAttemptMs = 0;

/**
 * Rotation: newest snapshot per day for the last `DAILY_KEEP` days, then the
 * newest per ISO-week for `WEEKLY_KEEP` weeks beyond that. Returns ids to drop.
 */
export function pruneBackups(records: Array<{ id: string; createdAt: string }>, now: Date): string[] {
  const keep = new Set<string>();
  const sorted = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const dailyCutoff = now.getTime() - DAILY_KEEP * DAY_MS;
  const weeklyCutoff = dailyCutoff - WEEKLY_KEEP * 7 * DAY_MS;
  const seenDays = new Set<string>();
  const seenWeeks = new Set<string>();

  for (const record of sorted) {
    const createdMs = Date.parse(record.createdAt);
    if (!Number.isFinite(createdMs) || createdMs < weeklyCutoff) {
      continue;
    }

    if (createdMs >= dailyCutoff) {
      const day = record.createdAt.slice(0, 10);
      if (!seenDays.has(day)) {
        seenDays.add(day);
        keep.add(record.id);
      }
      continue;
    }

    const week = `${Math.floor(createdMs / (7 * DAY_MS))}`;
    if (seenWeeks.has(week) || seenWeeks.size >= WEEKLY_KEEP) {
      continue;
    }
    seenWeeks.add(week);
    keep.add(record.id);
  }

  return records.filter((record) => !keep.has(record.id)).map((record) => record.id);
}

/** Write a snapshot at most once per hour; prune old ones afterwards. */
export async function maybeWriteBackup(workspace: Workspace, now = new Date()): Promise<void> {
  if (!isIndexedDbAvailable()) {
    return;
  }
  if (now.getTime() - lastAttemptMs < HOUR_MS) {
    return;
  }
  lastAttemptMs = now.getTime();

  const db = await openDatabase();
  const existing = await requestToPromise<BackupRecord[]>(
    db.transaction("backups", "readonly").objectStore("backups").getAll(),
  );
  const newest = existing.map((record) => record.createdAt).sort().at(-1);
  if (newest && now.getTime() - Date.parse(newest) < HOUR_MS) {
    return;
  }

  const record: BackupRecord = {
    id: `backup_${now.getTime()}`,
    createdAt: now.toISOString(),
    payload: stringifyExport(workspace),
  };
  const stale = pruneBackups([...existing, record], now);

  const transaction = db.transaction("backups", "readwrite");
  const store = transaction.objectStore("backups");
  store.put(record);
  for (const id of stale) {
    store.delete(id);
  }
  await transactionDone(transaction);
}

export async function listBackups(): Promise<BackupSummary[]> {
  if (!isIndexedDbAvailable()) {
    return [];
  }

  const db = await openDatabase();
  const records = await requestToPromise<BackupRecord[]>(
    db.transaction("backups", "readonly").objectStore("backups").getAll(),
  );
  return records
    .map((record) => ({ id: record.id, createdAt: record.createdAt, sizeBytes: record.payload.length }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readBackup(id: string): Promise<string | null> {
  if (!isIndexedDbAvailable()) {
    return null;
  }

  const db = await openDatabase();
  const record = await requestToPromise<BackupRecord | undefined>(
    db.transaction("backups", "readonly").objectStore("backups").get(id),
  );
  return record?.payload ?? null;
}

/** Test-only: reset the hourly throttle. */
export function resetBackupThrottleForTests(): void {
  lastAttemptMs = 0;
}
