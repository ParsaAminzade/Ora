// Settings for the big calendar: second clock, default reminders, default calendar.
import { useStore } from '../../core/state';
import { DEFAULT_CAL_PREFS, localTz, setCalPrefs, TZ_PRESETS, tzLabel } from '../../core/calendars';
import { REMIND_OPTIONS } from '../../core/events';
import { Row } from '../Panels';

export function CalendarPrefsBlock() {
  const prefs = useStore((s) => s.settings.calendar) ?? DEFAULT_CAL_PREFS;
  const cals = prefs.cals?.length ? prefs.cals : DEFAULT_CAL_PREFS.cals;
  const def = prefs.defaultRemind ?? [10];
  return (
    <div className="cal-prefs">
      <Row label="ساعت دوم کنار ساعت‌ها" hint={`برای وقتی با شهر دیگری کار داری. ساعت این‌جا: ${tzLabel(localTz())}`}>
        <select className="mini-select ev-sel" aria-label="ساعت دوم" value={prefs.secondTz ?? ''} onChange={(e) => setCalPrefs({ secondTz: e.target.value || undefined })}>
          <option value="">ندارد</option>
          {TZ_PRESETS.filter(([z]) => z !== localTz()).map(([z, n]) => <option key={z} value={z}>{n}</option>)}
        </select>
      </Row>
      <Row label="یادآوری پیش‌فرض رویداد تازه" hint="اعلان سیستم، حتی وقتی تبی باز نیست؛ و اگر تب باز باشد، اورآ هم می‌گوید.">
        <div className="day-pills">
          {REMIND_OPTIONS.filter(([m]) => m < 1440).map(([m, n]) => (
            <button key={m} className="pill pill-xs" aria-pressed={def.includes(m)} onClick={() => setCalPrefs({ defaultRemind: def.includes(m) ? def.filter((x) => x !== m) : [...def, m].sort((a, b) => a - b) })}>{n}</button>
          ))}
        </div>
      </Row>
      <Row label="تقویم اصلی رویدادهای خودت">
        <select className="mini-select ev-sel" aria-label="تقویم اصلی رویدادهای خودت" value={cals.find((c) => c.default)?.id ?? cals[0].id}
          onChange={(e) => setCalPrefs({ cals: cals.map((c) => ({ ...c, default: c.id === e.target.value })) })}>
          {cals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Row>
    </div>
  );
}
