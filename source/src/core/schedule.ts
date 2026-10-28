// The time plan behind «برنامه»: Google-Calendar-like blocks, placed and re-placed by a planner
// that knows your priorities, your deadlines, your hours, your rhythm and (over time) you.
//
// Everything here is plain arithmetic, so it is exact, instant, offline and explainable. What is
// "personal" is learned from your own history: how much longer than estimated each kind of work
// really takes, and the part of the day in which you actually finish hard things.
import { db, type CalEvent, type Task } from './db';
import { addDays, dayKey, fa } from './dates';
import { kvGet, kvSet } from './kv';
import { localCalendar } from './providers/calendar';
import { plannerOf, today, type PlannerSettings } from './planner';
import { estLabel } from './taskparse';
import { daysBetween, endAbs, rangeOn } from './events';

/* ---------- time helpers ---------- */
export const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + (m || 0); };
export const toHM = (n: number) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(Math.round(n % 60)).padStart(2, '0')}`;
export const faHM = (n: number) => fa(toHM(n));
const round5 = (n: number) => Math.ceil(n / 5) * 5;
const dayOf = (k: string) => new Date(`${k}T12:00:00`);
export const nowMin = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

/* ---------- blocks ---------- */
export interface Block {
  id: string; kind: 'task' | 'event' | 'break' | 'focus';
  title: string; start: number; end: number;
  taskId?: string; fixed: boolean; score: number; area?: string; color?: string; done?: boolean;
  /** For events: the event itself (an occurrence, for a repeating one). */
  ev?: CalEvent;
  /** A session of a recurring goal / part of a project. */
  goal?: boolean; project?: string;
  /** The block continues from the day before / into the next day. */
  cutStart?: boolean; cutEnd?: boolean;
}

/** How much a task matters right now: top three, deadlines, importance, how often it slipped. */
export function score(t: Task, d = today()): number {
  let s = 0;
  if (t.top) s += 100;
  if (t.priority) s += 40;
  if (t.due) {
    const days = Math.round((dayOf(t.due).getTime() - dayOf(d).getTime()) / 864e5);
    s += days < 0 ? 90 : days === 0 ? 70 : days === 1 ? 45 : days <= 3 ? 25 : days <= 7 ? 10 : 0;
  }
  s += Math.min(20, (t.slips ?? 0) * 5);
  return s;
}

/** Breaks the planner inserted, per day (so the view can show them). */
const BREAKS = (d: string) => `ora:breaks:${d}`;
export async function breaksOf(d: string): Promise<[number, number][]> { return (await kvGet<[number, number][]>(BREAKS(d))) ?? []; }

export function blocksFor(d: string, tasks: Task[], events: CalEvent[], breaks: [number, number][] = [], stats?: Stats): Block[] {
  const out: Block[] = [];
  for (const t of tasks) {
    if (t.when !== d || !t.time || t.someday) continue;
    const start = toMin(t.time);
    out.push({ id: t.id, kind: 'task', title: t.title, start, end: start + personalEst(t, stats), taskId: t.id, fixed: !!t.fixed, score: score(t, d), area: t.area, done: t.done, goal: !!t.goal, project: t.project });
  }
  for (const e of events) {
    const r = rangeOn(e, d);
    if (!r) continue;
    const off = daysBetween(e.day, d) * 1440;
    out.push({ id: `ev-${e.id}`, kind: e.kind === 'focus' ? 'focus' : 'event', title: e.title, start: r[0], end: r[1], fixed: e.kind !== 'focus', score: e.kind === 'focus' ? 0 : 999, color: e.color, ev: e, cutStart: toMin(e.time!) - off < 0, cutEnd: endAbs(e) - off > 1440 });
  }
  for (const [a, b] of breaks) out.push({ id: `br-${a}`, kind: 'break', title: 'استراحت', start: a, end: b, fixed: false, score: 0 });
  return out.sort((a, b) => a.start - b.start);
}

/* ---------- personal statistics ---------- */
export interface Outcome { area: string; est: number; actual: number; hour: number; done: boolean; at: number }
export interface Stats { ratio: Record<string, { r: number; n: number }>; overall: { r: number; n: number }; peak: 'morning' | 'afternoon' | 'evening'; peakN: number; byPart: Record<string, { done: number; n: number }> }
const LOG = 'ora:block-log';

export async function logOutcome(o: Omit<Outcome, 'at'>): Promise<void> {
  const log = (await kvGet<Outcome[]>(LOG)) ?? [];
  log.push({ ...o, at: Date.now() });
  await kvSet(LOG, log.slice(-600));
}

const partOf = (h: number) => (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening');
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Estimate bias per area (shrunk towards the general buffer until there is evidence) and peak hours. */
export function computeStats(log: Outcome[], buffer = plannerOf().buffer): Stats {
  const K = 4; // pseudo-observations of the prior
  const ratios = (xs: Outcome[]) => xs.filter((o) => o.done && o.est > 0 && o.actual > 0).map((o) => Math.min(4, Math.max(0.4, o.actual / o.est)));
  const shrink = (rs: number[]) => ({ r: rs.length ? (rs.length * median(rs) + K * buffer) / (rs.length + K) : buffer, n: rs.length });
  const areas = new Set(log.map((o) => o.area));
  const ratio: Stats['ratio'] = {};
  for (const a of areas) ratio[a] = shrink(ratios(log.filter((o) => o.area === a)));
  const byPart: Stats['byPart'] = { morning: { done: 0, n: 0 }, afternoon: { done: 0, n: 0 }, evening: { done: 0, n: 0 } };
  for (const o of log) { const p = byPart[partOf(o.hour)]; p.n++; if (o.done) p.done++; }
  // peak = the part of the day with the best (smoothed) completion rate
  const rate = (p: { done: number; n: number }) => (p.done + 1) / (p.n + 2);
  const peak = (Object.keys(byPart) as Stats['peak'][]).sort((a, b) => rate(byPart[b]) - rate(byPart[a]))[0];
  return { ratio, overall: shrink(ratios(log)), peak: log.length >= 10 ? peak : 'morning', peakN: log.length, byPart };
}
export async function loadStats(): Promise<Stats> { return computeStats((await kvGet<Outcome[]>(LOG)) ?? []); }

/** The estimate you will probably really need (your own bias for this kind of work). */
export function personalEst(t: Task, stats?: Stats): number {
  if (t.len) return t.len; // you set the block's length yourself
  const base = t.est ?? 30;
  if (t.fixed) return base; // a class or meeting takes exactly its time
  const r = stats ? (stats.ratio[t.area ?? '—']?.n ? stats.ratio[t.area ?? '—'].r : stats.overall.r) : plannerOf().buffer;
  return round5(base * r);
}

/* ---------- free time ---------- */
function freeGaps(busy: [number, number][], from: number, to: number): [number, number][] {
  const b = busy.filter(([a, z]) => z > from && a < to).sort((x, y) => x[0] - y[0]);
  const gaps: [number, number][] = [];
  let at = from;
  for (const [a, z] of b) { if (a > at) gaps.push([at, a]); at = Math.max(at, z); }
  if (at < to) gaps.push([at, to]);
  return gaps;
}

/* ---------- auto planning ---------- */
export interface Placement { taskId: string; title: string; when: string; time: string; len: number }
export interface Plan {
  placements: Placement[]; breaks: Record<string, [number, number][]>; unplaced: { taskId: string; title: string; why: string }[];
  days: string[]; stats: Stats;
}
export interface PlanInput { tasks: Task[]; events: CalEvent[]; settings: PlannerSettings; stats: Stats; now: Date; scope: 'day' | 'tomorrow' | 'week' }

const BREAK = { 25: [5, 25], 50: [10, 20], 90: [20, 30] } as const; // [short, long]

/** Places the open, unfixed tasks of the scope into free time, highest score first. */
export function autoPlan(inp: PlanInput): Plan {
  const { settings: p, stats, now } = inp;
  const d0 = dayKey(now);
  const first = inp.scope === 'tomorrow' ? addDays(now, 1) : now;
  const n = inp.scope === 'week' ? 7 : 1;
  const days = Array.from({ length: n }, (_, i) => dayKey(addDays(first, i))).filter((k) => !p.daysOff.includes(dayOf(k).getDay()));
  const last = days[days.length - 1] ?? d0;
  const peak = p.peak === 'auto' ? stats.peak : p.peak;
  const peakAt = { morning: 9 * 60, afternoon: 14 * 60, evening: 19 * 60 }[peak];

  // what to place
  const cands = inp.tasks.filter((t) => !t.done && !t.someday && !t.fixed && (
    inp.scope === 'week' ? (!t.when || t.when <= last || (!!t.due && t.due <= last))
      : (t.when ? t.when <= days[0] : !!t.top || (!!t.due && t.due <= days[0]))
  )).sort((a, b) => score(b, d0) - score(a, d0) || (a.due ?? '9').localeCompare(b.due ?? '9') || a.order - b.order);

  const busy = new Map<string, [number, number][]>();
  const focusOf = new Map<string, [number, number][]>();
  const used = new Map<string, number>();
  const breaks: Plan['breaks'] = {};
  for (const d of days) {
    const fixed: [number, number][] = blocksFor(d, inp.tasks.filter((t) => t.fixed || cands.every((c) => c.id !== t.id)), inp.events, [], stats)
      .filter((b) => b.kind !== 'break' && b.kind !== 'focus' && !b.done).map((b) => [b.start, b.end]);
    if (d === d0) fixed.push([0, round5(nowMin(now) + 5)]); // the past is gone
    focusOf.set(d, blocksFor(d, [], inp.events).filter((b) => b.kind === 'focus').map((b) => [b.start, b.end] as [number, number]));
    busy.set(d, fixed);
    // work that is already timed and stays put counts towards the day's hours
    used.set(d, inp.tasks.filter((t) => t.when === d && t.time && !t.done && !t.fixed && cands.every((c) => c.id !== t.id)).reduce((x, t) => x + personalEst(t, stats), 0));
    breaks[d] = [];
  }
  const cap = p.hours * 60;
  const placements: Placement[] = [];
  const unplaced: Plan['unplaced'] = [];
  const [shortB, longB] = BREAK[p.focus];
  const runLen = new Map<string, number>(); // focus minutes since the last break, per day (end-time keyed)

  for (const t of cands) {
    const len = personalEst(t, stats);
    let placed = false;
    let capHit = false;
    const deadline = t.due && t.due < last ? t.due : last;
    for (const d of days) {
      if (d > deadline) break;
      if ((used.get(d) ?? 0) + len > cap) { capHit = true; continue; }
      const gaps = freeGaps(busy.get(d)!, toMin(p.dayStart), toMin(p.dayEnd)).filter(([a, z]) => z - a >= len);
      if (!gaps.length) continue;
      // important work goes into your focus time if you set one, else as near your peak as possible;
      // the rest takes the earliest gap
      const fw = (focusOf.get(d) ?? []).find(([a, z]) => gaps.some(([g0, g1]) => Math.max(a, g0) + len <= Math.min(z, g1)));
      const target = fw ? fw[0] : peakAt;
      const pick = score(t, d0) >= 40
        ? gaps.map(([a, z]) => [a, z, Math.abs(Math.min(Math.max(target, a), z - len) - target)] as const).sort((x, y) => x[2] - y[2])[0]
        : [gaps[0][0], gaps[0][1], 0] as const;
      const start = score(t, d0) >= 40 ? Math.min(Math.max(target, pick[0]), pick[1] - len) : pick[0];
      const s = round5(start);
      if (s + len > pick[1]) continue;
      placements.push({ taskId: t.id, title: t.title, when: d, time: toHM(s), len });
      busy.get(d)!.push([s, s + len]);
      used.set(d, (used.get(d) ?? 0) + len);
      // a break after it: short after each focus run, long after two hours
      const key = `${d}`;
      const run = (runLen.get(key) ?? 0) + len;
      const brk = run >= 120 ? longB : len >= Math.min(p.focus, 45) || run >= p.focus ? shortB : 0;
      if (brk) { busy.get(d)!.push([s + len, s + len + brk]); breaks[d].push([s + len, s + len + brk]); runLen.set(key, run >= 120 ? 0 : run); }
      else runLen.set(key, run);
      placed = true;
      break;
    }
    if (!placed) unplaced.push({ taskId: t.id, title: t.title, why: capHit ? `از سقف ${fa(p.hours)} ساعت کار در روز بیشتر می‌شد` : t.due && t.due <= last ? 'تا مهلتش جای خالی کافی نیست' : 'در این بازه جا نشد' });
  }
  return { placements, breaks, unplaced, days, stats };
}

export async function applyPlan(plan: Plan): Promise<void> {
  for (const x of plan.placements) await db.tasks.update(x.taskId, { when: x.when, time: x.time });
  for (const d of plan.days) await kvSet(BREAKS(d), plan.breaks[d] ?? []);
}

/* ---------- live re-planning when a block runs over ---------- */
export interface Replan {
  shifted: { taskId: string; title: string; from: string; to: string }[];
  dropped: { taskId: string; title: string; score: number }[];
  advice: 'go' | 'stop' | 'either';
  text: string;
}

/** If the current block takes `extra` more minutes, what happens to the rest of today? */
export function replan(cur: Task, extra: number, tasks: Task[], events: CalEvent[], settings: PlannerSettings, stats: Stats, now = new Date()): Replan {
  const d = dayKey(now);
  const end = Math.max(nowMin(now), toMin(cur.time ?? toHM(nowMin(now)))) + extra;
  const fixedBusy: [number, number][] = blocksFor(d, tasks.filter((t) => t.fixed && t.id !== cur.id), events, [], stats).filter((b) => b.kind !== 'break' && b.kind !== 'focus').map((b) => [b.start, b.end]);
  const later = tasks.filter((t) => t.when === d && t.time && !t.done && !t.fixed && t.id !== cur.id && toMin(t.time) >= toMin(cur.time ?? '00:00'))
    .sort((a, b) => toMin(a.time!) - toMin(b.time!));
  const busy = [...fixedBusy, [toMin(cur.time ?? '00:00'), end] as [number, number]];
  const shifted: Replan['shifted'] = [];
  const dropped: Replan['dropped'] = [];
  const dayEnd = toMin(settings.dayEnd);
  for (const t of later) {
    const len = personalEst(t, stats);
    let at = Math.max(toMin(t.time!), 0);
    for (let g = 0; g < 30; g++) { const hit = busy.find(([a, z]) => at < z && at + len > a); if (!hit) break; at = round5(hit[1] + 5); }
    if (at + len > dayEnd) { dropped.push({ taskId: t.id, title: t.title, score: score(t, d) }); continue; }
    busy.push([at, at + len]);
    if (toHM(at) !== t.time) shifted.push({ taskId: t.id, title: t.title, from: t.time!, to: toHM(at) });
  }
  const mine = score(cur, d);
  const worst = dropped.reduce((m, x) => Math.max(m, x.score), -1);
  const dueToday = dropped.filter((x) => { const t = tasks.find((y) => y.id === x.taskId); return t?.due && t.due <= d; });
  let advice: Replan['advice'] = 'either';
  let text: string;
  if (!dropped.length && !shifted.length) { advice = 'go'; text = `ادامه بده؛ تا ${faHM(end)} جا هست و به بقیه‌ی برنامه نمی‌خورد.`; }
  else if (!dropped.length) { advice = 'go'; text = `اشکالی ندارد: ${shifted.map((x) => `«${x.title}» ساعت ${fa(x.to)}`).join('، ')} شروع می‌شود و همه‌ی کارهای امروز هنوز جا می‌شوند.`; }
  else if (dueToday.length) { advice = 'stop'; text = `پیشنهادم این است که همین‌جا تمامش کنی: «${dueToday[0].title}» مهلتش امروز است و با این تمدید به امروز نمی‌رسد.`; }
  else if (worst === mine) { advice = 'either'; text = `«${dropped.map((x) => x.title).join('» و «')}» به فردا می‌رود${shifted.length ? ` و ${shifted.map((x) => `«${x.title}» ساعت ${fa(x.to)}`).join('، ')} می‌شود` : ''}. اولویتشان با «${cur.title}» یکی است؛ انتخاب با خودت.`; }
  else if (worst > mine) { advice = 'stop'; text = `با این تمدید «${dropped.map((x) => x.title).join('» و «')}» به فردا می‌رود، که از «${cur.title}» مهم‌تر است. بهتر است همین‌جا ببندی.`; }
  else { advice = 'go'; text = `منطقی است ادامه بدهی: «${dropped.map((x) => x.title).join('» و «')}» که اولویت کمتری دارد به فردا می‌رود${shifted.length ? ` و ${shifted.map((x) => `«${x.title}» ساعت ${fa(x.to)}`).join('، ')} می‌شود` : ''}.`; }
  return { shifted, dropped, advice, text };
}

export async function applyReplan(cur: Task, extra: number, r: Replan, opts: { startNow?: boolean } = {}): Promise<void> {
  if (opts.startNow) await db.tasks.update(cur.id, { time: toHM(round5(nowMin())) });
  else await db.tasks.update(cur.id, { est: (cur.est ?? 30) + extra, ...(cur.len ? { len: cur.len + extra } : {}) });
  for (const x of r.shifted) await db.tasks.update(x.taskId, { time: x.to });
  const tmr = dayKey(addDays(new Date(), 1));
  for (const x of r.dropped) {
    const t = await db.tasks.get(x.taskId);
    if (!t) continue;
    await db.tasks.update(x.taskId, { when: tmr, time: undefined, slips: (t.slips ?? 0) + 1 });
    if (t.time) await logOutcome({ area: t.area ?? '—', est: t.est ?? 30, actual: 0, hour: toMin(t.time) / 60 | 0, done: false });
  }
}

/* ---------- how the week looks ---------- */
export interface Report {
  load: number; // planned / available (0–1+)
  plannedMin: number; availableMin: number;
  restMin: number; restNeed: number;
  verdict: 'light' | 'ok' | 'heavy' | 'over';
  risks: { title: string; due: string; shortMin: number }[];
  pace?: { done: number; planned: number };
  insights: string[];
}

export function report(inp: Omit<PlanInput, 'scope'> & { scope: 'day' | 'week'; breaks?: Record<string, [number, number][]>; history?: Task[]; from?: string }): Report {
  const { settings: p, stats } = inp;
  // a plan for tomorrow (or a day you are looking at) is judged from the start of that day
  const now = inp.from && inp.from > dayKey(inp.now) ? new Date(`${inp.from}T00:00:00`) : inp.now;
  const n = inp.scope === 'week' ? 7 : 1;
  const days = Array.from({ length: n }, (_, i) => dayKey(addDays(now, i))).filter((k) => !p.daysOff.includes(dayOf(k).getDay()));
  const d0 = dayKey(now);
  const windowLen = toMin(p.dayEnd) - toMin(p.dayStart);
  let available = 0, planned = 0, rest = 0;
  const capOf = new Map<string, number>();
  for (const d of days) {
    const fixed = blocksFor(d, inp.tasks.filter((t) => t.fixed), inp.events, [], stats).filter((b) => b.kind !== 'break' && b.kind !== 'focus').reduce((a, b) => a + (b.end - b.start), 0);
    const startLeft = d === d0 ? Math.max(toMin(p.dayStart), nowMin(now)) : toMin(p.dayStart);
    const left = Math.max(0, toMin(p.dayEnd) - startLeft);
    const c = Math.max(0, Math.min(p.hours * 60, (d === d0 ? left : windowLen) - fixed));
    capOf.set(d, c);
    available += c;
    rest += (inp.breaks?.[d] ?? []).reduce((a, [x, y]) => a + (y - x), 0);
  }
  const open = inp.tasks.filter((t) => !t.done && !t.someday && !t.fixed && (n === 1 ? (t.when ? t.when === d0 || (t.when < d0 && d0 === dayKey(inp.now)) : !!t.top && d0 === dayKey(inp.now)) : (!t.when || t.when <= days[days.length - 1])));
  planned = open.reduce((a, t) => a + personalEst(t, stats), 0);
  // deadlines: cumulative demand (earliest deadline first) against cumulative capacity
  const risks: Report['risks'] = [];
  const due = open.filter((t) => t.due && t.due <= (days[days.length - 1] ?? d0)).sort((a, b) => a.due!.localeCompare(b.due!));
  let demand = 0;
  for (const t of due) {
    demand += personalEst(t, stats);
    const capTo = days.filter((d) => d <= t.due!).reduce((a, d) => a + (capOf.get(d) ?? 0), 0);
    if (demand > capTo) risks.push({ title: t.title, due: t.due!, shortMin: demand - capTo });
  }
  // rest: about a sixth of focused time (short breaks) plus a long one every two hours of work
  const restNeed = round5(planned / 6 + Math.floor(planned / 120) * 10);
  const load = available ? planned / available : planned ? 2 : 0;
  const verdict: Report['verdict'] = load > 1 ? 'over' : load > 0.85 ? 'heavy' : load < 0.4 ? 'light' : 'ok';
  // pace over the last seven days
  let pace: Report['pace'];
  if (inp.history) {
    const since = dayKey(addDays(now, -7));
    const past = inp.history.filter((t) => t.when && t.when >= since && t.when < d0);
    if (past.length >= 3) pace = { planned: past.length, done: past.filter((t) => t.done).length };
  }
  const insights: string[] = [];
  for (const [a, v] of Object.entries(stats.ratio)) {
    if (v.n >= 3 && Math.abs(v.r - 1) >= 0.2) insights.push(`کارهای ${a === '—' ? 'بدون حوزه' : `#${a}`} معمولاً ${fa(v.r.toFixed(1)).replace('.', '٫')} برابر برآوردت طول می‌کشند؛ برنامه همین را حساب می‌کند.`);
  }
  if (stats.peakN >= 10) insights.push(`بیشترین کارهای تمام‌شده‌ات مال ${{ morning: 'صبح', afternoon: 'بعدازظهر', evening: 'عصر و شب' }[stats.peak]} است؛ کارهای مهم همان موقع چیده می‌شوند.`);
  if (pace && pace.done / pace.planned < 0.6) insights.push(`هفته‌ی گذشته ${fa(pace.done)} از ${fa(pace.planned)} کار برنامه‌ریزی‌شده انجام شد؛ برنامه‌ی سبک‌تر واقع‌بینانه‌تر است.`);
  return { load, plannedMin: planned, availableMin: available, restMin: rest, restNeed, verdict, risks, pace, insights };
}

export function verdictText(r: Report, scope: 'day' | 'week', span = scope === 'week' ? 'این هفته' : 'امروز'): string {
  const base = `${span} ${estLabel(r.plannedMin)} کار داری برای ${estLabel(r.availableMin)} وقت (${fa(Math.round(r.load * 100))}٪).`;
  const v = { light: 'برنامه سبک است؛ جا برای کار بیشتر یا استراحت هست.', ok: 'برنامه متعادل است.', heavy: 'برنامه سنگین است؛ کوچک‌ترین تأخیری بقیه را عقب می‌اندازد.', over: 'بیشتر از وقتت برنامه داری؛ باید چیزی را جابه‌جا کنی.' }[r.verdict];
  return `${base} ${v}`;
}

/* ---------- loading helpers ---------- */
export async function scheduleInputs(days = 7): Promise<{ tasks: Task[]; events: CalEvent[]; stats: Stats }> {
  const d0 = today();
  const [tasks, events, stats] = await Promise.all([db.tasks.toArray(), localCalendar.list(d0, dayKey(addDays(new Date(), days))), loadStats()]);
  return { tasks, events, stats };
}

/* ---------- finding free time ---------- */
export interface FreeSlot { day: string; start: number; end: number }
/** Free stretches of at least `minLen` minutes inside your working hours (past time excluded). */
export function freeSlots(days: string[], tasks: Task[], events: CalEvent[], settings: PlannerSettings, minLen: number, now = new Date()): FreeSlot[] {
  const out: FreeSlot[] = [];
  const d0 = dayKey(now);
  for (const d of days) {
    if (d < d0 || settings.daysOff.includes(dayOf(d).getDay())) continue;
    const busy: [number, number][] = blocksFor(d, tasks.filter((t) => !t.done), events).filter((b) => b.kind === 'task' || b.kind === 'event').map((b) => [b.start, b.end]);
    if (d === d0) busy.push([0, round5(nowMin(now) + 5)]);
    for (const [a, z] of freeGaps(busy, toMin(settings.dayStart), toMin(settings.dayEnd))) if (z - a >= minLen) out.push({ day: d, start: a, end: z });
  }
  return out;
}
