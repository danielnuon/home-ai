/**
 * @file Brain's service worker: keeps the app shell cached so Brain opens instantly on the
 * phone, even on a slow cellular link (spec 7.1 principle 7, 7.17 "cached app shell").
 *
 * API calls and the event stream are never cached: stale status is worse than none, and the
 * pages already say when data is stale.
 */
const SHELL_CACHE = "brain-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/icon.svg"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }
  // Hashed build assets never change, so the cache can answer first; pages go to the network
  // first and fall back to the cached shell when offline.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ??
          fetch(event.request).then((response) => {
            // Never keep an error: a 404 cached during a deploy would be served forever.
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match("/")));
});
