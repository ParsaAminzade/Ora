// The Ora mark as a living eye: the pupil follows the mouse, it blinks now and then, and once in a
// while it offers a short tip in a bubble beside it. Click the eye for the next tip.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../core/db';
import { isQuiet } from '../core/safety';
import { useStore } from '../core/state';
import { IconX } from './icons';
import { openPlanner, ritualDone, ritualDue } from '../core/planner';
import { fbStore, gapX, note, offDay, shouldAsk, snoozed, type FbKind } from '../core/feedback';
import { knownTips, WhyNot } from './WhyNot';

interface Tip { kind?: FbKind; tipId?: number; text: string; action?: { label: string; run(): void }; sticky?: boolean; mood?: 'firm'; choices?: { label: string; run(): void }[]; title?: string; said?: boolean }

const TIPS: Tip[] = [
  { text: 'Ctrl+K را بزن: از هر جا یک کار تازه، یک رویداد یا یک سؤال از دستیار.' },
  { text: 'کلید / مستقیم می‌بردت توی جستجو.' },
  { text: 'در جستجو اول بنویس «a» و یک فاصله تا در arXiv بگردد؛ «s» برای Scholar و «y» برای یوتیوب.' },
  { text: 'Alt و یک عدد حالت را عوض می‌کند؛ مثلاً Alt+2 یعنی حالت کار.' },
  { text: 'در حالت کار می‌توانی سایت‌های حواس‌پرت‌کن را ببندی.', action: { label: 'تنظیم حالت‌ها', run: () => { useStore.getState().setPanel('settings'); window.setTimeout(() => document.querySelector('section[data-title="حالت‌ها"]')?.scrollIntoView({ block: 'start' }), 80); } } },
  { text: 'جمله‌ای به دلت نشست؟ ♥ بزن. من از همین یاد می‌گیرم چه چیزهایی دوست داری.' },
  { text: 'روی میانبرها راست‌کلیک کن تا ویرایش یا جابه‌جایشان کنی.' },
  { text: 'در یادداشت فرمول را بین دو $ بنویس، مثل $E=mc^2$، تا درست نمایش داده شود.' },
  { text: 'در متن یک کار بنویس #پژوهش تا حوزه‌اش ثبت شود.' },
  { text: 'پس‌زمینه‌ای را که ساختی ذخیره کن تا بعداً با یک کلیک برگردد.' },
  { text: 'اینترنت قطع است؟ تقریباً همه‌چیز من بدون اینترنت هم کار می‌کند.' },
];

const LS = { at: 'ora:tip-at', i: 'ora:tip-i' };
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const TIP_GAP = 3 * 3600_000; // at most one unprompted tip every three hours
const REST = { x: 2.1, y: -2.1 }; // the logo pose: looking up and to the side
const MAX = 3.2;

async function pickTip(context: boolean): Promise<Tip> {
  // Things worth saying right now come before the general rotation.
  const st = useStore.getState();
  if (context && !st.settings.sentences.tasteTestDone) {
    return { text: 'یک دقیقه وقت داری؟ با آزمون سلیقه، جمله‌ها بیشتر شبیه خودت می‌شوند.', action: { label: 'شروع آزمون', run: () => dispatchEvent(new Event('nova:taste-test')) } };
  }
  if (context && (await db.tasks.filter((t) => !t.done).count()) === 0) {
    return { text: 'امروز هنوز کاری ننوشته‌ای. یک کار کوچک بنویس؛ شروع همیشه همین است.', action: { label: 'نوشتن', run: () => (document.querySelector('[aria-label="تسک جدید"]') as HTMLInputElement | null)?.focus() } };
  }
  // the general rotation, skipping the ones you said you already know
  const known = new Set(knownTips());
  let i = (Number(read(LS.i)) || 0) % TIPS.length;
  for (let k = 0; k < TIPS.length && known.has(i); k++) i = (i + 1) % TIPS.length;
  write(LS.i, String(i + 1));
  return { ...TIPS[i], tipId: i };
}

