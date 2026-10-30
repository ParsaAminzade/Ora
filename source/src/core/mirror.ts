// M2 · «آینه»: the decision engine of the «قلب اورآ» plan, with rules (no AI, nothing leaves the device).
//
// Each time a new tab opens and stays (not a purposeful tab, not using Ora), Ora asks itself:
//   1. Is any brake on?            → silence   (focus running, quiet day, trust step < 2, cap reached,
//                                               «الان نه» < 2 h ago or twice today, all top three done,
//                                               «دارم کار می‌کنم» twice at this hour, something else open)
//   2. Is this moment really unlike *your* normal for this hour?  (tab switching / new-tab bursts
//      more than 2× your usual spread above your median; late past the bedtime you set)
//      Not sure enough                → silence
//   3. One in five eligible moments: silence on purpose (to learn whether speaking actually helps)
//   4. Otherwise: a mirror of known facts only (< 15 words) + a one-tap question, and «چرا الان؟».
// Answers move the trust ladder: helpful answers up, «مزاحم نشو» one step down (and quiet today).
//
// The lesson from testing it on Parsa: the mirror states only what Ora *knows* (counts, the hour);
// anything it would have to guess («هنوز نرفته») becomes a question with «منتظر جوابم» as a choice.
import { kvGet, kvSet } from './kv';
import { db } from './db';
import { fa } from './dates';
import { isQuiet, quietRestOfDay } from './safety';
import { LEARN_DAYS, rhythm, slotKey, slotNormal, type Rhythm, type SlotNormal } from './rhythm';
import { useStore } from './state';
import { today } from './planner';

export type Answer = 'working' | 'tired' | 'avoid' | 'meaning' | 'cant' | 'lost' | 'bored' | 'waiting' | 'step' | 'not-now' | 'stop' | 'none';
type Ev = { at: number; h: number; act: 'shown' | 'held' | 'braked'; why?: string; sig?: Signal['kind']; ans?: Answer; sim?: boolean; outcome?: 1 | 0 };
interface Store { events: Ev[]; down: number; downAt?: number }
const KEY = 'ora:mirror';
const SIM = 'ora:mirror-sim';
const H = 3600_000;

let cache: Store | null = null;
async function store(): Promise<Store> { if (!cache) cache = { events: [], down: 0, ...((await kvGet<Store>(KEY)) ?? {}) }; return cache; }
const save = async () => { if (cache) { cache.events = cache.events.slice(-400); await kvSet(KEY, cache); } };
export async function eraseMirror() { cache = { events: [], down: 0 }; await save(); }
export const mirrorLog = async () => (await store()).events;

/* ---------- test mode: try it on yourself without waiting 14 days ---------- */
export const simOn = () => { try { return !!localStorage.getItem(SIM); } catch { return false; } };
export async function setSim(on: boolean) {
  try { if (on) localStorage.setItem(SIM, String(Date.now())); else localStorage.removeItem(SIM); } catch { /* */ }
  if (!on) { const s = await store(); s.events = s.events.filter((e) => !e.sim); await save(); }
}
/** 14 made-up ordinary days (about 4 tab switches and one new tab per 10 minutes, 8:00–24:00) under
 *  your real data for today — so the engine compares *now* with a plausible normal. */
function simRhythm(real: Rhythm): Rhythm {
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const slots: Rhythm['slots'] = {};
  for (let d = 1; d <= LEARN_DAYS; d++) {
    const day = new Date(Date.now() - d * 86_400_000);
    for (let h = 8; h < 24; h++) for (let m = 0; m < 6; m++) {
      day.setHours(h, m * 10, 0, 0);
      slots[slotKey(day)] = { s: Math.round(2 + rnd() * 5), o: rnd() < 0.6 ? 1 : 2, p: rnd() < 0.5 ? 1 : 0 };
    }
  }
  const t = today();
  for (const [k, v] of Object.entries(real.slots)) if (k.startsWith(t)) slots[k] = v;
  return { since: Date.now() - (LEARN_DAYS + 1) * 86_400_000, slots };
}

/* ---------- the trust ladder ---------- */
export async function trustStep(): Promise<{ step: number; base: number; up: number; down: number; days: number }> {
  const r = await rhythm();
  const days = new Set(Object.keys(r.slots).map((k) => k.slice(0, 10))).size;
  const age = (Date.now() - r.since) / 86_400_000;
  let base = age < 3 ? 0 : days < LEARN_DAYS ? 1 : 2;
  if (simOn()) base = Math.max(base, 2);
  const s = await store();
  const good = s.events.filter((e) => e.act === 'shown' && (e.ans === 'step' || e.outcome === 1) && !e.sim).length;
  const up = base >= 2 ? (good >= 3 ? 1 : 0) + (good >= 10 ? 1 : 0) : 0;
  const cap = useStore.getState().settings.trustCap ?? 4;
  return { step: Math.max(0, Math.min(cap, base + up - s.down)), base, up, down: s.down, days };
}

