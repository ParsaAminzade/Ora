// A new Ora version: a slim bar at the top of every new tab until you update (hide it for today if
// you must), a step-by-step update sheet, and a «done» note once the new version is running.
// The background worker (public/sw.js) also shows a system notification, even with no tab open.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fa } from '../core/dates';
import { kvGet } from '../core/kv';
import { APP_VERSION, IS_EXTENSION, IS_WEB_BUILD } from '../core/platform';
import { isNewer } from '../core/remote';
import { useStore } from '../core/state';
import { IconDownload, IconX } from './icons';

type Latest = { version: string; notes?: string; url?: string };
const HIDE = 'ora:update-bar-hidden';
const UPDATER = 'https://github.com/ParsaAminzade/Ora/raw/main/downloads/Ora-Update.cmd';
const LAST = 'ora:last-version';
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private */ } } };
const newer = (l: Latest | null | undefined): l is Latest => !!l?.version && APP_VERSION !== 'dev' && isNewer(l.version, APP_VERSION);
const say = (detail: object) => dispatchEvent(new CustomEvent('ora:say', { detail }));

async function known(): Promise<Latest | null> {
  // what the worker found last (checked every two hours), else what the last pack said
  try {
    if (IS_EXTENSION && chrome.storage?.local) {
      const { oraLatest } = await chrome.storage.local.get('oraLatest');
      if (newer(oraLatest as Latest)) return oraLatest as Latest;
    }
  } catch { /* not readable */ }
  const info = await kvGet<{ latest?: Latest | null }>('ora:pack-info');
  return newer(info?.latest) ? info!.latest! : null;
}
let ghTried = 0;
async function knownOrGithub(): Promise<Latest | null> {
  const k = await known();
  if (k || Date.now() - ghTried < 30 * 60_000) return k;
  ghTried = Date.now();
  const g = await githubLatest(); // Ora's server can be unreachable where GitHub isn't
  return newer(g) ? g : null;
}

function download(url: string) {
  // the zip goes straight to Downloads; for anything else (a Release page) open it
  if (IS_EXTENSION && chrome.downloads && /\.(zip|cmd)(\?|$)/i.test(url)) chrome.downloads.download({ url, saveAs: false }).catch(() => window.open(url, '_blank'));
  else window.open(url, '_blank', 'noopener');
}
function openExtensionsPage() {
  if (IS_EXTENSION) void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
}

function Sheet({ latest, onClose }: { latest: Latest; onClose(): void }) {
  const [got, setGot] = useState(false);
  return (
    <div className="dlg-backdrop upd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="به‌روزرسانی اورآ" className="upd-sheet glass">
        <header className="upd-head">
          <div>
            <h2>نسخه‌ی <bdi dir="ltr">{fa(latest.version)}</bdi> اورآ آمد</h2>
            <span className="faint">نسخه‌ی تو: <bdi dir="ltr">{fa(APP_VERSION)}</bdi> · حدود دو دقیقه</span>
          </div>
          <button className="icon-btn" aria-label="بستن" onClick={onClose}><IconX size={18} /></button>
        </header>
        {latest.notes && <p className="upd-notes">{latest.notes}</p>}
        <ol className="upd-steps">
          <li>
            <b>Ora-Update را بگیر و رویش دوبار کلیک کن</b>
            <span>یک فایل کوچک ویندوزی. از هر جا اجرایش کنی، پوشه‌ی اورآ را خودش پیدا می‌کند، نسخه‌ی تازه را می‌گیرد و جایگزین می‌کند. اورآ هم تا یک دقیقه بعد خودش دوباره بالا می‌آید.</span>
            <button className="btn btn-accent" onClick={() => { download(UPDATER); setGot(true); }}><IconDownload size={16} />{got ? 'دوباره بگیر' : 'دانلود Ora-Update'}</button>
            <span className="upd-hint">اگر کروم پرسید فایل نگه داشته شود، Keep. اگر ویندوز پرسید اجرا شود، More info و بعد Run anyway. این فایل داخل پوشه‌ی اورآ هم هست.</span>
          </li>
        </ol>
        <details className="upd-manual">
          <summary>Ora-Update را پیدا نمی‌کنی؟ دستی:</summary>
          <ol className="upd-steps">
            <li>
              <b>نسخه‌ی تازه را بگیر</b>
              <span>یک فایل zip در پوشه‌ی Downloads.</span>
              {latest.url && <button className="btn btn-accent" onClick={() => { download(latest.url!); setGot(true); }}><IconDownload size={16} />{got ? 'دوباره بگیر' : 'دانلود'}</button>}
            </li>
            <li>
              <b>روی پوشه‌ی فعلی اورآ باز کن</b>
              <span>روی فایل راست‌کلیک کن، Extract All، و مسیر را همان پوشه‌ای بگذار که اورآ الان در آن است. اگر پرسید فایل‌ها جایگزین شوند، بله. کارها و تنظیماتت جای دیگری ذخیره‌اند و دست نمی‌خورند.</span>
            </li>
            <li>
              <b>صبر کن یا دوباره بارگذاری کن</b>
              <span>اورآ تا یک دقیقه خودش بالا می‌آید؛ یا در صفحه‌ی افزونه‌ها روی کارت اورآ ↻ را بزن.</span>
              {IS_EXTENSION && <button className="btn" onClick={openExtensionsPage}>باز کردن صفحه‌ی افزونه‌ها</button>}
            </li>
          </ol>
        </details>
      </div>
    </div>
  );
}

