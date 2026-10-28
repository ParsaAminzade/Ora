// One task in full: when, time, estimate, deadline, repeat, area, steps and notes. Saves as you go.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, type Task } from '../core/db';
import { addDays, dayKey, fa } from '../core/dates';
import { REPEAT_PRESETS } from '../core/recurrence';
import { dayLabel, estLabel, parseTask } from '../core/taskparse';
import { setFocusTask, setTop, today, toggleDone, tomorrow } from '../core/planner';
import { useStore } from '../core/state';
import { TimeInput } from './TimeInput';
import { IconPlus, IconTarget, IconTrash, IconX } from './icons';
import { attachTask } from '../core/projects';
import { taskToEvent } from '../core/calendar-service';
import { loadCoach, patternFrom, remedy } from '../core/coach';
import { reasonLabel } from '../core/review';
import { NONE } from '../core/none';

export const openTaskEditor = (id: string) => dispatchEvent(new CustomEvent('ora:edit-task', { detail: id }));

const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + (m || 0); };
const endOf = (t: Task) => { const e = toMin(t.time!) + (t.len ?? t.est ?? 30); return `${String(Math.floor(e / 60) % 24).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`; };
const nextSat = () => { const d = new Date(); return dayKey(addDays(d, (6 - d.getDay() + 7) % 7 || 7)); };
const thisThu = () => { const d = new Date(); return dayKey(addDays(d, (4 - d.getDay() + 7) % 7)); };

function DayPicker({ value, onChange, label, allowSomeday, someday }: { value?: string; onChange(v: string | undefined, someday?: boolean): void; label: string; allowSomeday?: boolean; someday?: boolean }) {
  const [text, setText] = useState('');
  const opts: [string, string | undefined, boolean?][] = ([['امروز', today()], ['فردا', tomorrow()], ['آخر هفته', thisThu()], ['هفته‌ی بعد', nextSat()]] as [string, string][])
    .filter(([, v], i, a) => a.findIndex(([, w]) => w === v) === i);
  const custom = value && !opts.some(([, v]) => v === value);
  return (
    <div className="te-field">
      <span className="te-label">{label}</span>
      <div className="day-pills">
        {opts.map(([n, v]) => <button key={n} className="pill" aria-pressed={!someday && value === v} onClick={() => onChange(v)}>{n}</button>)}
        {allowSomeday && <button className="pill" aria-pressed={!!someday} onClick={() => onChange(undefined, true)}>بعداً</button>}
        <button className="pill" aria-pressed={!value && !someday} onClick={() => onChange(undefined)}>{allowSomeday ? 'بدون تاریخ' : 'ندارد'}</button>
        {custom && <span className="pill" aria-pressed="true" role="status">{dayLabel(value!)}</span>}
        <input className="te-day-in" value={text} placeholder="یا بنویس: ۲۰ آبان، یکشنبه…" aria-label={`${label}: روز دلخواه`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { const p = parseTask(`x ${text}`); if (p.when) { onChange(p.when); setText(''); } } }}
          onBlur={() => { const p = parseTask(`x ${text}`); if (text && p.when) { onChange(p.when); setText(''); } }} />
      </div>
    </div>
  );
}

