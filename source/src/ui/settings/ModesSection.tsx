import { TimeInput } from '../TimeInput';
import { ask } from '../Dialog';
import { useState } from 'react';
import { useStore, type Background } from '../../core/state';
import { cleanDomain, fmtMin, hasBlockPermission, nowDate, requestBlockPermission, sunTimes, type Mode, type ModeRule, type RuleKind } from '../../core/modes';
import { uid } from '../../core/db';
import { fa } from '../../core/dates';
import { Section, Slider } from '../Panels';
import { useFontAssets } from './FontsSection';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../core/db';
import { sameLook } from '../../core/backgrounds';
import { fontName } from '../../core/fonts';
import { useNightLevel, levelText } from '../Modes';
import { IconPlus, IconX, IconChevronL } from '../icons';
import { NONE } from '../../core/none';
import { IS_EXTENSION } from '../../core/platform';

const input = { height: 36, borderRadius: 10, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: '0 10px', fontSize: 13 } as const;
const select = { ...input, background: '#12141B' } as const;

const LOOKS: [string, string, Partial<Background> | undefined][] = [
  ['inherit', 'مثل پس‌زمینه‌ی اصلی', undefined],
  ['stars', 'آسمان پرستاره', { kind: 'starfield' }],
  ['waves', 'موج‌های آرام', { kind: 'scene', scene: 'waves', sceneColor: '#7FA7C9', speed: 12, density: 40 }],
  ['aurora', 'شفق آرام', { kind: 'scene', scene: 'aurora', sceneColor: '#8FD9C8', speed: 15, density: 50 }],
  ['galaxy', 'کهکشان', { kind: 'scene', scene: 'galaxy', sceneColor: '#B9A4F0', speed: 20, density: 60 }],
  ['dark', 'رنگ ساده‌ی تیره', { kind: 'color', color: '#0B0D14' }],
  ['warm', 'رنگ ساده‌ی گرم', { kind: 'color', color: '#16110D' }],
];
const lookId = (b?: Partial<Background>) => {
  if (!b) return 'inherit';
  const hit = LOOKS.find(([, , v]) => v && v.kind === b.kind && (v.kind !== 'scene' || v.scene === b.scene) && (v.kind !== 'color' || v.color === b.color));
  return hit?.[0] ?? 'inherit';
};

