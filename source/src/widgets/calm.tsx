// "دل‌گرفته" mode: breathing, a line of classical poetry, a place to write and let go
// (nothing is saved), and one tap to reach someone you trust.
import { useEffect, useState } from 'react';
import { defineWidget } from '../core/widgets';
import { IconLeaf } from '../ui/icons';

const LINES = [
  ['یوسف گم‌گشته بازآید به کنعان غم مخور', 'کلبه‌ی احزان شود روزی گلستان غم مخور', 'حافظ'],
  ['رسید مژده که ایام غم نخواهد ماند', 'چنان نماند و چنین نیز هم نخواهد ماند', 'حافظ'],
  ['هر کسی کو دور ماند از اصل خویش', 'باز جوید روزگار وصل خویش', 'مولوی'],
] as const;

// 4s in, 4s hold, 6s out
const PHASES = [['دم', 4], ['نگه دار', 4], ['بازدم', 6]] as const;

function Breath() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setI((i + 1) % 3), PHASES[i][1] * 1000);
    return () => window.clearTimeout(t);
  }, [i]);
  const scale = i === 2 ? 0.6 : 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div aria-hidden="true" style={{ width: 120, height: 120, borderRadius: 60, background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent), transparent 70%)', border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)', transform: `scale(${i === 0 ? 1 : scale})`, transition: `transform ${PHASES[i][1]}s ease-in-out` }} />
      <span aria-live="polite" style={{ fontSize: 15 }}>{PHASES[i][0]}</span>
    </div>
  );
}

interface Config { contactName: string; contactHref: string }

defineWidget<Config>({
  type: 'calm',
  name: 'آرامش',
  description: 'تنفس، یک بیت، نوشتن و رها کردن',
  icon: <IconLeaf />,
  defaultSize: { w: 12, h: 17 },
  minSize: { w: 8, h: 12 },
  defaultConfig: { contactName: '', contactHref: '' },
  Component: function Calm({ config, setConfig, editing }) {
    const [line] = useState(() => LINES[Math.floor(Math.random() * LINES.length)]);
    const [text, setText] = useState('');
    const [letting, setLetting] = useState(false);
    const [setup, setSetup] = useState(false);
    const letGo = () => {
      setLetting(true);
      window.setTimeout(() => { setText(''); setLetting(false); }, 1600);
    };

    return (
      <div style={{ height: '100%', padding: 28, display: 'flex', flexDirection: 'column', gap: 22, alignItems: 'center', textAlign: 'center' }}>
        <Breath />
        <div style={{ fontFamily: "'Noto Naskh Arabic', var(--font, Vazirmatn), serif", fontSize: 20, lineHeight: 2 }}>
          <div>{line[0]}</div>
          <div>{line[1]}</div>
          <div className="faint" style={{ fontSize: 12, fontFamily: 'inherit' }}>{line[2]}</div>
        </div>
        <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="نوشتن و رها کردن"
            placeholder="هر چه در دلت است بنویس. ذخیره نمی‌شود."
            style={{ borderRadius: 14, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.22)', padding: 12, fontSize: 14, lineHeight: 1.9, resize: 'none', transition: 'opacity 1.5s, filter 1.5s', opacity: letting ? 0 : 1, filter: letting ? 'blur(6px)' : 'none' }} />
          <button className="btn" disabled={!text.trim() || letting} onClick={letGo}>رها کن</button>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          {config.contactHref && !setup && !editing ? (
            <>
              <a className="btn btn-accent" href={config.contactHref} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>حرف زدن با {config.contactName || 'او'}</a>
              <button className="btn" style={{ border: 0, fontSize: 12 }} onClick={() => setSetup(true)}>تغییر</button>
            </>
          ) : (
            <form style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }} onSubmit={(e) => { e.preventDefault(); setSetup(false); }}>
              <input value={config.contactName} onChange={(e) => setConfig({ contactName: e.target.value })} placeholder="با چه کسی حرف بزنی؟" aria-label="اسم آدم مورد اعتماد"
                style={{ height: 38, borderRadius: 10, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.22)', padding: '0 10px', fontSize: 13 }} />
              <input value={config.contactHref} onChange={(e) => setConfig({ contactHref: e.target.value.trim() })} placeholder="tel:… یا لینک پیام‌رسان" aria-label="راه تماس" dir="ltr"
                style={{ height: 38, borderRadius: 10, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.22)', padding: '0 10px', fontSize: 12 }} />
              <button className="btn" type="submit">ذخیره</button>
            </form>
          )}
        </div>
      </div>
    );
  },
});
