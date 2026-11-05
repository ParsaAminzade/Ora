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
/** Each tile's glow sits a little differently — its own angle, reach and strength — so a row of
 *  tiles doesn't look stamped out of one mould. Seeded by the site, so it never jumps around. */
// The glow lives only inside the tile (nothing spills around it), and its shape is the site's own:
// seeded by the host, so it stays the same on every visit but two sites with the same colours still
// look different — a different layout (corners, a band of light, a ring, a sweep), blob sizes and
// strengths, and the colours nudged a few degrees off each other.
function nudge(rgb: string, deg: number, light: number): string {
  const [r, g, b] = rgb.split(' ').map((x) => Number(x) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, sat = 0;
  if (d) {
    sat = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return hslToRgb((h + deg + 360) % 360, Math.min(1, sat), Math.max(0.2, Math.min(0.8, l + light))).join(' ');
}
function glowShape(url: string, c: string[]) {
  let seed = hueOf(hostOf(url) + '~') + 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let k = 0; k < 3; k++) rnd(); // let similar hosts drift apart
  const turn = rnd() * 360;
  const col = c.map((x, i) => nudge(x, (rnd() - 0.5) * 36, (rnd() - 0.5) * 0.12 + (i ? -0.02 : 0)));
  const pct = (v: number) => `${v.toFixed(0)}%`;
  const blob = (x: number, y: number, w: number, h: number, ci: number, a: number) =>
    `radial-gradient(${pct(w)} ${pct(h)} at ${pct(x)} ${pct(y)}, rgb(${col[ci % 4]} / ${a.toFixed(2)}), transparent 72%)`;
  const layers: string[] = [];
  const kind = Math.floor(rnd() * 4);
  if (kind === 0) {
    // corners: each colour from its own side, at its own reach
    for (let i = 0; i < 4; i++) {
      const a = ((turn + i * 90 + (rnd() - 0.5) * 60) * Math.PI) / 180, r = 30 + rnd() * 30;
      layers.push(blob(50 + Math.cos(a) * r, 50 + Math.sin(a) * r, 55 + rnd() * 45, 50 + rnd() * 40, i, 0.2 + rnd() * 0.2));
    }
  } else if (kind === 1) {
    // a band of light along one edge, like a sunrise
    const a = (turn * Math.PI) / 180;
    for (let i = 0; i < 3; i++) {
      const along = (i - 1) * 32 + (rnd() - 0.5) * 16;
      const x = 50 + Math.cos(a) * 48 - Math.sin(a) * along, y = 50 + Math.sin(a) * 48 + Math.cos(a) * along;
      layers.push(blob(x, y, 45 + rnd() * 25, 40 + rnd() * 25, i, 0.26 + rnd() * 0.18));
    }
    layers.push(blob(50 - Math.cos(a) * 40, 50 - Math.sin(a) * 40, 60, 50, 3, 0.08 + rnd() * 0.08));
  } else if (kind === 2) {
    // a soft ring: the middle stays dark, the colour sits around the icon
    layers.push(`radial-gradient(closest-side at ${pct(45 + rnd() * 10)} ${pct(45 + rnd() * 10)}, transparent 55%, rgb(${col[0]} / ${(0.18 + rnd() * 0.12).toFixed(2)}) 82%, transparent 100%)`);
    for (let i = 1; i < 3; i++) {
      const a = ((turn + i * 140) * Math.PI) / 180;
      layers.push(blob(50 + Math.cos(a) * 42, 50 + Math.sin(a) * 42, 50 + rnd() * 30, 45 + rnd() * 30, i, 0.16 + rnd() * 0.14));
    }
  } else {
    // a sweep from one corner across, colours one after another
    layers.push(`linear-gradient(${turn.toFixed(0)}deg, rgb(${col[0]} / ${(0.22 + rnd() * 0.12).toFixed(2)}), rgb(${col[1]} / ${(0.1 + rnd() * 0.1).toFixed(2)}) ${pct(35 + rnd() * 20)}, transparent ${pct(70 + rnd() * 20)})`);
    const a = ((turn + 180) * Math.PI) / 180;
    layers.push(blob(50 + Math.cos(a) * 45, 50 + Math.sin(a) * 45, 50 + rnd() * 30, 45 + rnd() * 30, 2, 0.14 + rnd() * 0.12));
  }
  return {
    '--sc-in': layers.join(', '),
    '--sc-rot': `${turn.toFixed(0)}deg`,
    '--sc-ring': (0.28 + rnd() * 0.3).toFixed(2),
    '--sc-c': col[0], '--sc-c2': col[1], '--sc-c3': col[2], '--sc-c4': col[3],
  };
}
function Tile({ s }: { s: Shortcut }) {
  const icon = useSiteIcon(s.url);
  const c = glowOf(icon, s.url);
  const mono = !!icon && !icon.pal?.length && !icon.rgb;
  return (
    <>
      <span className={`sc-tile${icon ? ' has-icon' : ''}${mono ? ' bw' : ''}`} style={c ? ({ '--sc-c': c[0], '--sc-c2': c[1], '--sc-c3': c[2], '--sc-c4': c[3], ...(mono ? {} : glowShape(s.url, c)) } as CSSProperties) : undefined}><Favicon s={s} size={34} icon={icon} /></span>
      <span className="sc-name">{s.title}</span>
    </>
  );
}

/* ---------- «بیشتر»: what doesn't fit goes into one quiet tile (no glow), opened as a small panel ---------- */
function FolderTile({ rest }: { rest: Shortcut[] }) {
  return (
    <>
      <span className="sc-tile sc-folder" aria-hidden="true">
        {rest.slice(0, 4).map((s) => <MiniIcon key={s.url + s.title} s={s} />)}
      </span>
      <span className="sc-name">{`${rest.length.toLocaleString('fa-IR')} تای دیگه`}</span>
    </>
  );
}
function MiniIcon({ s }: { s: Shortcut }) {
  const icon = useSiteIcon(s.url);
  return <span className="sc-folder-i"><Favicon s={s} size={16} icon={icon} /></span>;
}
function FolderPanel({ rest, anchor, onEdit, onClose }: { rest: Shortcut[]; anchor: DOMRect; onEdit(): void; onClose(): void }) {
  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);
  const w = Math.min(380, innerWidth - 24);
  const left = Math.max(12, Math.min(innerWidth - w - 12, anchor.left + anchor.width / 2 - w / 2));
  const below = anchor.bottom + 10 + 300 < innerHeight;
  return createPortal(
    <div className="sc-folder-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label="بقیه‌ی میانبرها" className="glass sc-folder-panel" style={{ left, width: w, ...(below ? { top: anchor.bottom + 10 } : { bottom: innerHeight - anchor.top + 10 }) }}>
        <div className="sc-grid">
          {rest.map((s) => (
            <div key={s.url + s.title} className="sc-item">
              <a href={s.url} className="sc-link" title={s.url}><Tile s={s} /></a>
            </div>
          ))}
          <div className="sc-item">
            <button className="sc-link sc-addtile" aria-label="ویرایش میانبرها" onClick={onEdit}>
              <span className="sc-tile sc-tile-new"><IconEdit size={18} /></span>
              <span className="sc-name">ویرایش</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
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
    // How many tiles fit without scrolling; the rest go into one «بیشتر» tile.
    const box = useRef<HTMLDivElement>(null);
    const [fit, setFit] = useState(999);
    const [folder, setFolder] = useState<DOMRect | null>(null);
    useEffect(() => {
      const el = box.current; if (!el) return;
      const measure = () => {
        if (el.closest('.phone')) { setFit(999); return; } // on the phone the card grows to fit: show them all
        const grid = el.querySelector<HTMLElement>('.sc-grid'); const one = grid?.querySelector<HTMLElement>('.sc-item');
        if (!grid || !one) return;
        const cs = getComputedStyle(grid);
        const cols = cs.gridTemplateColumns.split(' ').filter(Boolean).length || 1;
        // the grid's bottom padding is only breathing room: a last row may use it
        const gap = parseFloat(cs.rowGap) || 0, pad = parseFloat(cs.paddingTop) || 0;
        const rows = Math.max(1, Math.floor((el.clientHeight - pad + gap) / (one.offsetHeight + gap)));
        setFit(cols * rows);
      };
      measure();
      const ro = new ResizeObserver(measure); ro.observe(el);
      return () => ro.disconnect();
    }, [items.length]);
    // Sites first: the «ویرایش» tile only takes a place if one is left (otherwise it lives in the
    // «بیشتر» panel, and right-click still edits). A folder is only made for two or more sites.
    const overflow = !editing && drag === null && items.length > fit;
    const roomForEdit = !editing && !overflow && items.length < fit;
    const shown = overflow ? items.slice(0, Math.max(1, fit - 1)) : items;
    const rest = overflow ? items.slice(shown.length) : [];
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
        <div className="sc-scroll" ref={box}>
        <div className="sc-grid" onDragOver={(e) => { if (drag !== null) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); end(); }}>
          {shown.map((s, i) => (
            <div key={s.url + s.title} className={`sc-item${drag === i ? ' dragging' : ''}`} draggable={!editing}
              onDragStart={(e) => { setDrag(i); setPreview(config.items); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/uri-list', s.url); }}
              onDragOver={(e) => over(e, i)} onDragEnd={end}>
              <a href={s.url} draggable={false} className="sc-link" title={s.url}>
                <Tile s={s} />
              </a>
            </div>
          ))}
          {overflow && (
            <div className="sc-item">
              <button className="sc-link" aria-label={`${rest.length} میانبر دیگر`} onClick={(e) => setFolder(e.currentTarget.getBoundingClientRect())}>
                <FolderTile rest={rest} />
              </button>
            </div>
          )}
          {roomForEdit && (
            <div className="sc-item">
              <button className="sc-link sc-addtile" aria-label="ویرایش میانبرها" title="افزودن، جابه‌جایی، ویرایش و حذف" onClick={() => setPanel('add')}>
                <span className="sc-tile sc-tile-new"><IconEdit size={18} /></span>
                <span className="sc-name">ویرایش</span>
              </button>
            </div>
          )}
        </div>
        </div>
        {folder && <FolderPanel rest={rest} anchor={folder} onClose={() => setFolder(null)} onEdit={() => { setFolder(null); setPanel('edit'); }} />}
        {panel && <EditPanel items={config.items} onChange={set} onClose={() => setPanel(null)} focusNew={panel === 'add'} />}
      </div>
    );
  },
});
