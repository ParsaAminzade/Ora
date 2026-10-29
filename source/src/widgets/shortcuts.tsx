import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react';
import { cachedIcon, hostOf, siteIcon, type SiteIcon } from '../core/siteicon';
import { createPortal } from 'react-dom';
import { defineWidget } from '../core/widgets';
import { IconEdit, IconGrid, IconGrip, IconPinTop, IconPlus, IconTrash, IconDown, IconUp, IconX } from '../ui/icons';

interface Shortcut {
  title: string;
  url: string;
}
interface Config {
  items: Shortcut[];
}

const DEFAULTS: Shortcut[] = [
  { title: 'Google', url: 'https://www.google.com' },
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'Claude', url: 'https://claude.ai' },
  { title: 'Gemini', url: 'https://gemini.google.com' },
  { title: 'Translate', url: 'https://translate.google.com' },
  { title: 'Scholar', url: 'https://scholar.google.com' },
  { title: 'arXiv', url: 'https://arxiv.org' },
  { title: 'GitHub', url: 'https://github.com' },
];

const normalize = (raw: string) => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
const move = <T,>(a: T[], from: number, to: number) => { const b = [...a]; const [x] = b.splice(from, 1); b.splice(to, 0, x); return b; };
/** FNV-1a over the host, spread round the colour wheel. */
const hueOf = (s: string) => { let h = 0x811c9dc5; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h % 360; };

/** The site's own icon (or a monogram) and its colour, for the glow. */
function useSiteIcon(url: string): SiteIcon | null | undefined {
  const [icon, setIcon] = useState<SiteIcon | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void cachedIcon(url).then((c) => { if (alive && c !== undefined) setIcon(c); });
    void siteIcon(url).then((v) => { if (alive) setIcon(v); });
    return () => { alive = false; };
  }, [url]);
  return icon;
}
/** CSS colour (r g b) for a site: its icon's colour, else one made from its name. */
/** The glow's colours (r g b): every colour in the site's logo; a soft white for a black-and-white
 *  logo; colours made from the site's name for a monogram. Always four, repeating if the logo has fewer. */
function glowOf(icon: SiteIcon | null | undefined, url: string): string[] | undefined {
  if (icon === undefined) return undefined;
  let pal: number[][];
  if (icon) pal = icon.pal?.length ? icon.pal : icon.rgb ? [icon.rgb] : [[226, 230, 240]];
  else { const h = hueOf(hostOf(url)); pal = [hslToRgb(h, 0.55, 0.6), hslToRgb((h + 40) % 360, 0.5, 0.58)]; }
  return [0, 1, 2, 3].map((i) => pal[i % pal.length].join(' '));
}
function hslToRgb(h: number, s: number, l: number): number[] {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
}

function Favicon({ s, size, icon }: { s: Shortcut; size: number; icon: SiteIcon | null | undefined }) {
  const letter = (s.title.trim() || hostOf(s.url)).slice(0, 1).toUpperCase();
  if (icon === undefined) return <span className="sc-wait" aria-hidden="true" />;
  if (!icon) {
    const h = hueOf(hostOf(s.url));
    return (
      <span className="sc-mono" aria-hidden="true" style={{ fontSize: Math.round(size * 0.8), color: `hsl(${h} 60% 82%)`, background: `linear-gradient(160deg, hsl(${h} 45% 50% / .26), hsl(${h} 45% 40% / .1))` }}>
        {letter}
      </span>
    );
  }
  return <img src={icon.src} alt="" width={size} height={size} draggable={false} className={`sc-img${icon.dark ? ' on-light' : ''}`} />;
}
function RowIcon({ s }: { s: Shortcut }) {
  const icon = useSiteIcon(s.url);
  return <Favicon s={s} size={20} icon={icon} />;
}
function Tile({ s }: { s: Shortcut }) {
  const icon = useSiteIcon(s.url);
  const c = glowOf(icon, s.url);
  const mono = !!icon && !icon.pal?.length && !icon.rgb;
  return (
    <>
      <span className={`sc-tile${icon ? ' has-icon' : ''}${mono ? ' bw' : ''}`} style={c ? ({ '--sc-c': c[0], '--sc-c2': c[1], '--sc-c3': c[2], '--sc-c4': c[3] } as CSSProperties) : undefined}><Favicon s={s} size={34} icon={icon} /></span>
      <span className="sc-name">{s.title}</span>
    </>
  );
}

