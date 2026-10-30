import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { defineWidget } from '../core/widgets';
import { useStore } from '../core/state';
import { localCalendar } from '../core/providers/calendar';
import { addDays, dayKey, fa, JALALI_MONTHS, toJalali, WEEKDAYS_FULL, weekCol } from '../core/dates';
import { sortEvents, syncRange } from '../core/calendar-service';
import { useNow } from '../ui/hooks';
import { IconClock, IconLayers } from '../ui/icons';
import { openCalendar } from '../ui/Schedule';
import { emptyAgendaLine } from '../core/voice';
import { openEventEditor } from '../ui/cal/EventEditor';
import { timeLabel } from '../core/events';
import { NONE } from '../core/none';

interface Config {
  days: number;
}

function dayLabel(key: string, todayKey: string, tomorrowKey: string): string {
  if (key === todayKey) return 'امروز';
  if (key === tomorrowKey) return 'فردا';
  const d = new Date(`${key}T12:00:00`);
  const j = toJalali(d);
  return `${WEEKDAYS_FULL[weekCol(d)]} ${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]}`;
}

defineWidget<Config>({
  type: 'agenda',
  name: 'برنامه‌ی پیش‌رو',
  description: 'رویدادهای امروز و روزهای آینده (خودت و گوگل)',
  icon: <IconClock />,
  defaultSize: { w: 6, h: 8 },
  minSize: { w: 4, h: 4 },
  defaultConfig: { days: 7 },
  Component: function Agenda({ config, setConfig }) {
    const now = useNow(60_000);
    const from = dayKey(now);
    const to = dayKey(addDays(now, config.days - 1));
    const tomorrow = dayKey(addDays(now, 1));
    const connected = useStore((s) => s.settings.google.connected || s.settings.caldav.enabled);
    const events = (useLiveQuery(() => localCalendar.list(from, to), [from, to]) ?? NONE).sort(sortEvents);
    const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const upcoming = events.filter((e) => e.day !== from || !e.time || e.time >= nowHM);

    useEffect(() => { if (connected) void syncRange(from, to); }, [from, to, connected]);

    const groups = new Map<string, typeof upcoming>();
    for (const e of upcoming) groups.set(e.day, [...(groups.get(e.day) ?? []), e]);

    return (
      <div className="w">
        <div className="w-head">
          <h2 className="w-title">برنامه‌ی پیش‌رو</h2>
          <span className="w-meta" />
          <button className="icon-btn" aria-label="تقویم کامل" title="باز کردن در تقویم کامل" onClick={() => openCalendar({ view: 'agenda', day: from })}><IconLayers size={16} /></button>
          <select className="mini-select" value={config.days} onChange={(e) => setConfig({ days: Number(e.target.value) })} aria-label="بازه">
            {[1, 3, 7, 14].map((d) => <option key={d} value={d}>{d === 1 ? 'امروز' : `${fa(d)} روز`}</option>)}
          </select>
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {upcoming.length === 0 && <div className="w-empty"><IconClock /><b>{emptyAgendaLine() || 'برنامه‌ای در این بازه نیست'}</b><span>رویدادها را از تقویم اضافه کن.</span></div>}
          {[...groups].map(([day, list]) => (
            <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: day === from ? 'var(--accent)' : 'var(--text-2)' }}>{dayLabel(day, from, tomorrow)}</span>
              {list.map((e) => (
                <div key={e.id} role="button" tabIndex={0} className="ag-row" onClick={() => openEventEditor({ event: e })} onKeyDown={(k) => { if (k.key === 'Enter') openEventEditor({ event: e }); }} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                  <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: e.color ?? 'var(--accent)' }} />
                  <span className="muted tnum" style={{ width: 78, fontSize: 12, flexShrink: 0 }}>{e.time ? timeLabel(e) : 'تمام‌روز'}</span>
                  <span style={{ flex: 1 }}>{e.title}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  },
});
