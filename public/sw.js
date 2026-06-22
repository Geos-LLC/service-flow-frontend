/* ServiceFlow service worker — push notifications + offline shell.
 *
 * Cache strategy:
 *   - Install:   precache the app shell (index.html, manifest, logos).
 *   - Activate:  drop any caches not on the current version constants.
 *   - Fetch (same-origin, GET):
 *       /static/* (CRA hash-named assets) → cache-first (immutable)
 *       navigation requests              → network-first, fallback to cached /index.html
 *       other same-origin GETs           → network-first, fallback to runtime cache
 *   - Cross-origin (API / Supabase / etc) → pass through, never intercept.
 *       Stale API data in cache would silently corrupt the UI; going
 *       offline just fails the API call cleanly so the React layer can
 *       show whatever error state it already has.
 *   - Non-GET (POST/PUT/PATCH/DELETE)    → pass through.
 *
 * Update behaviour: skipWaiting + clients.claim → new SW takes over on
 * the next navigation. No "new version available" prompt yet.
 *
 * Bump these cache version constants on every meaningful SW edit so the
 * activate handler purges old entries.
 */

const SHELL_CACHE_VERSION   = 'sf-shell-v1';
const RUNTIME_CACHE_VERSION = 'sf-runtime-v1';
const ACTIVE_CACHES = new Set([SHELL_CACHE_VERSION, RUNTIME_CACHE_VERSION]);

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !ACTIVE_CACHES.has(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Cross-origin (API / Supabase / 3rd-party) — never intercept.
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first, fallback to cached shell so client-side
  // router can take over from the shell once it's painted.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (_) {
        const shell = await caches.open(SHELL_CACHE_VERSION);
        const cached = await shell.match('/index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // /static/* — CRA emits hashed filenames here. Safe cache-first.
  if (url.pathname.startsWith('/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE_VERSION);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        return Response.error();
      }
    })());
    return;
  }

  // Other same-origin GETs (favicon, images, etc) — network-first with
  // runtime-cache fallback. We don't touch /api/* because the app
  // proxies API calls cross-origin to the Railway backend.
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh.ok) {
        const cache = await caches.open(RUNTIME_CACHE_VERSION);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (_) {
      const cache = await caches.open(RUNTIME_CACHE_VERSION);
      const cached = await cache.match(req);
      return cached || Response.error();
    }
  })());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: 'ServiceFlow', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'ServiceFlow';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/logo192.png',
    badge: payload.badge || '/logo192.png',
    data: payload.data || {},
    tag: payload.data?.jobId ? `job-${payload.data.jobId}` : undefined,
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = '/#/team-member/field-app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(target.replace('/#', '')) && 'focus' in w) return w.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
