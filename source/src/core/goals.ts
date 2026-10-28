// Recurring goals (Google Calendar "Goals"): «ورزش، ۳ بار در هفته، ۴۵ دقیقه، صبح». Ora finds room
// for the sessions in your week, spreads them out, and moves a session when something lands on it.
import { db, uid, type CalEvent, type Goal, type Task } from './db';
import { addDays, dayKey, fa } from './dates';
import { localCalendar } from './providers/calendar';
import { plannerOf, today } from './planner';
import { blocksFor, nowMin, toHM, toMin } from './schedule';

const dd = (k: string) => new Date(`${k}T12:00:00`);
export const weekStartOf = (k: string) => dayKey(addDays(dd(k), -((dd(k).getDay() + 1) % 7)));
export const weekDays = (k: string) => Array.from({ length: 7 }, (_, i) => dayKey(addDays(dd(weekStartOf(k)), i)));

const PART: Record<Goal['part'], [number, number] | null> = { morning: [0, 12 * 60], afternoon: [12 * 60, 17 * 60], evening: [17 * 60, 24 * 60], any: null };
export const PART_LABEL: Record<Goal['part'], string> = { morning: 'صبح', afternoon: 'بعدازظهر', evening: 'عصر و شب', any: 'هر وقت' };

function windowOf(g: Goal, dayStart: number, dayEnd: number): [number, number] {
  const p = PART[g.part];
  return p ? [Math.max(dayStart, p[0]), Math.min(dayEnd, p[1])] : [dayStart, dayEnd];
}

function busyOn(d: string, tasks: Task[], events: CalEvent[], skipTask?: string): [number, number][] {
  const b = blocksFor(d, tasks.filter((t) => !t.done && t.id !== skipTask), events).filter((x) => x.kind === 'task' || x.kind === 'event').map((x) => [x.start, x.end] as [number, number]);
  if (d === today()) b.push([0, Math.ceil((nowMin() + 10) / 5) * 5]);
  return b;
}

function freeSlot(busy: [number, number][], [a, z]: [number, number], len: number): number | null {
  const s = [...busy].filter(([x, y]) => y > a && x < z).sort((p, q) => p[0] - q[0]);
  let at = Math.ceil(a / 5) * 5;
  for (const [x, y] of s) { if (x - at >= len) return at; at = Math.max(at, Math.ceil((y + 10) / 5) * 5); }
  return z - at >= len ? at : null;
}

export interface GoalRun { placed: number; moved: { title: string; to: string }[]; short: { title: string; missing: number }[] }