/* ---------- the edit panel ---------- */
function EditPanel({ items, onChange, onClose, focusNew }: { items: Shortcut[]; onChange(items: Shortcut[]): void; onClose(): void; focusNew: boolean }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [drag, setDrag] = useState<number | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (focusNew) urlRef.current?.focus();
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [focusNew, onClose]);

  const patch = (i: number, p: Partial<Shortcut>) => onChange(items.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const shift = (i: number, to: number) => {
    if (to < 0 || to >= items.length || to === i) return;
    onChange(move(items, i, to));
    // keep keyboard focus on the moved row
    window.setTimeout(() => listRef.current?.querySelectorAll<HTMLElement>('.sc-row')[to]?.focus(), 0);
  };
  const add = () => {
    if (!url.trim()) { urlRef.current?.focus(); return; }
    const full = normalize(url.trim());
    onChange([...items, { title: title.trim() || hostOf(full), url: full }]);
    setUrl(''); setTitle('');
    urlRef.current?.focus();
    window.setTimeout(() => listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' }), 0);
  };
  const rowKeys = (e: KeyboardEvent, i: number) => {
    if (e.target !== e.currentTarget) return;
    if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); shift(i, i - 1); }
    if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); shift(i, i + 1); }
  };

  return createPortal(
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="ویرایش میانبرها" className="glass sc-panel">
        <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>ویرایش میانبرها</h2>
            <p className="faint" style={{ margin: '4px 0 0', fontSize: 12 }}>برای جابه‌جایی بکش، یا روی ردیف Alt و جهت‌نما را بزن. تغییرها همان لحظه ذخیره می‌شوند.</p>
          </div>
          <button className="icon-btn" aria-label="بستن" onClick={onClose}><IconX size={18} /></button>
        </header>

        <ol ref={listRef} className="sc-list scroll" aria-label="فهرست میانبرها">
          {items.map((s, i) => (
            <li key={s.url + i} className={`sc-row${drag === i ? ' dragging' : ''}`} tabIndex={0} aria-label={`${s.title}، جایگاه ${i + 1}`}
              draggable onKeyDown={(e) => rowKeys(e, i)}
              onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }}
              onDragOver={(e) => { if (drag === null) return; e.preventDefault(); if (drag !== i) { onChange(move(items, drag, i)); setDrag(i); } }}
              onDragEnd={() => setDrag(null)} onDrop={(e) => e.preventDefault()}>
              <span className="sc-grip" aria-hidden="true"><IconGrip size={16} /></span>
              <span className="sc-row-icon"><RowIcon s={s} /></span>
              <input className="sc-in" value={s.title} aria-label="اسم" onChange={(e) => patch(i, { title: e.target.value })}
                onBlur={() => { if (!s.title.trim()) patch(i, { title: hostOf(s.url) }); }} draggable={false} onDragStart={(e) => e.preventDefault()} />
              <input className="sc-in" value={s.url} aria-label="آدرس" dir="ltr" style={{ flex: 1.6 }} onChange={(e) => patch(i, { url: e.target.value })}
                onBlur={() => { if (s.url.trim()) patch(i, { url: normalize(s.url.trim()) }); }} draggable={false} onDragStart={(e) => e.preventDefault()} />
              <button className="icon-btn sc-mini" title="اولین شود" aria-label={`${s.title} اولین شود`} disabled={i === 0} onClick={() => shift(i, 0)}><IconPinTop size={15} /></button>
              <button className="icon-btn sc-mini" title="بالاتر" aria-label={`${s.title} بالاتر`} disabled={i === 0} onClick={() => shift(i, i - 1)}><IconUp size={15} /></button>
              <button className="icon-btn sc-mini" title="پایین‌تر" aria-label={`${s.title} پایین‌تر`} disabled={i === items.length - 1} onClick={() => shift(i, i + 1)}><IconDown size={15} /></button>
              <button className="icon-btn sc-mini sc-del" title="حذف" aria-label={`حذف ${s.title}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><IconTrash size={15} /></button>
            </li>
          ))}
          {!items.length && <li className="faint" style={{ padding: 16, textAlign: 'center', fontSize: 13 }}>هنوز سایتی نیست. از پایین اضافه کن.</li>}
        </ol>

        <form className="sc-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <div className="field" style={{ flex: 1.6 }}><input ref={urlRef} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="آدرس سایت، مثلاً github.com" aria-label="آدرس سایت جدید" dir="ltr" /></div>
          <div className="field" style={{ flex: 1 }}><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اسم (اختیاری)" aria-label="اسم سایت جدید" /></div>
          <button className="btn btn-accent" style={{ height: 44 }}><IconPlus size={16} />افزودن</button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

defineWidget<Config>({
  type: 'shortcuts',
  name: 'میانبرها',
  description: 'سایت‌های پرکاربرد با آیکون خودکار',
  icon: <IconGrid />,
  defaultSize: { w: 8, h: 7 },
  minSize: { w: 3, h: 3 },
  defaultConfig: { items: DEFAULTS },
  card: false,
  multiple: true,
  Component: function Shortcuts({ config, setConfig, editing }) {
    const [panel, setPanel] = useState<null | 'edit' | 'add'>(null);
    // Live order while dragging on the grid; committed on drop.
    const [preview, setPreview] = useState<Shortcut[] | null>(null);
    const [drag, setDrag] = useState<number | null>(null);
    const items = preview ?? config.items;
    const set = (next: Shortcut[]) => setConfig({ items: next });

    const over = (e: DragEvent, j: number) => {
      if (drag === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (drag !== j) { setPreview(move(items, drag, j)); setDrag(j); }
    };
    const end = () => { if (preview) set(preview); setPreview(null); setDrag(null); };

    return (
      <div className="sc-wrap" onContextMenu={(e) => { e.preventDefault(); setPanel('edit'); }}>
        <div className="sc-scroll scroll">
        <div className="sc-grid" onDragOver={(e) => { if (drag !== null) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); end(); }}>
          {items.map((s, i) => (
            <div key={s.url + s.title} className={`sc-item${drag === i ? ' dragging' : ''}`} draggable={!editing}
              onDragStart={(e) => { setDrag(i); setPreview(config.items); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/uri-list', s.url); }}
              onDragOver={(e) => over(e, i)} onDragEnd={end}>
              <a href={s.url} draggable={false} className="sc-link" title={s.url}>
                <Tile s={s} />
              </a>
            </div>
          ))}
          {!editing && (
            <div className="sc-item">
              <button className="sc-link sc-addtile" aria-label="ویرایش میانبرها" title="افزودن، جابه‌جایی، ویرایش و حذف" onClick={() => setPanel('add')}>
                <span className="sc-tile sc-tile-new"><IconEdit size={18} /></span>
                <span className="sc-name">ویرایش</span>
              </button>
            </div>
          )}
        </div>
        </div>
        {panel && <EditPanel items={config.items} onChange={set} onClose={() => setPanel(null)} focusNew={panel === 'add'} />}
      </div>
    );
  },
});
