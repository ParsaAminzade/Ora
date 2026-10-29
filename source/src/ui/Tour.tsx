// «آشنایی با اورآ»: picture cards, each with «فهمیدم» and «جزئیات بیشتر». A full sheet (TourHost),
// a small daily reminder card for what isn't understood yet, and the section in settings.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../core/state';
import { fa } from '../core/dates';
import { nextToNudge, nudgeDue, nudged, openTour, putOff, resetTour, tourItems, tourSeen, understood, used, type TourId, type TourItem } from '../core/tour';
import { IconCheck, IconChevronL, IconChevronR, IconOra, IconX } from './icons';
import { Section } from './Panels';

/* ---------- pictures ---------- */
// Each card has a small animated scene in its own colour, drawn the same way: a dark rounded
// «screen», soft light from one corner, and the Ora mark. Together they are the tour's look.
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <g>
      <rect x="40" y="22" width="240" height="150" rx="16" fill="rgba(8,10,16,.55)" stroke="rgba(255,255,255,.16)" />
      {children}
    </g>
  );
}
const Glass = (p: { x: number; y: number; w: number; h: number; r?: number; o?: number; className?: string; style?: CSSProperties }) => (
  <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r ?? 8} fill={`rgba(255,255,255,${p.o ?? 0.1})`} stroke="rgba(255,255,255,.18)" className={p.className} style={p.style} />
);
const Line = ({ x, y, w, o = 0.5 }: { x: number; y: number; w: number; o?: number }) => <rect x={x - w} y={y} width={w} height="5" rx="2.5" fill={`rgba(255,255,255,${o})`} />;

function ArtBg() {
  return (
    <Screen>
      <defs>
        <clipPath id="tb-clip"><rect x="40" y="22" width="240" height="150" rx="16" /></clipPath>
        <radialGradient id="tb-gal" cx=".3" cy=".4" r=".9"><stop offset="0" stopColor="#6b5cff" /><stop offset=".6" stopColor="#1a1446" /><stop offset="1" stopColor="#07060f" /></radialGradient>
        <linearGradient id="tb-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffb36b" /><stop offset="1" stopColor="#ff6f61" /></linearGradient>
      </defs>
      <g clipPath="url(#tb-clip)">
        <g className="tour-fade f1"><rect x="40" y="22" width="240" height="150" fill="url(#tb-sky)" /><path d="M40 150 L100 98 L140 130 L190 84 L280 150 V172 H40Z" fill="#3b2a4d" /><circle cx="214" cy="116" r="13" fill="#fff3d6" /></g>
        <g className="tour-fade f2"><rect x="40" y="22" width="240" height="150" fill="url(#tb-gal)" />{[[70, 50], [110, 80], [160, 44], [210, 96], [250, 60], [90, 130], [230, 140], [180, 120]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 ? 1.3 : 2.2} fill="#fff" opacity=".85" />)}</g>
        <g className="tour-fade f3"><rect x="40" y="22" width="240" height="150" fill="#1e3a35" /><circle cx="160" cy="97" r="60" fill="#2f6b5e" opacity=".6" /></g>
      </g>
      <Glass x={196} y={36} w={70} h={34} />
      <Line x={258} y={46} w={40} o={0.75} /><Line x={258} y={56} w={26} o={0.45} />
      <Glass x={54} y={36} w={92} h={60} />
      {[48, 60, 72, 84].map((y, i) => <Line key={y} x={138} y={y} w={i === 0 ? 50 : 66 - i * 8} o={0.5} />)}
      <g><g className="tour-tap"><circle cx="248" cy="150" r="9" fill="var(--tour-c)" /><path d="M244 150h8M248 146v8" stroke="#0b0d14" strokeWidth="2" strokeLinecap="round" /></g></g>
    </Screen>
  );
}

