/**
 * Service worker for Dad's Arcade.
 *
 * Goal: the game must launch and play with no network at all. Scores recorded
 * offline queue up in localStorage and sync when the connection returns, which
 * is handled in the app, not here.
 *
 * Bump CACHE_VERSION on any release that changes the shell.
 */

const CACHE_VERSION = "dads-arcade-v8";

/** Enough to boot offline; hashed build assets are cached on first visit. */
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // Individually, so one 404 doesn't fail the whole install.
      .then((cache) =>
        Promise.allSettled(APP_SHELL.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Leaderboard data is never cached -- a stale high-score table is worse than
  // no table, and the app already handles a failed request by queueing.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: try the network so updates land, fall back to the cached
  // shell so the game still opens on a plane.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/").then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Static assets are content-hashed by the build, so cache-first is safe and
  // makes repeat launches instant.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
