// Ora web app: works offline. Everything the app needs is cached at install; a new version is
// fetched in the background and takes over when you tap «بارگذاری دوباره» (or on the next start).
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `ora-${VERSION}`;

self.addEventListener('install', (e) => {
  // Some hosts answer index.html with a redirect to the folder (Cloudflare does). A redirected
  // response cannot be served for a page load, so store a clean copy of each file instead.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(FILES.map(async (f) => {
      const res = await fetch(f, { cache: 'reload' });
      if (!res.ok) throw new Error(`${f}: ${res.status}`);
      await c.put(f, res.redirected ? new Response(await res.blob(), { status: 200, headers: res.headers }) : res);
    }));
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('ora-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // only this app's own files; the API, weather, poetry etc. always go to the network
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(new URL('./', location).pathname)) return;
  if (url.pathname.includes('/api/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const isPage = e.request.mode === 'navigate';
    const hit = await cache.match(isPage ? './index.html' : e.request, { ignoreSearch: isPage });
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      // fonts and other files not cached at install are kept once used, for offline next time
      if (res.ok && !isPage) cache.put(e.request, res.clone()).catch(() => {});
      return res;
    } catch { return (await cache.match('./index.html')) ?? Response.error(); }
  })());
});

// Reminders sent by the page while it is open show as system notifications.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow('./');
  })());
});
