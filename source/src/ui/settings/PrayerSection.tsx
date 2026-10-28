import { useStore } from '../../core/state';
import { DEFAULT_REMINDER, reminderText, upcomingReminders, type PrayerKey } from '../../core/reminders';
import { fa } from '../../core/dates';
import { Row, Section, Segmented } from '../Panels';

const KEYS: [PrayerKey, string][] = [['fajr', 'اذان صبح'], ['sunrise', 'طلوع آفتاب'], ['dhuhr', 'اذان ظهر'], ['sunset', 'غروب آفتاب'], ['maghrib', 'اذان مغرب'], ['midnight', 'نیمه‌شب شرعی']];

export function PrayerSection() {
  const saved = useStore((s) => s.settings.prayerReminder);
  const place = useStore((s) => s.settings.place);
  const setSettings = useStore((s) => s.setSettings);
  const r = { ...DEFAULT_REMINDER, ...saved };
  const set = (p: Partial<typeof r>) => setSettings({ prayerReminder: { ...r, ...p } });
  const next = upcomingReminders(new Date(), r)[0];
  return (
    <Section title="یادآوری نماز" hint={`بر اساس اوقات شرعی ${place.name}. اعلان سیستم حتی وقتی هیچ تبی باز نیست هم می‌آید (اگر کروم باز باشد).`}>
      <Row label="یادآوری">
        <Segmented label="یادآوری نماز" value={r.enabled ? 'on' : 'off'} options={[['on', 'روشن'], ['off', 'خاموش']] as const} onChange={(v) => set({ enabled: v === 'on' })} />
      </Row>
      {r.enabled && (
        <>
          <div className="day-pills" role="group" aria-label="کدام وقت‌ها">
            {KEYS.map(([k, n]) => (
              <button key={k} className="pill" aria-pressed={r.keys.includes(k)} onClick={() => set({ keys: r.keys.includes(k) ? r.keys.filter((x) => x !== k) : [...r.keys, k] })}>{n}</button>
            ))}
          </div>
          <Row label="چه زمانی">
            <Segmented label="چند دقیقه قبل" value={r.before} options={[[0, 'سر وقت'], [5, '۵ دقیقه قبل'], [10, '۱۰ دقیقه قبل'], [15, '۱۵ دقیقه قبل'], [30, 'نیم ساعت قبل']] as const} onChange={(v) => set({ before: v })} />
          </Row>
          <Row label="اعلان ویندوز" hint="خاموش باشد، فقط چشم اورآ روی صفحه یادآوری می‌کند.">
            <Segmented label="اعلان ویندوز" value={r.notify ? 'on' : 'off'} options={[['on', 'روشن'], ['off', 'فقط داخل صفحه']] as const} onChange={(v) => set({ notify: v === 'on' })} />
          </Row>
          <span className="faint" style={{ fontSize: 12 }}>
            {next ? `یادآوری بعدی: ${reminderText(next.label, r.before)} · ساعت ${fa(new Date(next.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}` : 'وقتی انتخاب نشده.'}
          </span>
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => dispatchEvent(new CustomEvent('ora:say', { detail: { text: reminderText('اذان ظهر', r.before), sticky: true } }))}>امتحان یادآوری</button>
        </>
      )}
    </Section>
  );
}
