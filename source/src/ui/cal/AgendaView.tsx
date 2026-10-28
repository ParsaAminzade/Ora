// «فهرست»: the next weeks as a plain list (Google's "Schedule" view), and search results.
import type { CalEvent, Task } from '../../core/db';
import { fa } from '../../core/dates';
import { lastDay, timeLabel } from '../../core/events';
import { describe } from '../../core/recurrence';
import { today } from '../../core/planner';
import { estLabel } from '../../core/taskparse';
import { areaColor, dayTitle, evColor } from './shared';

interface Row { key: string; day: string; sort: string; time: string; title: string; sub?: string; color: string; e?: CalEvent; t?: Task; done?: boolean }

export function AgendaView({ days, events, tasks, query, onOpenEvent, onOpenTask, onPickDay }: {
  days: string[]; events: CalEvent[]; tasks: Task[]; query?: string;
  onOpenEvent(e: CalEvent, r: DOMRect): void; onOpenTask(t: Task, r: DOMRect): void; onPickDay(d: string): void;
}) {
  const t0 = today();
  const rows: Row[] = [];
  const q = query?.trim();
  const set = new Set(days);
  for (const e of events) {
    // a multi-day event is listed on its first visible day
    const d = q ? e.day : (e.day >= days[0] ? e.day : days[0]);
    if (!q && (!set.has(d) || lastDay(e) < days[0])) continue;
    rows.push({ key: e.id, day: d, sort: e.time ?? '', time: timeLabel(e), title: e.title, sub: [e.location, e.rrule ? describe(e.rrule) : ''].filter(Boolean).join(' · ') || undefined, color: evColor(e), e });
  }
  for (const t of tasks) {
    if (!t.when || t.someday) continue;
    if (!q && !set.has(t.when)) continue;
    if (!q && !t.time) continue;
    rows.push({ key: t.id, day: t.when, sort: t.time ?? '99', time: t.time ? fa(t.time) : 'کار', title: t.title, sub: [t.est ? estLabel(t.est) : '', t.area ? `#${t.area}` : ''].filter(Boolean).join(' · ') || undefined, color: t.area ? areaColor(t.area) : 'var(--accent)', t, done: t.done });
  }
  rows.sort((a, b) => a.day.localeCompare(b.day) || a.sort.localeCompare(b.sort));
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(r.day, [...(groups.get(r.day) ?? []), r]);
  return (
    <div className="cal-agenda scroll">
      {q && <p className="faint" style={{ margin: '0 0 8px', fontSize: 13 }}>{rows.length ? `${fa(rows.length)} نتیجه برای «${q}»` : `چیزی با «${q}» پیدا نشد.`}</p>}
      {!q && !rows.length && <div className="w-empty"><b>در این سی روز چیزی ثبت نشده</b><span>روی جدول روز یا هفته بکش تا رویداد بسازی.</span></div>}
      {[...groups].map(([d, list]) => (
        <div key={d} className={`cal-ag-day${d === t0 ? ' is-today' : ''}`}>
          <button className="cal-ag-date" onClick={() => onPickDay(d)}>{d === t0 ? 'امروز · ' : ''}{dayTitle(d)}</button>
          <div className="cal-ag-list">
            {list.map((r) => (
              <button key={r.key} className={`cal-ag-row${r.done ? ' done' : ''}`} style={{ '--c': r.color } as React.CSSProperties}
                onClick={(ev) => { const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect(); if (r.e) onOpenEvent(r.e, rect); else if (r.t) onOpenTask(r.t, rect); }}>
                <i />
                <span className="cal-ag-time">{r.time}</span>
                <span className="cal-ag-title">{r.title}{r.sub && <small>{r.sub}</small>}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