// downloads/latest.json in Ora's GitHub repo, through whichever door answers (raw.githubusercontent
// is filtered in some places; the API and jsDelivr usually aren't)
const GH_LATEST: [string, Record<string, string>][] = [
  ['https://api.github.com/repos/ParsaAminzade/Ora/contents/downloads/latest.json', { Accept: 'application/vnd.github.raw' }],
  ['https://raw.githubusercontent.com/ParsaAminzade/Ora/main/downloads/latest.json', {}],
  ['https://cdn.jsdelivr.net/gh/ParsaAminzade/Ora@main/downloads/latest.json', {}],
];
async function githubLatest(): Promise<Latest | null> {
  for (const [u, headers] of GH_LATEST) {
    try {
      const r = await fetch(u, { cache: 'no-store', headers, signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const j = (await r.json()) as Latest;
      if (j?.version) return j;
    } catch { /* next door */ }
  }
  return null;
}

/** Throw away the copy the browser keeps for offline use and load the newest files. Tasks and notes
 *  live in the browser's database, not in that copy, so nothing of yours is touched. */
async function forceWebUpdate() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch { /* */ }
  try { for (const k of await caches.keys()) if (k.startsWith('ora-')) await caches.delete(k); } catch { /* */ }
  const u = new URL(location.href); u.searchParams.set('v', String(Date.now()));
  location.replace(u.toString());
}

/** The phone/web app: a new version is downloaded and waiting (one tap takes it), or GitHub says a
 *  newer one exists that this browser hasn't picked up yet (one tap fetches it fresh). */
function WebUpdateBar() {
  const [apply, setApply] = useState<(() => void) | null>(() => (globalThis as { oraWebUpdate?: () => void }).oraWebUpdate ?? null);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setApply(() => (e as CustomEvent<{ apply: () => void }>).detail.apply);
    addEventListener('ora:web-update-ready', on);
    // just updated? clean the address and say so once
    if (new URLSearchParams(location.search).has('v')) { const u = new URL(location.href); u.searchParams.delete('v'); history.replaceState(null, '', u.toString()); }
    const prev = ls.get(LAST);
    if (prev && APP_VERSION !== 'dev' && isNewer(APP_VERSION, prev)) window.setTimeout(() => say({ title: `اورآ به نسخه‌ی ${fa(APP_VERSION)} به‌روز شد`, text: 'هر چیزی که تازه آمده، در «آشنایی با اورآ» هم هست.' }), 1500);
    if (APP_VERSION !== 'dev') ls.set(LAST, APP_VERSION);
    const look = () => { if (navigator.onLine !== false) void githubLatest().then((l) => setLatest(newer(l) ? l : null)); };
    look();
    const vis = () => { if (document.visibilityState === 'visible') look(); };
    document.addEventListener('visibilitychange', vis);
    const iv = window.setInterval(look, 3600_000);
    return () => { removeEventListener('ora:web-update-ready', on); document.removeEventListener('visibilitychange', vis); window.clearInterval(iv); };
  }, []);
  if (!apply && !latest) return null;
  const go = () => { setBusy(true); if (apply) apply(); else void forceWebUpdate(); };
  return createPortal(
    <div className="upd-bar glass" role="status">
      <span className="upd-dot" aria-hidden="true" />
      <span>{latest ? <>نسخه‌ی <bdi dir="ltr">{fa(latest.version)}</bdi> اورآ آمده</> : 'نسخه‌ی تازه‌ی اورآ آماده است'}</span>
      <button className="btn btn-accent btn-sm" disabled={busy} onClick={go}>{busy ? 'یک لحظه…' : 'به‌روزرسانی'}</button>
    </div>,
    document.body,
  );
}

