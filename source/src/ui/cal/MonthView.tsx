// Month view: the Jalali month as a grid of weeks (Saturday first). Each day shows its events and
// timed tasks; click a day's number to open it, click empty space to add, drag a chip to move it.
import { useRef, useState } from 'react';
import type { CalEvent, Task } from '../../core/db';
import { fa, toJalali, weekCol, WEEKDAYS_FULL } from '../../core/dates';
import { lastDay, timeLabel } from '../../core/events';
import { today } from '../../core/planner';
import { dd, evColor, areaColor } from './shared';

interface Item { key: string; text: string; time?: string; color: string; e?: CalEvent; task?: Task; allDay: boolean; done?: boolean }

export function MonthView({ days, month, events, tasks, holidays, onPickDay, onCreate, onOpenEvent, onOpenTask, onMoveEvent, onMoveTask }: {
  days: string[]; month: number; events: CalEvent[]; tasks: Task[]; holidays: Map<string, string[]>;
  onPickDay(d: string): void; onCreate(d: string, rect: DOMRect): void; onOpenEvent(e: CalEvent, rect: DOMRect): void; onOpenTask(t: Task, rect: DOMRect): void;
  onMoveEvent(e: CalEvent, day: string): void; onMoveTask(t: Task, day: string): void;
}) {
  const t = today();
  const [over, setOver] = useState<string | null>(null);
  const drag = useRef<Item | null>(null);
  const itemsOf = (d: string): Item[] => {
    const ev = events.filter((e) => e.day <= d && lastDay(e) >= d).sort((a, b) => Number(!!a.time) - Number(!!b.time) || (a.time ?? '').localeCompare(b.time ?? ''))
      .map((e): Item => ({ key: e.id, text: e.title, time: e.time, color: evColor(e), e, allDay: !e.time }));
    const tk = tasks.filter((x) => x.when === d && x.time && !x.someday).map((x): Item => ({ key: x.id, text: x.title, time: x.time, color: x.area ? areaColor(x.area) : 'var(--accent)', task: x, allDay: false, done: x.done }));
    return [...ev, ...tk].sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || (a.time ?? '').localeCompare(b.time ?? ''));
  };
  const rows = days.length / 7;
  return (
    <div className="cal-month" style={{ gridTemplateRows: `auto repeat(${rows}, minmax(0, 1fr))` }}>
      {WEEKDAYS_FULL.map((w) => <span key={w} className="cal-mh">{w}</span>)}
      {days.map((d) => {
        const j = toJalali(dd(d));
        const items = itemsOf(d);
        const hol = holidays.get(d) ?? [];
        const max = rows > 5 ? 2 : 3;
        const off = j.jm !== month;
        return (
          <div key={d} className={`cal-mc${off ? ' out' : ''}${d === t ? ' is-today' : ''}${over === d ? ' over' : ''}`}
            onClick={(e) => { if (e.target === e.currentTarget) onCreate(d, (e.currentTarget as HTMLElement).getBoundingClientRect()); }}
            onDragOver={(e) => { if (drag.current) { e.preventDefault(); setOver(d); } }}
            onDragLeave={() => setOver((o) => (o === d ? null : o))}
            onDrop={(e) => { e.preventDefault(); setOver(null); const it = drag.current; drag.current = null; if (!it) return; if (it.e && it.e.day !== d) onMoveEvent(it.e, d); if (it.task && it.task.when !== d) onMoveTask(it.task, d); }}>
            <button className={`cal-mn${hol.length || weekCol(dd(d)) === 6 ? ' is-off' : ''}`} onClick={() => onPickDay(d)} aria-label={`نمای روز ${fa(j.jd)}`}>{fa(j.jd)}</button>
            {hol.slice(0, 1).map((h) => <span key={h} className="cal-mhol" title={hol.join('، ')}>{h}</span>)}
            {items.slice(0, max).map((it) => (
              <button key={it.key} draggable className={`cal-mi${it.allDay ? ' ad' : ''}${it.done ? ' done' : ''}`} style={{ '--c': it.color } as React.CSSProperties}
                onDragStart={(e) => { drag.current = it; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.text); }}
                onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); if (it.e) onOpenEvent(it.e, r); else if (it.task) onOpenTask(it.task, r); }}
                title={it.e ? `${it.text} · ${timeLabel(it.e)}` : it.text}>
                {!it.allDay && <i />}{it.time && <span className="cal-mi-t">{fa(it.time)}</span>}<span className="cal-mi-x">{it.text}</span>
              </button>
            ))}
            {items.length > max && <button className="cal-mmore" onClick={() => onPickDay(d)}>{fa(items.length - max)} مورد دیگر</button>}
          </div>
        );
      })}
    </div>
  );
}
