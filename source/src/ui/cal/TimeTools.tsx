// Phase-3 tools beside the calendar: recurring goals, a free-time finder, and «بینش زمان».
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CalEvent, type Goal, type Task } from '../../core/db';
import { fa, weekCol, WEEKDAYS_FULL, WEEKDAYS_SHORT, toJalali } from '../../core/dates';
import { goalProgress, PART_LABEL, planGoals, removeGoal, saveGoal, weekStartOf } from '../../core/goals';
import { freeSlots, faHM, type FreeSlot } from '../../core/schedule';
import { insight, type Insight } from '../../core/insights';
import { localCalendar } from '../../core/providers/calendar';
import { plannerOf, today } from '../../core/planner';
import { estLabel } from '../../core/taskparse';
import { useStore } from '../../core/state';
import { calOf } from '../../core/calendars';
import { ask } from '../Dialog';
import { IconX } from '../icons';
import { dayTitle, dd, monthRange, plus } from './shared';
import { NONE } from '../../core/none';

/* ---------- goals ---------- */
function GoalDialog({ goal, onClose }: { goal?: Goal; onClose(): void }) {
  const areas = useStore((s) => s.settings.areas);
  const [g, setG] = useState<Partial<Goal>>(goal ?? { perWeek: 3, minutes: 45, part: 'morning', active: true });
  const [title, setTitle] = useState(goal?.title ?? '');
  const set = (x: Partial<Goal>) => setG({ ...g, ...x });
  const save = async () => {
    if (!title.trim()) return;
    await saveGoal({ ...g, title: title.trim() });
    const r = await planGoals();
    dispatchEvent(new CustomEvent('ora:say', { detail: { text: r.placed ? `${fa(r.placed)} جلسه‌ی «${title.trim()}» در این هفته جا داده شد.${r.short.length ? ` ${fa(r.short[0].missing)} تا جا نشد؛ هفته‌ات پُر است.` : ''}` : r.short.length ? 'این هفته جای خالی برایش پیدا نشد.' : 'هدف ذخیره شد.' } }));
    onClose();
  };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true); }, [onClose]);
  return createPortal(
    <div className="dlg-backdrop" style={{ zIndex: 96 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={goal ? 'ویرایش هدف' : 'هدف تازه'} className="glass ev-ed" style={{ width: 'min(520px, 100%)' }}>
        <div className="ev-ed-head">
          <input className="ev-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً ورزش، مطالعه‌ی زبان، کتاب خواندن" aria-label="عنوان هدف" onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
          <button className="icon-btn" aria-label="بستن" onClick={onClose}><IconX size={18} /></button>
        </div>
        <div className="ev-ed-body">
          <div className="te-field"><span className="te-label">چند بار در هفته؟</span>
            <div className="day-pills">{[1, 2, 3, 4, 5, 6, 7].map((n) => <button key={n} className="pill pill-xs" aria-pressed={g.perWeek === n} onClick={() => set({ perWeek: n })}>{fa(n)}</button>)}</div>
          </div>
          <div className="te-field"><span className="te-label">هر بار چقدر؟</span>
            <div className="day-pills">{[15, 30, 45, 60, 90, 120].map((m) => <button key={m} className="pill pill-xs" aria-pressed={g.minutes === m} onClick={() => set({ minutes: m })}>{estLabel(m)}</button>)}</div>
          </div>
          <div className="te-field"><span className="te-label">بهترین وقتش</span>
            <div className="seg seg-sm" style={{ alignSelf: 'flex-start' }}>{(Object.keys(PART_LABEL) as Goal['part'][]).map((k) => <button key={k} aria-checked={g.part === k} onClick={() => set({ part: k })}>{PART_LABEL[k]}</button>)}</div>
          </div>
          <div className="te-field"><span className="te-label">فقط این روزها (اختیاری)</span>
            <div className="day-pills">{[6, 0, 1, 2, 3, 4, 5].map((d) => <button key={d} className="pill pill-xs" aria-pressed={!!g.days?.includes(d)} onClick={() => set({ days: g.days?.includes(d) ? g.days.filter((x) => x !== d) : [...(g.days ?? []), d] })}>{WEEKDAYS_FULL[(d + 1) % 7]}</button>)}</div>
          </div>
          {areas.length > 0 && (
            <div className="te-field"><span className="te-label">حوزه</span>
              <div className="day-pills"><button className="pill pill-xs" aria-pressed={!g.area} onClick={() => set({ area: undefined })}>هیچ</button>{areas.map((a) => <button key={a} className="pill pill-xs" aria-pressed={g.area === a} onClick={() => set({ area: a })}>#{a}</button>)}</div>
            </div>
          )}
          <p className="faint ev-hint" style={{ marginTop: 0 }}>اورآ جلسه‌ها را در وقت‌های خالی هفته می‌چیند و پخششان می‌کند. اگر بعداً جلسه‌ای روی یکی‌شان بیفتد، خودش جابه‌جایش می‌کند.</p>
        </div>
        <div className="pl-foot">
          <button className="btn btn-accent" onClick={() => void save()} disabled={!title.trim()}>ذخیره</button>
          <button className="btn" style={{ border: 0 }} onClick={onClose}>انصراف</button>
          {goal && <button className="btn" style={{ border: 0 }} onClick={async () => { await saveGoal({ ...goal, active: !goal.active }); onClose(); }}>{goal.active ? 'مکث' : 'ادامه'}</button>}
          {goal && <button className="btn" style={{ border: 0, color: 'var(--danger)', marginInlineStart: 'auto' }} onClick={async () => { if (await ask(`هدف «${goal.title}» حذف شود؟ جلسه‌های آینده‌اش هم پاک می‌شوند (انجام‌شده‌ها می‌مانند).`, { danger: true })) { await removeGoal(goal.id); onClose(); } }}>حذف</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function GoalsPanel({ tasks }: { tasks: Task[] }) {
  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? NONE;
  const [edit, setEdit] = useState<Goal | 'new' | null>(null);
  return (
    <div className="goals">
      <span className="te-label">هدف‌های تکرارشونده</span>
      {goals.length === 0 && <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>مثلاً «ورزش، ۳ بار در هفته، صبح». اورآ برایش وقت پیدا می‌کند و نگهش می‌دارد.</span>}
      {goals.map((g) => {
        const pr = goalProgress(g, tasks);
        return (
          <button key={g.id} className={`goal${g.active ? '' : ' paused'}`} onClick={() => setEdit(g)} title="ویرایش هدف">
            <span className="goal-t">{g.title}<small>{fa(g.perWeek)}× · {estLabel(g.minutes)} · {PART_LABEL[g.part]}{g.active ? '' : ' · متوقف'}</small></span>
            <span className="goal-dots" aria-label={`${fa(pr.done)} از ${fa(pr.target)} این هفته`}>
              {Array.from({ length: pr.target }, (_, i) => <i key={i} className={i < pr.done ? 'on' : i < pr.done + pr.planned ? 'plan' : ''} />)}
            </span>
            {pr.streak >= 2 && <span className="goal-streak">{fa(pr.streak)} هفته پشت سر هم</span>}
          </button>
        );
      })}
      <button className="link-btn" onClick={() => setEdit('new')}>+ هدف تازه</button>
      {edit && <GoalDialog goal={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/* ---------- free time finder ---------- */
export function FreeFinder({ tasks, onPick }: { tasks: Task[]; onPick(s: FreeSlot, len: number, rect: DOMRect): void }) {
  const [len, setLen] = useState(60);
  const [span, setSpan] = useState<'today' | 'week'>('week');
  const t0 = today();
  const days = span === 'today' ? [t0] : Array.from({ length: 7 }, (_, i) => plus(t0, i));
  const events = useLiveQuery(() => localCalendar.list(days[0], days[days.length - 1]), [days[0], days.length]) ?? NONE;
  const slots = freeSlots(days, tasks, events, plannerOf(), len).sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start).slice(0, 6);
  return (
    <div className="free">
      <span className="te-label">وقت خالی پیدا کن</span>
      <div className="free-q">
        <div className="seg seg-sm">{[30, 60, 90, 120].map((m) => <button key={m} aria-checked={len === m} onClick={() => setLen(m)}>{m < 60 ? `${fa(m)}د` : `${fa(m / 60)}س`}</button>)}</div>
        <div className="seg seg-sm">{([['today', 'امروز'], ['week', '۷ روز']] as const).map(([k, n]) => <button key={k} aria-checked={span === k} onClick={() => setSpan(k)}>{n}</button>)}</div>
      </div>
      {slots.length === 0 && <span className="faint" style={{ fontSize: 12 }}>جای خالی به این اندازه در ساعت‌های کاری‌ات نیست.</span>}
      {slots.map((s) => (
        <button key={`${s.day}${s.start}`} className="sch-chip free-slot" onClick={(e) => onPick(s, len, (e.currentTarget as HTMLElement).getBoundingClientRect())}>
          {s.day === t0 ? 'امروز' : dayTitle(s.day)} · {faHM(s.start)}–{faHM(s.end)} <span className="faint">({estLabel(s.end - s.start)})</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- time insights ---------- */
type Period = 'week' | 'last' | 'month';
const C = { ev: '#3987e5', done: '#199e70', open: '#d95926' };

function rangeOf(p: Period): [string, string, string, string] {
  const t0 = today();
  if (p === 'month') { const r = monthRange(t0); const pr = monthRange(plus(r.first, -1)); return [r.first, r.last, pr.first, pr.last]; }
  const ws = weekStartOf(t0);
  const s = p === 'week' ? ws : plus(ws, -7);
  return [s, plus(s, 6), plus(s, -7), plus(s, -1)];
}

export function InsightsView({ tasks }: { tasks: Task[] }) {
  const [p, setP] = useState<Period>('week');
  const [from, to, pf, pt] = rangeOf(p);
  const gcals = useStore((s) => s.settings.google.calendars);
  useStore((s) => s.settings.calendar);
  const events = useLiveQuery(() => localCalendar.list(pf, to), [pf, to]) ?? NONE;
  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? NONE;
  const calName = (e: CalEvent) => {
    if (e.source.startsWith('google:')) { const g = gcals.find((c) => `google:${c.id}` === e.source); return { key: e.source, name: `گوگل · ${g?.summary ?? ''}`, color: g?.color ?? '#7FA7C9' }; }
    const c = calOf(e.cal); return { key: `local:${c.id}`, name: c.name, color: c.color };
  };
  const data: Insight = useMemo(() => {
    const prev = insight(pf, pt, events, tasks, calName);
    return insight(from, to, events, tasks, calName, prev);
  }, [events, tasks, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(60, ...data.perDay.map((d) => d.events + d.done + d.open));
  const [tip, setTip] = useState<string | null>(null);
  const tot = data.byArea.reduce((a, x) => Math.max(a, x.planned), 1);
  const calMax = data.byCal.reduce((a, x) => Math.max(a, x.min), 1);
  return (
    <div className="ins scroll">
      <div className="ins-head">
        <div className="seg seg-sm" role="radiogroup" aria-label="بازه">{([['week', 'این هفته'], ['last', 'هفته‌ی قبل'], ['month', 'این ماه']] as const).map(([k, n]) => <button key={k} role="radio" aria-checked={p === k} onClick={() => setP(k)}>{n}</button>)}</div>
        <span className="faint" style={{ fontSize: 12.5 }}>{dayTitle(from)} تا {dayTitle(to)}</span>
      </div>
      <div className="ins-tiles">
        <div className="ins-tile"><span>جلسه و رویداد</span><b>{estLabel(data.eventMin)}</b></div>
        <div className="ins-tile"><span>کار برنامه‌ریزی‌شده</span><b>{estLabel(data.taskMin)}</b></div>
        <div className="ins-tile"><span>انجام‌شده</span><b>{estLabel(data.doneMin)}</b><small>{data.taskMin ? `${fa(Math.round((data.doneMin / data.taskMin) * 100))}٪ از برنامه` : ''}</small></div>
        <div className="ins-tile"><span>تمرکز با تایمر</span><b>{estLabel(data.focusMin)}</b></div>
      </div>
      {data.notes.length > 0 && <div className="ins-notes">{data.notes.map((n) => <p key={n}>{n}</p>)}</div>}

      <section className="ins-card" aria-label="هر روز">
        <div className="ins-card-h"><b>هر روز</b>
          <span className="ins-legend"><i style={{ background: C.ev }} />رویداد<i style={{ background: C.done }} />کار انجام‌شده<i style={{ background: C.open }} />کار انجام‌نشده</span>
        </div>
        <div className="ins-bars" style={{ gridTemplateColumns: `repeat(${data.perDay.length}, minmax(0, 1fr))` }} onMouseLeave={() => setTip(null)}>
          {data.perDay.map((d) => {
            const total = d.events + d.done + d.open;
            const lbl = `${dayTitle(d.day)}: رویداد ${estLabel(d.events)} · انجام‌شده ${estLabel(d.done)} · انجام‌نشده ${estLabel(d.open)}`;
            return (
              <div key={d.day} className={`ins-col${d.day === data.busiest ? ' top' : ''}`} onMouseEnter={() => setTip(lbl)} title={lbl} aria-label={lbl} role="img">
                <div className="ins-stack" style={{ height: `${(total / max) * 100}%` }}>
                  {d.open > 0 && <span style={{ flexGrow: d.open, background: C.open }} />}
                  {d.done > 0 && <span style={{ flexGrow: d.done, background: C.done }} />}
                  {d.events > 0 && <span style={{ flexGrow: d.events, background: C.ev }} />}
                </div>
                <span className="ins-x">{data.perDay.length > 10 ? fa(toJalali(dd(d.day)).jd) : `${WEEKDAYS_SHORT[weekCol(dd(d.day))]} ${fa(toJalali(dd(d.day)).jd)}`}</span>
              </div>
            );
          })}
        </div>
        <p className="ins-tip" aria-live="polite">{tip ?? (data.busiest ? `شلوغ‌ترین روز: ${dayTitle(data.busiest)}` : 'هنوز چیزی در این بازه ثبت نشده.')}</p>
      </section>

      <div className="ins-two">
        <section className="ins-card" aria-label="کار به تفکیک حوزه">
          <div className="ins-card-h"><b>کار، به تفکیک حوزه</b><span className="ins-legend"><i style={{ background: C.done }} />انجام‌شده<i style={{ background: C.open }} />مانده</span></div>
          {data.byArea.length === 0 && <p className="faint" style={{ fontSize: 12.5 }}>کار زمان‌دار در این بازه نیست.</p>}
          {data.byArea.slice(0, 7).map((a) => (
            <div key={a.area} className="ins-row" title={`${a.area}: ${estLabel(a.done)} از ${estLabel(a.planned)}`}>
              <span className="ins-row-l">{a.area === 'بدون حوزه' ? a.area : `#${a.area}`}</span>
              <span className="ins-row-bar"><span style={{ width: `${(a.planned / tot) * 100}%` }}><i style={{ width: `${(a.done / Math.max(1, a.planned)) * 100}%`, background: C.done }} /><i style={{ flex: 1, background: C.open }} /></span></span>
              <span className="ins-row-v">{estLabel(a.done)} / {estLabel(a.planned)}</span>
            </div>
          ))}
        </section>
        <section className="ins-card" aria-label="رویدادها به تفکیک تقویم">
          <div className="ins-card-h"><b>رویدادها، به تفکیک تقویم</b></div>
          {data.byCal.length === 0 && <p className="faint" style={{ fontSize: 12.5 }}>رویداد زمان‌داری در این بازه نیست.</p>}
          {data.byCal.map((c) => (
            <div key={c.key} className="ins-row">
              <span className="ins-row-l"><i className="ins-dot" style={{ background: c.color }} />{c.name}</span>
              <span className="ins-row-bar"><span style={{ width: `${(c.min / calMax) * 100}%`, background: c.color, opacity: .85 }} /></span>
              <span className="ins-row-v">{estLabel(c.min)}</span>
            </div>
          ))}
          {goals.filter((g) => g.active).length > 0 && (
            <>
              <div className="ins-card-h" style={{ marginTop: 10 }}><b>هدف‌ها در این هفته</b></div>
              {goals.filter((g) => g.active).map((g) => { const pr = goalProgress(g, tasks); return <div key={g.id} className="ins-row"><span className="ins-row-l">{g.title}</span><span className="ins-row-v" style={{ marginInlineStart: 'auto' }}>{fa(pr.done)} از {fa(pr.target)}{pr.streak >= 2 ? ` · ${fa(pr.streak)} هفته پشت سر هم` : ''}</span></div>; })}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
