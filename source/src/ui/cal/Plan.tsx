// The planning side of the calendar: the honest report (how heavy, how much rest, which deadlines
// are at risk) and the step-by-step planner that places your tasks into free time.
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CalEvent, type Task } from '../../core/db';
import { addDays, dayKey, fa, WEEKDAYS_FULL } from '../../core/dates';
import { localCalendar } from '../../core/providers/calendar';
import { addParsed, plannerOf, setTop, today, type PlannerSettings } from '../../core/planner';
import { parseTask, estLabel, dayLabel } from '../../core/taskparse';
import { applyPlan, autoPlan, blocksFor, loadStats, report, toMin, verdictText, type Block, type Plan, type Stats } from '../../core/schedule';
import { useStore } from '../../core/state';
import { withUndo } from '../../core/undo';
import { TimeInput } from '../TimeInput';
import { IconFlag, IconPlus, IconStar } from '../icons';
import { TimeGrid } from './TimeGrid';
import { NONE } from '../../core/none';

type Scope = 'day' | 'tomorrow' | 'week';

export function ReportCard({ tasks, events, stats, scope, breaks, from }: { tasks: Task[]; events: CalEvent[]; stats: Stats; scope: 'day' | 'week'; breaks?: Record<string, [number, number][]>; from?: string }) {
  const p = plannerOf();
  const r = report({ tasks, events, settings: p, stats, now: new Date(), scope, breaks, history: tasks, from });
  const span = scope === 'week' ? 'این هفته' : !from || from === today() ? 'امروز' : dayLabel(from);
  const pct = Math.round(r.load * 100);
  return (
    <div className="sch-report">
      <div className={`sch-load v-${r.verdict}`}>
        <div className="pl-cap-bar"><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
        <span>{verdictText(r, scope, span)}</span>
      </div>
      <div className="sch-kv"><span>استراحت لازم</span><b>{estLabel(r.restNeed)}{r.restMin ? ` · در برنامه: ${estLabel(r.restMin)}` : ''}</b></div>
      <p className="faint sch-note">برای هر ساعت کار متمرکز حدود ده دقیقه استراحت کوتاه، و بعد از هر دو ساعت یک استراحت بلندتر. ذهن بعد از حدود ۹۰ دقیقه تمرکز افت می‌کند.</p>
      {r.risks.map((x) => <div key={x.title} className="sch-risk">به «{x.title}» تا {dayLabel(x.due)} نمی‌رسی؛ حدود {estLabel(x.shortMin)} کم داری. یا مهلت را جابه‌جا کن، یا کارهای کم‌اهمیت‌تر را بردار.</div>)}
      {r.pace && <div className="sch-kv"><span>هفته‌ی گذشته</span><b>{fa(r.pace.done)} از {fa(r.pace.planned)} کار برنامه‌ریزی‌شده انجام شد</b></div>}
      {r.insights.map((x) => <div key={x} className="sch-insight">{x}</div>)}
      {!r.insights.length && <p className="faint sch-note">هرچه بیشتر از برنامه استفاده کنی، اورآ یاد می‌گیرد هر نوع کار واقعاً چقدر برایت طول می‌کشد و کِی بهتر کار می‌کنی؛ برنامه‌ها دقیق‌تر می‌شوند.</p>}
    </div>
  );
}

