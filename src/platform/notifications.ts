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

export async function showTimerNotification(input: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const icon = `${import.meta.env.BASE_URL}icons/icon.svg`;
  const targetUrl = input.url ?? getTimerNotificationTargetUrl();
  const options: NotificationOptions = {
    body: input.body,
    icon,
    badge: icon,
    tag: input.tag ?? "prodnote-timer",
    requireInteraction: true,
    data: {
      url: targetUrl,
    },
  };

  const registration = await getReadyServiceWorker();
  if (registration) {
    await registration.showNotification(input.title, options);
    return;
  }

  const notification = new Notification(input.title, options);
  notification.onclick = () => {
    window.focus();
    if (window.location.href !== targetUrl) {
      window.location.href = targetUrl;
    }
    notification.close();
  };
}

async function getReadyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const currentRegistration = await navigator.serviceWorker.getRegistration();
    if (currentRegistration?.active) {
      return currentRegistration;
    }

    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 800)),
    ]);
  } catch {
    return null;
  }
}

function getTimerNotificationTargetUrl(): string {
  const focusRoute = new URL(import.meta.env.BASE_URL, window.location.origin);
  focusRoute.hash = "/focus";
  return focusRoute.toString();
}