function ArtTheme() {
  const sw = ['#D9B77E', '#7ED9B0', '#8FA8FF', '#FF8FA3'];
  return (
    <Screen>
      <g className="tour-accent">
        <Glass x={58} y={40} w={124} h={60} />
        <Line x={170} y={52} w={70} o={0.7} /><Line x={170} y={64} w={92} o={0.4} /><Line x={170} y={76} w={60} o={0.4} />
        <rect x="70" y="112" width="72" height="22" rx="11" className="tour-accent-fill" />
        <text x="106" y="127" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0b0d14">شروع</text>
        <circle cx="166" cy="123" r="11" fill="none" strokeWidth="3" className="tour-accent-stroke" />
      </g>
      <Glass x={196} y={40} w={70} h={118} />
      {sw.map((c, i) => <circle key={c} cx="231" cy={62 + i * 26} r="9" fill={c} />)}
      <circle cx="231" cy="62" r="13" fill="none" stroke="#fff" strokeWidth="2" className="tour-ring" />
      <text x="120" y="160" textAnchor="middle" fontSize="18" fill="rgba(255,255,255,.75)" style={{ fontFamily: 'var(--font-sentence)' }}>آ ب پ</text>
    </Screen>
  );
}

function ArtModes() {
  const modes: [string, string][] = [['کار', '#2f5d8a'], ['خستگی', '#5d4a6e'], ['شب', '#15172a']];
  return (
    <Screen>
      <defs><clipPath id="tm-clip"><rect x="40" y="22" width="240" height="150" rx="16" /></clipPath></defs>
      <g clipPath="url(#tm-clip)">
        {modes.map(([, c], i) => <rect key={i} x="40" y="22" width="240" height="150" fill={c} className={`tour-fade f${i + 1}`} />)}
      </g>
      <Glass x={60} y={60} w={110} h={84} />
      <Line x={160} y={74} w={60} o={0.7} /><Line x={160} y={88} w={84} o={0.45} /><Line x={160} y={102} w={70} o={0.45} />
      <g transform="translate(184 60)">
        {modes.map(([n], i) => (
          <g key={n} transform={`translate(0 ${i * 30})`}>
            <rect width="80" height="24" rx="12" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.2)" />
            <rect width="80" height="24" rx="12" className={`tour-pill p${i + 1}`} />
            <text x="40" y="16" textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">{n}</text>
          </g>
        ))}
      </g>
      <text x="224" y="44" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.6)" direction="ltr">Alt+1 · 2 · 3</text>
    </Screen>
  );
}

function ArtTaste() {
  return (
    <Screen>
      <Glass x={62} y={40} w={196} h={70} r={12} o={0.08} />
      <text x="160" y="70" textAnchor="middle" fontSize="13" fill="#fff" style={{ fontFamily: 'var(--font-sentence)' }}>قدر لحظه‌ها را نمی‌دانیم</text>
      <text x="160" y="92" textAnchor="middle" fontSize="13" fill="#fff" style={{ fontFamily: 'var(--font-sentence)' }}>تا وقتی که خاطره شوند</text>
      <g transform="translate(112 120)">
        <circle cx="12" cy="12" r="13" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.2)" />
        <path className="tour-heart" d="M12 18s-6-3.8-6-8.4a3.4 3.4 0 0 1 6-2.2 3.4 3.4 0 0 1 6 2.2c0 4.6-6 8.4-6 8.4z" />
        <rect x="34" y="1" width="44" height="22" rx="11" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.2)" /><text x="56" y="16" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.8)">کمتر</text>
        <rect x="84" y="1" width="52" height="22" rx="11" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.2)" /><text x="110" y="16" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.8)">نفهمیدم</text>
      </g>
      <g transform="translate(72 154)">
        <rect width="176" height="6" rx="3" fill="rgba(255,255,255,.12)" />
        <rect width="176" height="6" rx="3" className="tour-learn" />
        <text x="176" y="-8" textAnchor="end" fontSize="9" fill="rgba(255,255,255,.6)">اورآ دارد سلیقه‌ات را یاد می‌گیرد</text>
      </g>
      <g className="tour-spark"><path d="M246 46c.5 3.4 2.2 5.1 5.6 5.6-3.4.5-5.1 2.2-5.6 5.6-.5-3.4-2.2-5.1-5.6-5.6 3.4-.5 5.1-2.2 5.6-5.6z" fill="#fff" /></g>
    </Screen>
  );
}

