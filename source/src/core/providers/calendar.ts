// The extension's own calendar (IndexedDB) is the source of truth. Google Calendar, CalDAV
// (your own Radicale server) and ICS files are adapters that copy into / out of it.
import { db, uid, type CalEvent, type Recurrence } from '../db';
import { expand, seriesDays } from '../recurrence';
import { lastDay, shiftDay } from '../events';

export interface NewEvent {
  title: string;
  day: string;
  time?: string;
  end?: string;
  endDay?: string;
  rrule?: Recurrence;
  location?: string;
  notes?: string;
  remind?: number[];
  color?: string;
  cal?: string;
  kind?: 'focus' | 'off';
}

async function tombstone(e: CalEvent) {
  if (e.dav?.href) await db.tombstones.put({ id: e.id, href: e.dav.href, deletedAt: Date.now() });
}

/** Fields that describe an event (not its identity or sync bookkeeping). */
const CONTENT: (keyof CalEvent)[] = ['title', 'day', 'time', 'end', 'endDay', 'location', 'notes', 'remind', 'color', 'cal', 'rrule', 'kind'];

export const localCalendar = {
  id: 'local',
  name: 'تقویم من (روی همین مرورگر)',

  /** Every event shown in [fromDay, toDay]: one-off (also multi-day) events plus occurrences of repeating series. */
  async list(fromDay: string, toDay: string): Promise<CalEvent[]> {
    const single = await db.events.where('day').belowOrEqual(toDay).filter((e) => !e.rrule && lastDay(e) >= fromDay).toArray();
    const masters = await db.events.where('recurring').equals(1).filter((e) => e.day <= toDay).toArray();
    return [...single, ...masters.flatMap((m) => expand(m, fromDay, toDay))];
  },

  async create(input: NewEvent): Promise<CalEvent> {
    const ev: CalEvent = { id: uid(), source: 'local', updatedAt: Date.now(), recurring: input.rrule ? 1 : 0, ...strip(input) } as CalEvent;
    await db.events.put(ev);
    return ev;
  },

  /** Change a stored event (not an expanded occurrence). */
  async update(id: string, patch: Partial<CalEvent>): Promise<void> {
    const cur = await db.events.get(id);
    if (!cur) return;
    const next: CalEvent = { ...cur, ...patch, updatedAt: Date.now() };
    for (const k of Object.keys(patch) as (keyof CalEvent)[]) if (patch[k] === undefined) delete next[k];
    next.recurring = next.rrule ? 1 : 0;
    await db.events.put(next);
  },

  async remove(id: string): Promise<void> {
    const e = await db.events.get(id);
    if (e) await tombstone(e);
    await db.events.delete(id);
  },

  /** Remove one day from a repeating series. */
  async skipOccurrence(seriesId: string, day: string): Promise<void> {
    const m = await db.events.get(seriesId);
    if (!m) return;
    await db.events.update(seriesId, { exdates: [...new Set([...(m.exdates ?? []), day])], updatedAt: Date.now() });
  },

  /** «فقط این»: the series skips `day`, and a standalone copy carries the change. */
  async overrideOccurrence(seriesId: string, day: string, patch: Partial<CalEvent>): Promise<CalEvent | null> {
    const m = await db.events.get(seriesId);
    if (!m) return null;
    await this.skipOccurrence(seriesId, day);
    const span = m.endDay ? Math.round((new Date(`${m.endDay}T12:00`).getTime() - new Date(`${m.day}T12:00`).getTime()) / 864e5) : 0;
    const base = { ...pick(m), title: m.title, id: uid(), source: 'local', day, endDay: span ? shiftDay(day, span) : undefined, rrule: undefined, recurring: 0, overrideOf: seriesId, origDay: day, updatedAt: Date.now() };
    const ev = { ...base, ...patch, rrule: undefined, recurring: 0 as const } as CalEvent;
    await db.events.put(clean(ev));
    return ev;
  },

  /** «این و بعدی‌ها»: the series ends the day before `day`; a new series starts there with the change. */
  async splitSeries(seriesId: string, day: string, patch: Partial<CalEvent>): Promise<CalEvent | null> {
    const m = await db.events.get(seriesId);
    if (!m?.rrule) return null;
    if (day <= m.day) { await this.update(seriesId, patch); return m; }
    const before = seriesDays(m.day, m.rrule, shiftDay(day, -1), m.exdates).length;
    const produced = seriesDays(m.day, { ...m.rrule, count: undefined }, shiftDay(day, -1)).length;
    const oldRule: Recurrence = { ...m.rrule, until: shiftDay(day, -1), count: undefined };
    await this.update(seriesId, { rrule: before ? oldRule : undefined, exdates: m.exdates?.filter((x) => x < day) });
    const rest: Recurrence = { ...m.rrule, count: m.rrule.count ? Math.max(1, m.rrule.count - produced) : undefined };
    const span = m.endDay ? Math.round((new Date(`${m.endDay}T12:00`).getTime() - new Date(`${m.day}T12:00`).getTime()) / 864e5) : 0;
    const ev: CalEvent = clean({ ...pick(m), title: m.title, id: uid(), source: 'local', day, endDay: span ? shiftDay(day, span) : undefined, rrule: rest, recurring: 1, exdates: m.exdates?.filter((x) => x >= day), updatedAt: Date.now(), ...patch });
    if (patch.rrule === undefined && 'rrule' in patch) { ev.rrule = undefined; ev.recurring = 0; }
    await db.events.put(ev);
    return ev;
  },

  /** «این و بعدی‌ها» for deletion: the series simply ends the day before. */
  async endSeriesBefore(seriesId: string, day: string): Promise<void> {
    const m = await db.events.get(seriesId);
    if (!m?.rrule) return;
    if (day <= m.day) { await this.remove(seriesId); return; }
    await this.update(seriesId, { rrule: { ...m.rrule, until: shiftDay(day, -1), count: undefined } });
  },
};

function pick(m: CalEvent): Partial<CalEvent> {
  const o: Partial<CalEvent> = {};
  for (const k of CONTENT) if (m[k] !== undefined) (o as Record<string, unknown>)[k] = m[k];
  return o;
}
function strip(i: NewEvent): Partial<CalEvent> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(i)) if (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length && k !== 'remind')) o[k] = v;
  return o as Partial<CalEvent>;
}
function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}
