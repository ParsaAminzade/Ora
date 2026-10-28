import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { useStore, activeMode } from '../core/state';
import { db } from '../core/db';
import { dayKey } from '../core/dates';
import { fa } from '../core/dates';
import { applyBlockRules, inTimeWindow, nightLevel, nowDate, sunTimes, sunsetGlow, type ModeRule } from '../core/modes';

/* ---------- automatic switching ---------- */
async function ruleMatches(r: ModeRule, now: Date): Promise<boolean> {
  if (!r.enabled) return false;
  if (r.kind === 'offline') return !navigator.onLine;
  if (r.kind === 'time') return !!r.from && !!r.to && inTimeWindow(now, r.from, r.to, r.days);
  if (r.kind === 'event' && r.match?.trim()) {
    const q = r.match.trim();
    const evs = await db.events.where('day').equals(dayKey(now)).toArray();
    const m = now.getHours() * 60 + now.getMinutes();
    return evs.some((e) => {
      if (!e.time || !e.title.includes(q)) return false;
      const [h, mm] = e.time.split(':').map(Number);
      const start = h * 60 + mm;
      return m >= start - 5 && m < start + 60;
    });
  }
  return false;
}

/** Looks at the rules every 30 s (and on network changes) and switches when the answer changes. */
export function useModeEngine() {
  const loaded = useStore((s) => s.loaded);
  const rules = useStore((s) => s.settings.modeRules);
  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    const tick = async () => {
      const st = useStore.getState();
      const { modeRules, modes } = st.settings;
      let target: string | null = null;
      for (const r of modeRules) {
        if (modes.some((m) => m.id === r.mode) && (await ruleMatches(r, nowDate()))) { target = r.mode; break; }
      }
      if (!alive) return;
      const cur = useStore.getState().settings;
      if (target === cur.mode.lastTarget) return;
      if (target) {
        const returnTo = cur.mode.auto ? cur.mode.returnTo : cur.mode.active;
        if (cur.mode.active !== target) useStore.getState().switchMode(target, 'auto');
        const s2 = useStore.getState().settings;
        useStore.getState().setSettings({ mode: { ...s2.mode, auto: target, lastTarget: target, returnTo } });
      } else {
        const back = cur.mode.auto && cur.mode.active === cur.mode.auto ? (cur.mode.returnTo ?? 'home') : null;
        if (back) useStore.getState().switchMode(back, 'manual');
        const s2 = useStore.getState().settings;
        useStore.getState().setSettings({ mode: { ...s2.mode, auto: null, returnTo: null, lastTarget: null } });
      }
    };
    void tick();
    const iv = window.setInterval(() => void tick(), 30_000);
    const onNet = () => void tick();
    addEventListener('online', onNet);
    addEventListener('offline', onNet);
    return () => { alive = false; window.clearInterval(iv); removeEventListener('online', onNet); removeEventListener('offline', onNet); };
  }, [loaded, rules]);

  // Keep the blocked-sites rules in step with the active mode.
  const active = useStore((s) => activeMode(s.settings));
  const blockKey = active ? `${active.id}|${active.block.join(',')}` : '';
  useEffect(() => {
    if (!loaded) return;
    void applyBlockRules(useStore.getState().settings.modes.find((m) => m.id === useStore.getState().settings.mode.active)).catch((e) => console.warn('[Nova] block rules', e));
  }, [loaded, blockKey]);
}

/** Alt+1 … Alt+9 switch modes in their listed order. */
export function useModeHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (!m) return;
      const modes = useStore.getState().settings.modes;
      const target = modes[Number(m[1]) - 1];
      if (!target) return;
      e.preventDefault();
      useStore.getState().switchMode(target.id);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}

