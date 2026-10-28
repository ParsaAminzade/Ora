// «تقویم و برنامه»: one Google-Calendar-like place for events and time-blocked tasks. Views: day,
// three days, week, month and a plain list; drag to create, move and resize; a step-by-step planner
// and an honest report on how heavy the plan is. Keyboard: t d x w m a, j/k (or ←/→), c, /, Ctrl+Z.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CalEvent, type Task } from '../core/db';
import { fa, toJalali } from '../core/dates';
import { localCalendar } from '../core/providers/calendar';
import { addParsed, plannerOf, today } from '../core/planner';
import { openTaskEditor } from './TaskEditor';
import { blocksFor, breaksOf, loadStats, nowMin, type Block, type Stats } from '../core/schedule';
import { isRepeating, syncRange, updateEvent } from '../core/calendar-service';
import { moved, resized, toHM, toMin } from '../core/events';
import { holidaysOn } from '../core/holidays';
import { useStore } from '../core/state';
import { calPrefs, localCalendars, setCalPrefs, DEFAULT_CAL_PREFS, type LocalCal } from '../core/calendars';
import { undoLast, withUndo } from '../core/undo';
import { estLabel, parseTask } from '../core/taskparse';
import { askText, ask } from './Dialog';
import { IconChevronL, IconChevronR, IconMenu, IconPlus, IconSearch, IconSpark, IconX } from './icons';
import { TimeGrid, ZMAX, ZMIN } from './cal/TimeGrid';
import { MonthView } from './cal/MonthView';
import { AgendaView } from './cal/AgendaView';
import { MiniMonth } from './cal/MiniMonth';
import { EventCard, QuickCreate, TaskCard } from './cal/Popovers';
import { openEventEditor } from './cal/EventEditor';
import { askScope } from './cal/ScopeAsk';
import { ReportCard, Wizard } from './cal/Plan';
import { FreeFinder, GoalsPanel, InsightsView } from './cal/TimeTools';
import { planGoals } from '../core/goals';
import { dd, monthRange, rangeLabel, step, viewDays, VIEWS, type View } from './cal/shared';
import { EVENT_COLORS } from '../core/events';
import { NONE } from '../core/none';
import { isPhone } from '../core/platform';

export interface CalOpen { view?: View; wizard?: boolean; day?: string }
export const openSchedule = (opts: CalOpen = {}) => dispatchEvent(new CustomEvent('ora:schedule', { detail: opts }));
export const openCalendar = openSchedule;

type PopState = { kind: 'create'; day: string; start?: number; end?: number; rect: DOMRect } | { kind: 'event'; e: CalEvent; rect: DOMRect } | { kind: 'task'; t: Task; rect: DOMRect } | null;

