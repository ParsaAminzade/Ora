// Tasks with a real plan behind them: today / upcoming / everything, top three, estimates against
// the hours you have, rollover you can see, natural Persian entry, repeats and focus with the timer.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { defineWidget } from '../core/widgets';
import { db, type Task } from '../core/db';
import { fa } from '../core/dates';
import { parseTask, dayLabel, estLabel } from '../core/taskparse';
import { addParsed, byPlan, isInbox, isOverdue, isToday, load, openPlanner, plannerOf, reschedule, setFocusTask, setTop, today, tomorrow, toggleDone } from '../core/planner';
import { IconCheckSquare, IconFlag, IconPlan, IconPlus, IconRepeat, IconStar, IconTarget, IconTrash, IconCalendar, IconClock } from '../ui/icons';
import { openTaskEditor } from '../ui/TaskEditor';
import { openSchedule } from '../ui/Schedule';
import { NONE } from '../core/none';

type View = 'today' | 'upcoming' | 'all';
interface Config { hideDone: boolean; view?: View }

const daysLate = (t: Task) => (t.when ? Math.round((new Date(`${today()}T12:00`).getTime() - new Date(`${t.when}T12:00`).getTime()) / 864e5) : 0);

function Meta({ t }: { t: Task }) {
  const proj = useLiveQuery(async () => (t.project ? db.projects.get(t.project) : undefined), [t.project]);
  const late = isOverdue(t) ? daysLate(t) : 0;
  const steps = t.steps?.length ? t.steps.filter((s) => s.done).length : -1;
  const dueSoon = t.due && t.due <= tomorrow();
  const bits = [
    late > 0 && <span key="late" className="tm tm-late">{late === 1 ? 'از دیروز' : `${fa(late)} روز عقب`}</span>,
    t.time && <span key="time" className="tm"><IconClock size={11} />{fa(t.time)}</span>,
    t.est && <span key="est" className="tm">{estLabel(t.est)}</span>,
    t.due && <span key="due" className={`tm${dueSoon ? ' tm-due' : ''}`}>مهلت {dayLabel(t.due)}</span>,
    t.repeat && <span key="rep" className="tm"><IconRepeat size={11} /></span>,
    steps >= 0 && <span key="steps" className="tm">{fa(steps)}/{fa(t.steps!.length)}</span>,
    t.spent ? <span key="spent" className="tm">{fa(t.spent)} دقیقه تمرکز</span> : null,
    (t.slips ?? 0) >= 3 && !t.done && <span key="slip" className="tm tm-late" title="این کار چند بار عقب افتاده؛ شاید باید کوچک‌ترش کنی">{fa(t.slips!)} بار عقب افتاده</span>,
    proj && <span key="proj" className="tm tm-proj" style={{ '--c': proj.color } as React.CSSProperties} title={`پروژه‌ی ${proj.title}`}>{proj.title}</span>,
    t.goal && <span key="goal" className="tm" title="جلسه‌ی یک هدف تکرارشونده">↻ هدف</span>,
    t.area && <span key="area" className="tm tm-area">#{t.area}</span>,
  ].filter(Boolean);
  return bits.length ? <span className="task-meta">{bits}</span> : null;
}

function DayMenu({ t, onClose, anchor }: { t: Task; onClose(): void; anchor: DOMRect }) {
  useEffect(() => {
    const close = () => onClose();
    const t1 = window.setTimeout(() => addEventListener('pointerdown', close, { once: true }), 0);
    return () => { window.clearTimeout(t1); removeEventListener('pointerdown', close); };
  }, [onClose]);
  const sat = (() => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return d; })();
  const items: [string, () => Promise<void>][] = [
    ['امروز', () => reschedule(t, today())],
    ['فردا', () => reschedule(t, tomorrow())],
    ['هفته‌ی بعد', () => reschedule(t, `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')}`)],
    ['بعداً (یه روزی)', () => reschedule(t, undefined, { someday: true })],
    ['بدون تاریخ', () => reschedule(t, undefined)],
  ];
  return createPortal(
    <div className="glass menu" role="menu" style={{ top: anchor.bottom + 6, left: Math.max(8, anchor.left - 60) }} onPointerDown={(e) => e.stopPropagation()}>
      {items.map(([n, fn]) => <button key={n} role="menuitem" onClick={() => { void fn(); onClose(); }}>{n}</button>)}
    </div>,
    document.body,
  );
}

