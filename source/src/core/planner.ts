// Planning, built on what the best planners agree on:
//  · a plan day separate from a deadline (Things: "when" vs "deadline"),
//  · at most three things that make today a good day (MIT / top three),
//  · estimates checked against the hours you really have (Sunsama's capacity line, with a buffer
//    for the planning fallacy),
//  · unfinished work rolls over visibly, never silently (with a count of how often it slipped),
//  · a short daily planning ritual in the morning and a shutdown in the evening.
import { db, uid, type Task } from './db';
import { addDays, dayKey } from './dates';
import { seriesDays } from './recurrence';
import { useStore } from './state';
import type { Parsed } from './taskparse';

export const today = () => dayKey(new Date());
export const tomorrow = () => dayKey(addDays(new Date(), 1));

export interface PlannerSettings {
  hours: number; buffer: number; morning: boolean; evening: boolean; eveningAt: number;
  /** The part of the day plans may use, HH:MM. */
  dayStart: string; dayEnd: string;
  /** Days with no planned work (JS getDay(): 5 = Friday). */
  daysOff: number[];
  /** Work rhythm: minutes of focus before a short break. */
  focus: 25 | 50 | 90;
  /** When hard work goes best ('auto' = learned from what you actually finish). */
  peak: 'auto' | 'morning' | 'afternoon' | 'evening';
  /** Ask at the end of each time block whether it is done. */
  liveCheck: boolean;
}
export const DEFAULT_PLANNER: PlannerSettings = {
  hours: 6, buffer: 1.25, morning: true, evening: true, eveningAt: 18,
  dayStart: '08:00', dayEnd: '22:00', daysOff: [], focus: 50, peak: 'auto', liveCheck: true,
};
export const plannerOf = (): PlannerSettings => ({ ...DEFAULT_PLANNER, ...useStore.getState().settings.planner });

/** Open tasks that belong to today: planned for today or earlier (rolled over), or due today. */
export function isToday(t: Task, d = today()): boolean {
  if (t.done || t.someday) return false;
  return (!!t.when && t.when <= d) || (!!t.due && t.due <= d) || !!t.top;
}
export const isOverdue = (t: Task, d = today()) => !t.done && !!t.when && t.when < d;
export const isInbox = (t: Task) => !t.done && !t.when && !t.someday && !t.top;

/** Sort inside a view: top three, then timed (by time), then important, then the rest. */
export function byPlan(a: Task, b: Task): number {
  return Number(a.done) - Number(b.done)
    || Number(!!b.top) - Number(!!a.top)
    || (a.time && b.time ? a.time.localeCompare(b.time) : Number(!!b.time) - Number(!!a.time))
    || b.priority - a.priority
    || a.order - b.order;
}

/** Planned minutes for the open tasks of a day, with the planning-fallacy buffer. */
export function load(tasks: Task[], d = today()): { planned: number; buffered: number; capacity: number; missing: number } {
  const p = plannerOf();
  const open = tasks.filter((t) => isToday(t, d));
  const planned = open.reduce((a, t) => a + (t.est ?? 0), 0);
  return { planned, buffered: Math.round(planned * p.buffer), capacity: p.hours * 60, missing: open.filter((t) => !t.est).length };
}

export async function addParsed(p: Parsed): Promise<Task> {
  const t: Task = {
    id: uid(), title: p.title, done: false, priority: p.priority ?? 0, order: Date.now(), createdAt: Date.now(),
    area: p.area, when: p.when ?? (p.someday ? undefined : today()), due: p.due, time: p.time, est: p.est, top: p.top, someday: p.someday, repeat: p.repeat,
  };
  if (t.area) {
    const st = useStore.getState();
    if (!st.settings.areas.includes(t.area)) st.setSettings({ areas: [...st.settings.areas, t.area] });
  }
  await db.tasks.put(t);
  return t;
}

/** Why a task can't be ticked yet: it belongs to a later day, or its time hasn't come. */
export function notYet(t: Task, now = new Date()): 'day' | 'time' | null {
  if (t.done) return null;
  const d = dayKey(now);
  if (t.when && t.when > d) return 'day';
  if (t.when === d && t.time) { const [h, m] = t.time.split(':').map(Number); if (h * 60 + m > now.getHours() * 60 + now.getMinutes()) return 'time'; }
  return null;
}
const hmNow = () => { const n = new Date(); return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; };

/** Done / undone. A repeating task leaves a finished copy behind and moves itself to its next day.
 *  Work planned for later can't be ticked by accident: Ora asks, and if you really did it early,
 *  it is moved to now first so the record (and what Ora learns from it) stays true. Returns false when not ticked. */