/* ---------- rail button + menu ---------- */
export function ModeButton() {
  const modes = useStore((s) => s.settings.modes);
  const state = useStore((s) => s.settings.mode);
  const switchMode = useStore((s) => s.switchMode);
  const setPanel = useStore((s) => s.setPanel);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const cur = modes.find((m) => m.id === state.active);
  const toggle = () => {
    // The menu lives on <body>: inside the frosted rail its own frosting would only see the rail.
    const b = ref.current?.getBoundingClientRect();
    if (b) setPos({ top: b.top, right: innerWidth - b.left + 12 });
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('pointerdown', close);
    addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" aria-label={`حالت: ${cur?.name ?? ''}`} title={`حالت: ${cur?.name ?? ''} (Alt+عدد)`} aria-expanded={open} aria-haspopup="menu"
        onClick={toggle} style={{ fontSize: 18, color: 'var(--accent)' }}>
        <span aria-hidden="true">{cur?.icon ?? '◐'}</span>
      </button>
      {open && createPortal(
        <div ref={menuRef} className="glass" role="menu" aria-label="حالت‌ها"
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 40, width: 240, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, '--glass-solid': 'rgba(14,16,22,.95)' } as React.CSSProperties}>
          {modes.map((m, i) => (
            <button key={m.id} role="menuitemradio" aria-checked={m.id === state.active}
              onClick={() => { switchMode(m.id); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, height: 40, padding: '0 10px', borderRadius: 10, border: 0, textAlign: 'right', fontSize: 14,
                background: m.id === state.active ? 'var(--fill-2)' : 'transparent', color: m.id === state.active ? 'var(--text)' : 'var(--text-2)' }}>
              <span aria-hidden="true" style={{ width: 22, textAlign: 'center', color: m.accent ?? 'var(--accent)' }}>{m.icon}</span>
              <span style={{ flex: 1 }}>{m.name}</span>
              {state.auto === m.id && <span style={{ fontSize: 11, color: 'var(--accent)' }}>خودکار</span>}
              {i < 9 && <span className="faint" style={{ fontSize: 11, direction: 'ltr' }}>Alt+{i + 1}</span>}
            </button>
          ))}
          <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
          <button className="btn" style={{ border: 0, justifyContent: 'flex-start', fontSize: 13 }} onClick={() => { setOpen(false); setPanel('settings'); window.setTimeout(() => document.getElementById('modes-section')?.scrollIntoView({ block: 'start' }), 50); }}>
            مدیریت حالت‌ها و قانون‌ها
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** A short note when a rule switched the mode, with a way back. */
export function AutoModeToast() {
  const mode = useStore((s) => s.settings.mode);
  const modes = useStore((s) => s.settings.modes);
  const switchMode = useStore((s) => s.switchMode);
  const [shown, setShown] = useState<string | null>(null);
  const prev = useRef(mode.auto);
  useEffect(() => {
    if (mode.auto && mode.auto !== prev.current) {
      setShown(mode.auto);
      const t = window.setTimeout(() => setShown(null), 8000);
      prev.current = mode.auto;
      return () => window.clearTimeout(t);
    }
    prev.current = mode.auto;
  }, [mode.auto]);
  if (!shown || mode.active !== shown) return null;
  const m = modes.find((x) => x.id === shown);
  const back = modes.find((x) => x.id === (mode.returnTo ?? 'home'));
  return (
    <div role="status" className="glass" style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 50, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, '--glass-solid': 'rgba(12,14,20,.86)' } as import('react').CSSProperties}>
      <span>حالت «{m?.name}» خودکار روشن شد.</span>
      {back && <button className="btn" style={{ height: 32 }} onClick={() => { switchMode(back.id); setShown(null); }}>برگرد به «{back.name}»</button>}
    </div>
  );
}

/* ---------- evening light ---------- */
/** The evening light now: `level` dims from sunset to bedtime; `glow` is the warm sunset light (sunset → maghrib only). */
export function useEveningLight(): { level: number; glow: number } {
  const night = useStore((s) => s.settings.night);
  const place = useStore((s) => s.settings.place);
  const [light, setLight] = useState({ level: 0, glow: 0 });
  useEffect(() => {
    const calc = () => {
      const now = nowDate();
      const { sunset, sunrise, maghrib } = sunTimes(place, now);
      setLight({ level: nightLevel(now, sunset, sunrise, night), glow: sunsetGlow(now, sunset, maghrib, night) });
    };
    calc();
    const iv = window.setInterval(calc, 30_000);
    return () => window.clearInterval(iv);
  }, [night, place]);
  return light;
}
export const useNightLevel = (): number => useEveningLight().level;

/** The evening veil over everything (pointer-events: none): a warm golden light from sunset until the
 *  maghrib call, and a slow dimming from sunset to bedtime. */
export function NightLayer() {
  const n = useStore((s) => s.settings.night);
  const preview = useStore((s) => s.nightPreview);
  const live = useEveningLight();
  const level = preview ?? live.level;
  const glow = preview ?? live.glow;
  return (
    <div aria-hidden="true" data-testid="night" data-level={level.toFixed(2)} data-glow={glow.toFixed(2)} style={{ position: 'fixed', inset: 0, zIndex: 9000, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgb(255,150,70), rgb(255,196,120) 55%, rgb(255,226,170))', mixBlendMode: 'multiply', opacity: glow * (n.warmth / 100) * 0.5, transition: 'opacity 2s' }} />
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: level * (n.maxDim / 100), transition: 'opacity 2s' }} />
    </div>
  );
}

export const levelText = (l: number) => `${fa(Math.round(l * 100))}٪`;
