/**
 * Refresh subscribed ICS calendars through the server proxy (browser CORS
 * blocks direct feed fetches). Stale = older than an hour; `force` refreshes
 * everything, e.g. from the «Обновить» button.
 */

import { parseIcs } from "../domain/ics";
import { appStore } from "../state";
import { listIcsSubscriptions, touchIcsSubscription } from "../storage/ics-subscriptions";
import { getSyncServerUrl } from "../sync/client";

const STALE_MS = 60 * 60 * 1000;

export interface IcsRefreshResult {
  refreshed: number;
  errors: string[];
}

export async function refreshIcsSubscriptions(force = false): Promise<IcsRefreshResult> {
  const serverUrl = getSyncServerUrl();
  const result: IcsRefreshResult = { refreshed: 0, errors: [] };
  if (!serverUrl) {
    return result;
  }

  const now = Date.now();
  for (const subscription of listIcsSubscriptions()) {
    const last = subscription.lastSyncedAt ? Date.parse(subscription.lastSyncedAt) : 0;
    if (!force && now - last < STALE_MS) {
      continue;
    }

    try {
      const response = await fetch(`${serverUrl}/api/ics-proxy?url=${encodeURIComponent(subscription.url)}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      const parsed = parseIcs(await response.text());
      await appStore.syncSubscribedEvents(subscription.id, parsed);
      touchIcsSubscription(subscription.id, new Date().toISOString());
      result.refreshed += 1;
    } catch (error) {
      result.errors.push(`${subscription.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}