/** Make sure each active goal has its sessions this week, and none of them sits on something else. */
export async function planGoals(now = new Date()): Promise<GoalRun> {
  const goals = (await db.goals.toArray()).filter((g) => g.active);
  const run: GoalRun = { placed: 0, moved: [], short: [] };
  if (!goals.length) return run;
  const p = plannerOf();
  const t0 = dayKey(now);
  // this week and the next, so a Friday still sees next week's sessions
  for (const days of [weekDays(t0), weekDays(dayKey(addDays(dd(weekStartOf(t0)), 7)))]) {
    const events = await localCalendar.list(days[0], days[6]);
    let tasks = await db.tasks.toArray();
    const [ds, de] = [toMin(p.dayStart), toMin(p.dayEnd)];
    for (const g of goals) {
      const allowed = (d: string) => d >= t0 && (g.days?.length ? g.days.includes(dd(d).getDay()) : !p.daysOff.includes(dd(d).getDay()));
      const win = windowOf(g, ds, de);
      const mine = () => tasks.filter((t) => t.goal === g.id && t.when && days.includes(t.when));

      // 1. sessions that now clash with something: move within the day, else to another free day
      for (const s of mine().filter((t) => !t.done && t.time && t.when! >= t0)) {
        const busy = busyOn(s.when!, tasks, events, s.id);
        const a = toMin(s.time!), z = a + (s.len ?? s.est ?? g.minutes);
        if (!busy.some(([x, y]) => a < y && z > x)) continue;
        let target: { d: string; at: number } | null = null;
        for (const d of [s.when!, ...days.filter((x) => x !== s.when && allowed(x) && !mine().some((t) => t.when === x))]) {
          const at = freeSlot(d === s.when ? busy : busyOn(d, tasks, events, s.id), win, g.minutes);
          if (at !== null) { target = { d, at }; break; }
        }
        if (target) {
          await db.tasks.update(s.id, { when: target.d, time: toHM(target.at) });
          run.moved.push({ title: g.title, to: `${target.d === s.when ? '' : `${dayName(target.d)} `}${fa(toHM(target.at))}` });
        } else await db.tasks.update(s.id, { time: undefined });
        tasks = await db.tasks.toArray();
      }

      // 2. top up the week, spreading sessions out
      let need = g.perWeek - mine().length;
      while (need > 0) {
        const taken = mine().map((t) => t.when!);
        const cands = days.filter((d) => allowed(d) && !taken.includes(d));
        if (!cands.length) break;
        const spread = (d: string) => (taken.length ? Math.min(...taken.map((x) => Math.abs((dd(d).getTime() - dd(x).getTime()) / 864e5))) : 0);
        cands.sort((a, b) => spread(b) - spread(a) || a.localeCompare(b));
        let placed = false;
        for (const d of cands) {
          const at = freeSlot(busyOn(d, tasks, events), win, g.minutes);
          if (at === null) continue;
          await db.tasks.put({ id: uid(), title: g.title, done: false, priority: 0, order: Date.now(), createdAt: Date.now(), area: g.area, when: d, time: toHM(at), est: g.minutes, len: g.minutes, goal: g.id, project: g.project });
          tasks = await db.tasks.toArray();
          run.placed++; placed = true;
          break;
        }
        if (!placed) break;
        need--;
      }
      // only this week's shortfall is worth a word (what's left of it may simply be too short)
      if (need > 0 && days[0] === weekStartOf(t0) && days.filter((d) => d >= t0).length >= need) run.short.push({ title: g.title, missing: need });
    }
  }
  return run;
}

const DAY = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const dayName = (k: string) => DAY[dd(k).getDay()];

export interface GoalProgress { done: number; planned: number; target: number; streak: number; weeks: { start: string; done: number }[] }

/** This week's sessions, and how many weeks in a row the goal was met. */
export function goalProgress(g: Goal, tasks: Task[], ref = today()): GoalProgress {
  const days = weekDays(ref);
  const mine = tasks.filter((t) => t.goal === g.id);
  const inWeek = (start: string, t: Task) => !!t.when && t.when >= start && t.when <= dayKey(addDays(dd(start), 6));
  const cur = mine.filter((t) => inWeek(days[0], t));
  const weeks: GoalProgress['weeks'] = [];
  let streak = 0, counting = true;
  for (let i = 1; i <= 12; i++) {
    const start = dayKey(addDays(dd(days[0]), -7 * i));
    if (start < weekStartOf(dayKey(new Date(g.createdAt)))) break;
    const done = mine.filter((t) => t.done && inWeek(start, t)).length;
    weeks.unshift({ start, done });
    if (counting && done >= g.perWeek) streak++; else counting = false;
  }
  const doneNow = cur.filter((t) => t.done).length;
  if (doneNow >= g.perWeek) streak++;
  return { done: doneNow, planned: cur.filter((t) => !t.done && t.time).length, target: g.perWeek, streak, weeks };
}

export async function saveGoal(g: Partial<Goal> & { title: string }): Promise<Goal> {
  const full: Goal = { id: g.id ?? uid(), title: g.title, area: g.area, perWeek: g.perWeek ?? 3, minutes: g.minutes ?? 45, part: g.part ?? 'any', days: g.days, active: g.active ?? true, createdAt: g.createdAt ?? Date.now(), project: g.project };
  await db.goals.put(full);
  // keep future, unfinished sessions in step with the goal
  await db.tasks.filter((t) => t.goal === full.id && !t.done && !!t.when && t.when >= today()).modify((t) => { t.title = full.title; t.area = full.area; t.est = full.minutes; t.len = full.minutes; });
  return full;
}

export async function removeGoal(id: string): Promise<void> {
  await db.goals.delete(id);
  await db.tasks.filter((t) => t.goal === id && !t.done && !!t.when && t.when >= today()).delete();
}
