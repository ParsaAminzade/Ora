// «بینش زمان» (like Google's Time Insights): where a week or a month really went — meetings vs your
// own work, by calendar and by area, planned vs done — compared with the period before.
import type { CalEvent, Task } from './db';
import { addDays, dayKey, fa } from './dates';
import { durationMin, rangeOn } from './events';
import { estLabel } from './taskparse';

export interface DayBar { day: string; events: number; done: number; open: number }
export interface Insight {
  from: string; to: string;
  eventMin: number; taskMin: number; doneMin: number; focusMin: number;
  byCal: { key: string; name: string; color: string; min: number }[];
  byArea: { area: string; planned: number; done: number }[];
  perDay: DayBar[];
  busiest?: string;
  notes: string[];
}

const blockLen = (t: Task) => t.len ?? t.est ?? 30;

export function insight(from: string, to: string, events: CalEvent[], tasks: Task[], calName: (e: CalEvent) => { key: string; name: string; color: string }, prev?: Insight): Insight {
  const days: string[] = [];
  for (let d = new Date(`${from}T12:00`); dayKey(d) <= to; d = addDays(d, 1)) days.push(dayKey(d));
  const perDay: DayBar[] = days.map((d) => ({ day: d, events: 0, done: 0, open: 0 }));
  const idx = new Map(days.map((d, i) => [d, i]));
  const cal = new Map<string, { key: string; name: string; color: string; min: number }>();
  let eventMin = 0;
  for (const e of events) {
    if (!e.time || e.kind === 'focus') continue; // all-day and focus windows are not time spent in meetings
    for (const d of days) {
      const r = rangeOn(e, d);
      if (!r) continue;
      const m = r[1] - r[0];
      eventMin += m;
      perDay[idx.get(d)!].events += m;
      if (e.kind === 'off') continue;
      const c = calName(e);
      const x = cal.get(c.key) ?? { ...c, min: 0 };
      x.min += m; cal.set(c.key, x);
    }
  }
  const area = new Map<string, { area: string; planned: number; done: number }>();
  let taskMin = 0, doneMin = 0, focusMin = 0;
  for (const t of tasks) {
    if (!t.when || !idx.has(t.when) || t.someday) continue;
    const planned = t.time ? blockLen(t) : t.done ? (t.est ?? 0) : 0;
    if (!planned && !t.spent) continue;
    taskMin += planned;
    if (t.done) doneMin += planned;
    focusMin += t.spent ?? 0;
    const bar = perDay[idx.get(t.when)!];
    if (t.done) bar.done += planned; else bar.open += planned;
    const a = t.area ?? 'بدون حوزه';
    const x = area.get(a) ?? { area: a, planned: 0, done: 0 };
    x.planned += planned; if (t.done) x.done += planned;
    area.set(a, x);
  }
  const byCal = [...cal.values()].sort((a, b) => b.min - a.min);
  const byArea = [...area.values()].sort((a, b) => b.planned - a.planned);
  const busiest = [...perDay].sort((a, b) => (b.events + b.done + b.open) - (a.events + a.done + a.open))[0];
  const notes: string[] = [];
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  if (taskMin) notes.push(`از ${estLabel(taskMin)} کاری که برنامه‌ریزی کرده بودی، ${estLabel(doneMin)} انجام شد (${fa(pct(doneMin, taskMin))}٪).`);
  if (eventMin && taskMin) notes.push(eventMin > taskMin ? `وقت جلسه‌ها و رویدادها (${estLabel(eventMin)}) از وقت کار خودت (${estLabel(taskMin)}) بیشتر بود.` : `${fa(pct(taskMin, eventMin + taskMin))}٪ وقتِ برنامه‌ریزی‌شده‌ات مال کار خودت بود و بقیه جلسه و رویداد.`);
  if (prev && prev.eventMin + prev.taskMin > 0) {
    const cur = eventMin + taskMin, old = prev.eventMin + prev.taskMin;
    const ch = pct(cur - old, old);
    if (Math.abs(ch) >= 15) notes.push(`نسبت به دوره‌ی قبل ${fa(Math.abs(ch))}٪ ${ch > 0 ? 'شلوغ‌تر' : 'خلوت‌تر'} بود.`);
    if (prev.taskMin && taskMin) { const r0 = prev.doneMin / prev.taskMin, r1 = doneMin / taskMin; if (Math.abs(r1 - r0) >= 0.15) notes.push(r1 > r0 ? 'نسبت به دوره‌ی قبل، بیشتر از برنامه‌ات را انجام دادی.' : 'نسبت به دوره‌ی قبل، سهم کمتری از برنامه‌ات انجام شد؛ شاید برنامه سنگین‌تر بوده.'); }
  }
  const leak = byArea.find((a) => a.planned >= 120 && a.done / a.planned < 0.4);
  if (leak) notes.push(`کارهای ${leak.area === 'بدون حوزه' ? 'بدون حوزه' : `#${leak.area}`} بیشتر از همه عقب ماند (${fa(pct(leak.done, leak.planned))}٪ انجام).`);
  if (focusMin) notes.push(`${estLabel(focusMin)} با تایمر تمرکز کار کردی.`);
  return { from, to, eventMin, taskMin, doneMin, focusMin, byCal, byArea, perDay, busiest: busiest && busiest.events + busiest.done + busiest.open > 0 ? busiest.day : undefined, notes };
}

export { durationMin };
