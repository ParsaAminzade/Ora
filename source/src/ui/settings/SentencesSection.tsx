import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useStore } from '../../core/state';
import { db } from '../../core/db';
import { fa } from '../../core/dates';
import { GROUP_NAMES, addSentence, exportMine, fetchApi, generateLine, groupOf, importPack, sourceLabel, type SourceGroup } from '../../core/sentences';
import { Row, Section, Segmented, Slider } from '../Panels';
import { GanjoorBox, TastePanel } from './TastePanel';
import { IconDownload, IconUpload, IconX } from '../icons';
import { NONE } from '../../core/none';

const input = { height: 36, borderRadius: 10, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: '0 10px', fontSize: 13 } as const;
const select = { ...input, background: '#12141B' } as const;
const TAGS: [string, string][] = [['', 'بدون برچسب'], ['focus', 'تمرکز'], ['gentle', 'روز خسته'], ['comfort', 'دلگرمی'], ['calm', 'آرامش'], ['growth', 'رشد']];

export function SentencesSection() {
  const cfg = useStore((s) => s.settings.sentences);
  const areas = useStore((s) => s.settings.areas);
  const bingeGuard = useStore((s) => s.settings.bingeGuard);
  const setSettings = useStore((s) => s.setSettings);
  const set = (p: Partial<typeof cfg>) => setSettings({ sentences: { ...useStore.getState().settings.sentences, ...p } });
  const all = useLiveQuery(() => db.sentences.toArray(), []) ?? NONE;
  const [text, setText] = useState('');
  const [by, setBy] = useState('');
  const [tag, setTag] = useState('');
  const [area, setArea] = useState('');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const packFile = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); } catch (e) { setMsg({ ok: false, text: String((e as Error).message ?? e) }); } finally { setBusy(false); }
  };
  const counts = all.reduce<Record<string, number>>((a, s) => { const g = groupOf(s.source); a[g] = (a[g] ?? 0) + 1; return a; }, {});
  const found = q.trim() ? all.filter((s) => s.text.includes(q.trim()) || s.by?.includes(q.trim())).slice(0, 40) : [];

  return (
    <div id="sentences-section">
      <Section title="جمله‌ها">
        <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>هر منبع یک وزن دارد؛ صفر یعنی خاموش. جمله‌ای که در ۳۰ روز گذشته دیده‌ای کمتر برمی‌گردد. حالت فعلی، ساعت روز و حوزه‌ی تسک‌های مهمِ باز هم در انتخاب اثر دارند.</span>
        <Row label="مراقب ورق زدن زیاد" hint="اگر جمله‌ها را پشت‌سرهم رد کنی، اورآ چند دقیقه «دیگری» را می‌بندد و تو را سراغ کارت می‌فرستد. بیشتر از ۲۰ جمله‌ی تازه در روز هم نشان نمی‌دهد تا کتابخانه زود تکراری نشود.">
          <Segmented label="مراقب ورق زدن زیاد" value={bingeGuard === false ? 'off' : 'on'} options={[['on', 'روشن'], ['off', 'خاموش']] as const} onChange={(v) => setSettings({ bingeGuard: v === 'on' })} />
        </Row>
        <div className="set-grid2">
        {(Object.keys(GROUP_NAMES) as SourceGroup[]).map((g) => (
          <Slider key={g} label={<>{GROUP_NAMES[g]} <span className="faint" style={{ fontSize: 12 }}>({fa(counts[g] ?? 0)} جمله)</span></>} value={cfg.weights[g]} min={0} max={10} show={(v) => (v ? `وزن ${fa(v)}` : 'خاموش')}
            onChange={(v) => set({ weights: { ...useStore.getState().settings.sentences.weights, [g]: v } })} />
        ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <label className="muted" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            عوض شدن
            <select value={cfg.rotate} onChange={(e) => set({ rotate: e.target.value as typeof cfg.rotate })} aria-label="هر چند وقت عوض شود" style={select}>
              <option value="tab">هر تب</option><option value="hour">هر ساعت</option><option value="day">هر روز</option>
            </select>
          </label>
          <label className="muted" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            قلم
            <select value={cfg.font} onChange={(e) => set({ font: e.target.value as typeof cfg.font })} aria-label="قلم جمله" style={select}>
              <option value="naskh">نسخ</option><option value="vazir">وزیرمتن</option><option value="custom">فونت شخصی</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <label className="muted" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            اندازه
            <select value={cfg.size} onChange={(e) => set({ size: e.target.value as typeof cfg.size })} aria-label="اندازه‌ی جمله" style={select}>
              <option value="m">معمولی</option><option value="l">بزرگ</option><option value="xl">خیلی بزرگ</option>
            </select>
          </label>
          <label className="muted" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            ضخامت
            <select value={cfg.weight} onChange={(e) => set({ weight: Number(e.target.value) as typeof cfg.weight })} aria-label="ضخامت جمله" style={select}>
              <option value={400}>نازک</option><option value={500}>متوسط</option><option value={600}>ضخیم</option><option value={700}>خیلی ضخیم</option>
            </select>
          </label>
        </div>
        <div className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          پشت جمله
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {([['glass', 'شیشه'], ['bevel', 'برجسته'], ['halo', 'سایه‌ی نرم'], ['none', 'هیچ']] as const).map(([v, n]) => (
              <button key={v} className="btn" aria-pressed={cfg.frame === v} onClick={() => set({ frame: v })}
                style={{ height: 34, padding: 0, fontSize: 12, background: cfg.frame === v ? 'var(--fill-2)' : undefined, borderColor: cfg.frame === v ? 'var(--accent)' : undefined }}>{n}</button>
            ))}
          </div>
        </div>

        <TastePanel />

        <GanjoorBox />

        <h4 className="subhead">جمله‌ی خودت</h4>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} aria-label="جمله‌ی تازه" placeholder="یک جمله یا بیت (برای دو مصراع Enter بزن)"
          style={{ borderRadius: 10, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: 8, fontSize: 13, lineHeight: 1.8, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="از چه کسی؟ (اختیاری)" aria-label="گوینده" style={{ ...input, flex: 1, minWidth: 120 }} />
          <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="برچسب جمله" style={select}>{TAGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
          <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="حوزه‌ی جمله" style={select}><option value="">بدون حوزه</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        </div>
        <button className="btn" disabled={!text.trim()} onClick={() => void run(async () => {
          await addSentence(text, { by: by.trim() || undefined, tags: tag ? [tag] : undefined, area: area || undefined });
          setText(''); setBy('');
          return 'اضافه شد.';
        })}>افزودن به جمله‌های من</button>
        <span className="faint" style={{ fontSize: 12 }}>از هر جا: Ctrl+K و بعد جمله را داخل «» بنویس.</span>

        <h4 className="subhead">بسته‌ها و API</h4>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={() => packFile.current?.click()}><IconUpload size={15} />وارد کردن بسته</button>
          <button className="btn" style={{ flex: 1 }} onClick={() => void exportMine()}><IconDownload size={15} />خروجی جمله‌ها</button>
        </div>
        <input ref={packFile} type="file" accept=".json" hidden aria-label="فایل بسته‌ی جمله"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(async () => { const r = await importPack(f); return `بسته‌ی «${r.name}» با ${fa(r.count)} جمله اضافه شد.`; }); }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={cfg.apiName} onChange={(e) => set({ apiName: e.target.value })} aria-label="اسم API" placeholder="اسم" style={{ ...input, width: 90, flexShrink: 0 }} />
          <input value={cfg.apiUrl} onChange={(e) => set({ apiUrl: e.target.value.trim() })} aria-label="آدرس API جمله" placeholder="https://… یا http://localhost/…" dir="ltr" style={{ ...input, flex: 1, fontSize: 12 }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn" style={{ flex: 1 }} disabled={busy || !cfg.apiUrl} onClick={() => void run(async () => `${fa(await fetchApi())} جمله‌ی تازه از API ذخیره شد.`)}>دریافت از API</button>
          <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={() => void run(async () => { const s = await generateLine(); return s ? `مدل نوشت: «${s.text}»` : 'مدل جوابی نداد.'; })}>یک جمله از مدل محلی</button>
        </div>
        <details style={{ fontSize: 12 }}>
          <summary style={{ cursor: 'pointer' }} className="muted">قالب بسته و API</summary>
          <pre dir="ltr" style={{ margin: '8px 0 0', padding: 10, borderRadius: 10, background: 'rgba(0,0,0,.4)', fontSize: 11, whiteSpace: 'pre-wrap', textAlign: 'left', lineHeight: 1.6 }}>{`{ "name": "…",
  "items": [ { "text": "…", "by": "…",
    "area": "پژوهش",
    "tags": ["focus","gentle","comfort","calm","growth"],
    "when": ["morning","day","evening","night"],
    "modes": ["work"] } ] }`}</pre>
          <p className="faint" style={{ lineHeight: 1.8 }}>آرایه‌ی ساده‌ی رشته‌ها یا یک شیء تکی مثل {'{ "quote": "…", "author": "…" }'} هم قبول است. جمله‌های API ذخیره می‌شوند و بدون اینترنت هم نمایش داده می‌شوند. اگر وزن API یا مدل بیشتر از صفر باشد، روزی یک بار خودکار به‌روز می‌شوند.</p>
        </details>
        {msg && <span style={{ fontSize: 12, lineHeight: 1.7, color: msg.ok ? 'var(--accent)' : 'var(--danger)' }}>{msg.text}</span>}

        <h4 className="subhead">کتابخانه</h4>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`جستجو میان ${fa(all.length)} جمله…`} aria-label="جستجوی جمله" style={input} />
        {found.map((s) => (
          <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 10, background: 'var(--fill)', fontSize: 12, lineHeight: 1.8 }}>
            <span style={{ flex: 1, whiteSpace: 'pre-line' }}>{s.text}<span className="faint"> — {s.by ? `${s.by} · ` : ''}{sourceLabel(s)}{s.likes ? ` · ♥${fa(s.likes)}` : ''}</span></span>
            <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="حذف جمله" onClick={() => void db.sentences.delete(s.id)}><IconX size={13} /></button>
          </div>
        ))}

        <h4 className="subhead">حوزه‌های زندگی</h4>
        <input defaultValue={areas.join('، ')} aria-label="حوزه‌ها" onBlur={(e) => setSettings({ areas: [...new Set(e.target.value.split(/[،,]/).map((x) => x.trim()).filter(Boolean))] })} style={input} />
        <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>با ویرگول جدا کن. روی هر تسک انتخاب می‌شوند (یا در متن تسک بنویس #پژوهش). جمله‌ای که حوزه‌اش با تمرکز امروزت یکی باشد بیشتر نشان داده می‌شود.</span>
      </Section>
    </div>
  );
}
