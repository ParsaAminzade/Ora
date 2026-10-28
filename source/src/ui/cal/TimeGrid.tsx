// Day / 3-day / week time grid, Google-Calendar style: drag on empty space to create, drag a block to
// move it (also to another day), drag its bottom edge to change its length, click to open it.
// All-day and multi-day events sit in a lane above the hours.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CalEvent } from '../../core/db';
import { fa, toJalali, weekCol, WEEKDAYS_SHORT } from '../../core/dates';
import { faHM, nowMin, type Block } from '../../core/schedule';
import { lastDay } from '../../core/events';
import { estLabel } from '../../core/taskparse';
import { today } from '../../core/planner';
import { blockColor, dd, evColor, HOUR, lanes, snap } from './shared';
import { clockIn, localTz, tzLabel } from '../../core/calendars';

export interface GridHandlers {
  onCreate?(day: string, start: number, end: number, rect: DOMRect): void;
  onOpenBlock?(b: Block, rect: DOMRect): void;
  onMoveBlock?(b: Block, day: string, start: number): void;
  onResizeBlock?(b: Block, day: string, end: number): void;
  onDropTask?(taskId: string, day: string, start: number): void;
  onCreateAllDay?(day: string, rect: DOMRect): void;
  onOpenEvent?(e: CalEvent, rect: DOMRect): void;
  onMoveAllDay?(e: CalEvent, day: string): void;
  onPickDay?(day: string): void;
}

interface Props extends GridHandlers {
  days: string[];
  blocks: Map<string, Block[]>;
  allDay: CalEvent[];
  holidays: Map<string, string[]>;
  window: [number, number];
  readOnly?: boolean;
  ghostIds?: Set<string>;
  pending?: { day: string; start: number; end: number } | null;
  selected?: string | null;
  compactHeads?: boolean;
  /** A second clock beside the hours (IANA zone). */
  secondTz?: string;
  /** Pixels per hour (zoom), and a request to fit part of the day. */
  hour?: number;
  onZoom?(h: number): void;
  focus?: { start: number; end: number; n: number } | null;
}
export const ZMIN = 28, ZMAX = 180;

interface Drag { mode: 'create' | 'move' | 'resize'; from: string; day: string; a: number; start: number; end: number; b?: Block; moved: boolean; x0: number; y0: number; off: number }

