// The daily ritual. Morning: deal with what slipped, choose today's top three, check the
// estimates against the hours you really have, and (optionally) give each task a time.
// Evening: see what got done, and decide where the rest goes, so tomorrow starts clean.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Task } from '../core/db';
import { fa, formatJalaliLong } from '../core/dates';
import { byPlan, isInbox, isOverdue, isToday, load, plannerOf, reschedule, ritualDone, setTop, timeBlock, today, tomorrow } from '../core/planner';
import { dayLabel, estLabel } from '../core/taskparse';
import { addEvent } from '../core/calendar-service';
import { useStore } from '../core/state';
import { TimeInput } from './TimeInput';
import { IconStar, IconX } from './icons';
import { loadCoach, patternFrom, remedy } from '../core/coach';
import { reasonLabel } from '../core/review';
import { NONE } from '../core/none';

type Step = 'slipped' | 'choose' | 'time' | 'shutdown';

const nowHM = () => { const d = new Date(Date.now() + 10 * 60_000); const m = Math.ceil(d.getMinutes() / 15) * 15; d.setMinutes(m, 0, 0); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function Est({ t }: { t: Task }) {
  return (
    <span className="pl-est">
      {[15, 30, 60, 90].map((m) => <button key={m} className="pill pill-xs" aria-pressed={t.est === m} onClick={() => db.tasks.update(t.id, { est: t.est === m ? undefined : m })}>{estLabel(m)}</button>)}
    </span>
  );
}

function Planner({ start, onClose }: { start: 'plan' | 'shutdown'; onClose(): void }) {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? NONE;
  const d = today();
  const slipped = tasks.filter((t) => isOverdue(t, d) && !t.top).sort(byPlan);
  const [step, setStep] = useState<Step>(start === 'shutdown' ? 'shutdown' : 'slipped');
  const [hours, setHours] = useState(plannerOf().hours);
  const [from, setFrom] = useState(nowHM());
  const [toCal, setToCal] = useState(false);
  const [msg, setMsg] = useState('');
  const setSettings = useStore((s) => s.setSettings);
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? NONE;
  const [coach, setCoach] = useState<Awaited<ReturnType<typeof loadCoach>> | null>(null);
  useEffect(() => { void loadCoach().then(setCoach); }, []);

  useEffect(() => { if (step === 'slipped' && tasks.length && !slipped.length) setStep('choose'); }, [step, tasks.length, slipped.length]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    addEventListener('keydown', esc, true);
    return () => removeEventListener('keydown', esc, true);
  }, [onClose]);

  const todayOpen = tasks.filter((t) => isToday(t, d)).sort(byPlan);
  const inbox = tasks.filter(isInbox).sort(byPlan);
  const tops = tasks.filter((t) => !t.done && t.top).length;
  const cap = { ...load(tasks, d), capacity: hours * 60 };
  const over = cap.buffered - cap.capacity;
  const doneToday = tasks.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toDateString() === new Date().toDateString());
  const leftToday = tasks.filter((t) => isToday(t, d));

  const finish = (kind: 'morning' | 'evening') => { ritualDone(kind); onClose(); };
  const steps: [Step, string][] = start === 'shutdown' ? [['shutdown', 'جمع‌بندی']] : [['slipped', 'عقب‌مانده‌ها'], ['choose', 'انتخاب'], ['time', 'زمان']];

  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={start === 'shutdown' ? 'جمع‌بندی امروز' : 'برنامه‌ریزی امروز'} className="glass pl">
        <div className="pl-head">
          <div style={{ flex: 1 }}>
            <h2>{start === 'shutdown' ? 'جمع‌بندی امروز' : 'برنامه‌ی امروز'}</h2>
            <span className="faint" style={{ fontSize: 12 }}>{formatJalaliLong(new Date())}</span>
          </div>
          {steps.length > 1 && (
            <ol className="pl-steps">
              {steps.map(([k, n], i) => <li key={k} aria-current={step === k}><button onClick={() => setStep(k)}>{fa(i + 1)} · {n}</button></li>)}
            </ol>
          )}
          <button className="icon-btn" aria-label="بستن" onClick={onClose}><IconX size={18} /></button>
        </div>

        <div className="pl-body scroll">
          {step === 'slipped' && (
            <>
              <p className="pl-lead">{fa(slipped.length)} کار از روزهای قبل مانده. برای هرکدام تصمیم بگیر؛ کاری که بی‌صدا عقب می‌افتد، فقط سنگین‌تر می‌شود.</p>
              {slipped.map((t) => (
                <div key={t.id} className="pl-row">
                  <span className="pl-title">{t.title}<span className="faint"> · {dayLabel(t.when!)}{(t.slips ?? 0) >= 2 ? ` · ${fa(t.slips!)} بار عقب افتاده` : ''}</span></span>
                  <span className="pl-acts">
                    <button className="btn btn-sm" onClick={() => reschedule(t, d)}>امروز</button>
                    <button className="btn btn-sm" onClick={() => reschedule(t, tomorrow())}>فردا</button>
                    <button className="btn btn-sm" onClick={() => reschedule(t, undefined, { someday: true })}>بعداً</button>
                    <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => db.tasks.delete(t.id)}>حذف</button>
                  </span>
                </div>
              ))}
              {slipped.length > 1 && <button className="link-btn" onClick={() => Promise.all(slipped.map((t) => reschedule(t, d)))}>همه برای امروز</button>}
            </>
          )}

          {step === 'choose' && (
            <>
              <p className="pl-lead">کدام سه کار، اگر امروز انجام شوند، امروز را روز خوبی می‌کنند؟ ستاره بزن ({fa(tops)} از ۳). برای هر کار هم حدس بزن چقدر طول می‌کشد.</p>
              {todayOpen.length === 0 && inbox.length === 0 && <p className="faint">هنوز کاری برای امروز نیست. از ویجت تسک‌ها بنویس.</p>}
              {todayOpen.map((t) => (
                <div key={t.id} className="pl-row">
                  <button aria-pressed={!!t.top} aria-label={t.top ? 'برداشتن ستاره' : 'ستاره: از سه کار مهم'} onClick={() => setTop(t, !t.top)} className={`icon-btn${t.top ? ' star-on' : ''}`}><IconStar size={16} /></button>
                  <span className="pl-title">{t.title}{t.time ? <span className="faint"> · {fa(t.time)}</span> : null}
                    {(() => { const pat = coach ? patternFrom(coach, t, projects) : null; return pat ? <span className="rv-pat" style={{ display: 'block' }} title={remedy(pat.reason, t)}>معمولاً به خاطر «{reasonLabel(pat.reason)}» عقب می‌افتد</span> : null; })()}</span>
                  <Est t={t} />
                </div>
              ))}
              {inbox.length > 0 && (
                <>
                  <h3 className="pl-sub">کارهای بی‌تاریخ · برای امروز؟</h3>
                  {inbox.slice(0, 12).map((t) => (
                    <div key={t.id} className="pl-row">
                      <span className="pl-title">{t.title}</span>
                      <span className="pl-acts">
                        <button className="btn btn-sm" onClick={() => reschedule(t, d)}>امروز</button>
                        <button className="btn btn-sm" onClick={() => reschedule(t, tomorrow())}>فردا</button>
                        <button className="btn btn-sm" onClick={() => reschedule(t, undefined, { someday: true })}>بعداً</button>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {step === 'time' && (
            <>
              <label className="set-slider">
                <span className="set-slider-top"><span>امروز چند ساعت برای این کارها وقت داری؟</span><span className="set-val">{fa(hours)} ساعت</span></span>
                <input type="range" min={1} max={12} value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ '--p': `${((hours - 1) / 11) * 100}%` } as React.CSSProperties} />
              </label>
              <div className={`pl-cap${over > 0 ? ' over' : ''}`}>
                <div className="pl-cap-bar"><span style={{ width: `${Math.min(100, (cap.buffered / Math.max(1, cap.capacity)) * 100)}%` }} /></div>
                <span>{estLabel(cap.buffered)} کار (با {fa(Math.round((plannerOf().buffer - 1) * 100))}٪ حاشیه) برای {estLabel(cap.capacity)} وقت{cap.missing ? ` · ${fa(cap.missing)} کار بدون برآورد` : ''}</span>
              </div>
              {over > 0 && (
                <>
                  <p className="pl-lead warn">حدود {estLabel(over)} بیشتر از وقتت برنامه چیده‌ای. کارها معمولاً بیشتر از حدسمان طول می‌کشند؛ بهتر است چند تا را از همین الان به فردا بفرستی:</p>
                  {todayOpen.filter((t) => !t.top).sort((a, b) => a.priority - b.priority || (b.est ?? 0) - (a.est ?? 0)).slice(0, 4).map((t) => (
                    <div key={t.id} className="pl-row">
                      <span className="pl-title">{t.title}{t.est ? <span className="faint"> · {estLabel(t.est)}</span> : null}</span>
                      <span className="pl-acts"><button className="btn btn-sm" onClick={() => reschedule(t, tomorrow())}>فردا</button></span>
                    </div>
                  ))}
                </>
              )}
              <h3 className="pl-sub">به هر کار یک ساعت بده (اختیاری)</h3>
              <p className="faint" style={{ margin: 0, fontSize: 12, lineHeight: 1.8 }}>کارهای بی‌ساعت از ساعت شروع، یکی پس از دیگری و با ده دقیقه فاصله چیده می‌شوند. کاری که خودت ساعتش را گذاشته‌ای جابه‌جا نمی‌شود.</p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="muted" style={{ fontSize: 13 }}>از ساعت</span>
                <TimeInput value={from} onChange={setFrom} label="ساعت شروع چیدن" style={{ width: 96 }} />
                <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input className="chk" type="checkbox" checked={toCal} onChange={(e) => setToCal(e.target.checked)} />در تقویم هم ثبت شود</label>
                <button className="btn" onClick={async () => {
                  const n = await timeBlock(todayOpen, from);
                  if (toCal) {
                    const fresh = await db.tasks.bulkGet(todayOpen.map((t) => t.id));
                    for (const t of fresh) if (t?.time) await addEvent(d, `${t.time} ${t.title}`);
                  }
                  setMsg(n ? `${fa(n)} کار زمان‌بندی شد.` : 'همه‌ی کارها ساعت داشتند.');
                }}>بچین</button>
              </div>
              {msg && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{msg}</span>}
            </>
          )}

          {step === 'shutdown' && (
            <>
              <p className="pl-lead">{doneToday.length ? `امروز ${fa(doneToday.length)} کار را تمام کردی.` : 'امروز کاری تیک نخورد؛ اشکالی ندارد، فردا از کوچک‌ترینش شروع کن.'}</p>
              {doneToday.slice(0, 8).map((t) => <div key={t.id} className="pl-row done"><span className="pl-title">✓ {t.title}</span></div>)}
              {leftToday.length > 0 && (
                <>
                  <h3 className="pl-sub">مانده‌ها کجا بروند؟</h3>
                  {leftToday.map((t) => (
                    <div key={t.id} className="pl-row">
                      <span className="pl-title">{t.title}</span>
                      <span className="pl-acts">
                        <button className="btn btn-sm" onClick={() => reschedule(t, tomorrow())}>فردا</button>
                        <button className="btn btn-sm" onClick={() => reschedule(t, undefined, { someday: true })}>بعداً</button>
                        <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => db.tasks.delete(t.id)}>حذف</button>
                      </span>
                    </div>
                  ))}
                  <button className="link-btn" onClick={() => Promise.all(leftToday.map((t) => reschedule(t, tomorrow())))}>همه برای فردا</button>
                </>
              )}
            </>
          )}
        </div>

        <div className="pl-foot">
          {step === 'slipped' && <button className="btn btn-accent" onClick={() => setStep('choose')}>بعدی</button>}
          {step === 'choose' && <button className="btn btn-accent" onClick={() => setStep('time')}>بعدی</button>}
          {step === 'time' && <button className="btn btn-accent" onClick={() => { setSettings({ planner: { ...plannerOf(), hours } }); finish('morning'); }}>برنامه آماده است</button>}
          {step === 'shutdown' && <button className="btn btn-accent" onClick={() => finish('evening')}>روز را ببند</button>}
          <button className="btn" style={{ border: 0 }} onClick={onClose}>بعداً</button>
        </div>
      </div>
    </div>
  );
}

export function PlannerHost() {
  const [open, setOpen] = useState<'plan' | 'shutdown' | null>(null);
  useEffect(() => {
    // the evening shutdown is now the full day review
    const go = (e: Event) => { const d = (e as CustomEvent<'plan' | 'shutdown'>).detail ?? 'plan'; if (d === 'shutdown') dispatchEvent(new CustomEvent('ora:review')); else setOpen(d); };
    addEventListener('ora:planner', go);
    return () => removeEventListener('ora:planner', go);
  }, []);
  return open ? createPortal(<Planner start={open} onClose={() => setOpen(null)} />, document.body) : null;
}
