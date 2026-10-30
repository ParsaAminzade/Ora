// «ریتم تو»: how you usually use the computer — counted, never read. Step 1 of the «قلب اورآ» plan.
//
// Counted in 10-minute slots, on this device only, for the last 21 days:
//   o  how many times Ora's new tab opened
//   p  of those, how many went somewhere within 8 seconds without touching Ora (a purposeful tab)
//   s  how often you switched tabs (extension only: Chrome tells the worker «a tab became active»,
//      never which one or what is in it — Ora has no permission to see addresses or pages)
// From these, Ora learns your normal rhythm for each hour of the day over the first 14 days. Later
// (step 2) it compares the moment with *your* normal — not with a fixed number — before it speaks.
import { IS_EXTENSION } from './platform';

export type Slot = { o?: number; p?: number; s?: number };
export type Rhythm = { since: number; slots: Record<string, Slot>; paused?: boolean };
const KEY = 'oraRhythm';
const KEEP_DAYS = 21;
export const LEARN_DAYS = 14;

const pad = (n: number) => String(n).padStart(2, '0');
export const slotKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${Math.floor(d.getMinutes() / 10)}`;

async function read(): Promise<Rhythm> {
  try {
    if (IS_EXTENSION && chrome.storage?.local) return ((await chrome.storage.local.get(KEY))[KEY] as Rhythm) ?? { since: Date.now(), slots: {} };
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? { since: Date.now(), slots: {} };
  } catch { return { since: Date.now(), slots: {} }; }
}
async function write(r: Rhythm) {
  const cut = slotKey(new Date(Date.now() - KEEP_DAYS * 86_400_000));
  for (const k of Object.keys(r.slots)) if (k < cut) delete r.slots[k];
  try {
    if (IS_EXTENSION && chrome.storage?.local) await chrome.storage.local.set({ [KEY]: r });
    else localStorage.setItem(KEY, JSON.stringify(r));
  } catch { /* full or private */ }
}
export const rhythm = read;

async function bump(field: keyof Slot, by = 1) {
  const r = await read();
  if (r.paused) return;
  const k = slotKey();
  const s = (r.slots[k] ??= {});
  s[field] = (s[field] ?? 0) + by;
  await write(r);
}

/** Called once each time Ora's page opens. Marks it «purposeful» if you leave within 8 s without
 *  touching Ora (you opened a tab to go somewhere). */
export function watchOpen(): () => void {
  void bump('o');
  const t0 = Date.now();
  let touched = false;
  const touch = () => { touched = true; };
  const leave = () => { if (!touched && Date.now() - t0 < 8000) void bump('p'); };
  for (const e of ['pointerdown', 'keydown']) addEventListener(e, touch, { capture: true, passive: true });
  addEventListener('pagehide', leave);
  const vis = () => { if (document.visibilityState === 'hidden') leave(); };
  document.addEventListener('visibilitychange', vis, { once: true });
  return () => { removeEventListener('pagehide', leave); document.removeEventListener('visibilitychange', vis); };
}

export async function setPaused(paused: boolean) { const r = await read(); r.paused = paused; await write(r); }
export async function eraseRhythm() { await write({ since: Date.now(), slots: {}, paused: (await read()).paused }); }

/* ---------- your normal ---------- */
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export interface Normal {
  /** days with any data */
  days: number;
  learning: boolean;
  /** per hour of day: typical new tabs opened and tab switches in an hour (median over the days you were there that hour) */
  hours: { opens: number; switches: number; active: number }[];
  /** share of new tabs that were purposeful */
  purposeful: number;
  busiest: number[];
}
export async function normal(): Promise<Normal> {
  const r = await read();
  const byDayHour = new Map<string, { o: number; s: number; p: number }>();
  const days = new Set<string>();
  let o = 0, p = 0;
  for (const [k, v] of Object.entries(r.slots)) {
    const day = k.slice(0, 10), hour = k.slice(11, 13);
    days.add(day);
    const x = byDayHour.get(`${day}|${hour}`) ?? { o: 0, s: 0, p: 0 };
    x.o += v.o ?? 0; x.s += v.s ?? 0; x.p += v.p ?? 0;
    byDayHour.set(`${day}|${hour}`, x);
    o += v.o ?? 0; p += v.p ?? 0;
  }
  const hours = Array.from({ length: 24 }, (_, h) => {
    const rows = [...byDayHour.entries()].filter(([k]) => k.endsWith(`|${pad(h)}`)).map(([, v]) => v);
    return { opens: median(rows.map((x) => x.o)), switches: median(rows.map((x) => x.s)), active: rows.length };
  });
  const busiest = hours.map((x, h) => [x.active, h] as const).filter(([a]) => a > 0).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, h]) => h).sort((a, b) => a - b);
  return { days: days.size, learning: days.size < LEARN_DAYS, hours, purposeful: o ? p / o : 0, busiest };
}
