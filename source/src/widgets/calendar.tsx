import { ask } from '../ui/Dialog';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { defineWidget } from '../core/widgets';
import {
  JALALI_MONTHS, WEEKDAYS_SHORT, addDays, dayKey, fa, fromJalali, jalaliMonthLength, toJalali, weekCol, formatJalaliLong,
} from '../core/dates';
import { localCalendar } from '../core/providers/calendar';
import { addEvent, removeEvent, sortEvents, syncRange } from '../core/calendar-service';
import { REPEAT_PRESETS, describe } from '../core/recurrence';
import type { CalEvent } from '../core/db';
import { holidaysOn } from '../core/holidays';
import { useStore } from '../core/state';
import { useNow } from '../ui/hooks';
import { IconCalendar, IconChevronL, IconChevronR, IconLayers, IconPlus, IconX } from '../ui/icons';
import { openCalendar } from '../ui/Schedule';
import { openEventEditor } from '../ui/cal/EventEditor';
import { timeLabel } from '../core/events';
import { NONE } from '../core/none';

defineWidget<Record<string, never>>({
  type: 'calendar',
  name: 'تقویم',
  description: 'تقویم شمسی با تعطیلات، رویدادهای خودت و گوگل‌کلندر',
  icon: <IconCalendar />,
  defaultSize: { w: 6, h: 15 },
  minSize: { w: 5, h: 12 },
  defaultConfig: {},
  Component: function Calendar() {
    const now = useNow(60_000);
    const hijriOffset = useStore((st) => st.settings.hijriOffset);
    const today = toJalali(now);
    const [view, setView] = useState({ jy: today.jy, jm: today.jm });
    const [selected, setSelected] = useState(() => dayKey(now));
    const [draft, setDraft] = useState('');
    const [syncError, setSyncError] = useState<string | null>(null);
    const [repeat, setRepeat] = useState('none');
    const [asking, setAsking] = useState<string | null>(null);
    const gConnected = useStore((st) => st.settings.google.connected || st.settings.caldav.enabled);
    const gCalendars = useStore((st) => st.settings.google.calendars);

    const { cells, first, last } = useMemo(() => {
      const first = fromJalali(view.jy, view.jm, 1);
      const len = jalaliMonthLength(view.jy, view.jm);
      const lead = weekCol(first);
      const cells: ({ date: Date; jd: number } | null)[] = Array.from({ length: lead }, () => null);
      for (let i = 0; i < len; i++) cells.push({ date: addDays(first, i), jd: i + 1 });
      while (cells.length % 7) cells.push(null);
      return { cells, first, last: addDays(first, len - 1) };
    }, [view]);

    const events = (useLiveQuery(() => localCalendar.list(dayKey(first), dayKey(last)), [first, last]) ?? NONE).sort(sortEvents);

    // Pull Google events for the visible month (throttled inside), and again every 10 minutes.
    useEffect(() => {
      if (!gConnected) { setSyncError(null); return; }
      const run = (force = false) => void syncRange(dayKey(first), dayKey(last), force).then(setSyncError);
      run();
      const t = window.setInterval(() => run(true), 10 * 60_000);
      return () => window.clearInterval(t);
    }, [first, last, gConnected, gCalendars]);
    const eventDays = new Set(events.map((e) => e.day));
    const selectedEvents = events.filter((e) => e.day === selected);
    const todayKey = dayKey(now);

    const shift = (d: number) =>
      setView((v) => {
        const m = v.jm + d;
        return m < 1 ? { jy: v.jy - 1, jm: 12 } : m > 12 ? { jy: v.jy + 1, jm: 1 } : { jy: v.jy, jm: m };
      });

    const add = async () => {
      const text = draft.trim();
      if (!text) return;
      setDraft('');
      try {
        const rule = REPEAT_PRESETS.find((p) => p.key === repeat)?.rule ?? undefined;
        const note = await addEvent(selected, text, rule ?? undefined);
        setSyncError(note);
        setRepeat('none');
      } catch {
        setDraft(text);
        setSyncError('ثبت رویداد در گوگل انجام نشد');
      }
    };

    const onDelete = async (e: CalEvent) => {
      if (e.seriesId) { setAsking(e.id); return; }
      if (e.source.startsWith('google:') && !(await ask(`«${e.title}» از تقویم گوگل هم حذف شود؟`, { danger: true }))) return;
      void removeEvent(e).catch(() => setSyncError('حذف از گوگل انجام نشد'));
    };

    const selDate = new Date(`${selected}T12:00:00`);
    const selHolidays = holidaysOn(selDate, hijriOffset);

    return (
      <div className="w">
        <div className="w-head">
          <h2 className="w-title">{JALALI_MONTHS[view.jm - 1]} {fa(view.jy)}</h2>
          <span className="w-meta" />
          <div className="w-actions">
            {(view.jy !== today.jy || view.jm !== today.jm || selected !== todayKey) && (
              <button className="btn btn-sm" style={{ border: 0 }} onClick={() => { setView({ jy: today.jy, jm: today.jm }); setSelected(todayKey); }}>امروز</button>
            )}
            <button className="icon-btn" aria-label="تقویم کامل" title="باز کردن تقویم کامل (روز، هفته، ماه)" onClick={() => openCalendar({ view: 'week', day: selected })}><IconLayers size={16} /></button>
            <button className="icon-btn" aria-label="ماه قبل" title="ماه قبل" onClick={() => shift(-1)}><IconChevronR size={16} /></button>
            <button className="icon-btn" aria-label="ماه بعد" title="ماه بعد" onClick={() => shift(1)}><IconChevronL size={16} /></button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', textAlign: 'center', fontSize: 12, fontWeight: 500 }} className="faint">
          {WEEKDAYS_SHORT.map((d) => <span key={d}>{d}</span>)}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: '4px 2px' }}>
          {cells.map((c, i) => {
            if (!c) return <span key={i} />;
            const key = dayKey(c.date);
            const isToday = key === todayKey;
            const isSel = key === selected;
            const hol = holidaysOn(c.date, hijriOffset);
            const isFri = weekCol(c.date) === 6 || hol.length > 0;
            return (
              <button
                key={i}
                onClick={() => setSelected(key)}
                aria-label={formatJalaliLong(c.date)}
                title={hol.map((h) => h.name).join('، ') || undefined}
                aria-pressed={isSel}
                style={{
                  height: 34, borderRadius: 10, fontSize: 14, position: 'relative',
                  border: isSel && !isToday ? '1px solid var(--line-2)' : '1px solid transparent',
                  background: isToday ? 'var(--accent)' : 'transparent',
                  color: isToday ? 'var(--on-accent)' : isFri ? 'var(--danger)' : 'var(--text)',
                  fontWeight: isToday ? 700 : 400,
                }}
              >
                {fa(c.jd)}
                {eventDays.has(key) && (
                  <span style={{ position: 'absolute', bottom: 4, left: '50%', width: 4, height: 4, marginLeft: -2, borderRadius: 2, background: isToday ? 'var(--on-accent)' : (events.find((e) => e.day === key)?.color ?? 'var(--accent)') }} />
                )}
              </button>
            );
          })}
        </div>

        <div style={{ height: 1, background: 'var(--line)' }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{selected === todayKey ? 'امروز · ' : ''}{formatJalaliLong(selDate)}</div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {selHolidays.map((h) => (
            <div key={h.name} style={{ fontSize: 13, color: 'var(--danger)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--danger)' }} />
              {h.name}{h.lunar && <span className="faint" style={{ fontSize: 11 }}>(قمری، ممکن است یک روز جابه‌جا باشد)</span>}
            </div>
          ))}
          {selectedEvents.length === 0 && selHolidays.length === 0 && <span className="faint" style={{ fontSize: 13 }}>رویدادی ثبت نشده. از پایین اضافه کن.</span>}
          {selectedEvents.map((e) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--fill)' }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: e.color ?? 'var(--accent)', flexShrink: 0 }} />
              {e.time && <span className="muted" style={{ fontSize: 12 }}>{timeLabel(e)}</span>}
              <span style={{ flex: 1, fontSize: 13, cursor: 'pointer' }} role="button" tabIndex={0} title="جزئیات و ویرایش" onClick={() => openEventEditor({ event: e })} onKeyDown={(k) => { if (k.key === 'Enter') openEventEditor({ event: e }); }}>
                {e.title}
                {e.rrule && <span className="faint" style={{ fontSize: 11 }} title={describe(e.rrule)}> ↻ {describe(e.rrule)}</span>}
              </span>
              {asking === e.id ? (
                <span style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sm" onClick={() => { setAsking(null); void removeEvent(e, 'one'); }}>فقط این روز</button>
                  <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => { setAsking(null); void removeEvent(e, 'all'); }}>همه</button>
                </span>
              ) : (
                <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label="حذف رویداد" title="حذف" onClick={() => onDelete(e)}>
                  <IconX size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        {syncError && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{syncError}</span>}
        <form className="field" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <IconPlus size={16} className="ico faint" />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="رویداد، مثلاً ۱۴:۳۰ جلسه یا ۱۰-۱۲ کلاس" aria-label="رویداد جدید" />
          <select value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-label="تکرار"
            style={{ border: 0, background: 'transparent', fontSize: 12, color: repeat === 'none' ? 'var(--text-3)' : 'var(--accent)', maxWidth: 96, cursor: 'pointer' }}>
            {REPEAT_PRESETS.map((p) => <option key={p.key} value={p.key} style={{ background: '#12141B', color: '#ECE8E1' }}>{p.label}</option>)}
          </select>
        </form>
      </div>
    );
  },
});
