const BUILD_ID = "__PRODNOTE_BUILD_ID__";
const CACHE_NAME = `prodnote-${BUILD_ID}`;
const INDEX_URL = new URL("index.html", self.registration.scope).pathname;
const APP_SHELL = [
  "",
  "index.html",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
].map(
  (path) => new URL(path, self.registration.scope).pathname,
);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("prodnote-") && key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, INDEX_URL));
    return;
  }

  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(networkFirst(event.request));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ProdNote", body: event.data ? event.data.text() : "" };
  }

  const hash = typeof data.hash === "string" ? data.hash : "#/planner/today";
  event.waitUntil(
    self.registration.showNotification(data.title ?? "ProdNote", {
      body: data.body ?? "",
      tag: data.tag ?? "prodnote-push",
      icon: new URL("icons/icon-192.png", self.registration.scope).pathname,
      badge: new URL("icons/icon-192.png", self.registration.scope).pathname,
      data: { url: `${INDEX_URL}${hash}` },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url ?? `${INDEX_URL}#/focus`, self.registration.scope).href;
  event.waitUntil(focusOrOpenClient(targetUrl));
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    return (await cache.match(request)) ?? (fallbackUrl ? await cache.match(fallbackUrl) : undefined) ?? Response.error();
  }
}

async function focusOrOpenClient(targetUrl) {
  const target = new URL(targetUrl);
  const clientsList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of clientsList) {
    const clientUrl = new URL(client.url);
    const isSameApp = clientUrl.origin === target.origin;
    if (!isSameApp) {
      continue;
    }

    if ("focus" in client) {
      await client.focus();
    }

    if ("postMessage" in client) {
      client.postMessage({
        type: "prodnote-open-url",
        url: targetUrl,
        hash: target.hash || "#/focus",
      });
    }

    if (clientUrl.pathname !== target.pathname && "navigate" in client) {
      try {
        await client.navigate(targetUrl);
      } catch {
        // Fall through to openWindow below if needed.
      }
    }

    return;
  }

  if (self.clients.openWindow) {
    await self.clients.openWindow(targetUrl);
  }
}
