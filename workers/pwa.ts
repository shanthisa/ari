// PWA assets served directly by the Worker (we have no static-assets binding for
// arbitrary files). Kept tiny and dependency-free.

export const MANIFEST = JSON.stringify({
  name: "Ari — contact capture",
  short_name: "Ari",
  description: "Capture the people you meet at events in seconds.",
  // Launching the installed app drops you straight into event mode.
  start_url: "/app/capture",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#faf8f3",
  theme_color: "#1a1a1a",
  // ⭐ emoji icon via fav.farm (matches the "Ari✱" wordmark).
  icons: [
    {
      src: "https://fav.farm/%E2%AD%90",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    },
  ],
});

// Defensive service worker: never caches the API (private, auth'd), serves
// immutable build assets cache-first, and navigations network-first with a
// cached fallback when offline. Can't serve stale content while online.
export const SERVICE_WORKER = `
const CACHE = "ari-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache private data
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })());
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        return (
          (await caches.match(req)) ||
          (await caches.match("/app")) ||
          new Response("You are offline.", {
            status: 503,
            headers: { "content-type": "text/plain" },
          })
        );
      }
    })());
  }
});
`;