function ArtGlow() {
  return (
    <Screen>
      <defs>
        <clipPath id="tg-clip"><rect x="40" y="22" width="240" height="150" rx="16" /></clipPath>
        <linearGradient id="tg-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a2350" /><stop offset=".55" stopColor="#c8643c" /><stop offset="1" stopColor="#ffcf7a" /></linearGradient>
      </defs>
      <g clipPath="url(#tg-clip)">
        <rect x="40" y="22" width="240" height="150" fill="url(#tg-sky)" />
        <circle cx="160" cy="120" r="20" fill="#ffe6a8" className="tour-sun" />
        <rect x="40" y="128" width="240" height="44" fill="#1b1424" />
        <path d="M70 128v-20h6v-8h2v8h6v20M226 128v-34a6 6 0 0 1 12 0v34" fill="#1b1424" />
        <rect x="40" y="22" width="240" height="150" className="tour-warm" />
      </g>
      <g fontSize="10" fill="rgba(255,255,255,.85)" fontWeight="600">
        <text x="262" y="160" textAnchor="end">غروب</text>
        <text x="58" y="160">مغرب</text>
      </g>
      <path d="M90 156 H230" stroke="rgba(255,255,255,.35)" strokeDasharray="3 4" />
    </Screen>
  );
}

function ArtPlan() {
  const rows = ['تمرین فیزیک', 'خواندن فصل سوم', 'ایمیل به استاد'];
  return (
    <Screen>
      <Glass x={70} y={36} w={180} h={124} r={12} />
      <text x="236" y="56" textAnchor="end" fontSize="11" fontWeight="700" fill="#fff">سه کار مهم امروز</text>
      {rows.map((r, i) => (
        <g key={r} transform={`translate(0 ${70 + i * 28})`}>
          <rect x="216" y="0" width="18" height="18" rx="6" fill="none" stroke="rgba(255,255,255,.45)" />
          <rect x="216" y="0" width="18" height="18" rx="6" className={`tour-tick t${i + 1}`} />
          <path d="M220 9.5l3.2 3.2 6.6-6.8" fill="none" stroke="#0b0d14" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`tour-tickmark t${i + 1}`} />
          <text x="206" y="13" textAnchor="end" fontSize="11" fill="rgba(255,255,255,.85)">{r}</text>
          <rect x="88" y="6" width={40 - i * 8} height="6" rx="3" fill="var(--tour-c)" opacity=".5" />
        </g>
      ))}
    </Screen>
  );
}

function ArtKeys({ phone }: { phone: boolean }) {
  return (
    <Screen>
      <Glass x={66} y={44} w={188} h={36} r={18} />
      <text x="240" y="67" textAnchor="end" fontSize="12" fill="#fff" className="tour-type">خرید کتاب فردا</text>
      <rect x="138" y="56" width="1.6" height="16" fill="var(--tour-c)" className="tour-caret" />
      <Glass x={66} y={88} w={188} h={26} r={8} o={0.05} />
      <text x="240" y="105" textAnchor="end" fontSize="10" fill="rgba(255,255,255,.7)">افزودن تسک: خرید کتاب فردا</text>
      {phone ? (
        <g transform="translate(160 146)"><g className="tour-press"><circle r="18" fill="var(--tour-c)" /></g><path d="M-7 0h14M0 -7v14" stroke="#0b0d14" strokeWidth="2.6" strokeLinecap="round" /></g>
      ) : (
        <g transform="translate(116 128)" fontSize="12" fontWeight="700">
          <g className="tour-press"><rect width="48" height="32" rx="8" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.3)" /><text x="24" y="21" textAnchor="middle" fill="#fff">Ctrl</text></g>
          <text x="62" y="21" textAnchor="middle" fill="rgba(255,255,255,.6)">+</text>
          <g transform="translate(76 0)"><g className="tour-press"><rect width="32" height="32" rx="8" fill="var(--tour-c)" /><text x="16" y="21" textAnchor="middle" fill="#0b0d14">K</text></g></g>
        </g>
      )}
    </Screen>
  );
}

