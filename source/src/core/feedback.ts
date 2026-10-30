// When you turn down something Ora offered (plan the morning, close the day, a tip, a tour card…),
// Ora asks «چرا؟» with one tap — a few different reasons each time, so over the weeks it learns
// *why* you say no, not just that you did — and it changes what it does because of it:
//   الان وقتش نیست      → asks again a bit later today
//   ساعتش برام خوب نیست → asks which hour suits you and moves it
//   هر روز زیاده        → every other day
//   به کارم نمیاد       → offers to turn it off
//   اینو بلدم           → never shows that one again
// Skipping the question is always one tap too. Everything stays on this device and is listed (and
// erasable) in «اورآ درباره‌ی تو چه می‌داند».
import { kvGet, kvSet } from './kv';

export type FbKind = 'ritual-morning' | 'ritual-evening' | 'tip' | 'tour' | 'install';
export type FbReason = 'later' | 'bad-time' | 'too-often' | 'not-useful' | 'tired' | 'already' | 'unclear' | 'know' | 'no-tour' | 'how' | 'space' | 'browser' | 'why';

export const REASONS: Record<FbKind, [FbReason, string][]> = {
  'ritual-morning': [['later', 'الان وقتش نیست'], ['bad-time', 'ساعتش برام خوب نیست'], ['already', 'خودم برنامه‌مو دارم'], ['too-often', 'هر روز زیاده'], ['tired', 'حوصله‌شو ندارم'], ['not-useful', 'به کارم نمیاد'], ['unclear', 'نمی‌دونم دقیقاً چیه']],
  'ritual-evening': [['later', 'الان وقتش نیست'], ['bad-time', 'ساعتش برام خوب نیست'], ['tired', 'خسته‌ام'], ['already', 'خودم تو ذهنم جمعش کردم'], ['too-often', 'هر روز زیاده'], ['not-useful', 'به کارم نمیاد'], ['unclear', 'نمی‌دونم دقیقاً چیه']],
  tip: [['know', 'اینو بلدم'], ['later', 'الان نه'], ['too-often', 'زیاد نکته می‌دی'], ['not-useful', 'نکته لازم ندارم']],
  tour: [['know', 'اینو بلدم'], ['later', 'بعداً نگاه می‌کنم'], ['too-often', 'زیاد یادم می‌اندازی'], ['no-tour', 'آموزش نمی‌خوام']],
  install: [['later', 'الان نه'], ['how', 'بلد نیستم چطوری'], ['space', 'جا روی گوشیم کمه'], ['browser', 'تو مرورگر راحت‌ترم'], ['why', 'فایده‌ش چیه؟'], ['too-often', 'زیاد می‌پرسی']],
};

type Ev = { k: FbKind; r: FbReason | 'yes' | 'skip' | 'ignored'; at: number; h: number; d: number };
interface Store {
  events: Ev[];
  shown: Record<string, number>;
  snooze: Partial<Record<FbKind, number>>;
  everyOther: Partial<Record<FbKind, boolean>>;
}
const KEY = 'ora:feedback';
let cache: Store | null = null;
export async function fbStore(): Promise<Store> {
  if (!cache) cache = { events: [], shown: {}, snooze: {}, everyOther: {}, ...((await kvGet<Store>(KEY)) ?? {}) };
  return cache;
}
const save = async () => { if (cache) { cache.events = cache.events.slice(-500); await kvSet(KEY, cache); } };
export async function eraseFeedback() { resetAdaptations(); cache = { events: [], shown: {}, snooze: {}, everyOther: {} }; await save(); }

/** Three reasons for this «no», chosen so the ones asked least come up — a different set each time. */
export async function reasonsFor(k: FbKind, n = 3): Promise<[FbReason, string][]> {
  const s = await fbStore();
  const pool = REASONS[k].map((x) => ({ x, c: s.shown[`${k}|${x[0]}`] ?? 0, r: Math.random() }));
  const pick = pool.sort((a, b) => a.c - b.c || a.r - b.r).slice(0, n).map((p) => p.x);
  for (const [r] of pick) s.shown[`${k}|${r}`] = (s.shown[`${k}|${r}`] ?? 0) + 1;
  await save();
  // keep the order of the pool, so the chips don't jump around
  return REASONS[k].filter((x) => pick.includes(x));
}

export async function note(k: FbKind, r: Ev['r']): Promise<void> {
  const s = await fbStore();
  const now = new Date();
  s.events.push({ k, r, at: now.getTime(), h: now.getHours(), d: now.getDay() });
  if (r === 'later' && k.startsWith('ritual')) s.snooze[k] = Date.now() + 90 * 60_000;
  if (r === 'too-often') {
    if (k.startsWith('ritual')) s.everyOther[k] = true;
    // tips and tour cards: twice the gap each time you say so (up to 8×); read synchronously elsewhere
    if (k === 'tip' || k === 'tour') ls.set(GAP[k], String(Math.min(8, gapX(k) * 2)));
  }
  if (r === 'no-tour') ls.set('ora:tour-off', '1');
  await save();
}

const GAP = { tip: 'ora:tip-gapx', tour: 'ora:tour-gapx' } as const;
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private */ } } };
/** How much longer than usual to wait between tips / tour cards. */
export const gapX = (k: 'tip' | 'tour') => Math.max(1, Number(ls.get(GAP[k])) || 1);

/** Ask «چرا؟» this time? Yes — unless you skipped the question the last three times for this kind;
 *  then only every other time, so the question itself never becomes the nagging. */
export async function shouldAsk(k: FbKind): Promise<boolean> {
  const s = await fbStore();
  const mine = s.events.filter((e) => e.k === k && e.r !== 'yes' && e.r !== 'ignored').slice(-3);
  if (mine.length === 3 && mine.every((e) => e.r === 'skip')) return Math.random() < 0.5;
  return true;
}
/** Undo every adaptation (used by «پاک کردن» in the Knows page). */
export function resetAdaptations() { for (const k of [...Object.values(GAP), 'ora:tour-off']) { try { localStorage.removeItem(k); } catch { /* */ } } }

/** For rituals: asked to come back later today and that time hasn't come yet. */
export const snoozed = (s: Store, k: FbKind) => (s.snooze[k] ?? 0) > Date.now();
/** «هر روز زیاده»: only on every other day. */
export const offDay = (s: Store, k: FbKind) => !!s.everyOther[k] && Math.floor(Date.now() / 86_400_000) % 2 === 1;
/** How many times this reason was given for this kind (e.g. «به کارم نمیاد» twice → offer to turn it off). */
export const count = (s: Store, k: FbKind, r: FbReason) => s.events.filter((e) => e.k === k && e.r === r).length;

/** For «اورآ درباره‌ی تو چه می‌داند»: what you said when you turned things down. */
export async function summary(): Promise<{ k: FbKind; label: string; n: number }[]> {
  const s = await fbStore();
  const out = new Map<string, { k: FbKind; label: string; n: number }>();
  for (const e of s.events) {
    const label = REASONS[e.k]?.find(([r]) => r === e.r)?.[1];
    if (!label) continue;
    const key = `${e.k}|${e.r}`;
    out.set(key, { k: e.k, label, n: (out.get(key)?.n ?? 0) + 1 });
  }
  return [...out.values()].sort((a, b) => b.n - a.n).slice(0, 8);
}
export const KIND_LABEL: Record<FbKind, string> = { 'ritual-morning': 'برنامه‌ریزی صبح', 'ritual-evening': 'جمع‌بندی شب', tip: 'نکته‌ها', tour: 'آشنایی با اورآ', install: 'نصب روی گوشی' };