export function OraEye({ size = 30 }: { size?: number }) {
  const enabled = useStore((s) => s.settings.eyeTips !== false);
  const ref = useRef<HTMLButtonElement>(null);
  const pupil = useRef<SVGGElement>(null);
  const [blink, setBlink] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const [why, setWhy] = useState(false); // after a «نه»: the «چرا؟» row
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const target = useRef({ ...REST });
  const cur = useRef({ ...REST });
  const tipOpen = useRef(false);
  tipOpen.current = !!tip;

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Follow the pointer (smoothly); drift back to the resting pose when the mouse is still.
  useEffect(() => {
    if (reduced) return;
    let raf = 0, idle = 0;
    const onMove = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(MAX, d / 30) / d;
      target.current = { x: dx * k, y: dy * k };
      window.clearTimeout(idle);
      idle = window.setTimeout(() => { if (!tipOpen.current) target.current = { ...REST }; }, 4000);
    };
    const tick = () => {
      const c = cur.current, t = target.current;
      c.x += (t.x - c.x) * 0.2; c.y += (t.y - c.y) * 0.2;
      pupil.current?.setAttribute('transform', `translate(${c.x.toFixed(2)} ${c.y.toFixed(2)})`);
      raf = requestAnimationFrame(tick);
    };
    addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => { removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); window.clearTimeout(idle); };
  }, [reduced]);

  // Blink every few seconds, sometimes twice.
  useEffect(() => {
    if (reduced) return;
    let t = 0;
    const once = (after: () => void) => { setBlink(true); window.setTimeout(() => { setBlink(false); after(); }, 150); };
    const schedule = () => {
      t = window.setTimeout(() => once(() => { if (Math.random() < 0.25) window.setTimeout(() => once(schedule), 180); else schedule(); }), 3500 + Math.random() * 5500);
    };
    schedule();
    return () => window.clearTimeout(t);
  }, [reduced]);

  const show = useCallback(async (context = true, unasked = false) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: Math.max(12, r.top - 2), right: innerWidth - r.left + 14 });
    const next = await pickTip(context);
    setBlink(true); window.setTimeout(() => setBlink(false), 150);
    target.current = { x: -MAX, y: 0 }; // look at the bubble
    setWhy(false);
    // only a tip Ora offered on its own asks «چرا؟» when closed; one you asked for by clicking doesn't
    setTip(unasked ? { ...next, kind: 'tip' } : next);
  }, []);
  const hide = useCallback(() => { setTip(null); setWhy(false); target.current = { ...REST }; }, []);
  /** You said no to something Ora offered: ask why (unless you've been skipping that question). */
  const decline = useCallback(async () => {
    const k = tip?.kind;
    if (!k || why) return hide();
    if (await shouldAsk(k)) setWhy(true);
    else { void note(k, 'skip'); hide(); }
  }, [tip, why, hide]);
  const accept = (t: Tip) => { if (t.kind) void note(t.kind, 'yes'); };

  // Now and then, offer a tip on its own.
  useEffect(() => {
    if (!enabled) return;
    const gap = TIP_GAP * gapX('tip'); // «زیاد نکته می‌دی» stretches it
    const last = Number(read(LS.at)) || 0;
    if (Date.now() - last < gap) return;
    const t = window.setTimeout(() => {
      if (useStore.getState().panel !== 'none' || useStore.getState().editing) return;
      if (Date.now() - (Number(read(LS.at)) || 0) < gap) return; // something else spoke meanwhile
      write(LS.at, String(Date.now()));
      void show(true, true);
    }, 7000);
    return () => window.clearTimeout(t);
  }, [enabled, show]);

  // The daily ritual: a morning «let's plan» and an evening «let's close the day». Asked once a day.
  useEffect(() => {
    const t = window.setTimeout(async () => {
      if (useStore.getState().panel !== 'none' || useStore.getState().editing || isQuiet()) return;
      if (document.querySelector('[role="dialog"]')) return; // the terms, a question… not now
      const open = await db.tasks.filter((x) => !x.done).count();
      // what you told Ora when you said no before: «later» (not yet), «every day is too much» (off days)
      const fb = await fbStore();
      const ok = (k: FbKind) => !snoozed(fb, k) && !offDay(fb, k);
      if (ritualDue('morning') && open && ok('ritual-morning')) {
        ritualDone('morning');
        write(LS.at, String(Date.now()));
        dispatchEvent(new CustomEvent('ora:say', { detail: { kind: 'ritual-morning', text: 'صبح بخیر! دو دقیقه برنامه‌ی امروز را بچینیم؟ سه کار مهم، و اینکه به وقتت جا می‌شوند یا نه.', sticky: true, action: { label: 'بچینیم', run: () => openPlanner('plan') } } }));
      } else if (ritualDue('evening') && open && ok('ritual-evening')) {
        ritualDone('evening');
        write(LS.at, String(Date.now()));
        dispatchEvent(new CustomEvent('ora:say', { detail: { kind: 'ritual-evening', text: 'روز رو ببندیم؟ دو دقیقه: هر اولویت تا کجا رفت، نمره‌ی امروز، و مانده‌ها برای فردا.', sticky: true, action: { label: 'جمع‌بندی روز', run: () => dispatchEvent(new CustomEvent('ora:review')) } } }));
      }
    }, 4000);
    return () => window.clearTimeout(t);
  }, [enabled, show]);

  // Other parts of Ora can ask the eye to say something (prayer reminders, "that's enough lines").
  useEffect(() => {
    const say = (e: Event) => {
      const d = (e as CustomEvent<Tip>).detail;
      const r = ref.current?.getBoundingClientRect();
      if (r) setPos({ top: Math.max(12, r.top - 2), right: innerWidth - r.left + 14 });
      setBlink(true); window.setTimeout(() => setBlink(false), 150);
      target.current = { x: -MAX, y: 0 };
      setWhy(false);
      setTip({ ...d, said: true });
    };
    addEventListener('ora:say', say);
    return () => removeEventListener('ora:say', say);
  }, []);

  // An unprompted tip leaves by itself (important ones stay a bit longer); Escape closes it.
  // Leaving unanswered is noted as «ignored» — not as a «no» — and never asks why.
  useEffect(() => {
    if (!tip) return;
    const t = window.setTimeout(() => { if (tip.kind) void note(tip.kind, why ? 'skip' : 'ignored'); hide(); }, why ? 30000 : tip.sticky ? 45000 : 12000);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    addEventListener('keydown', esc);
    return () => { window.clearTimeout(t); removeEventListener('keydown', esc); };
  }, [tip, why, hide]);

  return (
    <>
      <button ref={ref} className="rail-logo ora-eye" aria-label="اورآ · یک نکته" title="اورآ · برای یک نکته کلیک کن"
        onClick={() => (tip ? void decline() : void show())}>
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={blink ? 'blink' : undefined}>
          <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="2.3" />
          <g ref={pupil} transform={`translate(${REST.x} ${REST.y})`}>
            <circle cx="12" cy="12" r="3.4" fill="#FFE7B8" opacity=".22" />
            <circle cx="12" cy="12" r="1.9" fill="#FFF1D6" />
          </g>
        </svg>
      </button>
      {tip && createPortal(
        <div className={`glass ora-tip${tip.mood === 'firm' ? ' firm' : ''}`} role="status" aria-live="polite" style={{ top: pos.top, right: pos.right }}>
          {why && tip.kind ? <WhyNot kind={tip.kind} tipId={tip.tipId} onDone={hide} /> : (
            <>
              {tip.title && <span className="ora-tip-title">{tip.title}</span>}
              <span className="ora-tip-text">{tip.text}</span>
              {tip.choices && (
                <span className="ora-tip-choices">
                  {tip.choices.map((c) => <button key={c.label} className="pill pill-xs" onClick={() => { accept(tip); hide(); c.run(); }}>{c.label}</button>)}
                </span>
              )}
              <span className="ora-tip-row">
                {tip.action && <button className="btn btn-sm btn-accent" onClick={() => { accept(tip); tip.action!.run(); hide(); }}>{tip.action.label}</button>}
                {tip.kind?.startsWith('ritual') && <button className="btn btn-sm" style={{ border: 0 }} onClick={() => void decline()}>الان نه</button>}
                {!tip.sticky && !tip.said && <button className="btn btn-sm" style={{ border: 0 }} onClick={() => void show(false)}>نکته‌ی بعدی</button>}
                <button className="icon-btn ora-tip-x" aria-label="بستن" onClick={() => void decline()}><IconX size={14} /></button>
              </span>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
