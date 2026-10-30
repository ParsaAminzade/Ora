import { ask } from './Dialog';
import { OraEye } from './OraEye';
import { PrayerSection } from './settings/PrayerSection';
import { PlannerSection } from './settings/PlannerSection';
import { CoachSection } from './settings/CoachSection';
import { PrivacySection, ProfileSection } from './settings/PrivacySection';
import { TourSection } from './Tour';
import { APP_VERSION, IS_EXTENSION, IS_WEB_BUILD, usePhone } from '../core/platform';
import { NotifySection } from './NotifyAsk';
import { effectiveLook } from '../core/state';
import { useAssetUrl } from './hooks';
import { bgStill } from '../core/backgrounds';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DEFAULT_SHADER, useStore, type BgKind, type SceneId } from '../core/state';
import { allWidgets } from '../core/widgets';
import { db, uid, type Asset } from '../core/db';
import { BackupSection } from './settings/BackupSection';
import { SearchSection } from './settings/SearchSection';
import { CalDavSection } from './settings/CalDavSection';
import { ModesSection } from './settings/ModesSection';
import { SentencesSection } from './settings/SentencesSection';
import { FontsSection } from './settings/FontsSection';
import { ModeButton } from './Modes';
import { fa } from '../core/dates';
import { searchPlaces, type Place } from '../core/location';
import { connectGoogle, disconnectGoogle, redirectUri, refreshCalendars } from '../core/providers/google';
import { exportICS, importICS } from '../core/ics';
import { CalendarPrefsBlock } from './settings/CalendarPrefsBlock';
import { SAMPLE_HTML } from '../bg/html-sample';
import { BackgroundGallery } from './settings/BackgroundGallery';
import { releaseAsset, saveBackground } from '../core/backgrounds';
import { syncRange } from '../core/calendar-service';
import { addDays, dayKey } from '../core/dates';
import { PRESET_URLS, ensureHostPermission, explainAIError, listModels, type AIPreset, type AISettings } from '../core/providers/ai';
import {
  IconDownload, IconPin, IconSearch, IconLayout, IconPlus, IconReset, IconSliders, IconUpload, IconX, IconCalendar, IconFolder, IconChat,
} from './icons';

const ACCENTS = ['#D9B77E', '#9FC7E8', '#C8B6F0', '#8FD9C8', '#E9A08F', '#ECE8E1'];

/* ---------- Side rail ---------- */
export function Rail() {
  const editing = useStore((s) => s.editing);
  const panel = useStore((s) => s.panel);
  const setEditing = useStore((s) => s.setEditing);
  const setPanel = useStore((s) => s.setPanel);
  return (
    <nav className="glass" aria-label="ناوبری" style={{ width: 64, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 0', zIndex: 25 }}>
      <OraEye />
      <button className="icon-btn" aria-label="ویرایش چیدمان" title="ویرایش چیدمان" aria-pressed={editing} onClick={() => setEditing(!editing)}>
        <IconLayout />
      </button>
      <ModeButton />
      <button className="icon-btn" aria-label="تقویم و برنامه" title="تقویم و برنامه" onClick={() => dispatchEvent(new CustomEvent('ora:schedule', { detail: {} }))}><IconCalendar /></button>
      <button className="icon-btn" aria-label="پروژه‌ها" title="پروژه‌ها" onClick={() => dispatchEvent(new CustomEvent('ora:projects', { detail: {} }))}><IconFolder /></button>
      <button className="icon-btn" aria-label="گفتگو با اورآ" title="گفتگو با اورآ: اولویت‌ها، نگرانی‌ها، عقب‌ماندن‌ها" onClick={() => dispatchEvent(new CustomEvent('ora:coach', { detail: {} }))}><IconChat /></button>
      <div style={{ flex: 1 }} />
      <button className="icon-btn" aria-label="شخصی‌سازی" title="شخصی‌سازی" aria-pressed={panel === 'settings'} onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')}>
        <IconSliders />
      </button>
    </nav>
  );
}

/* ---------- Edit-mode toolbar + widget drawer ---------- */
export function EditBar() {
  const editing = useStore((s) => s.editing);
  const panel = useStore((s) => s.panel);
  const setEditing = useStore((s) => s.setEditing);
  const setPanel = useStore((s) => s.setPanel);
  const resetLayout = useStore((s) => s.resetLayout);
  const widgets = useStore((s) => s.widgets);
  const addWidget = useStore((s) => s.addWidget);
  if (!editing) return null;

  return (
    <>
      <div className="glass" role="toolbar" aria-label="ویرایش چیدمان"
        style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 20, height: 56, borderRadius: 18, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', '--glass-solid': 'rgba(12,14,20,.9)' } as CSSProperties}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}><IconLayout size={18} />ویرایش چیدمان</span>
        <span style={{ width: 1, height: 24, background: 'var(--line-2)' }} />
        <button className="btn" style={{ border: 0 }} onClick={() => setPanel(panel === 'drawer' ? 'none' : 'drawer')}><IconPlus size={17} />افزودن ویجت</button>
        <button className="btn" style={{ border: 0 }} onClick={async () => { if (await ask('چیدمان به حالت اولیه برگردد؟ داده‌ها (تسک‌ها، یادداشت‌ها…) پاک نمی‌شوند.', { ok: 'برگردان' })) resetLayout(); }}><IconReset size={17} />چیدمان اولیه</button>
        <button className="btn btn-accent" onClick={() => setEditing(false)}>تمام</button>
      </div>

      {panel === 'drawer' && <div className="drawer-scrim" onClick={() => setPanel('none')} aria-hidden="true" />}
      {panel === 'drawer' && (
        <section className="glass" aria-label="افزودن ویجت"
          style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 20, width: 'min(1040px, calc(100vw - 140px))', padding: '16px 18px', borderRadius: 24, '--glass-solid': 'rgba(14,16,22,.94)' } as CSSProperties}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>افزودن ویجت</span>
            <button className="icon-btn" aria-label="بستن" onClick={() => setPanel('none')}><IconX size={18} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {allWidgets().map((d) => {
              const exists = widgets.some((x) => x.type === d.type);
              const disabled = exists && !d.multiple;
              return (
                <button key={d.type} disabled={disabled} onClick={() => addWidget(d.type)}
                  className="drawer-item">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>{d.icon}{d.name}</span>
                  <span className="faint" style={{ fontSize: 12, lineHeight: 1.6 }}>{disabled ? 'روی صفحه هست' : d.description}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

/* ---------- Settings sheet ---------- */
export function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section data-title={title} className="set-sec">
      <header className="set-sec-head">
        <h3>{title}</h3>
        {hint && <p>{hint}</p>}
      </header>
      {children}
    </section>
  );
}

/** One setting: name and help on the start side, the control on the end side. */
export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-text"><span className="set-row-label">{label}</span>{hint && <span className="set-row-hint">{hint}</span>}</div>
      <div className="set-row-ctl">{children}</div>
    </div>
  );
}

/** A segmented choice (one of a few), the same everywhere in settings. */
export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange(v: T): void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, n]) => (
        <button key={String(v)} role="radio" aria-checked={value === v} aria-pressed={value === v} onClick={() => onChange(v)}>{n}</button>
      ))}
    </div>
  );
}