function Calendars() {
  const prefs = useStore((s) => s.settings.calendar) ?? DEFAULT_CAL_PREFS;
  const google = useStore((s) => s.settings.google);
  const setSettings = useStore((s) => s.setSettings);
  const cals = prefs.cals?.length ? prefs.cals : localCalendars();
  const [colorFor, setColorFor] = useState<string | null>(null);
  const put = (next: LocalCal[]) => setCalPrefs({ cals: next });
  return (
    <div className="cal-cals">
      <span className="te-label">تقویم‌های من</span>
      {cals.map((c) => (
        <div key={c.id} className="cal-cal">
          <label className="cal-cal-l">
            <input type="checkbox" className="chk" style={{ '--chk': c.color } as React.CSSProperties} checked={!c.hidden} onChange={() => put(cals.map((x) => (x.id === c.id ? { ...x, hidden: !x.hidden } : x)))} aria-label={`نمایش ${c.name}`} />
            <span>{c.name}</span>
          </label>
          <button className="cal-dot" style={{ background: c.color }} aria-label={`رنگ ${c.name}`} onClick={() => setColorFor(colorFor === c.id ? null : c.id)} />
          <button className="link-btn cal-cal-act" onClick={async () => { const n = await askText('نام تقویم', c.name); if (n) put(cals.map((x) => (x.id === c.id ? { ...x, name: n } : x))); }}>نام</button>
          {!c.default && <button className="link-btn cal-cal-act" onClick={async () => {
            if (!(await ask(`تقویم «${c.name}» حذف شود؟ رویدادهایش به «${cals.find((x) => x.default)?.name ?? 'شخصی'}» منتقل می‌شوند.`, { danger: true }))) return;
            await db.events.filter((e) => e.source === 'local' && e.cal === c.id).modify((e) => { delete e.cal; e.updatedAt = Date.now(); });
            put(cals.filter((x) => x.id !== c.id));
          }}>حذف</button>}
          {colorFor === c.id && (
            <div className="ev-colors cal-cal-colors">{EVENT_COLORS.map(([col, n]) => <button key={col} className="ev-col" aria-label={n} aria-checked={c.color === col} role="radio" style={{ background: col }} onClick={() => { put(cals.map((x) => (x.id === c.id ? { ...x, color: col } : x))); setColorFor(null); }} />)}</div>
          )}
        </div>
      ))}
      <button className="link-btn" onClick={async () => {
        const n = await askText('نام تقویم تازه (مثلاً کار، دانشگاه، ورزش)', '');
        if (!n) return;
        const used = new Set(cals.map((c) => c.color));
        const color = EVENT_COLORS.map(([c]) => c).find((c) => !used.has(c)) ?? EVENT_COLORS[4][0];
        put([...cals, { id: `c${Date.now().toString(36)}`, name: n, color }]);
      }}>+ تقویم تازه</button>
      {google.connected && google.calendars.length > 0 && (
        <>
          <span className="te-label" style={{ marginTop: 6 }}>گوگل</span>
          {google.calendars.map((c) => (
            <label key={c.id} className="cal-cal-l">
              <input type="checkbox" className="chk" style={{ '--chk': c.color } as React.CSSProperties} checked={c.enabled} onChange={() => setSettings({ google: { ...google, calendars: google.calendars.map((x) => (x.id === c.id ? { ...x, enabled: !x.enabled } : x)) } })} />
              <span>{c.summary}</span>
            </label>
          ))}
        </>
      )}
    </div>
  );
}

