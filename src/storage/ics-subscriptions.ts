/**
 * Per-device list of subscribed ICS calendar URLs. Device-local by design
 * (like the active timer): the fetched events sync as regular events, the
 * URLs themselves stay on the device that added them.
 */

export interface IcsSubscription {
  id: string;
  name: string;
  url: string;
  lastSyncedAt: string | null;
}

const STORAGE_KEY = "prodnote-ics-subscriptions";

export function listIcsSubscriptions(): IcsSubscription[] {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is IcsSubscription =>
        typeof item?.id === "string" && typeof item.name === "string" && typeof item.url === "string",
    );
  } catch {
    return [];
  }
}

export function addIcsSubscription(name: string, url: string): IcsSubscription {
  const subscription: IcsSubscription = {
    id: `icssub_${crypto.randomUUID()}`,
    name: name.trim() || new URL(url).hostname,
    url: url.trim(),
    lastSyncedAt: null,
  };
  write([...listIcsSubscriptions(), subscription]);
  return subscription;
}

export function removeIcsSubscription(id: string): void {
  write(listIcsSubscriptions().filter((subscription) => subscription.id !== id));
}

export function touchIcsSubscription(id: string, syncedAt: string): void {
  write(
    listIcsSubscriptions().map((subscription) =>
      subscription.id === id ? { ...subscription, lastSyncedAt: syncedAt } : subscription,
    ),
  );
}

function write(subscriptions: IcsSubscription[]): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
  }
}
