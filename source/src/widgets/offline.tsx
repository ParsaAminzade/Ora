// Offline mode: what still works without the internet, at a glance.
import { useEffect, useState } from 'react';
import { defineWidget } from '../core/widgets';
import { useStore } from '../core/state';
import { listModels } from '../core/providers/ai';
import { lastAutoBackup } from '../core/backup';
import { fa } from '../core/dates';
import { IconWifiOff } from '../ui/icons';

type S = 'ok' | 'off' | 'wait' | 'none';

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => window.setTimeout(() => rej(new Error('timeout')), ms))]);

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    addEventListener('online', a); addEventListener('offline', b);
    return () => { removeEventListener('online', a); removeEventListener('offline', b); };
  }, []);
  return on;
}

function Row({ label, state, note }: { label: string; state: S; note?: string }) {
  const color = state === 'ok' ? '#8FD9C8' : state === 'off' ? 'var(--danger)' : 'var(--text-3)';
  const word = state === 'ok' ? 'در دسترس' : state === 'off' ? 'در دسترس نیست' : state === 'wait' ? 'بررسی…' : 'تنظیم نشده';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ color, fontSize: 12 }}>{note ?? word}</span>
    </div>
  );
}

defineWidget<Record<string, never>>({
  type: 'offline',
  name: 'وضعیت آفلاین',
  description: 'چه چیزهایی بدون اینترنت کار می‌کنند',
  icon: <IconWifiOff />,
  defaultSize: { w: 6, h: 11 },
  minSize: { w: 5, h: 8 },
  defaultConfig: {},
  Component: function Offline() {
    const online = useOnline();
    const ai = useStore((s) => s.settings.ai);
    const dav = useStore((s) => s.settings.caldav);
    const [aiState, setAi] = useState<S>('wait');
    const [davState, setDav] = useState<S>(dav.enabled ? 'wait' : 'none');
    const [backup, setBackup] = useState(0);

    useEffect(() => {
      let alive = true;
      setAi('wait');
      withTimeout(listModels(ai), 2500).then((l) => alive && setAi(l.length ? 'ok' : 'off')).catch(() => alive && setAi('off'));
      if (dav.enabled) withTimeout(fetch(dav.url, { method: 'OPTIONS' }), 2500).then(() => alive && setDav('ok')).catch(() => alive && setDav('off'));
      void lastAutoBackup().then((t) => alive && setBackup(t));
      return () => { alive = false; };
    }, [ai, dav.enabled, dav.url, online]);

    const days = backup ? Math.floor((Date.now() - backup) / 86_400_000) : -1;
    return (
      <div className="w" style={{ gap: 6 }}>
        <div className="w-head"><h2 className="w-title">{online ? 'اینترنت وصل است' : 'بدون اینترنت'}</h2></div>
        <Row label="اینترنت" state={online ? 'ok' : 'off'} note={online ? 'وصل' : 'قطع'} />
        <Row label="هوش مصنوعی روی همین سیستم" state={aiState} />
        <Row label="تقویم روی سرور خودت" state={davState} />
        <Row label="آخرین پشتیبان خودکار" state={backup ? 'ok' : 'none'} note={backup ? (days === 0 ? 'امروز' : `${fa(days)} روز پیش`) : 'هنوز نه'} />
        <p className="faint" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.9 }}>
          بدون اینترنت هم کار می‌کنند: تسک‌ها، یادداشت‌ها، تقویم و تکرارها، اوقات شرعی، حافظه و دانش دستیار، پس‌زمینه‌ها، پشتیبان‌گیری.
        </p>
      </div>
    );
  },
});
