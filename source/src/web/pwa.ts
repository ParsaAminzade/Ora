// The web/phone app: register the offline service worker (public-web/app-sw.js), keep it up to date,
// and open the home-screen shortcuts (?open=schedule|coach).
//
// A new version must never be missed:
// · it is looked for when the app opens, every time you come back to it, and every hour while open
// · ready when the app has just opened, or when you come back after a while: it is taken at once
//   (one quick reload, before you have touched anything)
// · ready while you are using the app: a small bar stays until you tap «بارگذاری دوباره»
//   (ui/Update.tsx), and it comes back each time you return to the app
const ready = (apply: () => void) => {
  (globalThis as { oraWebUpdate?: () => void }).oraWebUpdate = apply; // for a bar that mounts later
  dispatchEvent(new CustomEvent('ora:web-update-ready', { detail: { apply } }));
};

export function startPwa() {
  const open = new URLSearchParams(location.search).get('open');
  if (open === 'schedule' || open === 'coach') {
    window.setTimeout(() => dispatchEvent(new CustomEvent(`ora:${open}`, { detail: {} })), 900);
    history.replaceState(null, '', location.pathname);
  }
  if (!('serviceWorker' in navigator) || !/^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(location.origin)) return;
  let reloaded = false;
  let touchedAt = 0;
  let hiddenAt = 0;
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { touchedAt = Date.now(); }, { capture: true, passive: true });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.register('./app-sw.js').then((reg) => {
    const apply = () => reg.waiting?.postMessage('skip-waiting');
    // nothing you are in the middle of: the app has only just opened and you haven't touched it yet
    const idle = () => performance.now() < 6000 && !touchedAt;
    const handle = () => {
      if (!reg.waiting || !navigator.serviceWorker.controller) return;
      if (idle() || document.visibilityState === 'hidden') apply();
      else ready(apply);
    };
    handle();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') handle(); });
    });
    const check = () => reg.update().catch(() => {}).finally(handle);
    window.setInterval(check, 3600_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      // back after a while (more than a minute away): a waiting version is taken right away
      if (reg.waiting && hiddenAt && Date.now() - hiddenAt > 60_000) { apply(); return; }
      void check();
    });
  }).catch(() => {});
}