export function Slider({ label, value, min, max, onChange, unit = '', show }: { label: ReactNode; value: number; min: number; max: number; onChange: (v: number) => void; unit?: string; show?: (v: number) => string }) {
  return (
    <label className="set-slider">
      <span className="set-slider-top"><span>{label}</span><span className="set-val" aria-hidden="true">{show ? show(value) : `${fa(value)}${unit}`}</span></span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--p': `${((value - min) / (max - min || 1)) * 100}%` } as CSSProperties} />
    </label>
  );
}

async function saveAsset(file: File, kind: Asset['kind'], replaceId?: string): Promise<string> {
  const id = uid();
  await db.assets.put({ id, kind, name: file.name, mime: file.type, blob: file, createdAt: Date.now() });
  if (replaceId) await db.assets.delete(replaceId);
  return id;
}

function CitySection() {
  const place = useStore((s) => s.settings.place);
  const setSettings = useStore((s) => s.setSettings);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle');

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); setState('idle'); return; }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setState('loading');
      searchPlaces(query, ctrl.signal)
        .then((r) => { setResults(r); setState(r.length ? 'idle' : 'empty'); })
        .catch((e) => { if ((e as Error).name !== 'AbortError') setState('error'); });
    }, 350);
    return () => { window.clearTimeout(t); ctrl.abort(); };
  }, [q]);

  return (
    <Section title="شهر">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <IconPin size={16} className="ico" />
        <span style={{ flex: 1 }}>{place.label}</span>
        <span className="faint" style={{ fontSize: 11, direction: 'ltr' }}>{place.timezone}</span>
      </div>
      <div className="field">
        <IconSearch size={16} className="ico faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم شهر را بنویس…" aria-label="جستجوی شهر" />
      </div>
      {state === 'loading' && <span className="faint" style={{ fontSize: 12 }}>در حال جستجو…</span>}
      {state === 'error' && <span style={{ fontSize: 12, color: 'var(--danger)' }}>اتصال به سرویس مکان برقرار نشد.</span>}
      {state === 'empty' && <span className="faint" style={{ fontSize: 12 }}>شهری پیدا نشد.</span>}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 14, border: '1px solid var(--line)', overflow: 'hidden' }}>
          {results.map((r) => (
            <button key={`${r.lat},${r.lon}`} onClick={() => { setSettings({ place: r }); setQ(''); setResults([]); }}
              style={{ border: 0, background: 'var(--fill)', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: 8, textAlign: 'right', fontSize: 13, borderBottom: '1px solid var(--line)' }}>
              <span>{r.label}</span>
              <span className="faint" style={{ fontSize: 11, direction: 'ltr' }}>{r.lat.toFixed(2)}, {r.lon.toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}
      <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>آب‌وهوا از Open-Meteo گرفته می‌شود (حداکثر هر ۳۰ دقیقه یک بار). اوقات شرعی روی خود مرورگر و بدون اینترنت محاسبه می‌شود.</span>
    </Section>
  );
}

const SCENES: { id: SceneId; name: string; preview: string }[] = [
  { id: 'galaxy', name: 'کهکشان مارپیچی', preview: 'pv-galaxy' },
  { id: 'waves', name: 'موج‌های آرام', preview: 'pv-waves' },
  { id: 'aurora', name: 'شفق قطبی', preview: 'pv-aurora' },
  { id: 'orbs', name: 'اجرام شناور', preview: 'pv-orbs' },
];
const SCENE_COLORS = ['#B9A4F0', '#D9B77E', '#9FC7E8', '#8FD9C8', '#E9A08F'];

function BackgroundSection() {
  const bg = useStore((s) => s.settings.background);
  const setSettings = useStore((s) => s.setSettings);
  const shaderError = useStore((s) => s.shaderError);
  const bgFile = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(bg.shader);
  const setBg = (patch: Partial<typeof bg>) => setSettings({ background: { ...useStore.getState().settings.background, ...patch } });
  const kinds: [BgKind, string][] = [['starfield', 'آسمان پرستاره'], ['scene', 'صحنه‌ی سه‌بعدی'], ['shader', 'شیدر دلخواه'], ['html', 'کد HTML'], ['image', 'تصویر'], ['video', 'ویدیو'], ['color', 'رنگ ساده']];
  const htmlFile = useRef<HTMLInputElement>(null);
  const [htmlDraft, setHtmlDraft] = useState<string | null>(null);
  const [htmlMsg, setHtmlMsg] = useState('');
  useEffect(() => {
    if (bg.kind !== 'html' || htmlDraft !== null) return;
    if (!bg.htmlId) { setHtmlDraft(SAMPLE_HTML); return; }
    void db.assets.get(bg.htmlId).then(async (a) => setHtmlDraft(a ? await a.blob.text() : SAMPLE_HTML));
  }, [bg.kind, bg.htmlId, htmlDraft]);
  const runHtml = async (code: string) => {
    const id = uid();
    await db.assets.put({ id, kind: 'html', name: 'background.html', mime: 'text/html', blob: new Blob([code], { type: 'text/html' }), createdAt: Date.now() });
    const old = useStore.getState().settings.background.htmlId;
    setBg({ kind: 'html', htmlId: id });
    await saveBackground(useStore.getState().settings.background);
    await releaseAsset(old);
    setHtmlMsg(`اجرا شد · ${fa(Math.round(code.length / 1024))} کیلوبایت`);
  };
  const is3d = bg.kind === 'scene' || bg.kind === 'shader';

  return (
    <Section title="پس‌زمینه">
      <BackgroundGallery />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {kinds.map(([k, label]) => (
          <button key={k} className="btn" aria-pressed={bg.kind === k} style={{ padding: '0 6px', fontSize: 12, background: bg.kind === k ? 'var(--fill-2)' : undefined, borderColor: bg.kind === k ? 'var(--accent)' : undefined }}
            onClick={() => ((k === 'image' || k === 'video') && !bg.assetId ? bgFile.current?.click() : setBg({ kind: k }))}>
            {label}
          </button>
        ))}
      </div>

      {(bg.kind === 'scene' || bg.kind === 'starfield') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {SCENES.map((sc) => {
            const active = bg.kind === 'scene' && bg.scene === sc.id;
            return (
              <button key={sc.id} onClick={() => setBg({ kind: 'scene', scene: sc.id })} aria-pressed={active}
                style={{ border: 0, padding: 0, background: 'none', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'right' }}>
                <span className={sc.preview} style={{ display: 'block', width: '100%', height: 70, borderRadius: 12, outline: active ? '2px solid var(--accent)' : '1px solid var(--line)', outlineOffset: active ? 2 : 0 }} />
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 500 }}>{sc.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {is3d && (
        <>
          {bg.kind === 'scene' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 13, flex: 1 }}>رنگ صحنه</span>
              {SCENE_COLORS.map((c) => (
                <button key={c} aria-label={`رنگ صحنه ${c}`} onClick={() => setBg({ sceneColor: c })}
                  style={{ width: 26, height: 26, borderRadius: 13, background: c, border: bg.sceneColor === c ? '2px solid #fff' : '2px solid transparent' }} />
              ))}
              <input type="color" value={bg.sceneColor} onChange={(e) => setBg({ sceneColor: e.target.value })} aria-label="رنگ دلخواه صحنه" style={{ width: 30, height: 28, border: 0, background: 'none', padding: 0 }} />
            </div>
          )}
          {bg.kind === 'scene' && <Slider label="سرعت" value={bg.speed} min={0} max={100} onChange={(v) => setBg({ speed: v })} />}
          {bg.kind === 'scene' && <Slider label="تراکم" value={bg.density} min={0} max={100} onChange={(v) => setBg({ density: v })} />}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 13, flex: 1 }}>سقف فریم در ثانیه</span>
            {([24, 30, 60] as const).map((f) => (
              <button key={f} className="btn" style={{ height: 32, width: 48, padding: 0, background: bg.fps === f ? 'var(--fill-2)' : undefined, borderColor: bg.fps === f ? 'var(--accent)' : undefined }} onClick={() => setBg({ fps: f })}>{fa(f)}</button>
            ))}
          </div>
        </>
      )}

      {bg.kind === 'html' && (
        <>
          <textarea value={htmlDraft ?? ''} onChange={(e) => setHtmlDraft(e.target.value)} spellCheck={false} aria-label="کد HTML پس‌زمینه" dir="ltr"
            style={{ height: 220, resize: 'vertical', borderRadius: 12, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.35)', padding: 10, fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.6, textAlign: 'left' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-accent" style={{ flex: 1 }} disabled={!htmlDraft?.trim()} onClick={() => void runHtml(htmlDraft ?? '')}>اجرای کد</button>
            <button className="btn" onClick={() => htmlFile.current?.click()}><IconUpload size={15} />فایل</button>
            <button className="btn" onClick={() => { setHtmlDraft(SAMPLE_HTML); void runHtml(SAMPLE_HTML); }}>نمونه</button>
          </div>
          <input ref={htmlFile} type="file" accept=".html,.htm,text/html" hidden aria-label="فایل HTML پس‌زمینه"
            onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const code = await f.text(); setHtmlDraft(code); await runHtml(code); }} />
          {htmlMsg && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{htmlMsg}</span>}
          <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>هر صفحه‌ی HTML کامل (canvas، WebGL، انیمیشن CSS، حتی اسکریپت از CDN) را بچسبان یا از فایل بیاور. در یک قاب جدا و بدون دسترسی به داده‌هایت اجرا می‌شود؛ حرکت موس به آن می‌رسد ولی کلیک نه. اسکریپت‌های CDN فقط با اینترنت کار می‌کنند.</span>
        </>
      )}

      {bg.kind === 'shader' && (
        <>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label="کد شیدر" dir="ltr"
            style={{ height: 200, resize: 'vertical', borderRadius: 12, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.35)', padding: 10, fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.6, textAlign: 'left' }} />
          {shaderError && <pre dir="ltr" style={{ margin: 0, maxHeight: 90, overflow: 'auto', fontSize: 11, color: 'var(--danger)', whiteSpace: 'pre-wrap', textAlign: 'left' }}>{shaderError}</pre>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-accent" style={{ flex: 1 }} onClick={() => { setBg({ shader: draft }); void saveBackground(useStore.getState().settings.background); }}>اجرای شیدر</button>
            <button className="btn" onClick={() => { setDraft(DEFAULT_SHADER); setBg({ shader: DEFAULT_SHADER }); }}>نمونه</button>
          </div>
          <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>سازگار با Shadertoy: تابع mainImage و متغیرهای iTime، iResolution و iMouse.</span>
        </>
      )}

      <button className="btn" onClick={() => bgFile.current?.click()}><IconUpload size={16} />بارگذاری تصویر یا ویدیو</button>
      <input ref={bgFile} type="file" accept="image/*,video/mp4,video/webm" hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const kind = f.type.startsWith('video/') ? 'video' : 'image';
          const old = bg.assetId;
          const id = await saveAsset(f, kind);
          setBg({ kind, assetId: id });
          await saveBackground(useStore.getState().settings.background);
          await releaseAsset(old);
          e.target.value = '';
        }} />
      {bg.kind === 'color' && (
        <label className="muted" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
          رنگ پس‌زمینه
          <input type="color" value={bg.color} onChange={(e) => setBg({ color: e.target.value })} style={{ width: 48, height: 32, border: 0, background: 'none' }} />
        </label>
      )}
      <Slider label="تیرگی روی پس‌زمینه" value={bg.dim} min={0} max={80} unit="٪" onChange={(v) => setBg({ dim: v })} />
    </Section>
  );
}

