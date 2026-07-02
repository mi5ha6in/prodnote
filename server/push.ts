import webPush from "web-push";
import type { ServerConfig } from "./config";
import { createUuid } from "./crypto";
import { sqlClient } from "./db/client";
import { toSqlTimestamp } from "./db/timestamps";
import { collectPushAlerts } from "./push-alerts";
import { getSyncedWorkspace } from "./workspace";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

type Row = Record<string, unknown>;

export function isPushConfigured(config: ServerConfig): boolean {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey);
}

export function configureWebPush(config: ServerConfig): void {
  if (isPushConfigured(config)) {
    webPush.setVapidDetails(config.vapidSubject, config.vapidPublicKey ?? "", config.vapidPrivateKey ?? "");
  }
}

export async function savePushSubscription(userId: string, subscription: PushSubscriptionInput): Promise<void> {
  await sqlClient`
    insert into push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
    values (${createUuid()}, ${userId}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth}, ${toSqlTimestamp(new Date())})
    on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `;
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  await sqlClient`delete from push_subscriptions where user_id = ${userId} and endpoint = ${endpoint}`;
}

/** Delivered reminder keys per user, so a restart is the only way to re-notify. */
const sentKeysByUser = new Map<string, Set<string>>();
let sentKeysDay = "";

function sentKeys(userId: string, today: string): Set<string> {
  // Daily reset keeps the set from growing forever.
  if (sentKeysDay !== today) {
    sentKeysByUser.clear();
    sentKeysDay = today;
  }
  const keys = sentKeysByUser.get(userId) ?? new Set<string>();
  sentKeysByUser.set(userId, keys);
  return keys;
}

/**
 * One scheduler tick: for every user with subscriptions, compute due
 * reminders from their workspace and push the not-yet-delivered ones.
 */
export async function runPushTick(now = new Date()): Promise<void> {
  const rows = await sqlClient<Row[]>`
    select user_id, endpoint, p256dh, auth from push_subscriptions
  `;
  if (!rows.length) {
    return;
  }

  const byUser = new Map<string, Row[]>();
  for (const row of rows) {
    const userId = String(row.user_id);
    byUser.set(userId, [...(byUser.get(userId) ?? []), row]);
  }

  const today = now.toISOString().slice(0, 10);
  for (const [userId, subscriptions] of byUser) {
    const { workspace } = await getSyncedWorkspace(userId);
    const alerts = collectPushAlerts(workspace, now.getTime());
    const delivered = sentKeys(userId, today);

    for (const alert of alerts) {
      if (delivered.has(alert.key)) {
        continue;
      }
      delivered.add(alert.key);

      const payload = JSON.stringify({ title: alert.title, body: alert.body, hash: alert.hash, tag: alert.key });
      for (const subscription of subscriptions) {
        try {
          await webPush.sendNotification(
            {
              endpoint: String(subscription.endpoint),
              keys: { p256dh: String(subscription.p256dh), auth: String(subscription.auth) },
            },
            payload,
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // The browser dropped the subscription — clean up the dead endpoint.
            await sqlClient`delete from push_subscriptions where endpoint = ${String(subscription.endpoint)}`;
          } else {
            console.error("[push:error]", { statusCode, error: String(error) });
          }
        }
      }
    }
  }
}