function Row({ t, pulse }: { t: Task; pulse: boolean }) {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [full, setFull] = useState(false);
  return (
    <div className={`task-row${pulse ? ' pulse' : ''}${t.top ? ' is-top' : ''}`} data-done={t.done} data-id={t.id}>
      <input className="chk" type="checkbox" checked={t.done} onChange={() => void toggleDone(t)} aria-label={t.title} />
      <button className="task-main" onClick={() => openTaskEditor(t.id)} title="جزئیات و ویرایش">
        <span className="task-title">
          {!!t.priority && <IconFlag size={13} className="task-flag" aria-hidden="true" />}
          {t.title}
        </span>
        <Meta t={t} />
      </button>
      {!t.done && (
        <span className="task-tools">
          <button aria-label={t.top ? 'برداشتن از سه کار مهم' : 'از سه کار مهم امروز'} title={t.top ? 'برداشتن از سه کار مهم' : 'از سه کار مهم امروز'} aria-pressed={!!t.top}
            onClick={async () => { if (!(await setTop(t, !t.top))) { setFull(true); window.setTimeout(() => setFull(false), 2200); } }}
            className={`icon-btn${t.top ? ' star-on' : ''}`}><IconStar size={15} /></button>
          <button className="icon-btn" aria-label={t.priority ? 'برداشتن اولویت' : 'علامت‌گذاری به‌عنوان مهم'} title="مهم" aria-pressed={!!t.priority}
            onClick={() => db.tasks.update(t.id, { priority: t.priority ? 0 : 1 })} style={{ color: t.priority ? 'var(--danger)' : undefined }}><IconFlag size={15} /></button>
          <button className="icon-btn" aria-label="جابه‌جایی به روز دیگر" title="کِی؟" onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}><IconCalendar size={15} /></button>
          <button className="icon-btn" aria-label="تمرکز روی این کار" title="تمرکز روی این کار (تایمر)" onClick={() => { setFocusTask(t.id); dispatchEvent(new Event('ora:focus-start')); }}><IconTarget size={15} /></button>
          <button className="icon-btn" aria-label={`حذف ${t.title}`} title="حذف" onClick={() => db.tasks.delete(t.id)}><IconTrash size={15} /></button>
        </span>
      )}
      {full && <span className="task-toast" role="status">سه کار مهم امروز پر است؛ یکی را بردار.</span>}
      {menu && <DayMenu t={t} anchor={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

defineWidget<Config>({
  type: 'tasks',
  name: 'تسک‌ها',
  description: 'برنامه‌ی کارها: امروز، پیش‌رو، سه کار مهم و زمان‌بندی',
  icon: <IconCheckSquare />,
  defaultSize: { w: 6, h: 14 },
  minSize: { w: 5, h: 7 },
  defaultConfig: { hideDone: false, view: 'today' },
  Component: function Tasks({ config, setConfig }) {
    const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? NONE;
    const [draft, setDraft] = useState('');
    const [focused, setFocused] = useState(false);
    const [pulse, setPulse] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const view: View = config.view ?? 'today';
    const d = today();
    const parsed = useMemo(() => (draft.trim() ? parseTask(draft) : null), [draft]);

    // Ora sends you back to a task ("برو سراغ …"): show it and light it up.
    useEffect(() => {
      const go = (e: Event) => {
        const id = (e as CustomEvent<string>).detail;
        setConfig({ view: 'today' });
        setPulse(id);
        window.setTimeout(() => listRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
        window.setTimeout(() => setPulse(null), 2600);
      };
      addEventListener('ora:focus-task', go);
      return () => removeEventListener('ora:focus-task', go);
    }, [setConfig]);

    const add = async () => {
      if (!parsed) return;
      // Typed in the «today» view without a day → it is for today.
      const p = { ...parsed };
      if (view === 'today' && !p.when && !p.someday) p.when = d;
      setDraft('');
      await addParsed(p);
    };

    const doneToday = tasks.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toDateString() === new Date().toDateString());
    const todayOpen = tasks.filter((t) => isToday(t, d)).sort(byPlan);
    const cap = load(tasks, d);
    const over = cap.buffered > cap.capacity;

    let body: React.ReactNode;
    if (view === 'today') {
      const tops = todayOpen.filter((t) => t.top);
      const rest = todayOpen.filter((t) => !t.top);
      const done = config.hideDone ? [] : doneToday;
      const inbox = tasks.filter(isInbox);
      body = todayOpen.length + done.length === 0 ? (
        <div className="w-empty">
          <IconCheckSquare />
          <b>{doneToday.length ? 'کارهای امروز تمام شد' : 'امروز را با یک کار شروع کن'}</b>
          <span>{doneToday.length ? `${fa(doneToday.length)} کار انجام دادی. آفرین.` : 'بنویس و Enter بزن؛ مثلاً «ساعت ۵ مقاله ۴۵ دقیقه #پژوهش».'}</span>
          {inbox.length > 0 && <button className="btn btn-sm" onClick={() => openPlanner('plan')}>{fa(inbox.length)} کار بی‌تاریخ داری؛ برای امروز بچین</button>}
        </div>
      ) : (
        <>
          {tops.length > 0 && <div className="task-group-h">سه کار مهم امروز</div>}
          {tops.map((t) => <Row key={t.id} t={t} pulse={pulse === t.id} />)}
          {tops.length > 0 && rest.length > 0 && <div className="task-group-h">بقیه‌ی امروز</div>}
          {rest.map((t) => <Row key={t.id} t={t} pulse={pulse === t.id} />)}
          {done.length > 0 && <div className="task-group-h">انجام‌شده‌های امروز · {fa(done.length)}</div>}
          {done.map((t) => <Row key={t.id} t={t} pulse={false} />)}
        </>
      );
    } else {
      const open = tasks.filter((t) => !t.done);
      const groups: [string, Task[]][] = [];
      if (view === 'upcoming') {
        const later = open.filter((t) => t.when && t.when > d).sort((a, b) => a.when!.localeCompare(b.when!) || byPlan(a, b));
        const byDay = new Map<string, Task[]>();
        for (const t of later) byDay.set(t.when!, [...(byDay.get(t.when!) ?? []), t]);
        for (const [k, list] of byDay) groups.push([dayLabel(k), list]);
        if (!groups.length) groups.push(['', []]);
      } else {
        groups.push(['امروز و عقب‌مانده', todayOpen]);
        groups.push(['آینده', open.filter((t) => t.when && t.when > d && !t.top).sort((a, b) => a.when!.localeCompare(b.when!))]);
        groups.push(['بدون تاریخ', open.filter(isInbox).sort(byPlan)]);
        groups.push(['بعداً', open.filter((t) => t.someday).sort(byPlan)]);
      }
      const nonEmpty = groups.filter(([, l]) => l.length);
      body = nonEmpty.length === 0 ? (
        <div className="w-empty"><IconPlan /><b>{view === 'upcoming' ? 'برای روزهای بعد چیزی نچیده‌ای' : 'هیچ کار بازی نیست'}</b>
          <span>{view === 'upcoming' ? 'بنویس «فردا …» یا «شنبه …».' : 'یک کار تازه بنویس.'}</span></div>
      ) : nonEmpty.map(([h, l]) => (
        <div key={h} className="task-group">
          {h && <div className="task-group-h">{h} · {fa(l.length)}</div>}
          {l.map((t) => <Row key={t.id} t={t} pulse={pulse === t.id} />)}
        </div>
      ));
    }

    return (
      <div className="w">
        <div className="w-head">
          <h2 className="w-title">{view === 'today' ? 'امروز' : view === 'upcoming' ? 'پیش‌رو' : 'همه‌ی کارها'}</h2>
          <span className="w-meta" />
          <div className="w-actions">
            <div className="seg seg-sm" role="tablist" aria-label="نما">
              {([['today', 'امروز'], ['upcoming', 'پیش‌رو'], ['all', 'همه']] as const).map(([v, n]) => (
                <button key={v} role="tab" aria-selected={view === v} aria-checked={view === v} onClick={() => setConfig({ view: v })}>{n}</button>
              ))}
            </div>
            <button className="icon-btn" aria-label="برنامه‌ی زمانی" title="برنامه‌ی زمانی (روز و هفته)" onClick={() => openSchedule({ view: 'day' })}><IconClock size={17} /></button>
            <button className="icon-btn" aria-label="برنامه‌ریزی امروز" title="برنامه‌ریزی امروز" onClick={() => openPlanner(new Date().getHours() >= plannerOf().eveningAt ? 'shutdown' : 'plan')}><IconPlan size={17} /></button>
          </div>
        </div>
        {view === 'today' && (todayOpen.length + doneToday.length) > 0 && (
          <div className="task-cap" title={`برآورد کارهای امروز با ${fa(Math.round((plannerOf().buffer - 1) * 100))}٪ حاشیه برای کارهایی که همیشه بیشتر از فکرمان طول می‌کشند`}>
            <div className="w-progress" aria-hidden="true"><span style={{ width: `${(doneToday.length / (todayOpen.length + doneToday.length)) * 100}%` }} /></div>
            <span>
              {fa(doneToday.length)} از {fa(todayOpen.length + doneToday.length)} انجام شد
              {cap.planned > 0 && <span className={over ? 'cap-over' : undefined}> · {estLabel(cap.buffered)} کار برای {estLabel(cap.capacity)} وقت{over ? '؛ بیشتر از وقتت' : ''}</span>}
            </span>
          </div>
        )}

        <div ref={listRef} className="scroll task-list">{body}</div>

        {config.hideDone !== undefined && view === 'today' && doneToday.length > 0 && (
          <button className="link-btn" onClick={() => setConfig({ hideDone: !config.hideDone })}>{config.hideDone ? 'نمایش انجام‌شده‌ها' : 'پنهان‌کردن انجام‌شده‌ها'}</button>
        )}

        <div className="task-input">
          <form className="field" onSubmit={(e) => { e.preventDefault(); void add(); }}>
            <IconPlus size={18} className="ico faint" />
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              placeholder={view === 'upcoming' ? 'کار تازه، مثلاً «شنبه ساعت ۱۰ …»' : 'کار تازه…'} aria-label="تسک جدید" />
          </form>
          {parsed && parsed.chips.length > 0 && (
            <div className="task-chips" aria-live="polite">{parsed.chips.map((c, i) => <span key={i} className={`chip chip-${c.kind}`}>{c.label}</span>)}<span className="chip-title">«{parsed.title}»</span></div>
          )}
          {focused && !draft && (
            <div className="task-hint">می‌توانی بنویسی: فردا · شنبه · ساعت ۵ عصر · ۴۵ دقیقه · تا جمعه · هر روز · #پژوهش · ! مهم · !! سه کار مهم · بعداً</div>
          )}
        </div>
      </div>
    );
  },
});