function AISection() {
  const ai = useStore((s) => s.settings.ai);
  const setSettings = useStore((s) => s.setSettings);
  const setAI = (patch: Partial<AISettings>) => setSettings({ ai: { ...useStore.getState().settings.ai, ...patch } });
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      if (!(await ensureHostPermission(ai.baseUrl))) throw new Error('اجازه‌ی دسترسی داده نشد.');
      const list = await listModels(ai);
      setModels(list);
      if (!ai.model && list[0]) setAI({ model: list[0] });
      setStatus(list.length ? { ok: true, text: `متصل شد · ${fa(list.length)} مدل` } : { ok: false, text: 'وصل شد ولی هیچ مدلی نصب نیست. مثلاً در ترمینال: ollama pull <اسم مدل>' });
    } catch (e) {
      const msg = explainAIError(e, ai);
      setStatus({ ok: false, text: msg });
      if (msg.includes('OLLAMA_ORIGINS')) setShowGuide(true);
    } finally {
      setTesting(false);
    }
  };

  // Check the connection whenever the section opens or the server changes.
  useEffect(() => { void test(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ai.baseUrl, ai.apiKey]);

  const presets: [AIPreset, string][] = [['ollama', 'Ollama'], ['lmstudio', 'LM Studio'], ['custom', 'سرور دلخواه']];
  const modelOptions = ai.model && !models.includes(ai.model) ? [ai.model, ...models] : models;

  return (
    <Section title="هوش مصنوعی">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {presets.map(([p, label]) => (
          <button key={p} className="btn" aria-pressed={ai.preset === p} style={{ fontSize: 12, padding: '0 6px', background: ai.preset === p ? 'var(--fill-2)' : undefined, borderColor: ai.preset === p ? 'var(--accent)' : undefined }}
            onClick={() => setAI(p === 'custom' ? { preset: p } : { preset: p, baseUrl: PRESET_URLS[p], model: '' })}>
            {label}
          </button>
        ))}
      </div>
      <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        آدرس API
        <input value={ai.baseUrl} onChange={(e) => setAI({ baseUrl: e.target.value, preset: 'custom' })} dir="ltr" aria-label="آدرس API"
          style={{ height: 40, borderRadius: 12, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: '0 12px', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
      </label>
      {ai.preset === 'custom' && (
        <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          کلید API (اختیاری؛ فقط روی همین مرورگر ذخیره می‌شود)
          <input type="password" value={ai.apiKey} onChange={(e) => setAI({ apiKey: e.target.value })} dir="ltr" aria-label="کلید API" autoComplete="off"
            style={{ height: 40, borderRadius: 12, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: '0 12px', fontSize: 12 }} />
        </label>
      )}
      <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        مدل
        <select value={ai.model} onChange={(e) => setAI({ model: e.target.value })} aria-label="مدل" dir="ltr"
          style={{ height: 40, borderRadius: 12, border: '1px solid var(--line-2)', background: '#12141B', padding: '0 10px', fontSize: 13 }}>
          {!ai.model && <option value="">— انتخاب کن —</option>}
          {modelOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        مدل embedding (برای حافظه و دانش)
        <select value={ai.embedModel} onChange={(e) => setAI({ embedModel: e.target.value })} aria-label="مدل embedding" dir="ltr"
          style={{ height: 40, borderRadius: 12, border: '1px solid var(--line-2)', background: '#12141B', padding: '0 10px', fontSize: 13 }}>
          <option value="">بدون (جستجوی کلمه‌ای)</option>
          {[...new Set([ai.embedModel, ...models].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn" onClick={() => void test()} disabled={testing}>{testing ? 'در حال بررسی…' : 'آزمایش اتصال'}</button>
        {status && <span style={{ fontSize: 12, lineHeight: 1.7, color: status.ok ? 'var(--accent)' : 'var(--danger)', flex: 1 }}>{status.text}</span>}
      </div>
      <Slider label="خلاقیت (temperature)" value={Math.round(ai.temperature * 10)} min={0} max={15} show={(v) => fa((v / 10).toFixed(1)).replace('.', '٫')} onChange={(v) => setAI({ temperature: v / 10 })} />
      <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        دستور ثابت (system prompt)
        <textarea value={ai.system} onChange={(e) => setAI({ system: e.target.value })} rows={3} aria-label="دستور ثابت"
          style={{ borderRadius: 12, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: 10, fontSize: 12, lineHeight: 1.7, resize: 'vertical' }} />
      </label>

      <details style={{ fontSize: 13 }}>
        <summary style={{ cursor: 'pointer' }}>دستورهای سریع (<span dir="ltr">/break</span>، <span dir="ltr">/sum</span>…)</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {ai.commands.map((c, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 12, background: 'var(--fill)' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={c.trigger} dir="ltr" aria-label="کلید دستور" onChange={(e) => setAI({ commands: ai.commands.map((x, j) => (j === i ? { ...x, trigger: e.target.value.replace(/[^a-z0-9-]/gi, '') } : x)) })}
                  style={{ width: 80, height: 32, borderRadius: 8, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: '0 8px', fontSize: 12 }} />
                <input value={c.title} aria-label="عنوان دستور" onChange={(e) => setAI({ commands: ai.commands.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                  style={{ flex: 1, height: 32, borderRadius: 8, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: '0 8px', fontSize: 12 }} />
                <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label="حذف دستور" onClick={() => setAI({ commands: ai.commands.filter((_, j) => j !== i) })}><IconX size={14} /></button>
              </div>
              <textarea value={c.prompt} rows={3} aria-label="متن دستور" onChange={(e) => setAI({ commands: ai.commands.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)) })}
                style={{ borderRadius: 8, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: 8, fontSize: 12, lineHeight: 1.6, resize: 'vertical' }} />
            </div>
          ))}
          <button className="btn" onClick={() => setAI({ commands: [...ai.commands, { trigger: 'new', title: 'دستور جدید', prompt: '{{text}}' }] })}><IconPlus size={14} />دستور جدید</button>
          <span className="faint" style={{ fontSize: 12 }}>در متن دستور، <span dir="ltr">{'{{text}}'}</span> جای متنی است که بعد از دستور می‌نویسی.</span>
        </div>
      </details>

      <details open={showGuide} style={{ fontSize: 13 }}>
        <summary style={{ cursor: 'pointer' }}>اگر Ollama خطای ۴۰۳ داد</summary>
        <p className="muted" style={{ lineHeight: 1.9, margin: '8px 0' }}>افزونه معمولاً خودش این را حل می‌کند. اگر نشد، در PowerShell این را بزن، بعد Ollama را از System Tray ببند (Quit) و دوباره باز کن:</p>
        <pre dir="ltr" style={{ margin: 0, padding: 10, borderRadius: 10, background: 'rgba(0,0,0,.4)', fontSize: 12, whiteSpace: 'pre-wrap', textAlign: 'left' }}>setx OLLAMA_ORIGINS "chrome-extension://*"</pre>
      </details>
    </Section>
  );
}

function CalendarSection() {
  const hijriOffset = useStore((s) => s.settings.hijriOffset);
  const g = useStore((s) => s.settings.google);
  const setSettings = useStore((s) => s.setSettings);
  const setG = (patch: Partial<typeof g>) => setSettings({ google: { ...useStore.getState().settings.google, ...patch } });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const icsFile = useRef<HTMLInputElement>(null);
  const uri = redirectUri();

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); } catch (e) { setMsg({ ok: false, text: String((e as Error).message ?? e) }); } finally { setBusy(false); }
  };
  const syncNow = async () => {
    const now = new Date();
    const err = await syncRange(dayKey(addDays(now, -40)), dayKey(addDays(now, 60)), true);
    if (err) throw new Error(err);
    return 'همگام شد';
  };
  const inputStyle = { height: 38, borderRadius: 10, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: '0 10px', fontSize: 12 } as const;

  return (
    <Section title="تقویم‌ها">
      <CalendarPrefsBlock />
      <label className="muted" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
        تصحیح تاریخ قمری
        <select value={hijriOffset} onChange={(e) => setSettings({ hijriOffset: Number(e.target.value) })}
          style={{ height: 34, borderRadius: 10, border: '1px solid var(--line-2)', background: '#12141B', padding: '0 8px' }}>
          {[-2, -1, 0, 1, 2].map((v) => <option key={v} value={v}>{v === 0 ? 'بدون تصحیح' : `${fa(Math.abs(v))} روز ${v < 0 ? 'عقب' : 'جلو'}`}</option>)}
        </select>
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 14, background: 'var(--fill)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>گوگل‌کلندر</span>
          <span style={{ fontSize: 12, color: g.connected ? 'var(--accent)' : 'var(--text-3)' }}>{g.connected ? 'متصل' : 'وصل نیست'}</span>
        </div>
        {!g.connected && !IS_EXTENSION && (
          <span className="faint" style={{ fontSize: 12.5, lineHeight: 1.8 }}>اتصال به گوگل‌کلندر فعلاً فقط در افزونه‌ی کروم است. روی گوشی، تقویم را با فایل ICS وارد کن یا از اپ خود گوگل‌کلندر کنارش استفاده کن.</span>
        )}
        {!g.connected && IS_EXTENSION && (
          <>
            <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              Client ID (از Google Cloud Console)
              <input value={g.clientId} onChange={(e) => setG({ clientId: e.target.value.trim() })} dir="ltr" aria-label="Client ID" placeholder="xxxxxxxx.apps.googleusercontent.com" style={inputStyle} />
            </label>
            <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              Redirect URI (همین را در Google Cloud وارد کن)
              <div style={{ display: 'flex', gap: 6 }}>
                <input readOnly value={uri} dir="ltr" aria-label="Redirect URI" style={{ ...inputStyle, flex: 1 }} />
                <button className="btn" style={{ height: 38 }} onClick={() => void navigator.clipboard.writeText(uri).then(() => setMsg({ ok: true, text: 'کپی شد' }))}>کپی</button>
              </div>
            </label>
            <button className="btn btn-accent" style={{ alignSelf: 'flex-start', minWidth: 200 }} disabled={!g.clientId || busy} onClick={() => void run(async () => { await connectGoogle(); await syncNow(); return 'وصل شد'; })}>ورود با حساب گوگل</button>
          </>
        )}
        {g.connected && (
          <>
            <span className="muted" style={{ fontSize: 12 }}>تقویم‌هایی که نمایش داده شوند:</span>
            {g.calendars.map((c) => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={c.enabled} style={{ accentColor: c.color }}
                  onChange={(e) => setG({ calendars: g.calendars.map((x) => (x.id === c.id ? { ...x, enabled: e.target.checked } : x)) })} />
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color }} />
                <span style={{ flex: 1 }}>{c.summary}</span>
              </label>
            ))}
            <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              رویداد تازه کجا ثبت شود؟
              <select value={g.target} onChange={(e) => setG({ target: e.target.value })} aria-label="تقویم پیش‌فرض"
                style={{ height: 36, borderRadius: 10, border: '1px solid var(--line-2)', background: '#12141B', padding: '0 8px', fontSize: 13 }}>
                <option value="local">تقویم خودم (روی همین مرورگر)</option>
                {g.calendars.filter((c) => c.writable).map((c) => <option key={c.id} value={c.id}>گوگل: {c.summary}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={() => void run(async () => { await refreshCalendars(); return syncNow(); })}>همگام‌سازی</button>
              <button className="btn" disabled={busy} onClick={async () => { if (await ask('اتصال به گوگل قطع شود؟ رویدادهای گوگل از این صفحه پاک می‌شوند (در خود گوگل می‌مانند).', { danger: true, ok: 'قطع کن' })) void run(async () => { await disconnectGoogle(); return 'قطع شد'; }); }}>قطع اتصال</button>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => icsFile.current?.click()}><IconUpload size={15} />وارد کردن ICS</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => void run(async () => `${fa(await exportICS())} رویداد خروجی گرفته شد`)}><IconDownload size={15} />خروجی ICS</button>
      </div>
      <input ref={icsFile} type="file" accept=".ics,text/calendar" hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void run(async () => `${fa(await importICS(f))} رویداد وارد شد`);
        }} />
      {msg && <span style={{ fontSize: 12, lineHeight: 1.7, color: msg.ok ? 'var(--accent)' : 'var(--danger)' }}>{msg.text}</span>}
    </Section>
  );
}

/* ---------- Settings: a large sheet — navigation · settings · live preview ---------- */
const GROUPS: { name: string; items: { title: string; short?: string; keys: string }[] }[] = [
  { name: 'شروع', items: [{ title: 'آشنایی با اورآ', short: 'آشنایی', keys: 'آشنایی راهنما آموزش tour help فهمیدم' }] },
  { name: 'ظاهر', items: [
    { title: 'رنگ و پنل‌ها', short: 'رنگ و شیشه', keys: 'رنگ accent تاری blur شیشه پنل' },
    { title: 'پس‌زمینه', keys: 'پس زمینه background شیدر shader html تصویر ویدیو سه بعدی کهکشان گالری' },
    { title: 'فونت‌ها', keys: 'فونت font قلم' },
  ] },
  { name: 'رفتار', items: [
    { title: 'حالت‌ها', keys: 'حالت mode کار خستگی شب آفلاین قانون نور شب' },
    { title: 'برنامه‌ریزی', keys: 'برنامه تسک کار ساعت برآورد صبح عصر سه کار مهم' },
    { title: 'مربی', keys: 'مربی coach نگرانی دلیل نمره جمع بندی یادگیری لحن' },
    { title: 'جمله‌ها', keys: 'جمله شعر سلیقه گنجور api بسته حوزه' },
  ] },
  { name: 'ابزارها', items: [
    { title: 'هوش مصنوعی', keys: 'ai ollama مدل دستیار' },
    { title: 'شهر', keys: 'شهر آب و هوا اوقات شرعی' },
    { title: 'یادآوری نماز', keys: 'نماز اذان یادآوری اعلان غروب' },
    { title: 'تقویم‌ها', keys: 'تقویم گوگل ics قمری ساعت دوم منطقه زمانی یادآوری رویداد' },
    { title: 'سرور تقویم شخصی (CalDAV)', short: 'سرور تقویم (CalDAV)', keys: 'caldav radicale سرور' },
    { title: 'موتور جستجو', short: 'جستجو', keys: 'جستجو search گوگل duckduckgo' },
  ] },
  { name: 'داده', items: [
    ...(IS_WEB_BUILD ? [{ title: 'یادآوری کارها', short: 'یادآوری', keys: 'نوتیف اعلان یادآوری notification push' }] : []),
    { title: 'پروفایل من', short: 'پروفایل', keys: 'پروفایل نام علایق ایمیل' },
    { title: 'حریم خصوصی و داده‌ها', short: 'حریم خصوصی', keys: 'حریم خصوصی سرور قوانین اشتراک داده بازخورد پیام ایمیل حذف نسخه آپدیت' },
    { title: 'پشتیبان‌گیری و پایداری', short: 'پشتیبان', keys: 'پشتیبان backup بازگردانی خروجی' },
  ] },
];

export const appVersion = (): string => APP_VERSION;

/** A miniature of your page, drawn with the live settings (accent, glass, fonts, sentence frame, background). */
function LivePreview() {
  const settings = useStore((s) => s.settings);
  const look = effectiveLook(settings);
  const bg = look.background;
  const assetUrl = useAssetUrl(bg.kind === 'image' ? bg.assetId : undefined);
  const [still, setStill] = useState(bgStill.url);
  useEffect(() => { const f = () => setStill(bgStill.url); bgStill.listeners.add(f); return () => { bgStill.listeners.delete(f); }; }, []);
  const mode = settings.modes.find((m) => m.id === settings.mode.active);
  const bgStyle: CSSProperties =
    bg.kind === 'color' ? { background: bg.color }
    : bg.kind === 'image' && assetUrl ? { backgroundImage: `url("${assetUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : (bg.kind === 'scene' || bg.kind === 'shader' || bg.kind === 'html') && still ? { backgroundImage: `url("${still}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {};
  const cls = bg.kind === 'starfield' ? 'pv-galaxy' : bg.kind === 'scene' && !still ? `pv-${bg.scene}` : '';
  return (
    <div className="lp" aria-label="پیش‌نمایش زنده">
      <div className={`lp-screen ${cls}`} style={bgStyle}>
        <div className="lp-dim" style={{ opacity: bg.dim / 100 }} />
        <div className="lp-clock glass"><b>۱۹:۴۵</b><span>سه‌شنبه، ۱۴ مهر</span></div>
        <div className="lp-tasks glass">
          <span className="lp-h">امروز</span>
          <span className="lp-task"><i />خواندن فصل سوم</span>
          <span className="lp-task"><i className="on" />ایمیل به استاد</span>
        </div>
        <div className={`lp-sentence frame-${settings.sentences.frame}`}>
          <div className="sentence-plate"><span className="sentence-mark" /><blockquote style={{ fontWeight: settings.sentences.weight }}>قدر لحظه‌ها را نمی‌دانیم<br />تا وقتی که خاطره شوند.</blockquote></div>
        </div>
        <span className="lp-btn">شروع</span>
      </div>
      <div className="lp-meta"><span>پیش‌نمایش زنده</span>{mode && <span>حالت {mode.name}</span>}</div>
    </div>
  );
}

export function SettingsPanel() {
  const panel = useStore((s) => s.panel);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const setPanel = useStore((s) => s.setPanel);
  const phone = usePhone();
  const [q, setQ] = useState('');
  const [active, setActive] = useState('آشنایی با اورآ');
  const [peek, setPeek] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  // Search: hide sections that don't match.
  useEffect(() => {
    const root = body.current;
    if (!root) return;
    const query = q.trim().toLowerCase();
    const items = GROUPS.flatMap((g) => g.items);
    root.querySelectorAll<HTMLElement>('section[data-title]').forEach((el) => {
      const it = items.find((x) => x.title === el.dataset.title);
      const hay = `${el.dataset.title} ${it?.keys ?? ''} ${el.textContent ?? ''}`.toLowerCase();
      el.hidden = !!query && !hay.includes(query);
    });
  }, [q, panel]);

  // Scroll-spy: highlight the section being read. A click on the nav owns the highlight until
  // its smooth scroll settles, so passing sections don't flicker through it.
  const lock = useRef(0);
  useEffect(() => {
    const root = body.current;
    if (!root || panel !== 'settings') return;
    const onScroll = () => {
      if (Date.now() < lock.current) return;
      const top = root.getBoundingClientRect().top + 110;
      const atEnd = root.scrollTop + root.clientHeight >= root.scrollHeight - 4;
      let cur = '';
      const secs = [...root.querySelectorAll<HTMLElement>('section[data-title]')].filter((el) => !el.hidden);
      secs.forEach((el) => { if (el.getBoundingClientRect().top <= top) cur = el.dataset.title!; });
      if (atEnd && secs.length) cur = secs[secs.length - 1].dataset.title!;
      if (cur) setActive(cur);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [panel]);

  // While a slider is dragged the sheet fades, so the real page shows the change.
  useEffect(() => {
    const up = () => setPeek(false);
    addEventListener('pointerup', up);
    return () => removeEventListener('pointerup', up);
  }, []);

  // Other parts of Ora (the tour's «برو به …») can open settings at a section.
  useEffect(() => {
    const on = (e: Event) => {
      const title = (e as CustomEvent<{ section?: string }>).detail?.section;
      setPanel('settings');
      if (title) window.setTimeout(() => {
        const el = body.current?.querySelector<HTMLElement>(`section[data-title="${title}"]`);
        if (!el) return;
        setActive(title); lock.current = Date.now() + 900;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); window.setTimeout(() => el.classList.remove('flash'), 1500);
      }, 150);
    };
    addEventListener('ora:settings', on);
    return () => removeEventListener('ora:settings', on);
  }, [setPanel]);

  const hoverT = useRef(0);
  if (panel !== 'settings') return null;
  // Pointing at a nav item shows where that part is: after a short pause the body scrolls to it
  // and the whole section lights up, its title in the accent colour.
  const sec = (title: string) => body.current?.querySelector<HTMLElement>(`section[data-title="${title}"]`);
  const spotOn = (title: string) => {
    window.clearTimeout(hoverT.current);
    hoverT.current = window.setTimeout(() => {
      const el = sec(title);
      if (!el) return;
      body.current?.querySelectorAll('.set-sec.spot').forEach((x) => x.classList.remove('spot'));
      el.classList.add('spot');
      lock.current = Date.now() + 900;
      setActive(title);
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 380);
  };
  const spotOff = () => {
    window.clearTimeout(hoverT.current);
    body.current?.querySelectorAll('.set-sec.spot').forEach((x) => x.classList.remove('spot'));
  };
  const go = (title: string) => {
    window.clearTimeout(hoverT.current);
    const el = sec(title);
    if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); window.setTimeout(() => el.classList.remove('flash'), 1500); }
    setActive(title);
    lock.current = Date.now() + 900;
    body.current?.querySelector(`section[data-title="${title}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={`settings-overlay${peek ? ' peek' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) setPanel('none'); }}>
    <aside className="glass settings-sheet" aria-label="شخصی‌سازی">
      <nav className="settings-nav" aria-label="بخش‌های شخصی‌سازی">
        <h2 style={{ margin: '4px 10px 16px', fontSize: 18, fontWeight: 700 }}>شخصی‌سازی</h2>
        <div className="field" style={{ marginBottom: 12 }}>
          <IconSearch size={15} className="ico faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در تنظیمات…" aria-label="جستجو در تنظیمات" style={{ fontSize: 13 }} />
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {GROUPS.map((g) => (
            <div key={g.name} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
              <span className="settings-nav-group">{g.name}</span>
              {g.items.map((it) => (
                <button key={it.title} className="settings-nav-item" aria-current={active === it.title} onClick={() => go(it.title)}
                  onMouseEnter={() => spotOn(it.title)} onMouseLeave={spotOff} onFocus={() => spotOn(it.title)} onBlur={spotOff}>{it.short ?? it.title}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="settings-version">اورآ · نسخه‌ی <bdi dir="ltr">{fa(appVersion())}</bdi></div>
      </nav>

      <div ref={body} className="settings-body scroll" onPointerDownCapture={(e) => { if ((e.target as HTMLElement).matches('input[type="range"]')) setPeek(true); }}>
        <div className="settings-body-head">
          <span className="muted" style={{ fontSize: 13 }}>تغییرها همان لحظه اعمال و ذخیره می‌شوند.</span>
          <button className="icon-btn" aria-label="بستن" onClick={() => setPanel('none')}><IconX size={18} /></button>
        </div>

      <TourSection />

      <Section title="رنگ و پنل‌ها">
        <Row label="رنگ اصلی">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {ACCENTS.map((c) => (
            <button key={c} aria-label={`رنگ ${c}`} aria-pressed={settings.accent === c} onClick={() => setSettings({ accent: c })}
              className="swatch" style={{ background: c }} />
          ))}
          <label title="رنگ دلخواه" style={{ width: 32, height: 32, borderRadius: 16, border: '1.5px dashed var(--line-2)', display: 'grid', placeItems: 'center', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
            <IconPlus size={14} />
            <input type="color" value={settings.accent} onChange={(e) => setSettings({ accent: e.target.value })} aria-label="رنگ دلخواه" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          </label>
        </div>
        </Row>
        <Row label="جنس پنل‌ها" hint="شیشه‌ی ویژه همان قاب جمله است: لبه‌ی روشن و سایه‌ی نرم.">
          <Segmented label="جنس پنل‌ها" value={settings.panelStyle ?? 'premium'} options={[['premium', 'شیشه‌ی ویژه'], ['plain', 'ساده']] as const} onChange={(v) => setSettings({ panelStyle: v })} />
        </Row>
        <Row label="چشم اورآ" hint="گاهی (هر چند ساعت یک بار) یک نکته‌ی کوتاه پیشنهاد می‌دهد. با کلیک روی چشم هم نکته می‌گوید.">
          <Segmented label="چشم اورآ" value={settings.eyeTips === false ? 'off' : 'on'} options={[['on', 'نکته بگوید'], ['off', 'فقط نگاه کند']] as const} onChange={(v) => setSettings({ eyeTips: v === 'on' })} />
        </Row>
        <Row label="جا شدن چیدمان در صفحه" hint="همه‌ی ویجت‌ها با هم کوچک یا بزرگ می‌شوند تا صفحه بدون اسکرول پر شود.">
          <Segmented label="جا شدن چیدمان" value={settings.layoutFit === false ? 'off' : 'on'} options={[['on', 'خودکار'], ['off', 'اندازه‌ی ثابت']] as const} onChange={(v) => setSettings({ layoutFit: v === 'on' })} />
        </Row>
        {phone
          ? <Slider label="تاری پشت پنل‌ها (گوشی)" value={settings.panelBlurPhone ?? 2} min={0} max={40} unit="px" onChange={(v) => setSettings({ panelBlurPhone: v })} />
          : <Slider label="تاری پشت پنل‌ها" value={settings.panelBlur} min={0} max={40} unit="px" onChange={(v) => setSettings({ panelBlur: v })} />}
        <Slider label="پررنگی پنل‌ها" value={settings.panelOpacity} min={0} max={40} unit="٪" onChange={(v) => setSettings({ panelOpacity: v })} />
      </Section>

      <BackgroundSection />

      <FontsSection />

      <ModesSection />

      <PlannerSection />
      <CoachSection />

      <SentencesSection />

      <AISection />

      <CitySection />

      <PrayerSection />

      <CalendarSection />

      <CalDavSection />

      <SearchSection />

      <NotifySection />
      <ProfileSection />
      <PrivacySection />

      <BackupSection />
      </div>

      <div className="settings-preview">
        <LivePreview />
        <button className="btn" onPointerDown={() => setPeek(true)} onPointerUp={() => setPeek(false)} onPointerLeave={() => setPeek(false)}
          onKeyDown={(e) => { if (e.key === ' ') setPeek(true); }} onKeyUp={() => setPeek(false)}>نگه دار تا خود صفحه را ببینی</button>
        <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>وقتی یک لغزنده را می‌کشی، این پنجره کنار می‌رود تا تغییر را روی صفحه‌ی واقعی ببینی.</span>
      </div>
    </aside>
    </div>
  );
}
