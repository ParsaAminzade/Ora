// One entry point for the calendar widgets: add / change / remove events wherever they belong,
// and keep the Google copy fresh. Widgets never talk to a provider directly.
import { db, uid as newId, type CalEvent, type Recurrence, type Task } from './db';
import { daysBetween, durationMin, shiftDay, toHM as hm, toMin as mn } from './events';
import { useStore } from './state';
import { localCalendar, type NewEvent } from './providers/calendar';
import { createGoogleEvent, deleteGoogleEvent, NeedsSignIn, patchGoogleEvent, syncGoogle } from './providers/google';
import { pad2 } from './dates';
import { scheduleCalDavSync, syncCalDav } from './providers/caldav';
import { pushUndo, withUndo } from './undo';

const toLatin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

const D = '[0-9۰-۹]';
const RANGE = new RegExp(`^(${D}{1,2})(?::(${D}{2}))?\\s*(?:-|–|تا)\\s*(${D}{1,2})(?::(${D}{2}))?\\s+(.+)$`);
const SINGLE = new RegExp(`^(${D}{1,2})(?::(${D}{2}))?\\s+(.+)$`);

/** "14:30 جلسه" / "۹ کلاس" / "۱۴-۱۶ کارگاه" / "۱۰ تا ۱۱:۳۰ کلاس" → { time, end?, title } */
export function parseQuickEvent(text: string): { title: string; time?: string; end?: string } {
  const t = text.trim();
  const n = (x?: string) => Number(toLatin(x ?? '0'));
  const r = t.match(RANGE);
  if (r && n(r[1]) < 24 && n(r[3]) <= 24 && n(r[2]) < 60 && n(r[4]) < 60) {
    return { time: `${pad2(n(r[1]))}:${pad2(n(r[2]))}`, end: `${pad2(n(r[3]))}:${pad2(n(r[4]))}`, title: r[5].trim() };
  }
  const m = t.match(SINGLE);
  if (m && n(m[1]) < 24 && n(m[2]) < 60) return { time: `${pad2(n(m[1]))}:${pad2(n(m[2]))}`, title: m[3].trim() };
  return { title: t };
}

/** Where new events go: 'local' or a Google calendar id. */
export const defaultTarget = () => { const g = useStore.getState().settings.google; return g.connected && g.target !== 'local' ? g.target : 'local'; };

export interface Draft extends NewEvent { target?: string }

/** Create an event. Returns a short note when it had to go somewhere other than asked. */
export async function createEvent(d: Draft): Promise<{ note: string | null; event: CalEvent | null }> {
  const target = d.target ?? defaultTarget();
  const { target: _t, ...input } = d; // eslint-disable-line @typescript-eslint/no-unused-vars
  if (target !== 'local' && d.rrule?.calendar === 'jalali' && d.rrule.freq !== 'daily' && d.rrule.freq !== 'weekly') {
    const ev = await withUndo('رویداد ساخته شد', () => localCalendar.create(input));
    scheduleCalDavSync();
    return { note: 'تکرار شمسی در گوگل ممکن نیست؛ در تقویم خودت ثبت شد.', event: ev };
  }
  if (target !== 'local') {
    const ev = await createGoogleEvent(target, input);
    if (ev) pushUndo('رویداد ساخته شد', () => deleteGoogleEvent(ev));
    return { note: null, event: ev };
  }
  const ev = await withUndo('رویداد ساخته شد', () => localCalendar.create(input));
  scheduleCalDavSync();
  return { note: null, event: ev };
}

/** Quick add from a one-line text («۱۴:۳۰ جلسه»). */
export async function addEvent(day: string, text: string, rrule?: Recurrence): Promise<string | null> {
  const { title, time, end } = parseQuickEvent(text);
  if (!title) return null;
  return (await createEvent({ title, day, time, end, rrule })).note;
}

export type Scope = 'one' | 'following' | 'all';
const isGoogle = (e: CalEvent) => e.source.startsWith('google:') && !!e.externalId;
export const isRepeating = (e: CalEvent) => !!e.seriesId || !!e.recurringEventId;

