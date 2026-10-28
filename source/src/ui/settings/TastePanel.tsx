import { ask } from '../Dialog';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useStore } from '../../core/state';
import { db } from '../../core/db';
import { fa } from '../../core/dates';
import { FORMS, resetTaste, THEMES } from '../../core/taste';
import { UNCLEAR_WHY } from '../../core/sentences';
import { ganjoorPoets, harvest, poetName, type GPoet } from '../../core/ganjoor';
import { Slider } from '../Panels';
import { IconX } from '../icons';
import { NONE } from '../../core/none';


/** «سلیقه‌ی من»: in plain terms — the lines you loved, the ones you hid, and a few knobs. */
export function TastePanel() {
  const cfg = useStore((s) => s.settings.sentences);
  const setSettings = useStore((s) => s.setSettings);
  const set = (p: Partial<typeof cfg>) => setSettings({ sentences: { ...useStore.getState().settings.sentences, ...p } });
  const liked = useLiveQuery(() => db.sentences.filter((x) => (x.likes ?? 0) > 0).toArray(), []) ?? NONE;
  const hidden = useLiveQuery(() => db.sentences.filter((x) => !!x.dislikedAt).toArray(), []) ?? NONE;
  const unclear = (useLiveQuery(() => db.sentences.filter((x) => !!x.unclearAt).toArray(), []) ?? NONE).sort((a, b) => (b.unclearAt ?? 0) - (a.unclearAt ?? 0));
  // Where the unclear lines cluster: by reason, by rhetorical form, by theme.
  const tally = (key: (x: (typeof unclear)[number]) => string | undefined, names: Record<string, string>) => {
    const m = new Map<string, number>();
    for (const x of unclear) { const k = key(x); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${names[k] ?? k} (${fa(n)})`).join('، ');
  };
  const exportUnclear = () => {
    const rows = unclear.map((x) => ({ id: x.id, text: x.text, theme: x.theme, form: x.form, tone: x.tone, why: x.unclearWhy, source: x.source }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `ora-unclear-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const [showAll, setShowAll] = useState(false);
  const row = { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 10, background: 'var(--fill)', fontSize: 12.5, lineHeight: 1.8 } as const;

  return (
    <>
      <h4 className="subhead">سلیقه‌ی من</h4>
      <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>هر ♥، سنجاق یا «کمتر از این نوع» به اورآ یاد می‌دهد چه جمله‌هایی را بیشتر نشانت بدهد.</span>
      <button className="btn btn-accent" style={{ alignSelf: 'flex-start', minWidth: 200 }} onClick={() => dispatchEvent(new Event('nova:taste-test'))}>آزمون سلیقه (یک دقیقه)</button>

      <span className="muted" style={{ fontSize: 12 }}>جمله‌هایی که به دلت نشستند ({fa(liked.length)})</span>
      {liked.length === 0 && <span className="faint" style={{ fontSize: 12 }}>هنوز چیزی نیست؛ روی جمله‌ی پس‌زمینه ♥ بزن.</span>}
      {(showAll ? liked : liked.slice(0, 4)).map((x) => (
        <div key={x.id} style={row}>
          <span style={{ flex: 1, whiteSpace: 'pre-line' }}>{x.text}</span>
          <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="برداشتن از پسندیده‌ها" title="برداشتن" onClick={() => void db.sentences.update(x.id, { likes: 0 })}><IconX size={12} /></button>
        </div>
      ))}
      {liked.length > 4 && <button className="btn" style={{ height: 30, fontSize: 12, border: 0 }} onClick={() => setShowAll(!showAll)}>{showAll ? 'کمتر' : `همه (${fa(liked.length)})`}</button>}

      {hidden.length > 0 && (
        <details style={{ fontSize: 12 }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>جمله‌هایی که پنهان کردی ({fa(hidden.length)})</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {hidden.map((x) => (
              <div key={x.id} style={row}>
                <span style={{ flex: 1, whiteSpace: 'pre-line' }} className="muted">{x.text}</span>
                <button className="btn" style={{ height: 26, fontSize: 11, padding: '0 8px' }} onClick={() => void db.sentences.update(x.id, { dislikedAt: undefined })}>برگردان</button>
              </div>
            ))}
          </div>
        </details>
      )}

      <span className="muted" style={{ fontSize: 12 }}>جمله‌هایی که منظورشان را نفهمیدی ({fa(unclear.length)})</span>
      {unclear.length === 0 ? (
        <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>هر جمله‌ای که گنگ بود، روی دکمه‌ی «؟» زیرش بزن. کنار می‌رود و اینجا جمع می‌شود تا بفهمیم دقیقاً چه چیزهایی نامفهوم‌اند و بازنویسی‌شان کنیم.</span>
      ) : (
        <>
          <div className="unclear-sum">
            {tally((x) => x.unclearWhy, UNCLEAR_WHY) && <span>بیشتر به خاطر: {tally((x) => x.unclearWhy, UNCLEAR_WHY)}</span>}
            {tally((x) => x.form, FORMS) && <span>در قالب: {tally((x) => x.form, FORMS)}</span>}
            {tally((x) => x.theme, THEMES) && <span>در موضوع: {tally((x) => x.theme, THEMES)}</span>}
          </div>
          {unclear.slice(0, showAll ? 50 : 4).map((x) => (
            <div key={x.id} style={row}>
              <span style={{ flex: 1, whiteSpace: 'pre-line' }} className="muted">{x.text}{x.unclearWhy && <span className="faint"> · {UNCLEAR_WHY[x.unclearWhy]}</span>}</span>
              <button className="btn btn-sm" onClick={() => void db.sentences.update(x.id, { unclearAt: undefined, unclearWhy: undefined })}>برگردان</button>
            </div>
          ))}
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={exportUnclear}>خروجی برای بازنویسی (JSON)</button>
        </>
      )}

      <Slider label="چقدر زود سلیقه‌ی قدیمی فراموش شود" value={cfg.halfLife} min={7} max={120} unit=" روز" onChange={(v) => set({ halfLife: v })} />
      <Slider label="گاهی چیزی تازه نشانم بده" value={Math.round(cfg.explore * 100)} min={0} max={30} unit="٪" onChange={(v) => set({ explore: v / 100 })} />
      <button className="btn" style={{ color: 'var(--danger)' }} onClick={async () => { if (await ask('همه‌ی چیزهایی که اورآ از سلیقه‌ات یاد گرفته پاک شود؟ جمله‌ها پاک نمی‌شوند.', { danger: true, ok: 'پاک کن' })) void resetTaste(); }}>از صفر شروع کن</button>
    </>
  );
}

/** Real poetry from ganjoor.net. */
export function GanjoorBox() {
  const g = useStore((s) => s.settings.sentences.ganjoor);
  const setSettings = useStore((s) => s.setSettings);
  const setG = (p: Partial<typeof g>) => { const s = useStore.getState().settings.sentences; setSettings({ sentences: { ...s, ganjoor: { ...s.ganjoor, ...p } } }); };
  const count = useLiveQuery(() => db.sentences.filter((s) => s.id.startsWith('g-')).count(), []) ?? 0;
  const [poets, setPoets] = useState<GPoet[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { void ganjoorPoets().then(setPoets).catch(() => {}); }, []);
  const shown = poets.length ? poets.filter((p) => g.poets.includes(p.id) || p.id < 60) : [];

  return (
    <>
      <h4 className="subhead">شعر از گنجور</h4>
      <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={g.enabled} onChange={(e) => setG({ enabled: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
        روزی {fa(g.perDay)} بیت تازه از گنجور بگیر و برای همیشه نگه دار
      </label>
      <span className="faint" style={{ fontSize: 12 }}>{fa(count)} بیت از گنجور ذخیره شده؛ بدون اینترنت هم نمایش داده می‌شوند.</span>
      {shown.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 150, overflowY: 'auto' }} className="scroll">
          {shown.map((p) => {
            const on = g.poets.includes(p.id);
            return (
              <button key={p.id} className="btn" aria-pressed={on} onClick={() => setG({ poets: on ? g.poets.filter((x) => x !== p.id) : [...g.poets, p.id] })}
                style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 999, background: on ? 'var(--fill-2)' : undefined, borderColor: on ? 'var(--accent)' : undefined }}>{poetName(p)}</button>
            );
          })}
        </div>
      )}
      <button className="btn" disabled={busy || !g.poets.length} onClick={async () => {
        setBusy(true); setMsg(null);
        try {
          const n = await harvest(30, g.poets);
          setG({ last: Date.now() });
          setMsg({ ok: true, text: `${fa(n)} بیت تازه از گنجور ذخیره شد.` });
        } catch (e) {
          setMsg({ ok: false, text: navigator.onLine ? String((e as Error).message ?? e) : 'اینترنت وصل نیست؛ بیت‌های ذخیره‌شده همچنان کار می‌کنند.' });
        } finally { setBusy(false); }
      }}>{busy ? 'در حال گرفتن…' : 'همین الان ۳۰ بیت بگیر'}</button>
      {msg && <span style={{ fontSize: 12, color: msg.ok ? 'var(--accent)' : 'var(--danger)' }}>{msg.text}</span>}
    </>
  );
}