function CalendarApp({ start, onClose }: { start: CalOpen; onClose(): void }) {
  const prefs = useStore((s) => s.settings.calendar) ?? DEFAULT_CAL_PREFS;
  const hijriOffset = useStore((s) => s.settings.hijriOffset);
  const gConnected = useStore((s) => s.settings.google.connected || s.settings.caldav.enabled);
  const gCals = useStore((s) => s.settings.google.calendars);
  useStore((s) => s.settings.planner);
  const [view, setViewRaw] = useState<View>(
    // A week doesn't fit a phone; three days do.
    start.view ?? (isPhone() && (calPrefs().view ?? 'week') === 'week' ? '3day' : calPrefs().view ?? 'week'),
  );
  const setView = (v: View) => { setViewRaw(v); if (v !== calPrefs().view) setCalPrefs({ view: v }); };
  const [anchor, setAnchor] = useState(start.day ?? today());
  const [wizard, setWizard] = useState(!!start.wizard);
  const [pop, setPop] = useState<PopState>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [undoMsg, setUndoMsg] = useState<string | null>(null);
  const [side, setSide] = useState(prefs.side !== false);
  const [zoom, setZoomRaw] = useState(prefs.zoom ?? 48);
  const zoomSave = useRef(0);
  const setZoom = useCallback((h: number) => { const v = Math.round(Math.max(ZMIN, Math.min(ZMAX, h))); setZoomRaw(v); window.clearTimeout(zoomSave.current); zoomSave.current = window.setTimeout(() => setCalPrefs({ zoom: v }), 600); }, []);
  const [focus, setFocus] = useState<{ start: number; end: number; n: number } | null>(null);
  const [part, setPart] = useState<string | null>(null);
  const fit = (k: string, start: number, end: number) => { setPart(k); setFocus((f) => ({ start, end, n: (f?.n ?? 0) + 1 })); };
  const searchRef = useRef<HTMLInputElement>(null);

  const days = useMemo(() => viewDays(view, anchor), [view, anchor]);
  const from = days[0], to = days[days.length - 1];
  const hiddenCals = new Set((prefs.cals ?? []).filter((c) => c.hidden).map((c) => c.id));
  const defaultCal = (prefs.cals ?? []).find((c) => c.default)?.id ?? 'personal';
  const visible = (e: CalEvent) => (e.source === 'local' ? !hiddenCals.has(e.cal ?? defaultCal) : true);
  const rawEvents = useLiveQuery(() => localCalendar.list(from, to), [from, to]) ?? NONE;
  const events = rawEvents.filter(visible);
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? NONE;
  const q = query.trim();
  const found = useLiveQuery(async () => {
    if (!q) return null;
    const low = q.toLowerCase();
    const has = (s?: string) => !!s && s.toLowerCase().includes(low);
    const ev = await db.events.filter((e) => has(e.title) || has(e.location) || has(e.notes)).limit(200).toArray();
    const tk = await db.tasks.filter((t) => has(t.title) || has(t.notes)).limit(200).toArray();
    return { ev: ev.filter(visible), tk };
  }, [q, prefs.cals]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [brk, setBrk] = useState<Record<string, [number, number][]>>({});
  useEffect(() => { void loadStats().then(setStats); }, [tasks.length]);
  useEffect(() => { void Promise.all(days.map((d) => breaksOf(d).then((b) => [d, b] as const))).then((x) => setBrk(Object.fromEntries(x))); }, [days.join(), tasks]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (gConnected) void syncRange(from, to); }, [from, to, gConnected, gCals]);

  const p = plannerOf();
  const timed = events.filter((e) => e.time);
  const blocks = useMemo(() => new Map(days.map((d) => [d, stats ? blocksFor(d, tasks, timed, brk[d] ?? [], stats) : []])), [days, tasks, timed.length, rawEvents, brk, stats, prefs.cals]); // eslint-disable-line react-hooks/exhaustive-deps
  const holidays = useMemo(() => new Map(days.map((d) => [d, holidaysOn(dd(d), hijriOffset).map((h) => h.name)] as const).filter(([, h]) => h.length)), [days, hijriOffset]);
  const untimed = tasks.filter((t) => !t.done && !t.someday && !t.time && t.when && t.when >= from && t.when <= to);
  const inbox = tasks.filter((t) => !t.done && !t.someday && !t.time && (!t.when || t.when < today()) && !(t.when && t.when >= from)).slice(0, 8);

  // keep recurring goals placed (and out of the way of new events)
  useEffect(() => {
    void planGoals().then((r) => {
      if (r.moved.length) dispatchEvent(new CustomEvent('ora:say', { detail: { text: `«${r.moved[0].title}» با چیز دیگری هم‌زمان شده بود؛ رفت ${r.moved[0].to}.` } }));
    }).catch(() => {});
  }, [rawEvents.length]);

  // undo toast
  useEffect(() => {
    let tm = 0;
    const on = (e: Event) => { const l = (e as CustomEvent<string | null>).detail; setUndoMsg(l); window.clearTimeout(tm); if (l) tm = window.setTimeout(() => setUndoMsg(null), 8000); };
    addEventListener('ora:undo-offer', on);
    return () => { removeEventListener('ora:undo-offer', on); window.clearTimeout(tm); };
  }, []);

  const go = useCallback((dir: 1 | -1) => setAnchor((a) => step(view, a, dir)), [view]);
  const newEvent = () => {
    const n = nowMin();
    const startM = anchor === today() ? Math.ceil((n + 1) / 60) * 60 : toMin(p.dayStart);
    openEventEditor({ day: anchor, time: toHM(Math.min(1380, startM)), end: toHM(Math.min(1440, startM + 60)) });
  };

  // keyboard shortcuts (by key position, so they work on a Persian layout too)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const busy = document.querySelector('.cal-pop, .ev-ed, [role="alertdialog"], [aria-label="جزئیات کار"]');
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]');
      if (e.key === 'Escape') {
        if (busy) return;
        if (typing && searching) { setQuery(''); setSearching(false); e.stopPropagation(); return; }
        e.stopPropagation(); onClose(); return;
      }
      if (typing || busy || wizard) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.stopPropagation(); void undoLast(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const v = VIEWS.find(([, , code]) => code === e.code);
      const done = () => { e.preventDefault(); e.stopPropagation(); };
      if (v) { done(); setView(v[0]); return; }
      if (e.code === 'KeyT') { done(); setAnchor(today()); }
      else if (e.code === 'KeyJ' || e.code === 'KeyN' || e.key === 'ArrowLeft') { done(); go(1); }
      else if (e.code === 'KeyK' || e.code === 'KeyP' || e.key === 'ArrowRight') { done(); go(-1); }
      else if (e.code === 'KeyC') { done(); newEvent(); }
      else if (e.code === 'Slash') { done(); setSearching(true); window.setTimeout(() => searchRef.current?.focus(), 20); }
      else if (e.code === 'Equal' || e.code === 'NumpadAdd') { done(); setPart(null); setZoom(zoom * 1.25); }
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') { done(); setPart(null); setZoom(zoom / 1.25); }
    };
    addEventListener('keydown', k, true);
    return () => removeEventListener('keydown', k, true);
  });

  /* ---------- changes from the grid ---------- */
  const scopeFor = async (e: CalEvent) => (isRepeating(e) ? askScope('edit', e.source.startsWith('google:')) : 'all' as const);
  const moveEvent = async (e: CalEvent, day: string, time?: string) => {
    const s = await scopeFor(e);
    if (!s) return;
    await updateEvent(e, moved(e, day, time), s, 'رویداد جابه‌جا شد').catch((x) => dispatchEvent(new CustomEvent('ora:say', { detail: { text: `جابه‌جا نشد: ${(x as Error).message}` } })));
  };
  const handlers = {
    onCreate: (day: string, s: number, e: number, rect: DOMRect) => setPop({ kind: 'create', day, start: s, end: e, rect }),
    onCreateAllDay: (day: string, rect: DOMRect) => setPop({ kind: 'create', day, rect }),
    onOpenBlock: (b: Block, rect: DOMRect) => {
      if (b.ev) setPop({ kind: 'event', e: b.ev, rect });
      else if (b.taskId) { const t = tasks.find((x) => x.id === b.taskId); if (t) setPop({ kind: 'task', t, rect }); }
    },
    onOpenEvent: (e: CalEvent, rect: DOMRect) => setPop({ kind: 'event', e, rect }),
    onMoveBlock: (b: Block, day: string, s: number) => {
      if (b.ev) void moveEvent(b.ev, day, toHM(s));
      else if (b.taskId) void withUndo('کار جابه‌جا شد', () => db.tasks.update(b.taskId!, { when: day, time: toHM(s) }));
    },
    onResizeBlock: async (b: Block, day: string, end: number) => {
      if (b.ev) {
        const s = await scopeFor(b.ev);
        if (!s) return;
        await updateEvent(b.ev, resized(b.ev, end, day), s, 'زمان رویداد عوض شد');
      } else if (b.taskId) await withUndo('مدت کار عوض شد', () => db.tasks.update(b.taskId!, { len: end - b.start }));
    },
    onDropTask: (id: string, day: string, s: number) => void withUndo('کار در برنامه گذاشته شد', () => db.tasks.update(id, { when: day, time: toHM(s), someday: false })),
    onMoveAllDay: (e: CalEvent, day: string) => void moveEvent(e, day),
    onPickDay: (d: string) => { setAnchor(d); setView('day'); },
  };

  const label = q ? 'جستجو' : rangeLabel(view, days, anchor);
  const isGrid = view === 'day' || view === '3day' || view === 'week';
  const reportScope: 'day' | 'week' = view === 'day' ? 'day' : 'week';
  const pending = pop?.kind === 'create' && pop.start !== undefined ? { day: pop.day, start: pop.start, end: pop.end! } : null;
  const monthOf = toJalali(dd(view === 'month' ? monthRange(anchor).first : anchor)).jm;
  const marked = useMemo(() => new Set(rawEvents.flatMap((e) => [e.day])), [rawEvents]);

  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="تقویم و برنامه" className="glass sch cal-app">
        <div className="cal-head">
          {!wizard && <button className="icon-btn" aria-label="پنل کناری" aria-pressed={side} onClick={() => { setSide(!side); setCalPrefs({ side: !side }); }}><IconMenu size={18} /></button>}
          <div className="cal-title">
            <h2>{wizard ? 'برنامه‌ریزی قدم‌به‌قدم' : 'تقویم و برنامه'}</h2>
            {!wizard && <span className="cal-range">{label}</span>}
          </div>
          {!wizard && (
            <>
              <button className="btn btn-sm" onClick={() => setAnchor(today())} title="امروز (T)">امروز</button>
              <div className="w-actions">
                <button className="icon-btn" aria-label="قبلی" title="قبلی (K)" onClick={() => go(-1)}><IconChevronR size={16} /></button>
                <button className="icon-btn" aria-label="بعدی" title="بعدی (J)" onClick={() => go(1)}><IconChevronL size={16} /></button>
              </div>
              <div className={`cal-search${searching || q ? ' open' : ''}`}>
                <button className="icon-btn" aria-label="جستجو در تقویم" title="جستجو (/)" onClick={() => { setSearching(true); window.setTimeout(() => searchRef.current?.focus(), 20); }}><IconSearch size={16} /></button>
                {(searching || q) && <input ref={searchRef} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی رویداد و کار" aria-label="جستجوی رویداد و کار" onBlur={() => { if (!query) setSearching(false); }} />}
                {q && <button className="icon-btn" aria-label="پاک کردن جستجو" onClick={() => { setQuery(''); setSearching(false); }}><IconX size={14} /></button>}
              </div>
              <div className="seg seg-sm cal-views" role="tablist" aria-label="نما">
                {VIEWS.map(([v, n, code]) => <button key={v} role="tab" aria-selected={view === v && !q} aria-checked={view === v && !q} title={`${n} (${code.slice(3)})`} onClick={() => { setQuery(''); setSearching(false); setView(v); }}>{n}</button>)}
              </div>
              <button className="btn btn-accent btn-sm" onClick={() => setWizard(true)}><IconSpark size={14} />چیدن هوشمند</button>
            </>
          )}
          <button className="icon-btn" aria-label="بستن" onClick={onClose}><IconX size={18} /></button>
        </div>

        {wizard ? (
          <Wizard onCancel={() => setWizard(false)} onDone={(v, s) => { setWizard(false); setView(v === 'day' ? 'day' : 'week'); setAnchor(s); }} />
        ) : (
          <div className={`cal-main${side ? '' : ' no-side'}`}>
            {side && (
              <aside className="cal-side scroll">
                <button className="btn cal-create" onClick={newEvent}><IconPlus size={18} />ایجاد</button>
                <MiniMonth value={anchor} onPick={(d) => setAnchor(d)} range={isGrid ? days : undefined} marked={marked} />
                <Calendars />
                <GoalsPanel tasks={tasks} />
                <FreeFinder tasks={tasks} onPick={(sl, len, rect) => { setAnchor(sl.day); if (!isGrid) setView('day'); setPop({ kind: 'create', day: sl.day, start: sl.start, end: Math.min(sl.end, sl.start + len), rect }); }} />
                {isGrid && stats && <ReportCard tasks={tasks} events={timed} stats={stats} scope={reportScope} breaks={brk} from={days[0] >= today() ? days[0] : today()} />}
                {(untimed.length > 0 || inbox.length > 0) && (
                  <div className="sch-untimed">
                    <span className="te-label">بدون ساعت · برای چیدن بکش و روی جدول رها کن</span>
                    {[...untimed, ...inbox].map((t) => (
                      <button key={t.id} className="sch-chip" draggable onDragStart={(e) => { e.dataTransfer.setData('text/ora-task', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                        onClick={(e) => setPop({ kind: 'task', t, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })}>
                        {t.title}{t.est ? <span className="faint"> · {estLabel(t.est)}</span> : null}{!t.when || t.when < today() ? <span className="faint"> · {t.when ? 'عقب‌مانده' : 'بی‌تاریخ'}</span> : null}
                      </button>
                    ))}
                    <button className="link-btn" onClick={() => setWizard(true)}>همه را بچین</button>
                  </div>
                )}
                <p className="faint cal-keys">میانبرها: <kbd>T</kbd> امروز · <kbd>D</kbd> <kbd>X</kbd> <kbd>W</kbd> <kbd>M</kbd> <kbd>A</kbd> نماها · <kbd>J</kbd>/<kbd>K</kbd> بعدی/قبلی · <kbd>C</kbd> رویداد تازه · <kbd>/</kbd> جستجو · <kbd>Ctrl+Z</kbd> برگردان</p>
              </aside>
            )}
            <div className="cal-view">
              {q && found ? (
                <AgendaView days={days} events={found.ev} tasks={found.tk} query={q} onOpenEvent={handlers.onOpenEvent} onOpenTask={(t, r) => setPop({ kind: 'task', t, rect: r })} onPickDay={(d) => { setQuery(''); setSearching(false); handlers.onPickDay(d); }} />
              ) : isGrid ? (
                <>
                <div className="cal-zoom" role="toolbar" aria-label="بزرگ‌نمایی">
                  <span className="faint">زوم روی</span>
                  {([['morning', 'صبح', 6 * 60, 12 * 60], ['noon', 'ظهر', 11 * 60, 15 * 60], ['afternoon', 'بعدازظهر', 14 * 60, 18 * 60], ['evening', 'عصر و شب', 17 * 60, 23 * 60], ['day', 'روز کاری', toMin(p.dayStart), toMin(p.dayEnd)]] as const).map(([k, n, a, b]) => (
                    <button key={k} className="pill pill-xs" aria-pressed={part === k} onClick={() => fit(k, a, b)}>{n}</button>
                  ))}
                  <span className="cal-zoom-btns">
                    <button className="icon-btn" aria-label="کوچک‌نمایی" title="کوچک‌نمایی (−)" onClick={() => { setPart(null); setZoom(zoom / 1.25); }} disabled={zoom <= ZMIN}>−</button>
                    <span className="faint" style={{ fontSize: 11.5, minWidth: 34, textAlign: 'center' }}>{fa(Math.round((zoom / 48) * 100))}٪</span>
                    <button className="icon-btn" aria-label="بزرگ‌نمایی" title="بزرگ‌نمایی (+) · یا Ctrl و چرخ موس روی جدول" onClick={() => { setPart(null); setZoom(zoom * 1.25); }} disabled={zoom >= ZMAX}>+</button>
                  </span>
                </div>
                <TimeGrid days={days} blocks={blocks} allDay={events.filter((e) => !e.time)} holidays={holidays} window={[toMin(p.dayStart), toMin(p.dayEnd)]} pending={pending} secondTz={prefs.secondTz} hour={zoom} onZoom={(h) => { setPart(null); setZoom(h); }} focus={focus}
                  selected={pop?.kind === 'event' ? pop.e.id : pop?.kind === 'task' ? pop.t.id : null} {...handlers} />
                </>
              ) : view === 'insights' ? (
                <InsightsView tasks={tasks} />
              ) : view === 'month' ? (
                <MonthView days={days} month={monthOf} events={events} tasks={tasks} holidays={holidays} onPickDay={handlers.onPickDay}
                  onCreate={(d, r) => setPop({ kind: 'create', day: d, rect: r })} onOpenEvent={handlers.onOpenEvent} onOpenTask={(t, r) => setPop({ kind: 'task', t, rect: r })}
                  onMoveEvent={(e, d) => void moveEvent(e, d, e.time)} onMoveTask={(t, d) => void withUndo('کار جابه‌جا شد', () => db.tasks.update(t.id, { when: d }))} />
              ) : (
                <AgendaView days={days} events={events} tasks={tasks} onOpenEvent={handlers.onOpenEvent} onOpenTask={(t, r) => setPop({ kind: 'task', t, rect: r })} onPickDay={handlers.onPickDay} />
              )}
            </div>
          </div>
        )}
        {undoMsg && (
          <div className="cal-toast" role="status">
            <span>{undoMsg}</span>
            <button className="link-btn" onClick={() => { void undoLast(); setUndoMsg(null); }}>برگردان</button>
          </div>
        )}
      </div>
      {pop?.kind === 'create' && <QuickCreate at={pop} onClose={() => setPop(null)} onMore={({ title, kind }) => {
        const at = pop; setPop(null);
        if (kind === 'event') openEventEditor({ title, day: at.day, time: at.start !== undefined ? toHM(at.start) : undefined, end: at.end !== undefined ? toHM(at.end) : undefined, allDay: at.start === undefined });
        else void addParsed({ ...parseTask(title || 'کار تازه'), when: at.day, time: at.start !== undefined ? toHM(at.start) : undefined, est: at.start !== undefined ? at.end! - at.start : undefined }).then((t) => openTaskEditor(t.id));
      }} />}
      {pop?.kind === 'event' && <EventCard e={pop.e} rect={pop.rect} onClose={() => setPop(null)} />}
      {pop?.kind === 'task' && <TaskCard t={tasks.find((x) => x.id === pop.t.id) ?? pop.t} rect={pop.rect} onClose={() => setPop(null)} />}
    </div>
  );
}

export function ScheduleHost() {
  const [open, setOpen] = useState<CalOpen | null>(null);
  useEffect(() => {
    const go = (e: Event) => setOpen((e as CustomEvent).detail ?? {});
    addEventListener('ora:schedule', go);
    return () => removeEventListener('ora:schedule', go);
  }, []);
  return open ? createPortal(<CalendarApp start={open} onClose={() => setOpen(null)} />, document.body) : null;
}
