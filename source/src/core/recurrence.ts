// Repeating events. "Monthly"/"yearly" can follow the Jalali calendar (every 1st of Mehr,
// every 15th of the Jalali month) — something the iCalendar standard cannot express.
import type { CalEvent, Recurrence } from './db';
import { addDays, dayKey, fromJalali, jalaliMonthLength, toJalali } from './dates';

const parseDay = (k: string) => new Date(`${k}T12:00:00`);
const MAX_ITER = 5000;

/** Every occurrence day of a series up to `toDay` (inclusive), honouring count/until/exdates. */
export function seriesDays(start: string, r: Recurrence, toDay: string, exdates: string[] = []): string[] {
  const out: string[] = [];
  const stop = r.until && r.until < toDay ? r.until : toDay;
  const ex = new Set(exdates);
  let produced = 0;
  const push = (k: string) => {
    produced++;
    if (!ex.has(k)) out.push(k);
  };
  const done = () => (r.count !== undefined && produced >= r.count);
  const interval = Math.max(1, r.interval || 1);
  const s = parseDay(start);

  if (r.freq === 'daily') {
    for (let i = 0, d = s; i < MAX_ITER && dayKey(d) <= stop && !done(); i++, d = addDays(s, i * interval)) push(dayKey(d));
    return out;
  }

  if (r.freq === 'weekly') {
    const days = new Set(r.byWeekday?.length ? r.byWeekday : [s.getDay()]);
    // Weeks are counted from the start day's Saturday (Iranian week).
    const weekStart = addDays(s, -((s.getDay() + 1) % 7));
    for (let i = 0; i < MAX_ITER * 7 && !done(); i++) {
      const d = addDays(s, i);
      const k = dayKey(d);
      if (k > stop) break;
      const week = Math.floor(Math.round((d.getTime() - weekStart.getTime()) / 864e5) / 7);
      if (week % interval === 0 && days.has(d.getDay())) push(k);
    }
    return out;
  }

  // monthly / yearly: step months, skip months that lack the day (31st, Esfand 30th, Feb 29th).
  const stepMonths = (r.freq === 'monthly' ? 1 : 12) * interval;
  if (r.calendar === 'jalali') {
    const j = toJalali(s);
    for (let i = 0; i < MAX_ITER && !done(); i++) {
      const m0 = j.jm - 1 + i * stepMonths;
      const jy = j.jy + Math.floor(m0 / 12);
      const jm = (m0 % 12) + 1;
      if (j.jd > jalaliMonthLength(jy, jm)) continue;
      const k = dayKey(fromJalali(jy, jm, j.jd));
      if (k > stop) break;
      push(k);
    }
  } else {
    for (let i = 0; i < MAX_ITER && !done(); i++) {
      const d = new Date(s.getFullYear(), s.getMonth() + i * stepMonths, 1, 12);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      if (s.getDate() > last) continue;
      d.setDate(s.getDate());
      const k = dayKey(d);
      if (k > stop) break;
      push(k);
    }
  }
  return out;
}

/** Occurrences of a series that fall in [fromDay, toDay], as event objects. */
export function expand(master: CalEvent, fromDay: string, toDay: string): CalEvent[] {
  if (!master.rrule) return [];
  // a multi-day series: occurrences that started before `fromDay` may still be running
  const span = master.endDay && master.endDay > master.day ? Math.round((parseDay(master.endDay).getTime() - parseDay(master.day).getTime()) / 864e5) : 0;
  const from = span ? dayKey(addDays(parseDay(fromDay), -span)) : fromDay;
  return seriesDays(master.day, master.rrule, toDay, master.exdates)
    .filter((k) => k >= from)
    .map((k) => ({ ...master, id: `${master.id}@${k}`, day: k, endDay: span ? dayKey(addDays(parseDay(k), span)) : undefined, seriesId: master.id }));
}

const FA_WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

/** Short Persian description, e.g. «هر سال (شمسی)». */
export function describe(r: Recurrence): string {
  const every = r.interval > 1 ? `هر ${r.interval} ` : 'هر ';
  const unit = { daily: 'روز', weekly: 'هفته', monthly: 'ماه', yearly: 'سال' }[r.freq];
  const days = [...(r.byWeekday ?? [])].sort().join();
  if (r.freq === 'weekly' && r.interval === 1 && days === '0,1,2,3,6') return 'شنبه تا چهارشنبه';
  if (r.freq === 'weekly' && r.interval === 1 && days === '0,1,2,3,4,6') return 'شنبه تا پنجشنبه';
  let s = `${every}${unit}`;
  if (r.freq === 'weekly' && r.byWeekday?.length) s += ` (${r.byWeekday.map((d) => FA_WEEKDAYS[d]).join('، ')})`;
  if (r.freq === 'monthly' || r.freq === 'yearly') s += r.calendar === 'jalali' ? ' شمسی' : ' میلادی';
  return s;
}

/** Presets for the quick repeat picker. */
export const REPEAT_PRESETS: { key: string; label: string; rule: Recurrence | null }[] = [
  { key: 'none', label: 'بدون تکرار', rule: null },
  { key: 'daily', label: 'هر روز', rule: { freq: 'daily', interval: 1, calendar: 'jalali' } },
  { key: 'sat-wed', label: 'شنبه تا چهارشنبه', rule: { freq: 'weekly', interval: 1, calendar: 'jalali', byWeekday: [6, 0, 1, 2, 3] } },
  { key: 'sat-thu', label: 'شنبه تا پنجشنبه', rule: { freq: 'weekly', interval: 1, calendar: 'jalali', byWeekday: [6, 0, 1, 2, 3, 4] } },
  { key: 'weekly', label: 'هر هفته', rule: { freq: 'weekly', interval: 1, calendar: 'jalali' } },
  { key: 'jmonthly', label: 'هر ماه شمسی', rule: { freq: 'monthly', interval: 1, calendar: 'jalali' } },
  { key: 'jyearly', label: 'هر سال شمسی', rule: { freq: 'yearly', interval: 1, calendar: 'jalali' } },
  { key: 'gmonthly', label: 'هر ماه میلادی', rule: { freq: 'monthly', interval: 1, calendar: 'gregorian' } },
  { key: 'gyearly', label: 'هر سال میلادی', rule: { freq: 'yearly', interval: 1, calendar: 'gregorian' } },
];
