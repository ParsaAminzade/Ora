import { defineWidget } from '../core/widgets';
import { useStore } from '../core/state';
import { formatInZone, nextPrayer, prayerTimes } from '../core/prayer';
import { useNow } from '../ui/hooks';
import { IconBell, IconMosque } from '../ui/icons';
import { DEFAULT_REMINDER, type PrayerKey } from '../core/reminders';

interface Config {
  compact: boolean;
}

defineWidget<Config>({
  type: 'prayer',
  name: 'اوقات شرعی',
  description: 'محاسبه‌ی آفلاین به روش مؤسسه ژئوفیزیک تهران',
  icon: <IconMosque />,
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 4, h: 3 },
  defaultConfig: { compact: true },
  Component: function Prayer({ config, setConfig }) {
    const now = useNow(30_000);
    const place = useStore((s) => s.settings.place);
    const times = prayerTimes(place, now);
    const rem = useStore((s) => s.settings.prayerReminder);
    const r = { ...DEFAULT_REMINDER, ...rem };
    const setSettings = useStore((s) => s.setSettings);
    const toggle = (k: PrayerKey) => setSettings({ prayerReminder: { ...r, enabled: true, keys: r.keys.includes(k) ? r.keys.filter((x) => x !== k) : [...r.keys, k] } });
    const next = nextPrayer(place, now);

    if (config.compact) {
      return (
        <button onClick={() => setConfig({ compact: false })} title="نمایش فهرستی"
          style={{ width: '100%', height: '100%', border: 0, background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderRadius: 'inherit' }}>
          {times.map((t) => {
            const isNext = t.key === next.key;
            return (
              <span key={t.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: isNext ? 'var(--accent)' : undefined }}>
                <span style={{ fontSize: 12, color: isNext ? undefined : 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isNext && <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--accent)' }} />}
                  {t.label.replace('اذان ', '').replace(' آفتاب', '').replace(' شرعی', '')}
                </span>
                <span style={{ fontSize: 15, fontWeight: isNext ? 700 : 500 }} aria-label={isNext ? 'نوبت بعدی' : undefined}>{formatInZone(t.time, place.timezone)}</span>
              </span>
            );
          })}
        </button>
      );
    }
    return (
      <div className="w" style={{ overflow: 'hidden', gap: 8 }}>
        <div className="w-head">
          <h2 className="w-title">اوقات شرعی</h2>
          <span className="w-meta">{place.name}</span>
          <button className="btn btn-sm" style={{ border: 0 }} onClick={() => setConfig({ compact: true })}>فشرده</button>
        </div>
        {times.map((t) => {
          const isNext = t.key === next.key;
          return (
            <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: isNext ? 'var(--accent)' : undefined, fontWeight: isNext ? 600 : 400 }}>
              <span className={isNext ? undefined : 'muted'} style={{ flex: 1 }}>{t.label}</span>
              <span className="tnum">{formatInZone(t.time, place.timezone)}</span>
              <button className="icon-btn" style={{ width: 28, height: 28, color: r.enabled && r.keys.includes(t.key) ? 'var(--accent)' : 'var(--text-3)', opacity: r.enabled && r.keys.includes(t.key) ? 1 : 0.6 }}
                aria-pressed={r.enabled && r.keys.includes(t.key)} aria-label={`یادآوری ${t.label}`} title={r.enabled && r.keys.includes(t.key) ? `یادآوری ${t.label} روشن است` : `یادآوری ${t.label}`} onClick={() => toggle(t.key)}>
                <IconBell size={14} />
              </button>
            </div>
          );
        })}
      </div>
    );
  },
});