export function TimeGrid(p: Props) {
  const scroll = useRef<HTMLDivElement>(null);
  const cols = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [dropAt, setDropAt] = useState<{ day: string; start: number } | null>(null);
  const t = today();
  const n = nowMin();
  const H = p.hour ?? HOUR;
  const total = 24 * H;
  // zoom: keep a chosen minute at a chosen place on screen after the hour height changes
  const anchor = useRef<{ min: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el || !anchor.current) return;
    el.scrollTop = Math.max(0, (anchor.current.min / 60) * H - anchor.current.y);
    anchor.current = null;
  }, [H]);
  // «زوم روی بخشی از روز»: fit a span of the day to the visible height
  useEffect(() => {
    const el = scroll.current;
    if (!p.focus || !el) return;
    const avail = Math.max(120, el.clientHeight - 12);
    const h = Math.max(ZMIN, Math.min(ZMAX, avail / ((p.focus.end - p.focus.start) / 60)));
    anchor.current = { min: p.focus.start, y: 4 };
    if (Math.abs(h - H) < 0.5) { el.scrollTop = Math.max(0, (p.focus.start / 60) * H - 4); anchor.current = null; } else p.onZoom?.(h);
  }, [p.focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ctrl + wheel zooms around the pointer
  useEffect(() => {
    const el = scroll.current;
    if (!el || !p.onZoom) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const y = e.clientY - r.top;
      const min = ((el.scrollTop + y) / H) * 60;
      const h = Math.max(ZMIN, Math.min(ZMAX, H * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      if (Math.abs(h - H) < 0.5) return;
      anchor.current = { min, y };
      p.onZoom!(h);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [H, p.onZoom]);

  // Open at the start of your day (or a little before now).
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const at = p.days.includes(t) ? Math.min(n - 90, p.window[0]) : p.window[0] - 30;
    el.scrollTop = Math.max(0, (at / 60) * H);
  }, [p.days.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const where = (x: number, y: number): { day: string; min: number } | null => {
    const el = cols.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const colEls = [...el.querySelectorAll<HTMLElement>('[data-col]')];
    let day = p.days[0];
    let best = Infinity;
    for (const c of colEls) {
      const cr = c.getBoundingClientRect();
      const dist = x < cr.left ? cr.left - x : x > cr.right ? x - cr.right : 0;
      if (dist < best) { best = dist; day = c.dataset.col!; }
    }
    return { day, min: Math.max(0, Math.min(1440, ((y - r.top) / H) * 60)) };
  };

  const set = (d: Drag | null) => { dragRef.current = d; setDrag(d); };

  const onDown = (e: React.PointerEvent) => {
    if (p.readOnly || e.button !== 0) return;
    const target = e.target as HTMLElement;
    const w = where(e.clientX, e.clientY);
    if (!w) return;
    let bEl = target.closest<HTMLElement>('[data-bid]');
    // a focus band is a container: drag inside it to plan work; grab its label or edge to move it
    if (bEl?.classList.contains('cal-band') && !target.closest('.cal-band-l, .cal-rs')) bEl = null;
    if (bEl) {
      const b = (p.blocks.get(bEl.dataset.day!) ?? []).find((x) => x.id === bEl.dataset.bid);
      if (!b || b.kind === 'break') return;
      const resize = !!target.closest('.cal-rs');
      set({ mode: resize ? 'resize' : 'move', from: bEl.dataset.day!, day: bEl.dataset.day!, a: w.min, start: b.start, end: b.end, b, moved: false, x0: e.clientX, y0: e.clientY, off: w.min - b.start });
    } else {
      const s = Math.floor(w.min / 15) * 15;
      set({ mode: 'create', from: w.day, day: w.day, a: s, start: s, end: s + 15, moved: false, x0: e.clientX, y0: e.clientY, off: 0 });
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const moved = d.moved || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 4;
    const w = where(e.clientX, e.clientY);
    if (!w || !moved) { if (moved !== d.moved) set({ ...d, moved }); return; }
    if (d.mode === 'create') {
      const m = snap(w.min);
      const lo = Math.min(d.a, m), hi = Math.max(d.a + 15, m);
      set({ ...d, moved, start: lo, end: Math.max(lo + 15, hi) });
    } else if (d.mode === 'move' && d.b) {
      if (d.b.cutStart || d.b.cutEnd) return;
      const len = d.b.end - d.b.start;
      const s = Math.max(0, Math.min(1440 - len, snap(w.min - d.off)));
      set({ ...d, moved, day: w.day, start: s, end: s + len });
    } else if (d.mode === 'resize' && d.b) {
      set({ ...d, moved, day: d.from, end: Math.max(d.start + 15, Math.min(1440, snap(w.min))) });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    set(null);
    if (!d) return;
    if (d.mode === 'create') {
      const start = d.moved ? d.start : Math.floor(d.a / 30) * 30;
      const end = d.moved ? d.end : Math.min(1440, start + 60);
      const col = cols.current?.querySelector<HTMLElement>(`[data-col="${d.day}"]`);
      const cr = col?.getBoundingClientRect();
      const rect = cr ? new DOMRect(cr.left, cr.top + (start / 60) * H, cr.width, ((end - start) / 60) * H) : new DOMRect(e.clientX, e.clientY, 1, 1);
      p.onCreate?.(d.day, start, end, rect);
      return;
    }
    if (!d.b) return;
    if (!d.moved) {
      const el = cols.current?.querySelector<HTMLElement>(`[data-bid="${CSS.escape(d.b.id)}"]`);
      p.onOpenBlock?.(d.b, el?.getBoundingClientRect() ?? new DOMRect(e.clientX, e.clientY, 1, 1));
      return;
    }
    if (d.mode === 'move') {
      if (d.day !== d.from || d.start !== d.b.start) p.onMoveBlock?.(d.b, d.day, d.start);
    } else if (d.mode === 'resize' && d.end !== d.b.end) p.onResizeBlock?.(d.b, d.day, d.end);
  };

  // drop an unscheduled task from the side list onto the grid
  const onDragOver = (e: React.DragEvent) => {
    if (p.readOnly || !e.dataTransfer.types.includes('text/ora-task')) return;
    e.preventDefault();
    const w = where(e.clientX, e.clientY);
    if (w) setDropAt({ day: w.day, start: Math.floor(w.min / 15) * 15 });
  };
  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData('text/ora-task');
    const at = dropAt;
    setDropAt(null);
    if (id && at) { e.preventDefault(); p.onDropTask?.(id, at.day, at.start); }
  };

  /* ---------- all-day lane ---------- */
  const lane = useMemo(() => {
    const idx = new Map(p.days.map((d, i) => [d, i]));
    const items: { key: string; e?: CalEvent; text: string; color: string; from: number; to: number; row: number; holiday?: boolean }[] = [];
    const rowsEnd: number[] = [];
    const place = (from: number, to: number) => { let r = 0; while ((rowsEnd[r] ?? -1) >= from) r++; rowsEnd[r] = to; return r; };
    for (const [d, names] of p.holidays) { const i = idx.get(d); if (i === undefined) continue; for (const nm of names) items.push({ key: `h-${d}-${nm}`, text: nm, color: 'var(--danger)', from: i, to: i, row: place(i, i), holiday: true }); }
    const first = p.days[0], last = p.days[p.days.length - 1];
    for (const e of [...p.allDay].sort((a, b) => a.day.localeCompare(b.day) || lastDay(b).localeCompare(lastDay(a)))) {
      if (e.day > last || lastDay(e) < first) continue;
      const from = e.day < first ? 0 : idx.get(e.day)!;
      const to = lastDay(e) > last ? p.days.length - 1 : idx.get(lastDay(e))!;
      items.push({ key: e.id, e, text: e.title, color: evColor(e), from, to, row: place(from, to) });
    }
    return { items, rows: rowsEnd.length };
  }, [p.allDay, p.holidays, p.days]);
  const [laneOpen, setLaneOpen] = useState(false);
  const MAXROWS = 3;
  const shownRows = laneOpen ? lane.rows : Math.min(lane.rows, MAXROWS);
  const hidden = (i: number) => lane.items.filter((x) => x.row >= MAXROWS && x.from <= i && x.to >= i).length;

  const laneDrag = useRef<{ e: CalEvent; x0: number; col0: number; el: HTMLElement } | null>(null);
  const colAt = (x: number) => { const w = where(x, cols.current?.getBoundingClientRect().top ?? 0); return w ? p.days.indexOf(w.day) : -1; };

  const gut = p.secondTz ? 100 : 52;
  const tpl = `${gut}px repeat(${p.days.length}, minmax(0, 1fr))`;
  const tzDay = p.days.includes(t) ? t : p.days[0];

  return (
    <div className="cal-tg">
      <div className="cal-tg-head" style={{ gridTemplateColumns: tpl }}>
        {p.secondTz ? <span className="cal-tz-h"><b>{tzLabel(localTz())}</b><span>{tzLabel(p.secondTz)}</span></span> : <span />}
        {p.days.map((d) => {
          const j = toJalali(dd(d)), hol = p.holidays.has(d) || weekCol(dd(d)) === 6;
          return (
            <button key={d} className={`cal-dh${d === t ? ' is-today' : ''}${hol ? ' is-off' : ''}`} onClick={() => p.onPickDay?.(d)} disabled={!p.onPickDay} aria-label={`نمای روز ${fa(j.jd)}`}>
              <span className="cal-dh-w">{WEEKDAYS_SHORT[weekCol(dd(d))]}</span>
              <span className="cal-dh-n">{fa(j.jd)}</span>
            </button>
          );
        })}
      </div>
      <div className="cal-lane" style={{ gridTemplateColumns: tpl, gridTemplateRows: `repeat(${Math.max(1, shownRows) + (lane.rows > MAXROWS && !laneOpen ? 1 : 0)}, 22px)` }}
        onPointerDown={(e) => {
          if (p.readOnly || e.button !== 0) return;
          const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-eid]');
          if (chip) {
            const ev = p.allDay.find((x) => x.id === chip.dataset.eid);
            if (ev) { laneDrag.current = { e: ev, x0: e.clientX, col0: colAt(e.clientX), el: chip }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
          }
        }}
        onPointerUp={(e) => {
          const d = laneDrag.current; laneDrag.current = null;
          if (!d) return;
          const c = colAt(e.clientX);
          if (Math.abs(e.clientX - d.x0) > 6 && c >= 0 && c !== d.col0) {
            const delta = c - d.col0;
            const i0 = p.days.indexOf(d.e.day);
            const nd = i0 >= 0 && p.days[i0 + delta] ? p.days[i0 + delta] : (() => { const x = dd(d.e.day); x.setDate(x.getDate() + delta); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; })();
            p.onMoveAllDay?.(d.e, nd);
          } else p.onOpenEvent?.(d.e, d.el.getBoundingClientRect());
        }}>
        <span className="cal-lane-l" style={{ gridRow: `1 / -1` }}>تمام‌روز</span>
        {p.days.map((d, i) => (
          <button key={d} className="cal-lane-cell" style={{ gridColumn: i + 2, gridRow: '1 / -1' }} aria-label="رویداد تمام‌روز تازه" disabled={p.readOnly}
            onClick={(e) => { if (!(e.target as HTMLElement).closest('[data-eid]')) p.onCreateAllDay?.(d, (e.currentTarget as HTMLElement).getBoundingClientRect()); }} />
        ))}
        {lane.items.filter((x) => x.row < shownRows).map((x) => (
          <div key={x.key} className={`cal-ad${x.holiday ? ' hol' : ''}${p.selected === x.e?.id ? ' sel' : ''}`} data-eid={x.e?.id} role={x.e ? 'button' : undefined} tabIndex={x.e ? 0 : undefined}
            style={{ gridColumn: `${x.from + 2} / ${x.to + 3}`, gridRow: x.row + 1, '--c': x.color } as React.CSSProperties}
            onKeyDown={(e) => { if (x.e && e.key === 'Enter') p.onOpenEvent?.(x.e, (e.currentTarget as HTMLElement).getBoundingClientRect()); }}
            title={x.text}>{x.text}</div>
        ))}
        {lane.rows > MAXROWS && !laneOpen && p.days.map((d, i) => hidden(i) ? <button key={`m${d}`} className="cal-more" style={{ gridColumn: i + 2, gridRow: MAXROWS + 1 }} onClick={() => setLaneOpen(true)}>+{fa(hidden(i))}</button> : null)}
        {laneOpen && <button className="cal-more" style={{ gridColumn: 1, gridRow: shownRows }} onClick={() => setLaneOpen(false)}>کمتر</button>}
      </div>

      <div className="cal-tg-scroll scroll" ref={scroll}>
        <div className="cal-tg-body" style={{ gridTemplateColumns: tpl, height: total }}>
          <div className="cal-hours">
            {Array.from({ length: 24 }, (_, h) => h).map((h) => h > 0 && <span key={h} style={{ top: h * H }}>{fa(String(h).padStart(2, '0'))}:۰۰</span>)}
            {H >= 90 && Array.from({ length: 24 }, (_, h) => h).map((h) => <span key={`h${h}`} className="half" style={{ top: h * H + H / 2 }}>{fa(String(h).padStart(2, '0'))}:۳۰</span>)}
            {p.secondTz && Array.from({ length: 24 }, (_, h) => h).map((h) => h > 0 && <span key={`z${h}`} className="tz2" style={{ top: h * H }}>{fa(clockIn(p.secondTz!, tzDay, h * 60))}</span>)}
          </div>
          <div className="cal-cols" ref={cols} style={{ gridColumn: `2 / -1`, gridTemplateColumns: `repeat(${p.days.length}, minmax(0, 1fr))` }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => set(null)}
            onDragOver={onDragOver} onDragLeave={() => setDropAt(null)} onDrop={onDrop}>
            {p.days.map((d) => {
              const bs = (p.blocks.get(d) ?? []);
              return (
                <div key={d} className={`cal-col${d === t ? ' is-today' : ''}`} data-col={d} style={{ height: total, backgroundSize: H >= 90 ? `100% ${H}px, 100% ${H / 2}px` : `100% ${H}px`, backgroundImage: H >= 90 ? 'linear-gradient(to bottom, rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.025) 1px, transparent 1px)' : undefined }}>
                  <div className="cal-off" style={{ top: 0, height: (p.window[0] / 60) * H }} />
                  <div className="cal-off" style={{ top: (p.window[1] / 60) * H, bottom: 0 }} />
                  {bs.filter((b) => b.kind === 'focus').map((b) => (
                    <div key={b.id} data-bid={b.id} data-day={d} role="button" tabIndex={0} className={`cal-band${b.ev?.kind === 'off' ? ' off' : ''}`}
                      style={{ top: (b.start / 60) * H, height: ((b.end - b.start) / 60) * H, '--c': blockColor(b) } as React.CSSProperties}
                      onKeyDown={(e) => { if (e.key === 'Enter') p.onOpenBlock?.(b, (e.currentTarget as HTMLElement).getBoundingClientRect()); }}
                      title={`${b.title} · ${faHM(b.start)}–${faHM(b.end)}`}>
                      <span className="cal-band-l">◎ {b.title}</span>
                      {!p.readOnly && <span className="cal-rs" aria-hidden="true" />}
                    </div>
                  ))}
                  {lanes(bs.filter((b) => b.kind !== 'focus')).map((b) => {
                    const top = (b.start / 60) * H, h = Math.max(18, ((b.end - b.start) / 60) * H - 2);
                    const w = 100 / b.of;
                    const dragging = drag?.b?.id === b.id && drag.moved;
                    const canResize = !p.readOnly && b.kind !== 'break' && !b.cutEnd;
                    return (
                      <div key={b.id} data-bid={b.id} data-day={d} role={b.kind === 'break' ? undefined : 'button'} tabIndex={b.kind === 'break' ? undefined : 0}
                        className={`cal-b cal-${b.kind}${b.ev?.kind === 'off' ? ' is-off' : ''}${b.done ? ' done' : ''}${p.ghostIds?.has(b.taskId ?? '') ? ' ghost' : ''}${b.fixed && b.kind === 'task' ? ' fixed' : ''}${dragging ? ' lifting' : ''}${p.selected && (p.selected === b.id || p.selected === b.ev?.id) ? ' sel' : ''}${b.cutStart ? ' cut-s' : ''}${b.cutEnd ? ' cut-e' : ''}`}
                        style={{ top, height: h, insetInlineStart: `calc(${b.lane * w}% + 2px)`, width: `calc(${w}% - 4px)`, '--c': blockColor(b) } as React.CSSProperties}
                        onKeyDown={(e) => { if (e.key === 'Enter') p.onOpenBlock?.(b, (e.currentTarget as HTMLElement).getBoundingClientRect()); }}
                        title={`${b.title} · ${faHM(b.start)}–${faHM(b.end)}`}>
                        <span className="cal-bt">{b.kind === 'task' && <i className={`cal-chk${b.done ? ' on' : ''}`} />}{b.goal && <span className="cal-goal" title="جلسه‌ی یک هدف تکرارشونده">↻</span>}{b.title}</span>
                        {h > 30 && <span className="cal-bm">{faHM(b.start)}–{faHM(b.end)}{b.kind === 'task' && p.days.length < 5 ? ` · ${estLabel(b.end - b.start)}` : ''}{b.ev?.location && h > 46 ? ` · ${b.ev.location}` : ''}</span>}
                        {canResize && <span className="cal-rs" aria-hidden="true" />}
                      </div>
                    );
                  })}
                  {drag && drag.moved && drag.day === d && drag.mode !== 'create' && drag.b && (
                    <div className={`cal-b cal-${drag.b.kind} cal-ghost`} style={{ top: (drag.start / 60) * H, height: Math.max(18, ((drag.end - drag.start) / 60) * H - 2), insetInlineStart: 2, width: 'calc(100% - 4px)', '--c': blockColor(drag.b) } as React.CSSProperties}>
                      <span className="cal-bt">{drag.b.title}</span><span className="cal-bm">{faHM(drag.start)}–{faHM(drag.end)}</span>
                    </div>
                  )}
                  {((drag && drag.mode === 'create' && drag.day === d) || (p.pending && p.pending.day === d)) && (() => {
                    const g = drag && drag.mode === 'create' ? { start: drag.moved ? drag.start : Math.floor(drag.a / 30) * 30, end: drag.moved ? drag.end : Math.floor(drag.a / 30) * 30 + 60 } : p.pending!;
                    return <div className="cal-new" style={{ top: (g.start / 60) * H, height: Math.max(16, ((g.end - g.start) / 60) * H - 2) }}><span>{faHM(g.start)}–{faHM(g.end)}</span></div>;
                  })()}
                  {dropAt?.day === d && <div className="cal-new" style={{ top: (dropAt.start / 60) * H, height: H / 2 }}><span>{faHM(dropAt.start)}</span></div>}
                  {d === t && <div className="cal-now" style={{ top: (n / 60) * H }} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Keeps the "now" line moving. */
export function useMinuteTick(): void {
  const [, set] = useState(0);
  useEffect(() => { const iv = window.setInterval(() => set((x) => x + 1), 60_000); return () => window.clearInterval(iv); }, []);
}
