import { useEffect, useState } from 'react';
import { defineWidget } from '../core/widgets';
import { useStore } from '../core/state';
import { describeWeather, getWeather, type Weather } from '../core/location';
import { weatherLine } from '../core/voice';
import { fa, WEEKDAYS_FULL, weekCol } from '../core/dates';
import { IconCloud, IconCloudSun, IconFog, IconMoon, IconRain, IconReset, IconSnow, IconStorm, IconSun } from '../ui/icons';

export function WeatherIcon({ code, isDay = true, size = 20 }: { code: number; isDay?: boolean; size?: number }) {
  const { kind } = describeWeather(code);
  if (kind === 'clear') return isDay ? <IconSun size={size} /> : <IconMoon size={size} />;
  if (kind === 'partly') return isDay ? <IconCloudSun size={size} /> : <IconMoon size={size} />;
  if (kind === 'fog') return <IconFog size={size} />;
  if (kind === 'rain') return <IconRain size={size} />;
  if (kind === 'snow') return <IconSnow size={size} />;
  if (kind === 'storm') return <IconStorm size={size} />;
  return <IconCloud size={size} />;
}

const deg = (n: number) => `${fa(Math.round(n))}°`;

defineWidget<Record<string, never>>({
  type: 'weather',
  name: 'آب‌وهوا',
  description: 'وضعیت فعلی و پیش‌بینی چند روز آینده',
  icon: <IconCloudSun />,
  defaultSize: { w: 5, h: 7 },
  minSize: { w: 4, h: 3 },
  defaultConfig: {},
  Component: function WeatherWidget() {
    const place = useStore((s) => s.settings.place);
    const voice = useStore((s) => s.settings.voice ?? 'friendly');
    const [w, setW] = useState<Weather>();
    const [err, setErr] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
      let alive = true;
      setErr(false);
      getWeather(place, tick > 0).then((r) => alive && setW(r)).catch(() => alive && setErr(true));
      const t = window.setInterval(() => setTick((n) => n + 1), 30 * 60_000);
      return () => { alive = false; window.clearInterval(t); };
    }, [place, tick]);

    if (!w) {
      return (
        <div className="w">
          <div className="w-empty">
            <IconCloudSun />
            {err ? <><b>آب‌وهوا در دسترس نیست</b><span>اتصال اینترنت را بررسی کن.</span>
              <button className="btn btn-sm" onClick={() => setTick((n) => n + 1)}>دوباره</button></> : <span>در حال دریافت…</span>}
          </div>
        </div>
      );
    }
    const now = describeWeather(w.current.code);
    const line = voice === 'numbers' ? '' : weatherLine(w, new Date(), voice);
    return (
      <div className="wx w" style={{ overflow: 'hidden', padding: 16, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ color: 'var(--accent)' }}><WeatherIcon code={w.current.code} isDay={w.current.isDay} size={40} /></span>
          <div style={{ flex: 1 }}>
            <div className="tnum" style={{ fontSize: 34, fontWeight: 300, lineHeight: 1 }}>{deg(w.current.temp)}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{now.label} · {place.name}</div>
          </div>
          <button className="icon-btn" aria-label="به‌روزرسانی" title={`آخرین به‌روزرسانی ${new Date(w.fetchedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`} onClick={() => setTick((n) => n + 1)}>
            <IconReset size={16} />
          </button>
        </div>
        {line && <p className="wx-say" title={`احساس ${deg(w.current.feels)} · رطوبت ${fa(Math.round(w.current.humidity))}٪ · باد ${fa(Math.round(w.current.wind))} کیلومتر بر ساعت`}>{line}</p>}
        {!line && <div className="faint wx-extra" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`باد ${fa(Math.round(w.current.wind))} کیلومتر بر ساعت`}>
          احساس {deg(w.current.feels)} · رطوبت {fa(Math.round(w.current.humidity))}٪
        </div>}
        <div className="wx-days" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, w.daily.length - 1)}, minmax(0,1fr))`, gap: 6, marginTop: 'auto' }}>
          {w.daily.slice(1, 5).map((d) => {
            const date = new Date(`${d.date}T12:00:00`);
            return (
              <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 0', borderRadius: 12, background: 'var(--fill)' }}>
                <span className="faint" style={{ fontSize: 12 }}>{WEEKDAYS_FULL[weekCol(date)]}</span>
                <WeatherIcon code={d.code} size={18} />
                <span className="tnum" style={{ fontSize: 12 }}>{deg(d.max)} <span className="faint">{deg(d.min)}</span></span>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
