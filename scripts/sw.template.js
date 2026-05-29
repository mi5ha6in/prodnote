const BUILD_ID = "__PRODNOTE_BUILD_ID__";
const CACHE_NAME = `prodnote-${BUILD_ID}`;
const INDEX_URL = new URL("index.html", self.registration.scope).pathname;
const APP_SHELL = ["", "index.html", "manifest.webmanifest", "icons/icon.svg"].map(
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
