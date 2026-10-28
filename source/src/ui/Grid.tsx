import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { GRID, useStore, type WidgetInstance } from '../core/state';
import { getWidget } from '../core/widgets';
import { IconResize, IconX } from './icons';
import { ErrorBoundary } from './ErrorBoundary';

type Drag = { kind: 'move' | 'resize'; id: string; sx: number; sy: number; x0: number; y0: number; w0: number; h0: number; ignore: Set<string> };

const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function WidgetFrame({ inst, cell, editing, onStart }: {
  inst: WidgetInstance;
  cell: number;
  editing: boolean;
  onStart: (e: RPointerEvent, kind: Drag['kind'], inst: WidgetInstance) => void;
}) {
  const def = getWidget(inst.type)!;
  const setWidgetConfig = useStore((s) => s.setWidgetConfig);
  const removeWidget = useStore((s) => s.removeWidget);
  const setConfig = useCallback((patch: Record<string, unknown>) => setWidgetConfig(inst.id, patch), [inst.id, setWidgetConfig]);
  const Comp = def.Component;
  const card = def.card !== false;
  const g = GRID.gap / 2;

  return (
    <section
      aria-label={def.name}
      className={[card ? 'glass' : '', editing ? 'editing-card' : ''].filter(Boolean).join(' ') || undefined}
      onPointerDown={editing ? (e) => onStart(e, 'move', inst) : undefined}
      style={{
        position: 'absolute',
        right: inst.x * cell + g,
        top: inst.y * GRID.rowH + g,
        width: inst.w * cell - GRID.gap,
        height: inst.h * GRID.rowH - GRID.gap,
        cursor: editing ? 'grab' : undefined,
        outline: editing ? '1.5px dashed color-mix(in srgb, var(--accent) 70%, transparent)' : undefined,
        outlineOffset: 4,
        borderRadius: 'var(--radius)',
        transition: 'right .12s, top .12s, width .12s, height .12s',
        touchAction: editing ? 'none' : undefined,
      }}
    >
      <div style={{ height: '100%', pointerEvents: editing ? 'none' : undefined, userSelect: editing ? 'none' : undefined, overflow: card ? 'hidden' : 'clip', overflowClipMargin: card ? undefined : 90, borderRadius: 'inherit' }}>
        <ErrorBoundary label={def.name}>
          <Comp id={inst.id} config={inst.config as never} setConfig={setConfig} editing={editing} />
        </ErrorBoundary>
      </div>
      {editing && (
        <>
          <span className="edit-chip">{def.name}</span>
          <button
            aria-label={`حذف ${def.name}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => removeWidget(inst.id)}
            className="edit-del"
          >
            <IconX size={14} />
          </button>
          <button
            aria-label={`تغییر اندازه ${def.name}`}
            onPointerDown={(e) => { e.stopPropagation(); onStart(e, 'resize', inst); }}
            className="edit-resize"
          >
            <IconResize size={14} />
          </button>
        </>
      )}
    </section>
  );
}

export function Grid() {
  const widgets = useStore((s) => s.widgets);
  const editing = useStore((s) => s.editing);
  const updateWidget = useStore((s) => s.updateWidget);
  const bringToFront = useStore((s) => s.bringToFront);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [avail, setAvail] = useState(0);
  const fitOn = useStore((s) => s.settings.layoutFit ?? true);
  const drag = useRef<Drag | null>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    const host = el.parentElement!.parentElement!;
    const measure = () => { setWidth(el.clientWidth); setAvail(host.clientHeight); };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(host);
    measure();
    return () => ro.disconnect();
  }, []);

  // Fit the whole layout to the screen height: a new tab should never need scrolling, and a tall
  // screen shouldn't leave a dead band at the bottom. The layout is scaled as one piece (a transform,
  // which keeps iframes and hit-testing exact), so every card keeps its proportions. Frozen while
  // editing so cards don't jump under the mouse.
  const rows = Math.max(0, ...widgets.map((x) => x.y + x.h));
  const zoomRef = useRef(1);
  let zoom = zoomRef.current;
  if (!editing) {
    zoom = fitOn && rows && avail ? Math.min(1.2, Math.max(0.86, avail / (rows * GRID.rowH))) : 1;
    zoom = Math.round(zoom * 100) / 100;
    zoomRef.current = zoom;
  }
  useEffect(() => { document.documentElement.style.setProperty('--grid-zoom', String(zoom)); }, [zoom]);

  const cell = width / GRID.cols;

  const onStart = (e: RPointerEvent, kind: Drag['kind'], inst: WidgetInstance) => {
    if (e.button !== 0) return;
    e.preventDefault();
    bringToFront(inst.id);
    // Widgets already overlapping (e.g. from an older layout) don't block this drag.
    const ignore = new Set(widgets.filter((o) => o.id !== inst.id && overlap(o, inst)).map((o) => o.id));
    drag.current = { kind, id: inst.id, sx: e.clientX, sy: e.clientY, x0: inst.x, y0: inst.y, w0: inst.w, h0: inst.h, ignore };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !cell) return;
      const def = getWidget(widgets.find((x) => x.id === d.id)?.type ?? '');
      if (!def) return;
      // RTL grid: x grows to the left, so a mouse move to the left is a positive column change.
      const dc = Math.round(-(e.clientX - d.sx) / zoom / cell);
      const dr = Math.round((e.clientY - d.sy) / zoom / GRID.rowH);
      const next = d.kind === 'move'
        ? { x: Math.min(Math.max(0, d.x0 + dc), GRID.cols - d.w0), y: Math.max(0, d.y0 + dr), w: d.w0, h: d.h0 }
        : { x: d.x0, y: d.y0, w: Math.min(Math.max(def.minSize.w, d.w0 + dc), GRID.cols - d.x0), h: Math.max(def.minSize.h, d.h0 + dr) };
      // Widgets never overlap: a move into occupied cells is ignored until a free spot is reached.
      const hits = widgets.some((o) => o.id !== d.id && !d.ignore.has(o.id) && overlap(o, next));
      if (!hits) updateWidget(d.id, next);
    };
    const up = () => { drag.current = null; };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    return () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
  }, [cell, widgets, updateWidget, zoom]);

  const height = rows * GRID.rowH + (editing ? 240 : 0);
  return (
    <div style={{ position: 'relative', height: height * zoom, minHeight: '100%' }}>
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: `${100 / zoom}%`,
        transform: zoom === 1 ? undefined : `scale(${zoom})`,
        transformOrigin: 'top right',
        minHeight: height,
        backgroundImage: editing ? 'radial-gradient(rgba(255,255,255,.12) 1px, transparent 1px)' : undefined,
        backgroundSize: editing ? `${cell}px ${GRID.rowH}px` : undefined,
        backgroundPosition: 'right top',
      }}
    >
      {width > 0 && widgets.map((inst) => <WidgetFrame key={inst.id} inst={inst} cell={cell} editing={editing} onStart={onStart} />)}
    </div>
    </div>
  );
}
