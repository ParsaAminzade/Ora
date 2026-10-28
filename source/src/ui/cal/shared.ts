// Shared bits of the calendar views: view kinds, ranges, colours, overlap lanes, labels.
import type { CalEvent } from '../../core/db';
import { addDays, dayKey, fa, JALALI_MONTHS, toJalali, weekCol, WEEKDAYS_FULL } from '../../core/dates';
import type { Block } from '../../core/schedule';
import { calOf } from '../../core/calendars';

export type View = 'day' | '3day' | 'week' | 'month' | 'agenda' | 'insights';
export const VIEWS: [View, string, string][] = [['day', 'روز', 'KeyD'], ['3day', '۳ روز', 'KeyX'], ['week', 'هفته', 'KeyW'], ['month', 'ماه', 'KeyM'], ['agenda', 'فهرست', 'KeyA'], ['insights', 'بینش', 'KeyI']];

export const dd = (k: string) => new Date(`${k}T12:00:00`);
export const plus = (k: string, n: number) => dayKey(addDays(dd(k), n));
/** Saturday that starts the (Iranian) week containing `k`. */
export const weekStart = (k: string) => plus(k, -weekCol(dd(k)));
export function monthRange(k: string): { first: string; last: string; gridFrom: string; gridTo: string } {
  const j = toJalali(dd(k));
  let first = k;
  for (let i = 0; i < 31 && toJalali(dd(first)).jd !== 1; i++) first = plus(first, -1);
  let last = first;
  for (let i = 0; i < 31 && toJalali(dd(plus(last, 1))).jm === j.jm; i++) last = plus(last, 1);
  const gridFrom = weekStart(first);
  const gridTo = plus(weekStart(last), 6);
  return { first, last, gridFrom, gridTo };
}

/** The days a view shows around `anchor`. */
export function viewDays(view: View, anchor: string): string[] {
  if (view === 'day') return [anchor];
  if (view === '3day') return [0, 1, 2].map((i) => plus(anchor, i));
  if (view === 'week' || view === 'insights') { const s = weekStart(anchor); return Array.from({ length: 7 }, (_, i) => plus(s, i)); }
  if (view === 'month') { const r = monthRange(anchor); const n = Math.round((dd(r.gridTo).getTime() - dd(r.gridFrom).getTime()) / 864e5) + 1; return Array.from({ length: n }, (_, i) => plus(r.gridFrom, i)); }
  return Array.from({ length: 30 }, (_, i) => plus(anchor, i));
}
export function step(view: View, anchor: string, dir: 1 | -1): string {
  if (view === 'day') return plus(anchor, dir);
  if (view === '3day') return plus(anchor, 3 * dir);
  if (view === 'week' || view === 'insights') return plus(anchor, 7 * dir);
  if (view === 'agenda') return plus(anchor, 30 * dir);
  const r = monthRange(anchor);
  return dir > 0 ? plus(r.last, 1) : monthRange(plus(r.first, -1)).first;
}

export function rangeLabel(view: View, days: string[], anchor: string): string {
  const jd = (k: string) => toJalali(dd(k));
  if (view === 'month') { const j = jd(anchor); return `${JALALI_MONTHS[j.jm - 1]} ${fa(j.jy)}`; }
  if (view === 'insights') return 'بینش زمان';
  if (view === 'day') { const j = jd(anchor); return `${WEEKDAYS_FULL[weekCol(dd(anchor))]} ${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${fa(j.jy)}`; }
  const a = jd(days[0]), b = jd(days[days.length - 1]);
  if (a.jm === b.jm) return `${fa(a.jd)} تا ${fa(b.jd)} ${JALALI_MONTHS[a.jm - 1]} ${fa(a.jy)}`;
  return `${fa(a.jd)} ${JALALI_MONTHS[a.jm - 1]} تا ${fa(b.jd)} ${JALALI_MONTHS[b.jm - 1]} ${fa(b.jy)}`;
}
export function dayTitle(k: string): string {
  const j = toJalali(dd(k));
  return `${WEEKDAYS_FULL[weekCol(dd(k))]} ${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]}`;
}

const hueOf = (s: string) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
export const areaColor = (a: string) => `hsl(${hueOf(a)} 45% 62%)`;
export const evColor = (e: CalEvent) => e.color ?? (e.source === 'local' ? calOf(e.cal).color : 'var(--accent)');
export const blockColor = (b: Block) => (b.kind === 'event' ? (b.ev ? evColor(b.ev) : b.color ?? '#7FA7C9') : b.area ? areaColor(b.area) : 'var(--accent)');

/** Overlapping blocks share the width (lanes). */
export function lanes<T extends { start: number; end: number }>(bs: T[]): (T & { lane: number; of: number })[] {
  const out: (T & { lane: number; of: number })[] = [];
  const sorted = [...bs].sort((a, b) => a.start - b.start || b.end - a.end);
  let group: (T & { lane: number; of: number })[] = [];
  let groupEnd = -1;
  const flush = () => { const n = Math.max(1, ...group.map((g) => g.lane + 1)); group.forEach((g) => (g.of = n)); out.push(...group); group = []; };
  for (const b of sorted) {
    if (b.start >= groupEnd && group.length) flush();
    const used = new Set(group.filter((g) => g.end > b.start).map((g) => g.lane));
    let lane = 0; while (used.has(lane)) lane++;
    group.push({ ...b, lane, of: 1 });
    groupEnd = Math.max(groupEnd, b.end);
  }
  if (group.length) flush();
  return out;
}

export const snap = (m: number, s = 15) => Math.round(m / s) * s;
export const HOUR = 48;
