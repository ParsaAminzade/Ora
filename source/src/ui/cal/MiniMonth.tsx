// The small Jalali month in the side panel (and the date picker): pick a day, see which days have
// something, and which are holidays.
import { useEffect, useState } from 'react';
import { fa, JALALI_MONTHS, toJalali, weekCol, WEEKDAYS_SHORT } from '../../core/dates';
import { holidaysOn } from '../../core/holidays';
import { useStore } from '../../core/state';
import { today } from '../../core/planner';
import { IconChevronL, IconChevronR } from '../icons';
import { dd, monthRange, plus, viewDays } from './shared';

export function MiniMonth({ value, onPick, marked, range }: { value: string; onPick(d: string): void; marked?: Set<string>; range?: string[] }) {
  const [anchor, setAnchor] = useState(value);
  useEffect(() => setAnchor(value), [value]);
  const hijriOffset = useStore((s) => s.settings.hijriOffset);
  const r = monthRange(anchor);
  const days = viewDays('month', anchor);
  const j = toJalali(dd(r.first));
  const t = today();
  const inRange = new Set(range ?? []);
  return (
    <div className="mini">
      <div className="mini-head">
        <b>{JALALI_MONTHS[j.jm - 1]} {fa(j.jy)}</b>
        <button className="icon-btn" aria-label="ماه قبل" onClick={() => setAnchor(plus(r.first, -1))}><IconChevronR size={14} /></button>
        <button className="icon-btn" aria-label="ماه بعد" onClick={() => setAnchor(plus(r.last, 1))}><IconChevronL size={14} /></button>
      </div>
      <div className="mini-grid">
        {WEEKDAYS_SHORT.map((w) => <span key={w} className="mini-w">{w}</span>)}
        {days.map((d) => {
          const x = dd(d), jd = toJalali(x);
          const off = jd.jm !== j.jm;
          const hol = weekCol(x) === 6 || holidaysOn(x, hijriOffset).length > 0;
          return (
            <button key={d} className={`mini-d${off ? ' out' : ''}${d === t ? ' is-today' : ''}${d === value ? ' sel' : ''}${inRange.has(d) ? ' rng' : ''}${hol ? ' is-off' : ''}`}
              aria-label={`${fa(jd.jd)} ${JALALI_MONTHS[jd.jm - 1]}`} aria-pressed={d === value} onClick={() => onPick(d)}>
              {fa(jd.jd)}{marked?.has(d) && <i />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
