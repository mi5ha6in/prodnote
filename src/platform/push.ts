/**
 * Web Push subscription management for this device. The subscription itself
 * is device-specific; the server stores it and delivers reminders even when
 * the app tab is closed. Requires the sync server with VAPID keys configured.
 */

import { getSyncServerUrl } from "../sync/client";

export type PushStatus = "unsupported" | "server-off" | "denied" | "off" | "on";

export function isPushSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) {
    return null;
  }
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) {
    return "unsupported";
  }
  if (Notification.permission === "denied") {
    return "denied";
  }

  const registration = await getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    return "on";
  }

  try {
    const meta = await api<{ enabled: boolean }>("/api/push/public-key");
    return meta.enabled ? "off" : "server-off";
  } catch {
    return "server-off";
  }
}

export async function enablePush(): Promise<PushStatus> {
  const registration = await getRegistration();
  if (!registration) {
    return "unsupported";
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return "denied";
  }

  const meta = await api<{ publicKey: string | null; enabled: boolean }>("/api/push/public-key");
  if (!meta.enabled || !meta.publicKey) {
    return "server-off";
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(meta.publicKey),
  });
  await api("/api/push/subscription", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
  return "on";
}

export async function disablePush(): Promise<PushStatus> {
  const registration = await getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) {
    return "off";
  }

  await api("/api/push/subscription", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);
  await subscription.unsubscribe();
  return "off";
}

async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getSyncServerUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Push request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}