function ModeEditor({ m }: { m: Mode }) {
  const update = useStore((s) => s.updateMode);
  const del = useStore((s) => s.deleteMode);
  const resetLayout = useStore((s) => s.resetModeLayout);
  const [blockDraft, setBlockDraft] = useState(m.block.join('\n'));
  const [msg, setMsg] = useState('');
  const fonts = useFontAssets();
  const gallery = useLiveQuery(() => db.backgrounds.orderBy('createdAt').reverse().toArray(), []) ?? NONE;
  const savedLook = m.background?.kind ? gallery.find((g) => sameLook(g.bg, m.background!)) : undefined;

  const saveBlock = async () => {
    const list = [...new Set(blockDraft.split(/[\s,،]+/).map(cleanDomain).filter((d) => d.includes('.')))];
    setBlockDraft(list.join('\n'));
    const ok = await requestBlockPermission(list);
    update(m.id, { block: list });
    setMsg(!list.length ? 'فهرست خالی شد.' : ok ? `${fa(list.length)} سایت در این حالت بسته می‌شود.` : 'ذخیره شد، ولی تا اجازه ندهی بسته نمی‌شوند.');
    if (ok && list.length) void hasBlockPermission(list);
  };

  return (
    <details className="mode-row">
      <summary>
        <span className="mode-ico" aria-hidden="true" style={{ color: m.accent ?? 'var(--accent)' }}>{m.icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="mode-name">{m.name}</span>
          {(() => {
            const bits = [m.background ? (LOOKS.find(([id]) => id === lookId(m.background))?.[1] ?? 'پس‌زمینه‌ی خودش') : null, m.block.length ? `${fa(m.block.length)} سایت بسته` : null, m.font ? 'فونت جدا' : null, m.extraDim ? `تیرگی ${fa(m.extraDim)}٪` : null].filter(Boolean);
            return bits.length ? <span className="mode-meta">{bits.join(' · ')}</span> : null;
          })()}
        </span>
        <IconChevronL size={16} className="ico mode-chev" />
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0 4px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={m.icon} onChange={(e) => update(m.id, { icon: [...e.target.value].slice(-2).join('') || '◐' })} aria-label="نشانه‌ی حالت" style={{ ...input, width: 48, textAlign: 'center' }} />
          <input value={m.name} onChange={(e) => update(m.id, { name: e.target.value })} aria-label="اسم حالت" style={{ ...input, flex: 1 }} />
          <label title="رنگ این حالت" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="color" value={m.accent ?? '#D9B77E'} onChange={(e) => update(m.id, { accent: e.target.value })} aria-label="رنگ حالت" style={{ width: 34, height: 34, border: 0, background: 'none', padding: 0 }} />
          </label>
          {m.accent && <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label="رنگ پیش‌فرض" title="رنگ اصلی" onClick={() => update(m.id, { accent: undefined })}><IconX size={14} /></button>}
        </div>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          پس‌زمینه
          <select value={savedLook ? `saved:${savedLook.id}` : lookId(m.background)} aria-label="پس‌زمینه‌ی حالت" style={{ ...select, flex: 1 }}
            onChange={(e) => {
              const v = e.target.value;
              const saved = v.startsWith('saved:') ? gallery.find((g) => g.id === v.slice(6)) : undefined;
              update(m.id, { background: saved ? { ...saved.bg } : LOOKS.find(([id]) => id === v)?.[2] });
            }}>
            {LOOKS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            {gallery.length > 0 && <optgroup label="پس‌زمینه‌های من">{gallery.map((g) => <option key={g.id} value={`saved:${g.id}`}>{g.name}</option>)}</optgroup>}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <label className="muted" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            فونت صفحه
            <select value={m.font ?? ''} onChange={(e) => update(m.id, { font: e.target.value || undefined })} aria-label={`فونت صفحه · ${m.name}`} style={select}>
              <option value="">فونت پیش‌فرض</option>
              {fonts.map((f) => <option key={f.id} value={f.id}>{fontName(f.name)}</option>)}
            </select>
          </label>
          <label className="muted" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            فونت جمله
            <select value={m.sentenceFont ?? ''} onChange={(e) => update(m.id, { sentenceFont: e.target.value || undefined })} aria-label={`فونت جمله · ${m.name}`} style={select}>
              <option value="">مثل تنظیم جمله‌ها</option>
              <option value="naskh">نسخ</option>
              <option value="vazir">وزیرمتن</option>
              {fonts.map((f) => <option key={f.id} value={f.id}>{fontName(f.name)}</option>)}
            </select>
          </label>
        </div>
        {fonts.length === 0 && <span className="faint" style={{ fontSize: 11 }}>برای فونت جدا، اول در بخش «فونت‌ها» فونت بارگذاری کن.</span>}
        <Slider label="تیرگی اضافه" value={m.extraDim ?? 0} min={0} max={70} unit="٪" onChange={(v) => update(m.id, { extraDim: v })} />
        <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          لحن دستیار در این حالت
          <textarea value={m.tone ?? ''} onChange={(e) => update(m.id, { tone: e.target.value })} rows={2} aria-label="لحن دستیار"
            style={{ borderRadius: 10, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: 8, fontSize: 12, lineHeight: 1.7, resize: 'vertical' }} />
        </label>
{IS_EXTENSION ? (
        <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          سایت‌هایی که در این حالت بسته باشند (هر خط یکی)
          <textarea value={blockDraft} onChange={(e) => setBlockDraft(e.target.value)} rows={3} dir="ltr" aria-label={`سایت‌های بسته · ${m.name}`} placeholder={'instagram.com\nx.com'}
            style={{ borderRadius: 10, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: 8, fontSize: 12, lineHeight: 1.7, resize: 'vertical', textAlign: 'left' }} />
        </label>
        ) : <span className="faint" style={{ fontSize: 12.5 }}>بستن سایت‌ها فقط در افزونه‌ی کروم کار می‌کند.</span>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {IS_EXTENSION && <button className="btn" style={{ height: 34 }} aria-label={`ذخیره‌ی سایت‌های ${m.name}`} onClick={() => void saveBlock()}>ذخیره‌ی سایت‌ها</button>}
          <button className="btn" style={{ height: 34 }} onClick={async () => { if (await ask(`چیدمان «${m.name}» به حالت اولیه برگردد؟`, { ok: 'برگردان' })) resetLayout(m.id); }}>چیدمان اولیه</button>
          {!m.builtin && <button className="btn" style={{ height: 34, color: 'var(--danger)' }} onClick={async () => { if (await ask(`حالت «${m.name}» حذف شود؟`, { danger: true })) del(m.id); }}>حذف</button>}
        </div>
        {msg && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{msg}</span>}
      </div>
    </details>
  );
}

const KINDS: [RuleKind, string][] = [['time', 'ساعت'], ['offline', 'قطع اینترنت'], ['event', 'رویداد تقویم']];
const DAYS = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش']; // Sun…Sat
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5]; // show Saturday first

function RuleRow({ r, modes, onChange, onDelete }: { r: ModeRule; modes: Mode[]; onChange: (p: Partial<ModeRule>) => void; onDelete: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 12, background: 'var(--fill)', opacity: r.enabled ? 1 : 0.6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="checkbox" checked={r.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} aria-label="فعال" style={{ accentColor: 'var(--accent)' }} />
        <select value={r.kind} onChange={(e) => onChange({ kind: e.target.value as RuleKind })} aria-label="نوع قانون" style={{ ...select, flex: 1 }}>
          {KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <span className="faint" style={{ fontSize: 12 }}>←</span>
        <select value={r.mode} onChange={(e) => onChange({ mode: e.target.value })} aria-label="حالت مقصد" style={{ ...select, flex: 1 }}>
          {modes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="حذف قانون" onClick={onDelete}><IconX size={14} /></button>
      </div>
      {r.kind === 'time' && (
        <>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }} className="muted">
            از <TimeInput value={r.from ?? '22:00'} onChange={(v) => onChange({ from: v })} label="از ساعت" style={{ ...input, flex: 1, textAlign: 'center' }} />
            تا <TimeInput value={r.to ?? '06:00'} onChange={(v) => onChange({ to: v })} label="تا ساعت" style={{ ...input, flex: 1, textAlign: 'center' }} />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {DAY_ORDER.map((d) => {
              const on = !r.days?.length || r.days.includes(d);
              return (
                <button key={d} className="btn" aria-pressed={on} style={{ height: 32, flex: 1, padding: 0, fontSize: 12, fontWeight: on ? 700 : 400, background: on ? 'var(--accent)' : undefined, color: on ? 'var(--on-accent)' : 'var(--text-3)', borderColor: on ? 'transparent' : 'var(--line-input)' }}
                  onClick={() => {
                    const cur = r.days?.length ? r.days : [0, 1, 2, 3, 4, 5, 6];
                    const next = on ? cur.filter((x) => x !== d) : [...cur, d];
                    onChange({ days: next.length === 7 ? [] : next });
                  }}>{DAYS[d]}</button>
              );
            })}
          </div>
        </>
      )}
      {r.kind === 'event' && (
        <input value={r.match ?? ''} onChange={(e) => onChange({ match: e.target.value })} placeholder="بخشی از عنوان رویداد، مثلاً «کلاس»" aria-label="عنوان رویداد" style={input} />
      )}
    </div>
  );
}

function NightBox() {
  const night = useStore((s) => s.settings.night);
  const place = useStore((s) => s.settings.place);
  const setSettings = useStore((s) => s.setSettings);
  const setPreview = useStore((s) => s.setNightPreview);
  const level = useNightLevel();
  const setN = (p: Partial<typeof night>) => setSettings({ night: { ...useStore.getState().settings.night, ...p } });
  const sun = sunTimes(place, nowDate());
  const peek = () => { setPreview(1); window.setTimeout(() => setPreview(null), 5000); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 14, background: 'var(--fill)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
        <input type="checkbox" checked={night.enabled} onChange={(e) => setN({ enabled: e.target.checked })} aria-label="نور شب خودکار" style={{ accentColor: 'var(--accent)' }} />
        نور شب خودکار
        <span className="faint" style={{ marginInlineStart: 'auto', fontSize: 12, fontWeight: 400 }}>الان: {levelText(level)}</span>
      </label>
      <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>
        از غروب ({fa(fmtMin(sun.sunset))}) تا اذان مغرب ({fa(fmtMin(sun.maghrib))}) نور گرم زرد و نارنجی روی صفحه می‌نشیند و بعد می‌رود. از غروب تا ساعت خواب هم صفحه کم‌کم تیره‌تر می‌شود و بعد از طلوع ({fa(fmtMin(sun.sunrise))}) آرام برمی‌گردد.
      </span>
      <label className="muted" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
        ساعت خواب (اوج تیرگی)
        <TimeInput value={night.bedtime} onChange={(v) => setN({ bedtime: v || '23:30' })} label="ساعت خواب" style={{ ...input, width: 120, textAlign: 'center' }} />
      </label>
      <Slider label="تیرگی در اوج" value={night.maxDim} min={0} max={70} unit="٪" onChange={(v) => { setN({ maxDim: v }); setPreview(1); }} />
      <Slider label="گرمی نور غروب" value={night.warmth} min={0} max={100} unit="٪" onChange={(v) => { setN({ warmth: v }); setPreview(1); }} />
      <div style={{ display: 'flex', gap: 6 }} onPointerLeave={() => setPreview(null)}>
        <button className="btn" style={{ flex: 1, height: 34 }} onClick={peek}>پیش‌نمایش شب کامل</button>
      </div>
    </div>
  );
}

export function ModesSection() {
  const modes = useStore((s) => s.settings.modes);
  const rules = useStore((s) => s.settings.modeRules);
  const setSettings = useStore((s) => s.setSettings);
  const saveAsMode = useStore((s) => s.saveAsMode);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('✦');
  const setRules = (r: ModeRule[]) => setSettings({ modeRules: r });

  return (
    <div id="modes-section">
      <Section title="حالت‌ها">
        <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>هر حالت چیدمان، رنگ، پس‌زمینه، لحن دستیار و سایت‌های بسته‌ی خودش را دارد. چیدمان هر حالت را وقتی در همان حالت هستی با «ویرایش چیدمان» عوض کن. میانبر: Alt و شماره‌ی حالت.</span>
        {modes.map((m) => <ModeEditor key={m.id} m={m} />)}
        <form style={{ display: 'flex', gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) { saveAsMode(name.trim(), icon || '✦'); setName(''); } }}>
          <input value={icon} onChange={(e) => setIcon([...e.target.value].slice(-2).join(''))} aria-label="نشانه‌ی حالت تازه" style={{ ...input, width: 48, textAlign: 'center' }} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم حالت تازه" aria-label="اسم حالت تازه" style={{ ...input, flex: 1 }} />
          <button className="btn" type="submit" disabled={!name.trim()} style={{ height: 36 }}><IconPlus size={14} />از صفحه‌ی فعلی</button>
        </form>

        <h4 className="subhead">قانون‌های خودکار</h4>
        <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>اولین قانونی که برقرار باشد حالت را عوض می‌کند و وقتی تمام شد به حالت قبلی برمی‌گردد. اگر خودت دستی حالت را عوض کنی، تا آن قانون تمام نشده دوباره عوضش نمی‌کند.</span>
        {rules.map((r, i) => (
          <RuleRow key={r.id} r={r} modes={modes}
            onChange={(p) => setRules(rules.map((x, j) => (j === i ? { ...x, ...p } : x)))}
            onDelete={() => setRules(rules.filter((_, j) => j !== i))} />
        ))}
        <button className="btn" onClick={() => setRules([...rules, { id: `r-${uid().slice(0, 8)}`, enabled: true, kind: 'time', mode: 'work', from: '08:00', to: '12:00', days: [6, 0, 1, 2, 3] }])}>
          <IconPlus size={14} />قانون تازه
        </button>

        <NightBox />
      </Section>
    </div>
  );
}