export async function toggleDone(t: Task, opts: { early?: boolean } = {}): Promise<boolean> {
  if (t.done) { await db.tasks.update(t.id, { done: false, doneAt: undefined }); return true; }
  const why = notYet(t);
  if (why && !opts.early) {
    dispatchEvent(new CustomEvent('ora:say', { detail: {
      title: why === 'day' ? 'این کار مال روز دیگری است' : 'هنوز وقتش نرسیده',
      text: why === 'day' ? `«${t.title}» برای ${t.when === tomorrow() ? 'فردا' : 'روز دیگری'} برنامه‌ریزی شده؛ تا آن روز نمی‌شود تیکش زد.` : `«${t.title}» ساعت ${t.time} شروع می‌شود؛ قبل از وقتش تیک نمی‌خورد.`,
      sticky: true,
      choices: [{ label: 'زودتر انجامش دادم', run: () => void toggleDone(t, { early: true }) }],
    } }));
    return false;
  }
  if (why && opts.early) {
    // done early: it happened today, now — record it that way
    const len = t.len ?? t.est;
    const nowHM = hmNow();
    const [h, m] = nowHM.split(':').map(Number);
    const start = Math.max(0, h * 60 + m - (len ?? 0));
    t = { ...t, when: today(), time: t.time ? `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}` : undefined };
    await db.tasks.update(t.id, { when: t.when, time: t.time });
  }
  // A timed block finished today teaches the planner how long this kind of work really takes.
  if (t.time && t.when === today() && t.est && !t.fixed) {
    const [h, m] = t.time.split(':').map(Number);
    const now = new Date(); const actual = now.getHours() * 60 + now.getMinutes() - (h * 60 + m);
    if (actual >= 5 && actual <= t.est * 4) void import('./schedule').then((s) => s.logOutcome({ area: t.area ?? '—', est: t.est!, actual, hour: h, done: true }));
  }
  if (t.repeat) {
    const start = t.when ?? today();
    const nextDay = seriesDays(start, t.repeat, dayKey(addDays(new Date(), 400))).find((k) => k > today() && k > start);
    await db.tasks.put({ ...t, id: uid(), done: true, doneAt: Date.now(), repeat: undefined, top: false });
    if (nextDay) {
      await db.tasks.update(t.id, { when: nextDay, top: false, steps: t.steps?.map((s) => ({ ...s, done: false })), slips: 0 });
      return true;
    }
  }
  await db.tasks.update(t.id, { done: true, doneAt: Date.now() });
  return true;
}

/** Move to another day. Pushing a task later counts as a slip, so the planner can say so. */
export async function reschedule(t: Task, when: string | undefined, opts: { someday?: boolean } = {}): Promise<void> {
  const later = !!(t.when && when && when > t.when) || (!!t.when && t.when < today() && !!when);
  await db.tasks.update(t.id, { when, someday: opts.someday ?? false, top: when === today() ? t.top : false, slips: (t.slips ?? 0) + (later ? 1 : 0) });
}

/** Mark as one of today's top three (max three). Returns false when three are already chosen. */
export async function setTop(t: Task, on: boolean): Promise<boolean> {
  if (on) {
    const tops = await db.tasks.filter((x) => !x.done && !!x.top).count();
    if (tops >= 3) return false;
    await db.tasks.update(t.id, { top: true, when: t.when && t.when <= today() ? t.when : today(), someday: false });
  } else await db.tasks.update(t.id, { top: false });
  return true;
}

/** Give today's open tasks start times one after another, around what is already fixed. */
export async function timeBlock(tasks: Task[], startHM: string): Promise<number> {
  const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const toHM = (n: number) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  const fixed = tasks.filter((t) => t.time).map((t) => [toMin(t.time!), toMin(t.time!) + (t.est ?? 30)] as const);
  let at = toMin(startHM);
  let n = 0;
  for (const t of tasks.filter((x) => !x.time).sort(byPlan)) {
    const len = t.est ?? 30;
    // jump over fixed blocks that overlap
    for (let guard = 0; guard < 20; guard++) {
      const hit = fixed.find(([a, b]) => at < b && at + len > a);
      if (!hit) break;
      at = hit[1] + 5;
    }
    if (at + len > 24 * 60) break;
    await db.tasks.update(t.id, { time: toHM(at) });
    at += len + 10; // ten minutes between blocks
    n++;
  }
  return n;
}

/* ---------- the one task you are focusing on (shared with the timer) ---------- */
const FOCUS = 'ora:focus-task';
export const focusTaskId = (): string | null => { try { return localStorage.getItem(FOCUS); } catch { return null; } };
export function setFocusTask(id: string | null): void {
  try { if (id) localStorage.setItem(FOCUS, id); else localStorage.removeItem(FOCUS); } catch { /* private */ }
  dispatchEvent(new Event('ora:focus-changed'));
}
export async function logFocus(minutes: number): Promise<void> {
  const id = focusTaskId();
  if (!id) return;
  const t = await db.tasks.get(id);
  if (t) await db.tasks.update(id, { spent: (t.spent ?? 0) + minutes });
}

/* ---------- daily rituals: morning plan, evening shutdown ---------- */
const RIT = 'ora:ritual';
const ritual = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(RIT) ?? '{}'); } catch { return {}; } };
export function ritualDue(kind: 'morning' | 'evening', now = new Date()): boolean {
  const p = plannerOf();
  if (kind === 'morning' && (!p.morning || now.getHours() < 5 || now.getHours() >= 13)) return false;
  if (kind === 'evening' && (!p.evening || now.getHours() < p.eveningAt)) return false;
  return ritual()[kind] !== dayKey(now);
}
export function ritualDone(kind: 'morning' | 'evening', now = new Date()): void {
  try { localStorage.setItem(RIT, JSON.stringify({ ...ritual(), [kind]: dayKey(now) })); } catch { /* private */ }
}

/** One-time upgrade: before 1.7 every open task was simply «today's». Keep it that way. */
export async function migrateTasks(): Promise<void> {
  const KEY = 'ora:tasks-v2';
  try { if (localStorage.getItem(KEY)) return; } catch { return; }
  const d = today();
  await db.tasks.toCollection().modify((t) => { if (!t.done && !t.when && !t.someday) t.when = d; });
  try { localStorage.setItem(KEY, '1'); } catch { /* private */ }
}

export const openPlanner = (step: 'plan' | 'shutdown' = 'plan') => dispatchEvent(new CustomEvent('ora:planner', { detail: step }));