export function Wizard({ onDone, onCancel }: { onDone(view: 'day' | 'week', start: string): void; onCancel(): void }) {
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState<Scope>('day');
  const [draft, setDraft] = useState('');
  const saved = useStore((s) => s.settings.planner);
  const setSettings = useStore((s) => s.setSettings);
  const p: PlannerSettings = { ...plannerOf(), ...saved };
  const set = (x: Partial<PlannerSettings>) => setSettings({ planner: { ...p, ...x } });
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? NONE;
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  useEffect(() => { void loadStats().then(setStats); void localCalendar.list(today(), dayKey(addDays(new Date(), 8))).then(setEvents); }, []);
  const d0 = today();
  const firstDay = scope === 'tomorrow' ? dayKey(addDays(new Date(), 1)) : d0;
  const lastDay = scope === 'week' ? dayKey(addDays(new Date(), 6)) : firstDay;
  const cands = tasks.filter((t) => !t.done && !t.someday && (scope === 'week' ? (!t.when || t.when <= lastDay || (t.due && t.due <= lastDay)) : (t.when ? t.when <= firstDay : !!t.top)));
  const plan: Plan | null = useMemo(() => (step === 3 && stats ? autoPlan({ tasks, events, settings: p, stats, now: new Date(), scope }) : null), [step, stats, tasks, events, scope, saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = ['برای کی؟', 'روزت چطور است؟', 'چه کارهایی؟', 'پیش‌نمایش'];
  const previewDays = scope === 'week' ? Array.from({ length: 7 }, (_, i) => dayKey(addDays(new Date(), i))).filter((k) => !p.daysOff.includes(new Date(`${k}T12:00`).getDay())) : [firstDay];
  const previewData = useMemo(() => {
    const m = new Map<string, Block[]>();
    if (!plan || !stats) return m;
    const placed = new Map(plan.placements.map((x) => [x.taskId, x]));
    const moved = tasks.map((t) => (placed.has(t.id) ? { ...t, when: placed.get(t.id)!.when, time: placed.get(t.id)!.time } : (cands.some((c) => c.id === t.id) && !t.fixed ? { ...t, time: undefined } : t)));
    for (const d of previewDays) m.set(d, blocksFor(d, moved, events, plan.breaks[d] ?? [], stats));
    return m;
  }, [plan, stats]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="wz">
      <ol className="pl-steps wz-steps">{steps.map((n, i) => <li key={n} aria-current={i === step}><button onClick={() => setStep(i)}>{fa(i + 1)} · {n}</button></li>)}</ol>
      <div className="wz-body scroll">
        {step === 0 && (
          <>
            <p className="pl-lead">این برنامه برای چه بازه‌ای است؟</p>
            <div className="wz-cards">
              {([['day', 'امروز', 'از همین الان تا آخر امروز'], ['tomorrow', 'فردا', 'شب قبل بچین، صبح فقط شروع کن'], ['week', 'این هفته', 'هفت روز آینده؛ کارهای مهلت‌دار اول']] as const).map(([k, n, h]) => (
                <button key={k} className="wz-card" aria-pressed={scope === k} onClick={() => setScope(k)}><b>{n}</b><span>{h}</span></button>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <p className="pl-lead">کارها فقط در این بازه‌ی روز چیده می‌شوند، با استراحت‌هایی که ریتم تو می‌خواهد.</p>
            <div className="wz-row"><span>روز کاری از</span><TimeInput value={p.dayStart} onChange={(v) => set({ dayStart: v })} label="شروع روز" style={{ width: 90 }} /><span>تا</span><TimeInput value={p.dayEnd} onChange={(v) => set({ dayEnd: v })} label="پایان روز" style={{ width: 90 }} /></div>
            {scope === 'week' && (
              <div className="te-field"><span className="te-label">روزهای بدون کار</span>
                <div className="day-pills">{[6, 0, 1, 2, 3, 4, 5].map((g) => <button key={g} className="pill" aria-pressed={p.daysOff.includes(g)} onClick={() => set({ daysOff: p.daysOff.includes(g) ? p.daysOff.filter((x) => x !== g) : [...p.daysOff, g] })}>{WEEKDAYS_FULL[(g + 1) % 7]}</button>)}</div>
              </div>
            )}
            <div className="te-field"><span className="te-label">ریتم کار</span>
              <div className="day-pills">{([[25, '۲۵ دقیقه کار، ۵ استراحت'], [50, '۵۰ کار، ۱۰ استراحت'], [90, '۹۰ کار، ۲۰ استراحت']] as const).map(([v, n]) => <button key={v} className="pill" aria-pressed={p.focus === v} onClick={() => set({ focus: v })}>{n}</button>)}</div>
            </div>
            <label className="set-slider"><span className="set-slider-top"><span>حداکثر کار متمرکز در روز</span><span className="set-val">{fa(p.hours)} ساعت</span></span>
              <input type="range" min={1} max={12} value={p.hours} onChange={(e) => set({ hours: Number(e.target.value) })} style={{ '--p': `${((p.hours - 1) / 11) * 100}%` } as React.CSSProperties} /></label>
            <div className="te-field"><span className="te-label">کارهای مهم کِی چیده شوند؟</span>
              <div className="day-pills">{([['auto', `خودکار${stats && stats.peakN >= 10 ? ` (الان: ${{ morning: 'صبح', afternoon: 'بعدازظهر', evening: 'عصر' }[stats.peak]})` : ''}`], ['morning', 'صبح'], ['afternoon', 'بعدازظهر'], ['evening', 'عصر و شب']] as const).map(([v, n]) => <button key={v} className="pill" aria-pressed={p.peak === v} onClick={() => set({ peak: v })}>{n}</button>)}</div>
              <span className="faint" style={{ fontSize: 12 }}>«خودکار» از روی اینکه واقعاً چه ساعت‌هایی کارهایت را تمام می‌کنی یاد می‌گیرد.</span>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <p className="pl-lead">برای هر کار حدس بزن چقدر طول می‌کشد و مهم‌ها را مشخص کن. کاری که ساعتش ثابت است (کلاس، جلسه) جابه‌جا نمی‌شود.</p>
            {cands.length === 0 && <p className="faint">کاری در این بازه نیست. از پایین اضافه کن.</p>}
            {cands.sort((a, b) => Number(!!b.top) - Number(!!a.top) || b.priority - a.priority).map((t) => (
              <div key={t.id} className="pl-row wz-task">
                <button className={`icon-btn${t.top ? ' star-on' : ''}`} aria-label="سه کار مهم" aria-pressed={!!t.top} onClick={() => setTop(t, !t.top)}><IconStar size={15} /></button>
                <button className="icon-btn" aria-label="مهم" aria-pressed={!!t.priority} style={{ color: t.priority ? 'var(--danger)' : undefined }} onClick={() => db.tasks.update(t.id, { priority: t.priority ? 0 : 1 })}><IconFlag size={15} /></button>
                <span className="pl-title">{t.title}{t.due ? <span className="faint"> · مهلت {dayLabel(t.due)}</span> : null}{t.fixed && t.time ? <span className="faint"> · ثابت {fa(t.time)}</span> : null}</span>
                <span className="pl-est">{[15, 30, 60, 90, 120].map((m) => <button key={m} className="pill pill-xs" aria-pressed={t.est === m} onClick={() => db.tasks.update(t.id, { est: m, len: undefined })}>{estLabel(m)}</button>)}</span>
                {t.time && <button className="pill pill-xs" aria-pressed={!!t.fixed} title="این ساعت جابه‌جا نشود" onClick={() => db.tasks.update(t.id, { fixed: !t.fixed })}>ساعت ثابت</button>}
              </div>
            ))}
            <form className="field" onSubmit={async (e) => { e.preventDefault(); if (!draft.trim()) return; const pr = parseTask(draft); if (!pr.when && scope !== 'week') pr.when = firstDay; await addParsed(pr); setDraft(''); }}>
              <IconPlus size={16} className="ico faint" />
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="کار تازه، مثلاً «ساعت ۱۰ کلاس ۹۰ دقیقه» یا «ورزش ۴۵ دقیقه»" aria-label="کار تازه برای برنامه" />
            </form>
          </>
        )}
        {step === 3 && plan && stats && (
          <div className="wz-preview">
            <TimeGrid days={previewDays} blocks={previewData} allDay={[]} holidays={new Map()} window={[toMin(p.dayStart), toMin(p.dayEnd)]} readOnly ghostIds={new Set(plan.placements.map((x) => x.taskId))} />
            <div className="wz-side scroll">
              <ReportCard tasks={tasks.map((t) => { const x = plan.placements.find((y) => y.taskId === t.id); return x ? { ...t, when: x.when, time: x.time } : t; })} events={events} stats={stats} scope={scope === 'week' ? 'week' : 'day'} breaks={plan.breaks} from={firstDay} />
              {plan.unplaced.length > 0 && (
                <div className="sch-risk">جا نشد: {plan.unplaced.map((x) => `«${x.title}» (${x.why})`).join('، ')}. ساعت روزت را بیشتر کن، کاری را کوچک‌تر کن، یا برایش روز دیگری بگذار.</div>
              )}
              <span className="faint" style={{ fontSize: 12 }}>{fa(plan.placements.length)} کار چیده شد · زمان‌ها با برآورد شخصی خودت حساب شده‌اند.</span>
            </div>
          </div>
        )}
      </div>
      <div className="pl-foot">
        {step < 3 && <button className="btn btn-accent" onClick={() => setStep(step + 1)}>بعدی</button>}
        {step === 3 && plan && <button className="btn btn-accent" onClick={async () => { await withUndo('برنامه چیده شد', () => applyPlan(plan)); onDone(scope === 'week' ? 'week' : 'day', firstDay); }}>اعمال برنامه</button>}
        {step > 0 && <button className="btn" style={{ border: 0 }} onClick={() => setStep(step - 1)}>قبلی</button>}
        <button className="btn" style={{ border: 0, marginInlineStart: 'auto' }} onClick={onCancel}>انصراف</button>
      </div>
    </div>
  );
}
