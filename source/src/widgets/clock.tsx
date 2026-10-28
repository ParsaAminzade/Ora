import { defineWidget } from '../core/widgets';
import { useStore } from '../core/state';
import { formatGregorian, formatHijri, formatJalaliLong, formatTime } from '../core/dates';
import { useNow } from '../ui/hooks';
import { IconClock } from '../ui/icons';

interface Config {
  seconds: boolean;
}

defineWidget<Config>({
  type: 'clock',
  name: 'ساعت و تاریخ',
  description: 'ساعت، تاریخ شمسی، قمری و میلادی',
  icon: <IconClock />,
  defaultSize: { w: 6, h: 6 },
  minSize: { w: 4, h: 4 },
  defaultConfig: { seconds: false },
  Component: function Clock({ config }) {
    const now = useNow(config.seconds ? 1000 : 1000 * 10);
    const hijriOffset = useStore((s) => s.settings.hijriOffset);
    return (
      <div className="clock-box" style={{ height: '100%', boxSizing: 'border-box' }}>
      <div style={{ height: '100%', boxSizing: 'border-box', padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'safe center', gap: 2, overflow: 'hidden' }}>
        <div className="clock-time" style={{ fontWeight: 200, letterSpacing: '-1px' }}>
          {formatTime(now, config.seconds)}
        </div>
        <div className="clock-date" style={{ fontSize: 16, fontWeight: 600, marginTop: 6, lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatJalaliLong(now)}</div>
        <div className="faint clock-sub" style={{ fontSize: 13 }}>
          {formatHijri(now, hijriOffset)} · {formatGregorian(now)}
        </div>
      </div>
      </div>
    );
  },
});
