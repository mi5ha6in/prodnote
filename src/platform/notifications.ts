export type TimerNotificationStatus = NotificationPermission | "unsupported";

export function getTimerNotificationStatus(): TimerNotificationStatus {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export async function requestTimerNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }

  if (Notification.permission === "default") {
    return Notification.requestPermission();
  }

  return Notification.permission;
}

export async function showTimerNotification(input: { title: string; body: string }): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const icon = `${import.meta.env.BASE_URL}icons/icon.svg`;
  const options: NotificationOptions = {
    body: input.body,
    icon,
    badge: icon,
    tag: "prodnote-timer",
    requireInteraction: true,
  };

  const registration = await getReadyServiceWorker();
  if (registration) {
    await registration.showNotification(input.title, options);
    return;
  }

  new Notification(input.title, options);
}

async function getReadyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}
