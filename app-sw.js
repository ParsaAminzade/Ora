// Ora web app: works offline. Everything the app needs is cached at install; a new version is
// fetched in the background and takes over when you tap «بارگذاری دوباره» (or on the next start).
const VERSION = 'cf61a8026cd7';
const FILES = ["./","./app.webmanifest","./assets/ai-Bdw1Ef3T.js","./assets/dates-KBkGdMio.js","./assets/db-BepsHdCD.js","./assets/index-CFn5umtt.css","./assets/index-DQJn92f-.js","./assets/markdown-CLEEhsSJ.js","./assets/markdown-VvdwByQe.css","./assets/meanings-Dgtu1YaX.js","./assets/nova-sentences-C9Y0VbuM.js","./assets/pdf-EX3KQX08.js","./assets/pdf.worker.min-CjEcRF4W.mjs","./assets/pdf.worker.min-DI4FfYVf.js","./assets/planner-BMcShHDA.js","./assets/preload-helper-uBIymjUX.js","./assets/pwa-mf56G3oM.js","./assets/recurrence-Cu1sNjmU.js","./assets/schedule-D8djev-Y.js","./assets/state-B1_2zlRq.js","./assets/taskparse-D2Ujux3e.js","./assets/three-B8_0Ia1u.js","./bgframe.html","./icons/128.png","./icons/app-192.png","./icons/app-512.png","./icons/apple-180.png","./icons/maskable-512.png","./index.html","./sandbox.html"];
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

// Task reminders from the Ora server (Web Push). The browser opens the sealed message for us;
// the server never could. Buttons: «شروع» opens Ora, «۱۵ دقیقه بعد» asks the server to send the
// same sealed reminder again in 15 minutes.
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { t: e.data ? e.data.text() : 'اورآ' }; }
  e.waitUntil(self.registration.showNotification(m.t || 'اورآ', {
    body: m.b || '',
    tag: m.id || 'ora',
    renotify: true,
    dir: 'rtl',
    lang: 'fa',
    icon: './icons/app-192.png',
    badge: './icons/app-192.png',
    data: { id: m.id, s: m.s },
    actions: [{ action: 'start', title: 'شروع' }, { action: 'later', title: '۱۵ دقیقه بعد' }],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  if (e.action === 'later' && d.id && d.s) {
    e.waitUntil((async () => {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) await fetch(`${d.s}/api/push/snooze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint, id: d.id, minutes: 15 }) }).catch(() => {});
    })());
    return;
  }
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow('./');
  })());
});