function ArtPhone() {
  return (
    <g>
      <rect x="122" y="14" width="76" height="166" rx="16" fill="rgba(8,10,16,.7)" stroke="rgba(255,255,255,.3)" strokeWidth="2" />
      <rect x="148" y="20" width="24" height="5" rx="2.5" fill="rgba(255,255,255,.3)" />
      {[0, 1, 2].map((i) => <rect key={i} x="130" y={34 + i * 38} width="60" height="32" rx="7" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.2)" className={`tour-card c${i + 1}`} />)}
      <rect x="130" y="150" width="60" height="22" rx="11" fill="rgba(255,255,255,.1)" />
      <circle cx="160" cy="161" r="8" fill="var(--tour-c)" />
      <g transform="translate(220 70)"><g className="tour-tap"><rect width="54" height="54" rx="14" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.25)" /><g transform="translate(9 9) scale(1.5)"><circle cx="12" cy="12" r="7.2" fill="none" stroke="var(--tour-c)" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="38.9 6.3" transform="rotate(-20 12 12)" /><circle cx="17.1" cy="6.9" r="1.9" fill="#FFF1D6" /></g></g></g>
    </g>
  );
}

/** The roadmap card's picture is alive: drag a finger or the mouse over it. */
function ArtSoon() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0, t0 = performance.now();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const size = () => { const r = cv.getBoundingClientRect(); w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size();
    const dots = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), vx: 0, vy: 0, hue: 250 + Math.random() * 90 }));
    const ripples: { x: number; y: number; at: number }[] = [];
    let px = -1, py = -1, lastRipple = 0;
    const move = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect(); px = (e.clientX - r.left) / r.width; py = (e.clientY - r.top) / r.height;
      const now = performance.now();
      if (now - lastRipple > 90) { ripples.push({ x: px * w, y: py * h, at: now }); lastRipple = now; }
    };
    const leave = () => { px = py = -1; };
    cv.addEventListener('pointermove', move); cv.addEventListener('pointerdown', move); cv.addEventListener('pointerleave', leave);
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      // when nobody touches it, an invisible finger drifts across so the idea shows by itself
      const ax = px >= 0 ? px : 0.5 + 0.32 * Math.cos(t * 0.7), ay = py >= 0 ? py : 0.5 + 0.28 * Math.sin(t * 1.1);
      if (px < 0 && now - lastRipple > 700) { ripples.push({ x: ax * w, y: ay * h, at: now }); lastRipple = now; }
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, `hsl(${265 + 20 * Math.sin(t * 0.3)} 60% 14%)`); g.addColorStop(1, `hsl(${310 + 20 * Math.cos(t * 0.25)} 55% 18%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (let i = ripples.length - 1; i >= 0; i--) {
        const age = (now - ripples[i].at) / 1000;
        if (age > 1.6) { ripples.splice(i, 1); continue; }
        ctx.beginPath(); ctx.arc(ripples[i].x, ripples[i].y, 6 + age * 70, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,220,255,${0.45 * (1 - age / 1.6)})`; ctx.lineWidth = 1.5; ctx.stroke();
      }
      for (const d of dots) {
        const dx = ax - d.x, dy = ay - d.y, dist = Math.hypot(dx, dy) + 0.02;
        const pull = 0.00018 / dist;
        d.vx = (d.vx + dx * pull) * 0.96 + Math.sin(t + d.hue) * 0.00004;
        d.vy = (d.vy + dy * pull) * 0.96 + Math.cos(t * 0.8 + d.hue) * 0.00004;
        d.x = (d.x + d.vx + 1) % 1; d.y = (d.y + d.vy + 1) % 1;
        const near = Math.max(0, 1 - dist * 3);
        ctx.beginPath(); ctx.arc(d.x * w, d.y * h, 1.2 + near * 2.6, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${d.hue} 90% ${70 + near * 20}% / ${0.55 + near * 0.45})`; ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(size); ro.observe(cv);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerdown', move); cv.removeEventListener('pointerleave', leave); };
  }, []);
  return <canvas ref={ref} className="tour-canvas" aria-label="نمونه‌ی پس‌زمینه‌ی لمسی: انگشت یا موس را رویش بکش" />;
}

export function TourArt({ item, phone }: { item: TourItem; phone: boolean }) {
  const style = { '--tour-c': `hsl(${item.hue} 80% 68%)`, '--tour-h': String(item.hue) } as CSSProperties;
  if (item.id === 'soon') return <div className="tour-art live" style={style}><ArtSoon /><TourMark /></div>;
  const Art = { bg: ArtBg, theme: ArtTheme, modes: ArtModes, taste: ArtTaste, glow: ArtGlow, plan: ArtPlan, keys: () => <ArtKeys phone={phone} />, phone: ArtPhone }[item.id];
  return (
    <div className="tour-art" style={style} aria-hidden="true">
      <svg viewBox="0 0 320 194" preserveAspectRatio="xMidYMid meet"><Art /></svg>
      <TourMark />
    </div>
  );
}
const TourMark = () => <span className="tour-mark"><IconOra size={22} /></span>;

/* ---------- one card ---------- */
function TourCard({ item, index, total, done, onGot, compact, phone, onMore }: {
  item: TourItem; index: number; total: number; done: boolean; onGot(): void; compact?: boolean; phone: boolean; onMore?: () => void;
}) {
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [item.id]);
  const go = () => {
    if (!item.go) return;
    dispatchEvent(new CustomEvent(item.go.event, { detail: item.go.detail }));
  };
  return (
    <article className={`tour-card-box${compact ? ' compact' : ''}`} style={{ '--tour-h': String(item.hue) } as CSSProperties} aria-labelledby={`tour-t-${item.id}`}>
      <TourArt item={item} phone={phone} />
      <div className="tour-text">
        <span className="tour-kicker"><span>{item.kicker}</span><span className="tour-count">{fa(index + 1)} از {fa(total)}</span>{done && <span className="tour-done"><IconCheck size={12} /> فهمیدی</span>}</span>
        <h3 id={`tour-t-${item.id}`}>{item.title}</h3>
        <p>{item.short}</p>
        {more && !compact && (
          <div className="tour-more">
            {item.more.map((m, i) => <p key={i}>{m}</p>)}
            <span className="tour-ex-h">مثلاً</span>
            <ul className="tour-ex">{item.examples.map((e) => <li key={e}>{e}</li>)}</ul>
            {item.go && <button className="btn-link tour-go" onClick={go}>{item.go.label} ←</button>}
          </div>
        )}
        <div className="tour-btns">
          <button className="btn btn-accent tour-got" onClick={onGot}><IconCheck size={16} />فهمیدم</button>
          <button className="btn tour-more-btn" aria-expanded={compact ? undefined : more} onClick={() => (compact ? onMore?.() : setMore((x) => !x))}>{more && !compact ? 'کمتر' : 'جزئیات بیشتر'}</button>
        </div>
      </div>
    </article>
  );
}

function useSeen() {
  const [seen, setSeen] = useState<Partial<Record<TourId, number>>>({});
  useEffect(() => {
    const load = () => void tourSeen().then(setSeen);
    load();
    addEventListener('ora:tour-changed', load);
    return () => removeEventListener('ora:tour-changed', load);
  }, []);
  return seen;
}

/* ---------- the full sheet ---------- */
function TourSheet({ start, onClose }: { start?: TourId; onClose(): void }) {
  const items = tourItems();
  const seen = useSeen();
  const phone = matchMedia('(max-width: 720px)').matches;
  const first = Math.max(0, start ? items.findIndex((x) => x.id === start) : items.findIndex((x) => !seen[x.id]));
  const [i, setI] = useState(first);
  const item = items[i];
  const doneCount = items.filter((x) => seen[x.id]).length;
  const next = useCallback(() => setI((x) => Math.min(items.length - 1, x + 1)), [items.length]);
  const prev = () => setI((x) => Math.max(0, x - 1));
  const got = async () => {
    await understood(item.id);
    const after = items.findIndex((x, k) => k > i && !seen[x.id] && x.id !== item.id);
    if (after >= 0) setI(after);
    else if (items.every((x) => x.id === item.id || seen[x.id])) onClose();
    else next();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowLeft') next();
      if (e.key === 'ArrowRight') prev();
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  }, [next, onClose]);
  return (
    <div className="dlg-backdrop tour-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="آشنایی با اورآ" className="tour-sheet glass">
        <header className="tour-head">
          <b>آشنایی با اورآ</b>
          <span className="faint">{fa(doneCount)} از {fa(items.length)} را فهمیدی</span>
          <button className="icon-btn" aria-label="بستن" onClick={onClose}><IconX size={18} /></button>
        </header>
        <div className="tour-dots" role="tablist" aria-label="کارت‌ها">
          {items.map((x, k) => (
            <button key={x.id} role="tab" aria-selected={k === i} aria-label={`${x.title}${seen[x.id] ? ' (فهمیدی)' : ''}`} className={`tour-dot${seen[x.id] ? ' ok' : ''}`} style={{ '--tour-h': String(x.hue) } as CSSProperties} onClick={() => setI(k)} />
          ))}
        </div>
        <TourCard key={item.id} item={item} index={i} total={items.length} done={!!seen[item.id]} onGot={() => void got()} phone={phone} />
        <footer className="tour-nav">
          <button className="icon-btn" aria-label="قبلی" disabled={i === 0} onClick={prev}><IconChevronR size={18} /></button>
          <button className="icon-btn" aria-label="بعدی" disabled={i === items.length - 1} onClick={next}><IconChevronL size={18} /></button>
        </footer>
      </div>
    </div>
  );
}

/* ---------- the daily reminder card ---------- */
function TourNudge({ item, index, total, onClose }: { item: TourItem; index: number; total: number; onClose(): void }) {
  const phone = matchMedia('(max-width: 720px)').matches;
  return (
    <div className="tour-nudge glass" role="dialog" aria-label={`اورآ: ${item.title}`}>
      <button className="icon-btn tour-nudge-x" aria-label="بعداً" title="بعداً" onClick={() => { putOff(item.id); onClose(); }}><IconX size={16} /></button>
      <span className="tour-nudge-h">این را می‌دانستی؟</span>
      <TourCard item={item} index={index} total={total} done={false} compact phone={phone}
        onGot={() => { void understood(item.id); onClose(); }}
        onMore={() => { onClose(); openTour(item.id); }} />
    </div>
  );
}

export function TourHost() {
  const loaded = useStore((s) => s.loaded);
  const [sheet, setSheet] = useState<{ id?: TourId } | null>(null);
  const [nudge, setNudge] = useState<TourId | null>(null);
  useEffect(() => {
    const on = (e: Event) => { setNudge(null); setSheet({ id: (e as CustomEvent<{ id?: TourId }>).detail?.id }); };
    addEventListener('ora:tour', on);
    // a card's «برو به …» opens another part of Ora: step aside for it
    const away = () => setSheet(null);
    const others = ['ora:settings', 'ora:schedule', 'ora:palette'];
    for (const n of others) addEventListener(n, away);
    return () => { removeEventListener('ora:tour', on); for (const n of others) removeEventListener(n, away); };
  }, []);
  // Using a feature counts as understanding it.
  useEffect(() => {
    if (!loaded) return;
    const unsub = useStore.subscribe((st, prev) => {
      const a = st.settings, b = prev.settings;
      if (a.background !== b.background) used('bg');
      if (a.accent !== b.accent || a.font !== b.font || a.panelStyle !== b.panelStyle) used('theme');
      if (a.mode.active !== b.mode.active && !a.mode.auto) used('modes'); // by hand, not by a time rule
      if (a.night !== b.night) used('glow');
      if (a.phone !== b.phone) used('phone');
    });
    const ev: [string, TourId][] = [['ora:palette', 'keys'], ['ora:schedule', 'plan'], ['ora:review', 'plan'], ['ora:taste-used', 'taste']];
    const fns = ev.map(([n, id]) => { const f = () => used(id); addEventListener(n, f); return [n, f] as const; });
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') used('keys'); };
    addEventListener('keydown', key);
    return () => { unsub(); for (const [n, f] of fns) removeEventListener(n, f); removeEventListener('keydown', key); };
  }, [loaded]);
  // Every few hours for a newcomer (once a day later on), bring up the next thing not yet understood.
  useEffect(() => {
    if (!loaded) return;
    let shown = false;
    const tryNudge = async () => {
      const st = useStore.getState();
      if (shown || st.panel !== 'none' || st.editing || !nudgeDue()) return;
      if (document.querySelector('[role="dialog"]')) return; // the terms, a question… try again a bit later
      const seen = await tourSeen();
      const next = nextToNudge(tourItems(), seen);
      if (!next) return;
      shown = true;
      window.setTimeout(() => { shown = false; }, 60_000); // the page may stay open all day
      nudged();
      setNudge(next.id);
    };
    const t = window.setTimeout(() => void tryNudge(), 9000);
    // if something else was speaking, try again every couple of minutes while the page is open
    const iv = window.setInterval(() => void tryNudge(), 120_000);
    return () => { window.clearTimeout(t); window.clearInterval(iv); };
  }, [loaded]);
  const items = tourItems();
  const ni = nudge ? items.findIndex((x) => x.id === nudge) : -1;
  return createPortal(
    <>
      {sheet && <TourSheet start={sheet.id} onClose={() => setSheet(null)} />}
      {!sheet && ni >= 0 && <TourNudge item={items[ni]} index={ni} total={items.length} onClose={() => setNudge(null)} />}
    </>,
    document.body,
  );
}

/* ---------- in settings ---------- */
export function TourSection() {
  const seen = useSeen();
  const items = tourItems();
  const done = items.filter((x) => seen[x.id]).length;
  return (
    <Section title="آشنایی با اورآ" hint="چند چیزی که خوب است درباره‌ی اورآ بدانی، با تصویر و مثال. هر کدام را که «فهمیدم» بزنی، دیگر یادآوری نمی‌شود.">
      <div className="tour-list">
        {items.map((x) => (
          <button key={x.id} className={`tour-chip${seen[x.id] ? ' ok' : ''}`} style={{ '--tour-h': String(x.hue) } as CSSProperties} onClick={() => openTour(x.id)}>
            <i aria-hidden="true">{seen[x.id] ? <IconCheck size={12} /> : null}</i>{x.title}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-accent" onClick={() => openTour()}>{done === 0 ? 'شروع آشنایی' : done < items.length ? 'ادامه‌ی آشنایی' : 'دوباره ببین'}</button>
        <span className="faint" style={{ fontSize: 12 }}>{fa(done)} از {fa(items.length)} را فهمیدی</span>
        {done > 0 && <button className="btn-link" style={{ marginInlineStart: 'auto' }} onClick={() => void resetTour()}>از اول</button>}
      </div>
    </Section>
  );
}
