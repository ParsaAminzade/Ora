// The phone layout: the same widgets as one scrolling column, with a bottom bar. Order and hiding are phone-only.
import { useCallback, useMemo, useState } from 'react';
import { GRID, useStore, type WidgetInstance } from '../core/state';
import { allWidgets, getWidget } from '../core/widgets';
import { ErrorBoundary } from './ErrorBoundary';
import { OraEye } from './OraEye';
import { ModeButton } from './Modes';
import { IconCalendar, IconChat, IconCheck, IconDown, IconFolder, IconLayout, IconPlus, IconSliders, IconSpark, IconUp, IconX } from './icons';

type PhoneLayout = { order: string[]; hidden: string[] };
const phoneOf = (): PhoneLayout => ({ order: [], hidden: [], ...useStore.getState().settings.phone }) as PhoneLayout;
const setPhone = (patch: Partial<PhoneLayout>) => useStore.getState().setSettings({ phone: { ...phoneOf(), ...patch } });

/** Without a saved order: the most useful cards first, then the desktop reading order. */
const PRIORITY = ['sentence', 'clock', 'onetask', 'tasks', 'dayplan', 'agenda', 'prayer', 'calendar', 'weather', 'pomodoro', 'notes', 'calm', 'shortcuts', 'assistant', 'search', 'offline'];
const rank = (w: WidgetInstance) => {
  const i = PRIORITY.indexOf(w.type);
  return (i < 0 ? PRIORITY.length : i) * 1e4 + w.y * 100 + w.x;
};
function ordered(list: WidgetInstance[], order: string[]) {
  const pos = new Map(order.map((id, i) => [id, i]));
  return [...list].sort((a, b) => {
    const pa = pos.get(a.id), pb = pos.get(b.id);
    return pa !== undefined || pb !== undefined ? (pa ?? 1e6 + rank(a)) - (pb ?? 1e6 + rank(b)) : rank(a) - rank(b);
  });
}

function PhoneCard({ inst, editing, first, last, onMove, onHide }: { inst: WidgetInstance; editing: boolean; first: boolean; last: boolean; onMove(d: number): void; onHide(): void }) {
  const def = getWidget(inst.type);
  const setWidgetConfig = useStore((s) => s.setWidgetConfig);
  const setConfig = useCallback((c: Record<string, unknown>) => setWidgetConfig(inst.id, c), [inst.id, setWidgetConfig]);
  if (!def) return null;
  const C = def.Component;
  const card = def.card !== false;
  const h = Math.min(620, Math.max(110, inst.h * GRID.rowH - GRID.gap));
  return (
    <section aria-label={def.name} className={`phone-card${card ? ' glass' : ' bare'}${editing ? ' editing' : ''}`} style={card ? { height: h } : { minHeight: Math.min(h, 260) }} data-type={inst.type}>
      <div className="phone-card-in">
        <ErrorBoundary label={def.name}><C id={inst.id} config={inst.config as never} setConfig={setConfig as never} editing={false} /></ErrorBoundary>
      </div>
      {editing && (
        <div className="phone-card-tools">
          <span>{def.name}</span>
          <button className="icon-btn" aria-label={`بالاتر: ${def.name}`} disabled={first} onClick={() => onMove(-1)}><IconUp size={16} /></button>
          <button className="icon-btn" aria-label={`پایین‌تر: ${def.name}`} disabled={last} onClick={() => onMove(1)}><IconDown size={16} /></button>
          <button className="icon-btn" aria-label={`پنهان در گوشی: ${def.name}`} onClick={onHide}><IconX size={16} /></button>
        </div>
      )}
    </section>
  );
}

export function PhoneShell() {
  const loaded = useStore((s) => s.loaded);
  const widgets = useStore((s) => s.widgets);
  const phone = useStore((s) => s.settings.phone);
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const addWidget = useStore((s) => s.addWidget);
  const [editing, setEditing] = useState(false);
  const hidden = useMemo(() => new Set(phone?.hidden ?? []), [phone?.hidden]);
  const all = ordered(widgets, phone?.order ?? []);
  const shown = all.filter((w) => !hidden.has(w.id));
  const off = all.filter((w) => hidden.has(w.id));
  const move = (id: string, d: number) => {
    const ids = shown.map((w) => w.id);
    const i = ids.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setPhone({ order: [...ids, ...off.map((w) => w.id)] });
  };
  const send = (name: string) => dispatchEvent(new CustomEvent(name, { detail: {} }));
  const today = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return (
    <div className="phone">
      <header className="phone-top glass">
        <OraEye size={28} />
        <div className="phone-title"><b>اورآ</b><span>{today}</span></div>
        <ModeButton />
        <button className="icon-btn" aria-label="گفتگو با اورآ" onClick={() => send('ora:coach')}><IconChat /></button>
      </header>
      <main className="phone-feed scroll" id="phone-feed">
        {editing && (
          <div className="phone-edit-bar glass">
            <span><IconLayout size={16} /> چیدمان گوشی</span>
            <span className="faint">ترتیب و پنهان‌کردن فقط روی گوشی است؛ چیدمان کامپیوتر دست نمی‌خورد.</span>
            <button className="btn btn-accent" onClick={() => setEditing(false)}><IconCheck size={16} />تمام</button>
          </div>
        )}
        {loaded && shown.map((w, i) => (
          <PhoneCard key={w.id} inst={w} editing={editing} first={i === 0} last={i === shown.length - 1}
            onMove={(d) => move(w.id, d)} onHide={() => setPhone({ hidden: [...hidden, w.id] })} />
        ))}
        {editing && (
          <div className="phone-more glass">
            {off.length > 0 && (
              <>
                <b>پنهان در گوشی</b>
                <div className="day-pills">
                  {off.map((w) => <button key={w.id} className="pill" onClick={() => setPhone({ hidden: [...hidden].filter((x) => x !== w.id) })}>+ {getWidget(w.type)?.name}</button>)}
                </div>
              </>
            )}
            <b>افزودن ویجت</b>
            <div className="day-pills">
              {allWidgets().filter((d) => d.multiple || !widgets.some((w) => w.type === d.type)).map((d) => (
                <button key={d.type} className="pill" onClick={() => addWidget(d.type)}>+ {d.name}</button>
              ))}
            </div>
          </div>
        )}
        {!editing && loaded && <button className="phone-arrange" onClick={() => setEditing(true)}><IconLayout size={15} /> چیدمان گوشی</button>}
      </main>
      <nav className="phone-nav glass" aria-label="ناوبری">
        <button aria-label="امروز" aria-current={panel === 'none'} onClick={() => { setPanel('none'); document.getElementById('phone-feed')?.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <IconSpark size={20} /><span>امروز</span>
        </button>
        <button aria-label="تقویم و برنامه" onClick={() => send('ora:schedule')}><IconCalendar size={20} /><span>تقویم</span></button>
        <button aria-label="افزودن سریع" className="phone-add" onClick={() => send('ora:palette')}><IconPlus size={24} /></button>
        <button aria-label="پروژه‌ها" onClick={() => send('ora:projects')}><IconFolder size={20} /><span>پروژه‌ها</span></button>
        <button aria-label="شخصی‌سازی" aria-current={panel === 'settings'} onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')}><IconSliders size={20} /><span>تنظیمات</span></button>
      </nav>
    </div>
  );
}