export function UpdateHost() {
  if (IS_WEB_BUILD) return <WebUpdateBar />;
  return <ExtensionUpdate />;
}

function ExtensionUpdate() {
  const loaded = useStore((s) => s.loaded);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [sheet, setSheet] = useState(false);
  const [hidden, setHidden] = useState(false);

  const refresh = useCallback(async () => {
    const l = await knownOrGithub();
    setLatest(l);
    if (l) {
      try { const h = JSON.parse(ls.get(HIDE) ?? 'null'); setHidden(!!h && h.v === l.version && Date.now() < h.until); } catch { setHidden(false); }
    }
    return l;
  }, []);

  useEffect(() => {
    if (!loaded || IS_WEB_BUILD) return;
    // just updated? say so once
    const prev = ls.get(LAST);
    if (prev && APP_VERSION !== 'dev' && isNewer(APP_VERSION, prev)) {
      window.setTimeout(() => say({ title: `اورآ به نسخه‌ی ${fa(APP_VERSION)} به‌روز شد`, text: 'هر چیزی که تازه آمده، در «آشنایی با اورآ» هم هست.', sticky: true }), 1500);
    }
    if (APP_VERSION !== 'dev') ls.set(LAST, APP_VERSION);
    void refresh().then((l) => { if (l && new URLSearchParams(location.search).get('update') === '1') setSheet(true); });
    if (new URLSearchParams(location.search).get('update') === '1') history.replaceState(null, '', location.pathname);
    // ask the worker to look now too (it also looks every two hours on its own)
    try { if (IS_EXTENSION) void chrome.runtime.sendMessage('ora:check-update').catch(() => {}); } catch { /* old worker */ }
    const on = () => void refresh();
    addEventListener('ora:update-available', on);
    // coming back to a tab after running Ora-Update: let the worker reload Ora right away
    const vis = () => { if (document.visibilityState === 'visible') try { void chrome.runtime.sendMessage('ora:disk-check').catch(() => {}); } catch { /* */ } };
    if (IS_EXTENSION) document.addEventListener('visibilitychange', vis);
    const iv = window.setInterval(on, 30 * 60_000);
    let unsub = () => {};
    try {
      if (IS_EXTENSION && chrome.storage?.onChanged) {
        const f = (ch: Record<string, unknown>) => { if ('oraLatest' in ch) on(); };
        chrome.storage.onChanged.addListener(f);
        unsub = () => chrome.storage.onChanged.removeListener(f);
      }
    } catch { /* not available */ }
    return () => { removeEventListener('ora:update-available', on); document.removeEventListener('visibilitychange', vis); window.clearInterval(iv); unsub(); };
  }, [loaded, refresh]);

  if (!latest) return null;
  const hideToday = () => {
    const end = new Date(); end.setHours(24, 0, 0, 0);
    ls.set(HIDE, JSON.stringify({ v: latest.version, until: end.getTime() }));
    setHidden(true);
  };
  return createPortal(
    <>
      {!hidden && !sheet && (
        <div className="upd-bar glass" role="status">
          <span className="upd-dot" aria-hidden="true" />
          <span>نسخه‌ی <bdi dir="ltr">{fa(latest.version)}</bdi> اورآ آمده</span>
          <button className="btn btn-accent btn-sm" onClick={() => setSheet(true)}>به‌روزرسانی</button>
          <button className="icon-btn upd-x" aria-label="امروز نه" title="امروز نه" onClick={hideToday}><IconX size={14} /></button>
        </div>
      )}
      {sheet && <Sheet latest={latest} onClose={() => setSheet(false)} />}
    </>,
    document.body,
  );
}
