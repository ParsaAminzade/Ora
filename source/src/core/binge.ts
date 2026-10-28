// Guard against "flipping through" lines. Two costs: the library gets used up (tomorrow only
// repeats are left), and lines become a way to avoid the work. So: a rapid run of «دیگری»
// makes Ora step in (with a joke, a cooldown and a way back to the real task), and past a daily
// number of fresh lines «دیگری» replays lines you already loved instead of using up new ones.
import { db } from './db';
import { dayKey } from './dates';
import { useStore } from './state';

const KEY = 'ora:binge';
const WINDOW = 90_000;       // look at the last 90 seconds
const BURST = 6;             // this many «دیگری» inside the window is a binge
const COOLDOWN = 3 * 60_000; // «دیگری» rests for three minutes
export const DAILY_FRESH = 20; // fresh lines per day through «دیگری»

interface State { log: number[]; day: string; count: number; until: number; capSaid?: string; joke: number }
const load = (): State => {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? '') as State; if (s && Array.isArray(s.log)) return s; } catch { /* fresh */ }
  return { log: [], day: '', count: 0, until: 0, joke: 0 };
};
const save = (s: State) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } };

export const JOKES = [
  'بسه دیگه! این‌همه جمله‌ی انگیزشی رو اگه به کاکتوس گفته بودن، سالی سه بار هلو می‌داد. حالا نوبت خودته.',
  'تند تند ورق می‌زنی؛ انگار دنبال جمله‌ای هستی که کار رو جای تو انجام بده. همچین جمله‌ای نداریم.',
  'چند تا جمله خوندی و صفر تا کار. بیا این آمار رو برعکس کنیم.',
  'اگه با خوندن جمله آدم به جایی می‌رسید، من تا حالا به ماه رسیده بودم. پاشو.',
  'یه جمله کافیه، به شرط اینکه بعدش یه کار بکنی.',
  'اینجا کتابخونه نیست، سکوی پرتابه. بپر!',
];

export const guardOn = () => useStore.getState().settings.bingeGuard !== false;

/** Seconds left before «دیگری» works again (0 = free). */
export function cooldownLeft(now = Date.now()): number {
  if (!guardOn()) return 0;
  return Math.max(0, Math.ceil((load().until - now) / 1000));
}

/** Call on every «دیگری». 'binge' = stop and talk; 'replay' = show a loved line, not a new one. */
export function noteNext(now = Date.now()): 'ok' | 'binge' | 'replay' | 'resting' {
  if (!guardOn()) return 'ok';
  const s = load();
  if (s.until > now) return 'resting';
  const today = dayKey(new Date(now));
  if (s.day !== today) { s.day = today; s.count = 0; }
  s.log = [...s.log.filter((t) => now - t < WINDOW), now];
  if (s.log.length >= BURST) {
    s.until = now + COOLDOWN;
    s.log = [];
    save(s);
    return 'binge';
  }
  s.count++;
  save(s);
  return s.count > DAILY_FRESH ? 'replay' : 'ok';
}

/** The message for a binge, with the most important open task as the way out. */
export async function bingeMessage(): Promise<{ text: string; task?: { id: string; title: string } }> {
  const s = load();
  const text = JOKES[s.joke % JOKES.length];
  s.joke++;
  save(s);
  const open = await db.tasks.filter((t) => !t.done).toArray();
  const today = dayKey(new Date());
  const top = open.sort((a, b) => Number(!!b.top) - Number(!!a.top) || b.priority - a.priority
    || Number((a.when ?? '9') <= today) - Number((b.when ?? '9') <= today) || a.order - b.order)[0];
  return { text, task: top ? { id: top.id, title: top.title } : undefined };
}

/** True once a day: the first time the daily allowance runs out. */
export function shouldSayCap(): boolean {
  const s = load();
  if (s.capSaid === s.day) return false;
  s.capSaid = s.day;
  save(s);
  return true;
}