/* ---------- signals ---------- */
export interface Signal { kind: 'switching' | 'burst' | 'late'; p: number; mirror: string; why: string }
const bedMin = () => { const b = useStore.getState().settings.night?.bedtime ?? '23:30'; const [h, m] = b.split(':').map(Number); return h * 60 + (m || 0); };
const hm = (d: Date) => `${fa(d.getHours())}:${fa(String(d.getMinutes()).padStart(2, '0'))}`;
const sure = (x: number, med: number, mad: number) => {
  const spread = Math.max(1, 1.4826 * mad);
  const z = (x - med) / spread;
  return z <= 2 ? 0 : Math.min(0.97, 0.5 + 0.12 * z); // «بیش از ۲ برابر پراکندگی، بالای میانه»
};
export function signals(n: SlotNormal, now = new Date()): Signal[] {
  const out: Signal[] = [];
  const ps = sure(n.nowS, n.s.med, n.s.mad);
  if (ps && n.nowS >= 10) out.push({ kind: 'switching', p: ps, mirror: `${fa(n.nowS)} بار تب عوض کردی در ده دقیقه.`, why: `این ساعت معمولاً حدود ${fa(Math.round(n.s.med))} بار در ده دقیقه تب عوض می‌کنی؛ الان ${fa(n.nowS)} بار.` });
  const opens = Math.max(0, n.nowO - n.nowP); // purposeful tabs don't count
  const po = sure(opens, n.o.med, n.o.mad);
  if (po && opens >= 5) out.push({ kind: 'burst', p: po, mirror: `${fa(opens)} بار پشت هم تب تازه باز شد.`, why: `این ساعت معمولاً ${fa(Math.round(n.o.med))} تب تازه در ده دقیقه باز می‌کنی؛ الان ${fa(opens)} تا، بدون اینکه جایی بروی.` });
  const mins = now.getHours() * 60 + now.getMinutes();
  const past = (mins - bedMin() + 1440) % 1440; // minutes past bedtime
  if (past > 20 && past < 300) out.push({ kind: 'late', p: n.nowS + n.nowO > n.s.med + n.o.med ? 0.8 : 0.62, mirror: `ساعت ${hm(now)} است.`, why: `ساعت خوابی که گفتی ${fa(useStore.getState().settings.night?.bedtime ?? '')} است و الان ${fa(Math.round(past))} دقیقه از آن گذشته.` });
  return out.sort((a, b) => b.p - a.p);
}

/* ---------- brakes ---------- */
async function brakes(step: number, now = new Date()): Promise<string | null> {
  if (isQuiet()) return 'امروز ساکت (بعد از پیام سخت یا «مزاحم نشو»)';
  const st = useStore.getState();
  if (step < 2) return `پله‌ی اعتماد ${fa(step)} است (کمتر از ۲)`;
  const pomo = st.widgets.find((w) => w.type === 'pomodoro')?.config as { endsAt?: number | null; phase?: string } | undefined;
  if (pomo?.endsAt && pomo.endsAt > Date.now() && pomo.phase === 'focus') return 'تایمر تمرکز روشن است';
  if (st.panel !== 'none' || st.editing || document.querySelector('[role="dialog"]')) return 'چیز دیگری باز است';
  try { if (Date.now() - Number(localStorage.getItem('ora:tip-at') ?? 0) < 60_000) return 'اورآ همین الان چیز دیگری گفت'; } catch { /* */ }
  const s = await store();
  const shown = s.events.filter((e) => e.act === 'shown' && !!e.sim === simOn());
  const sim = simOn();
  if (sim) { if (shown.some((e) => Date.now() - e.at < 10 * 60_000)) return 'حالت آزمایشی: حداکثر هر ۱۰ دقیقه یک بار'; }
  else if (step === 2 && shown.filter((e) => Date.now() - e.at < 7 * 24 * H).length >= 2) return 'سقف این هفته (۲ بار) پر است';
  else if (step >= 3 && shown.some((e) => slotKey(new Date(e.at)).slice(0, 10) === today())) return 'سقف امروز (۱ بار) پر است';
  const nots = shown.filter((e) => e.ans === 'not-now');
  if (nots.some((e) => Date.now() - e.at < 2 * H)) return 'کمتر از ۲ ساعت از «الان نه»';
  if (nots.filter((e) => slotKey(new Date(e.at)).slice(0, 10) === today()).length >= 2) return 'امروز دو بار «الان نه» گفتی';
  if (shown.filter((e) => e.ans === 'working' && e.h === now.getHours()).length >= 2) return 'این ساعت دو بار «دارم کار می‌کنم» گفتی';
  const top = await db.tasks.filter((t) => !!t.top && t.when === today()).toArray();
  if (top.length && top.every((t) => t.done)) return 'سه کار مهم امروز انجام شده';
  return null;
}

