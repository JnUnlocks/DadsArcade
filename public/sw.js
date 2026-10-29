/**
 * Service worker for Dad's Arcade.
 *
 * Goal: the game must launch and play with no network at all. Scores recorded
 * offline queue up in localStorage and sync when the connection returns, which
 * is handled in the app, not here.
 *
 * Bump CACHE_VERSION on any release that changes the shell.
 */

const CACHE_VERSION = "dads-arcade-v34";

/**
 * Enough to boot offline; hashed build assets are cached on first visit.
 *
 * Word Voltage's puzzle pack is here too, so every level and every Daily
 * Charge plays offline even on a phone that never opened the cabinet while it
 * had signal. Its name carries its version (pack-v4.json) and it never
 * changes once released, so caching it for good is safe.
 */
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/word-voltage/pack-v4.json",
];

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

/*
 * Daily reminders (worker/push.ts). The push arrives empty on purpose, so the
 * words live here. Every push must show a notification: Safari and Chrome
 * both cancel a subscription that receives pushes it doesn't show.
 */
self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("Dad's Arcade", {
      body: "Today's puzzles are waiting. A couple of minutes keeps your streak going.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "daily-reminder",
    }),
  );
});

// Tapping it opens the arcade, or brings the open one to the front.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow("/");
    }),
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

  // The admin dashboard is worker-rendered, not a built asset, and should
  // never be servable offline from a stale cache -- always hit the network.
  if (url.pathname === "/admin") return;

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