function Editor({ id, onClose }: { id: string; onClose(): void }) {
  const t = useLiveQuery(() => db.tasks.get(id).then((x) => x ?? null), [id]);
  const areas = useStore((s) => s.settings.areas);
  const [step, setStep] = useState('');
  const [topFull, setTopFull] = useState(false);
  const projects = (useLiveQuery(() => db.projects.toArray(), []) ?? NONE).filter((p) => p.status !== 'done' || p.id === t?.project);
  const proj = projects.find((p) => p.id === t?.project);
  const [coach, setCoach] = useState<Awaited<ReturnType<typeof loadCoach>> | null>(null);
  useEffect(() => { void loadCoach().then(setCoach); }, []);
  const pattern = t && coach && !t.done ? patternFrom(coach, t, projects) : null;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    addEventListener('keydown', esc, true);
    return () => removeEventListener('keydown', esc, true);
  }, [onClose]);
  useEffect(() => { if (t === null) onClose(); }, [t, onClose]);
  if (!t) return null;
  const up = (p: Partial<Task>) => db.tasks.update(id, p);
  const repKey = t.repeat ? (REPEAT_PRESETS.find((r) => r.rule && r.rule.freq === t.repeat!.freq && r.rule.calendar === t.repeat!.calendar && JSON.stringify([...(r.rule.byWeekday ?? [])].sort()) === JSON.stringify([...(t.repeat!.byWeekday ?? [])].sort()))?.key ?? 'custom') : 'none';

  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="جزئیات کار" className="glass te">
        <div className="te-head">
          <input className="chk" type="checkbox" checked={t.done} onChange={() => void toggleDone(t)} aria-label="انجام شد" />
          <input className="te-title" value={t.title} onChange={(e) => up({ title: e.target.value })} aria-label="عنوان کار" />
          <button className="icon-btn" aria-label="بستن" onClick={onClose}><IconX size={18} /></button>
        </div>

        <div className="te-body scroll">
          <div className="te-toggles">
            <button className="pill" aria-pressed={!!t.top} onClick={async () => { if (!(await setTop(t, !t.top))) { setTopFull(true); window.setTimeout(() => setTopFull(false), 2400); } }}>★ از سه کار مهم امروز</button>
            <button className="pill" aria-pressed={!!t.priority} onClick={() => up({ priority: t.priority ? 0 : 1 })}>مهم</button>
            <button className="pill" onClick={() => { setFocusTask(t.id); dispatchEvent(new Event('ora:focus-start')); onClose(); }}><IconTarget size={13} /> تمرکز روی همین</button>
            <button className="pill" title="یک قرار ثابت در تقویم (کلاس، جلسه)، نه یک کار" onClick={async () => { onClose(); await taskToEvent(t); }}>تبدیل به رویداد</button>
            {topFull && <span className="faint" style={{ fontSize: 12 }}>سه کار مهم امروز پر است.</span>}
          </div>

          <DayPicker label="کِی انجامش می‌دهی؟" value={t.when} someday={t.someday} allowSomeday
            onChange={(v, someday) => up({ when: v, someday: !!someday, top: v === today() ? t.top : false })} />

          {t.time ? (
            // with a start time, the end says how long it is: no separate «how long» question
            <div className="te-field">
              <span className="te-label">زمان</span>
              <div className="te-when">
                <span className="faint">از</span>
                <TimeInput value={t.time} onChange={(v) => up({ time: v, when: t.when ?? today() })} label="ساعت شروع" style={{ width: 88 }} />
                <span className="faint">تا</span>
                <TimeInput value={endOf(t)} label="ساعت پایان" style={{ width: 88 }}
                  onChange={(v) => { const m = toMin(v) - toMin(t.time!); if (m >= 5) up({ est: m, len: m }); }} />
                <span className="faint" style={{ fontSize: 12 }}>{estLabel(t.len ?? t.est ?? 30)}</span>
                <button className="link-btn" onClick={() => up({ time: undefined, fixed: false })}>بدون ساعت</button>
              </div>
            </div>
          ) : (
            <div className="te-row2">
              <div className="te-field">
                <span className="te-label">ساعت شروع</span>
                <TimeInput value="" onChange={(v) => up({ time: v, when: t.when ?? today() })} label="ساعت شروع" style={{ width: 96 }} />
              </div>
              <div className="te-field" style={{ flex: 2 }}>
                <span className="te-label">حدوداً چقدر طول می‌کشد؟</span>
                <div className="day-pills">
                  {[15, 30, 45, 60, 90, 120].map((m) => <button key={m} className="pill" aria-pressed={t.est === m} onClick={() => up({ est: t.est === m ? undefined : m, len: undefined })}>{estLabel(m)}</button>)}
                </div>
              </div>
            </div>
          )}

          <DayPicker label="مهلت (ددلاین واقعی)" value={t.due} onChange={(v) => up({ due: v })} />

          <div className="te-field">
            <span className="te-label">تکرار</span>
            <div className="day-pills">
              {REPEAT_PRESETS.slice(0, 7).map((r) => (
                <button key={r.key} className="pill" aria-pressed={repKey === r.key} onClick={() => up({ repeat: r.rule ?? undefined, when: r.rule ? (t.when ?? today()) : t.when })}>{r.label}</button>
              ))}
            </div>
          </div>

          <div className="te-field">
            <span className="te-label">حوزه</span>
            <div className="day-pills">
              <button className="pill" aria-pressed={!t.area} onClick={() => up({ area: undefined })}>بدون حوزه</button>
              {areas.map((a) => <button key={a} className="pill" aria-pressed={t.area === a} onClick={() => up({ area: a })}>#{a}</button>)}
            </div>
          </div>

          {projects.length > 0 && (
            <div className="te-field">
              <span className="te-label">پروژه</span>
              <div className="day-pills">
                <button className="pill" aria-pressed={!t.project} onClick={() => void attachTask(t.id, undefined)}>بدون پروژه</button>
                {projects.map((p) => <button key={p.id} className="pill" aria-pressed={t.project === p.id} onClick={() => void attachTask(t.id, p.id)}><i className="te-pdot" style={{ background: p.color }} />{p.title}</button>)}
              </div>
              {proj && proj.phases.length > 1 && (
                <div className="day-pills">
                  {proj.phases.map((ph, i) => <button key={ph.id} className="pill pill-xs" aria-pressed={t.phase === ph.id} onClick={() => up({ phase: ph.id })}>{fa(i + 1)}. {ph.title}{ph.done ? ' ✓' : ''}</button>)}
                </div>
              )}
            </div>
          )}

          {pattern && <div className="te-pattern"><b>معمولاً به خاطر «{reasonLabel(pattern.reason)}» عقب می‌افتد.</b> {remedy(pattern.reason, t)}</div>}

          <div className="te-field">
            <span className="te-label">مرحله‌ها {t.steps?.length ? `· ${fa(t.steps.filter((s) => s.done).length)} از ${fa(t.steps.length)}` : ''}</span>
            {(t.steps ?? []).map((s) => (
              <div key={s.id} className="te-step">
                <input className="chk" type="checkbox" checked={s.done} aria-label={s.title} onChange={() => up({ steps: t.steps!.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} />
                <input className="te-step-in" value={s.title} aria-label="عنوان مرحله" onChange={(e) => up({ steps: t.steps!.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })} />
                <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="حذف مرحله" onClick={() => up({ steps: t.steps!.filter((x) => x.id !== s.id) })}><IconX size={13} /></button>
              </div>
            ))}
            <form className="field" style={{ height: 36 }} onSubmit={(e) => { e.preventDefault(); if (step.trim()) { up({ steps: [...(t.steps ?? []), { id: uid(), title: step.trim(), done: false }] }); setStep(''); } }}>
              <IconPlus size={15} className="ico faint" />
              <input value={step} onChange={(e) => setStep(e.target.value)} placeholder="مرحله‌ی بعدی… (کار بزرگ را خرد کن)" aria-label="مرحله‌ی تازه" />
            </form>
          </div>

          <div className="te-field">
            <span className="te-label">یادداشت</span>
            <textarea className="te-notes" value={t.notes ?? ''} onChange={(e) => up({ notes: e.target.value })} rows={3} placeholder="جزئیات، لینک، اولین قدم…" aria-label="یادداشت کار" />
          </div>
        </div>

        <div className="te-foot">
          <span className="faint" style={{ fontSize: 12 }}>
            {t.spent ? `${fa(t.spent)} دقیقه تمرکز · ` : ''}{(t.slips ?? 0) > 0 ? `${fa(t.slips!)} بار عقب افتاده · ` : ''}ساخته‌شده {dayLabel(dayKey(new Date(t.createdAt)))}
          </span>
          <button className="btn" style={{ color: 'var(--danger)', border: 0 }} onClick={() => { void db.tasks.delete(id); onClose(); }}><IconTrash size={15} />حذف</button>
        </div>
      </div>
    </div>
  );
}

export function TaskEditorHost() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const open = (e: Event) => setId((e as CustomEvent<string>).detail);
    addEventListener('ora:edit-task', open);
    return () => removeEventListener('ora:edit-task', open);
  }, []);
  return id ? createPortal(<Editor id={id} onClose={() => setId(null)} />, document.body) : null;
}