/* ---------- the decision ---------- */
export interface Moment { signal: Signal; step: number; sim: boolean; guess: Answer[] }
export interface Trace { brake?: string | null; signals: Signal[]; threshold: number; held?: boolean; moment?: Moment; normal: SlotNormal }
/** Decide whether to speak now. `force` (test button) skips the intentional silence and the cap, never the safety brakes. */
export async function decide(force = false, now = new Date()): Promise<Trace> {
  const real = await rhythm();
  const sim = simOn();
  const n = await slotNormal(now, sim ? simRhythm(real) : real);
  const { step } = await trustStep();
  const sigs = signals(n, now);
  const threshold = step >= 3 ? 0.6 : 0.75;
  const s = await store();
  const log = (e: Omit<Ev, 'at' | 'h'>) => { s.events.push({ at: Date.now(), h: now.getHours(), sim, ...e }); void save(); };
  let brake = await brakes(step, now);
  if (force && brake && !/ساکت|تمرکز|باز است/.test(brake)) brake = null; // the test button: cap/ladder off, safety on
  if (brake) { if (sigs[0]?.p >= threshold) log({ act: 'braked', why: brake, sig: sigs[0].kind }); return { brake, signals: sigs, threshold, normal: n }; }
  const best = force ? sigs[0] ?? { kind: 'switching' as const, p: 1, mirror: `${fa(n.nowS)} بار تب عوض کردی در ده دقیقه.`, why: '(دکمه‌ی آزمایش: بدون نشانه‌ی واقعی)' } : sigs.find((x) => x.p >= threshold);
  if (!best) return { signals: sigs, threshold, normal: n };
  if (!force && Math.random() < 0.2) { log({ act: 'held', sig: best.kind }); return { signals: sigs, threshold, held: true, normal: n }; }
  const guess: Answer[] = best.kind === 'late' ? ['tired', 'working', 'avoid', 'bored'] : now.getHours() >= 22 ? ['tired', 'avoid', 'working', 'lost'] : ['avoid', 'lost', 'bored', 'working'];
  log({ act: 'shown', sig: best.kind });
  return { signals: sigs, threshold, normal: n, moment: { signal: best, step, sim, guess } };
}

/** Your one-tap answer to the last mirror. */
export async function answer(a: Answer) {
  const s = await store();
  const last = [...s.events].reverse().find((e) => e.act === 'shown' && !e.ans);
  if (last) last.ans = a;
  if (a === 'stop') { s.down += 1; s.downAt = Date.now(); quietRestOfDay(); }
  await save();
}
/** 30 minutes later: did something actually move (a task done or a focus started)? The quiet label for learning. */
export async function settleOutcomes() {
  const s = await store();
  let changed = false;
  for (const e of s.events) {
    if (e.outcome !== undefined || (e.act !== 'shown' && e.act !== 'held') || Date.now() - e.at < 30 * 60_000) continue;
    const done = await db.tasks.filter((t) => !!t.done && !!t.doneAt && t.doneAt >= e.at && t.doneAt <= e.at + 30 * 60_000).count();
    e.outcome = done ? 1 : 0; changed = true;
  }
  if (changed) await save();
}
export const ANSWERS: [Answer, string][] = [
  ['working', 'دارم کار می‌کنم'], ['tired', 'خسته‌ام'], ['avoid', 'یه کاری ولم نمی‌کنه'], ['lost', 'نمی‌دونم از کجا شروع کنم'],
  ['bored', 'فقط حوصله ندارم'], ['waiting', 'منتظر جوابم'], ['meaning', 'به چه دردم می‌خوره؟'], ['cant', 'نمی‌کشم'],
];
export const REPLY: Partial<Record<Answer, string>> = {
  working: 'باشه، مزاحم نمی‌شم. این ساعت رو یادم می‌مونه.',
  tired: 'خستگی دلیل واقعیه. یه استراحت کوتاه — یا اگه دیروقته، خواب — خودش کاره.',
  avoid: 'گاهی خود کار سخت نیست، حسِ کنارش سخته. فقط دو دقیقه بازش کن؛ بعد اگه خواستی ببند.',
  lost: 'لازم نیست کل راه معلوم باشه. فقط قدم بعدی چیه؟ یه خط بنویسش.',
  bored: 'یه جور دیگه انجامش بده: پونزده دقیقه با تایمر، یا یه جای دیگه.',
  waiting: 'باشه. وقتی منتظری، کار دیگه‌ای از لیستت هست که دست خودت باشه؟',
  meaning: 'اگه این کار به یه چیزی که برات مهمه وصل بود، اون چی بود؟',
  cant: 'کوچیک‌ترین قدمش چیه که حتی الان هم بشه؟',
};