/** Change an event (or one / the rest / all of a repeating series). */
export async function updateEvent(e: CalEvent, patch: Partial<CalEvent>, scope: Scope = 'all', label = 'رویداد تغییر کرد'): Promise<void> {
  if (isGoogle(e)) {
    const keys = Object.keys(patch) as (keyof CalEvent)[];
    const old = Object.fromEntries(keys.map((k) => [k, e[k]]));
    await patchGoogleEvent(e, patch as never, scope !== 'one');
    if (scope === 'one') pushUndo(label, async () => { const cur = { ...e, ...patch }; await patchGoogleEvent(cur, old as never, false); });
    return;
  }
  await withUndo(label, async () => {
    if (!e.seriesId) { await localCalendar.update(e.id, patch); return; }
    if (scope === 'one') { await localCalendar.overrideOccurrence(e.seriesId, e.day, patch); return; }
    if (scope === 'following') { await localCalendar.splitSeries(e.seriesId, e.day, patch); return; }
    // all: a dragged occurrence moves the whole series by the same number of days
    const m = await db.events.get(e.seriesId);
    if (!m) return;
    const p: Partial<CalEvent> = { ...patch };
    if (patch.day && patch.day !== e.day) {
      const delta = daysBetween(e.day, patch.day);
      p.day = shiftDay(m.day, delta);
      if (patch.endDay) p.endDay = shiftDay(m.day, delta + daysBetween(patch.day, patch.endDay));
    } else if ('endDay' in patch) {
      p.endDay = patch.endDay ? shiftDay(m.day, daysBetween(e.day, patch.endDay)) : undefined;
    }
    await localCalendar.update(e.seriesId, p);
  });
  scheduleCalDavSync();
}

/** scope 'one' removes only this day of a repeating series; 'following' ends the series there. */
export async function removeEvent(e: CalEvent, scope: Scope = 'all'): Promise<void> {
  if (isGoogle(e)) { await deleteGoogleEvent(e, scope !== 'one'); return; }
  await withUndo('رویداد حذف شد', async () => {
    if (e.seriesId && scope === 'one') await localCalendar.skipOccurrence(e.seriesId, e.day);
    else if (e.seriesId && scope === 'following') await localCalendar.endSeriesBefore(e.seriesId, e.day);
    else await localCalendar.remove(e.seriesId ?? e.id);
  });
  scheduleCalDavSync();
}

/** Returns a Persian error message, or null when fine / nothing to sync. */
let lastDav = 0;

export async function syncRange(fromDay: string, toDay: string, force = false): Promise<string | null> {
  // Your own server first: it works without internet.
  if (useStore.getState().settings.caldav.enabled && (force || Date.now() - lastDav > 5 * 60_000)) {
    lastDav = Date.now();
    try { await syncCalDav(); } catch (e) { return (e as Error).message; }
  }
  try {
    await syncGoogle(fromDay, toDay, force);
    return null;
  } catch (e) {
    return e instanceof NeedsSignIn ? 'نیاز به ورود دوباره به گوگل (شخصی‌سازی ← تقویم‌ها)' : 'همگام‌سازی با گوگل انجام نشد';
  }
}

export const sortEvents = (a: CalEvent, b: CalEvent) =>
  a.day.localeCompare(b.day) || Number(!!a.time) - Number(!!b.time) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title);

/* ---------- switching format: event ⇄ task ---------- */

/** An event becomes a time-blocked task (a repeating one keeps repeating as a task). */
export async function eventToTask(e: CalEvent, scope: Scope = 'all'): Promise<Task> {
  const len = e.time ? Math.max(5, Math.min(durationMin(e), 24 * 60)) : undefined;
  const notes = [e.location, e.notes].filter(Boolean).join('\n') || undefined;
  const series = e.seriesId ? await db.events.get(e.seriesId) : null;
  const task: Task = {
    id: newId(), title: e.title, done: false, priority: 0, order: Date.now(), createdAt: Date.now(),
    when: e.day, time: e.time, est: len, len, notes,
    repeat: scope !== 'one' ? (series?.rrule ?? e.rrule) : undefined,
  };
  for (const k of Object.keys(task) as (keyof Task)[]) if (task[k] === undefined) delete task[k];
  if (e.source.startsWith('google:') && e.externalId) {
    await deleteGoogleEvent(e, scope !== 'one');
    await db.tasks.put(task);
    return task;
  }
  await withUndo('به کار تبدیل شد', async () => {
    if (e.seriesId && scope === 'one') await localCalendar.skipOccurrence(e.seriesId, e.day);
    else if (e.seriesId && scope === 'following') await localCalendar.endSeriesBefore(e.seriesId, e.day);
    else await localCalendar.remove(e.seriesId ?? e.id);
    await db.tasks.put(task);
  });
  scheduleCalDavSync();
  return task;
}

/** A task becomes an event (a fixed appointment in the calendar). */
export async function taskToEvent(t: Task): Promise<CalEvent | null> {
  const len = t.len ?? t.est ?? 60;
  const end = t.time ? hm(Math.min(24 * 60, mn(t.time) + len)) : undefined;
  let ev: CalEvent | null = null;
  await withUndo('به رویداد تبدیل شد', async () => {
    ev = (await createEvent({ title: t.title, day: t.when ?? today(), time: t.time, end, notes: t.notes, rrule: t.repeat, remind: t.time ? [10] : undefined, target: 'local' })).event;
    await db.tasks.delete(t.id);
  });
  return ev;
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
