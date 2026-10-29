// The web/phone app: register the offline service worker (public-web/app-sw.js), offer a reload when
// a new version is ready, and open the home-screen shortcuts (?open=schedule|coach).
const say = (detail: object) => dispatchEvent(new CustomEvent('ora:say', { detail }));

export function startPwa() {
  const open = new URLSearchParams(location.search).get('open');
  if (open === 'schedule' || open === 'coach') {
    window.setTimeout(() => dispatchEvent(new CustomEvent(`ora:${open}`, { detail: {} })), 900);
    history.replaceState(null, '', location.pathname);
  }
  if (!('serviceWorker' in navigator) || !/^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(location.origin)) return;
  let reloaded = false;
  let touched = false;
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { touched = true; }, { once: true, capture: true });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.register('./app-sw.js').then((reg) => {
    const offer = (w: ServiceWorker) => window.setTimeout(() => say({
      text: 'نسخه‌ی تازه‌ی اورآ آماده است.',
      sticky: true,
      action: { label: 'بارگذاری دوباره', run: () => w.postMessage('skip-waiting') },
    }), 2500);
    // A new version waiting from last time: the app has only just opened, so take it now
    // (one quick reload) instead of asking. Later on, ask, so nothing jumps under your finger.
    const fresh = () => performance.now() < 6000 && !touched;
    if (reg.waiting && navigator.serviceWorker.controller) { if (fresh()) reg.waiting.postMessage('skip-waiting'); else offer(reg.waiting); }
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state !== 'installed' || !navigator.serviceWorker.controller) return;
        if (fresh() || document.visibilityState === 'hidden') w.postMessage('skip-waiting'); else offer(w);
      });
    });
    window.setInterval(() => void reg.update().catch(() => {}), 6 * 3600_000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
