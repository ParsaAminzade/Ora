// «جمع‌بندی روز»: how far each of today's priorities got, why the unfinished ones didn't finish,
// the day's score (with how it was computed), Ora's word, and where the rest goes tomorrow.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, type DayReview, type Reason, type Task } from '../core/db';
import { fa, formatJalaliLong } from '../core/dates';
import { isToday, reschedule, ritualDone, today, tomorrow } from '../core/planner';
import { computeScore, defaultItems, LEVELS, REASONS, reasonLabel, recentReviews, saveReview, VERDICT, type Item } from '../core/review';
import { learnReasons, loadCoach, patternFrom, pickStyle, rateStyle, remedy, reviewMessage, STYLE_LABEL, type Style } from '../core/coach';
import { estLabel } from '../core/taskparse';
import { openProjects } from '../core/projects';
import { IconChevronL, IconChevronR, IconX } from './icons';
import { NONE } from '../core/none';

type Step = 'items' | 'why' | 'score' | 'tomorrow';
export const openReview = () => dispatchEvent(new CustomEvent('ora:review'));

function Review({ onClose }: { onClose(): void }) {
  const d = today();
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? NONE;
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? NONE;
  const saved = useLiveQuery(() => db.reviews.get(d).then((x) => x ?? null), [d]);
  const [items, setItems] = useState<Item[] | null>(null);
  const [extra, setExtra] = useState<{ title: string; minutes: number }[]>([]);
  const [xTitle, setXTitle] = useState('');
  const [xMin, setXMin] = useState(30);
  const [step, setStep] = useState<Step>('items');
  const [energy, setEnergy] = useState<number | undefined>();
  const [style, setStyle] = useState<Style>('data');
  const [rated, setRated] = useState(false);
  const [trend, setTrend] = useState<{ list: DayReview[]; avg: number | null; streak: number } | null>(null);
  const [coach, setCoach] = useState<Awaited<ReturnType<typeof loadCoach>> | null>(null);
  const [firstStep, setFirstStep] = useState<Record<string, string>>({});
  useEffect(() => { void loadCoach().then(setCoach); void pickStyle('review').then(setStyle); void recentReviews().then(setTrend); }, []);
  useEffect(() => {
    if (items || saved === undefined || !tasks.length) return;
    if (saved) { setItems(saved.items); setExtra(saved.extra ?? []); setEnergy(saved.energy); }
    else setItems(defaultItems(tasks, d));
  }, [saved, tasks, items, d]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[aria-label="جزئیات کار"]')) { e.stopPropagation(); onClose(); } };
    addEventListener('keydown', esc, true);
    return () => removeEventListener('keydown', esc, true);
  }, [onClose]);

  const list = items ?? [];
  const sc = useMemo(() => computeScore(list, tasks, extra, d), [list, tasks, extra, d]);
  const set = (id: string, p: Partial<Item>) => setItems(list.map((x) => (x.taskId === id ? { ...x, ...p } : x)));
  const move = (i: number, dir: -1 | 1) => { const a = [...list].sort((x, y) => x.rank - y.rank); const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setItems(a.map((x, k) => ({ ...x, rank: k + 1 }))); };
  const ranked = [...list].sort((a, b) => a.rank - b.rank);
  const unfinished = ranked.filter((x) => x.level < 4 && x.reason !== 'priority');
  const candidates = tasks.filter((t) => (isToday(t, d) || t.when === d) && !list.some((x) => x.taskId === t.id) && !t.goal);
  const leftovers = tasks.filter((t) => isToday(t, d) && !t.done && !list.some((x) => x.taskId === t.id && x.level === 4));

  const finishScore = async () => {
    const r: DayReview = { day: d, items: list, extra, score: sc.score, parts: sc.parts, energy, at: Date.now() };
    await saveReview(r);
    if (!saved) await learnReasons(list);
    ritualDone('evening');
    setStep('tomorrow');
  };
  const msg = reviewMessage(style, { score: sc.score, verdict: VERDICT[sc.verdict], over: sc.over }, ranked, (trend?.streak ?? 0) + (sc.score >= 60 && !saved ? 1 : 0), trend?.avg ?? null);
  const steps: [Step, string][] = [['items', 'اولویت‌ها'], ['why', 'چرا؟'], ['score', 'نمره'], ['tomorrow', 'فردا']];

  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="جمع‌بندی روز" className="glass pl rv">
        <div className="pl-head">
          <div style={{ flex: 1 }}>
            <h2>جمع‌بندی روز</h2>
            <span className="faint" style={{ fontSize: 12 }}>{formatJalaliLong(new Date())}</span>
          </div>
          <ol className="pl-steps">{steps.map(([k, n], i) => <li key={k} aria-current={step === k}><button onClick={() => setStep(k)} disabled={k === 'tomorrow' && step !== 'tomorrow'}>{fa(i + 1)} · {n}</button></li>)}</ol>
          <button className="icon-btn" aria-label="بستن" onClick={onClose}><IconX size={18} /></button>
        </div>

        <div className="pl-body scroll">
          {step === 'items' && (
            <>
              <p className="pl-lead">هر اولویت امروز تا کجا جلو رفت؟ ترتیب مهم است: اولی مهم‌ترین. اگر کاری را آگاهانه کنار گذاشتی، «اولویتم عوض شد» را بزن تا شکست حساب نشود.</p>
              {!ranked.length && <p className="faint">برای امروز اولویتی ثبت نشده. از پایین یکی اضافه کن، یا فقط کارهای پیش‌بینی‌نشده را بنویس.</p>}
              {ranked.map((x, i) => (
                <div key={x.taskId} className={`rv-item${x.reason === 'priority' ? ' off' : ''}`}>
                  <div className="rv-top">
                    <span className="rv-rank">{fa(i + 1)}</span>
                    <span className="rv-title">{x.title}</span>
                    <span className="rv-move">
                      <button className="icon-btn" aria-label={`بالاتر: ${x.title}`} disabled={i === 0} onClick={() => move(i, -1)}><IconChevronR size={14} style={{ transform: 'rotate(-90deg)' }} /></button>
                      <button className="icon-btn" aria-label={`پایین‌تر: ${x.title}`} disabled={i === ranked.length - 1} onClick={() => move(i, 1)}><IconChevronL size={14} style={{ transform: 'rotate(-90deg)' }} /></button>
                      <button className="icon-btn" aria-label={`برداشتن ${x.title} از اولویت‌ها`} onClick={() => setItems(list.filter((y) => y.taskId !== x.taskId).sort((a, b) => a.rank - b.rank).map((y, k) => ({ ...y, rank: k + 1 })))}><IconX size={13} /></button>
                    </span>
                  </div>
                  <div className="rv-levels" role="radiogroup" aria-label={`${x.title}: تا کجا؟`}>
                    {LEVELS.map(([v, n]) => <button key={v} role="radio" aria-checked={x.level === v && x.reason !== 'priority'} className={`rv-lv lv-${v}`} onClick={() => set(x.taskId, { level: v, reason: x.reason === 'priority' ? undefined : v === 4 ? undefined : x.reason })}>{n}</button>)}
                    <button role="radio" aria-checked={x.reason === 'priority'} className="rv-lv lv-off" onClick={() => set(x.taskId, { reason: x.reason === 'priority' ? undefined : 'priority' })}>اولویتم عوض شد</button>
                  </div>
                </div>
              ))}
              {ranked.length < 5 && candidates.length > 0 && (
                <div className="rv-add">
                  <span className="te-label">یک اولویت دیگر:</span>
                  <div className="day-pills">{candidates.slice(0, 8).map((t) => <button key={t.id} className="pill pill-xs" onClick={() => setItems([...list, { taskId: t.id, title: t.title, rank: list.length + 1, level: t.done ? 4 : 0, area: t.area, project: t.project }])}>+ {t.title}</button>)}</div>
                </div>
              )}
              <div className="rv-add">
                <span className="te-label">کار پیش‌بینی‌نشده‌ای هم کردی؟ (در نمره‌ی «حضور» حساب می‌شود)</span>
                {extra.map((x, i) => <div key={i} className="rv-extra"><span>{x.title} · {estLabel(x.minutes)}</span><button className="icon-btn" aria-label="حذف" onClick={() => setExtra(extra.filter((_, j) => j !== i))}><IconX size={13} /></button></div>)}
                <form className="rv-extra-f" onSubmit={(e) => { e.preventDefault(); if (xTitle.trim()) { setExtra([...extra, { title: xTitle.trim(), minutes: xMin }]); setXTitle(''); } }}>
                  <input className="ev-input" value={xTitle} onChange={(e) => setXTitle(e.target.value)} placeholder="مثلاً «جواب فوری به استاد»" aria-label="کار پیش‌بینی‌نشده" />
                  <div className="seg seg-sm">{[15, 30, 60, 120].map((m) => <button key={m} type="button" aria-checked={xMin === m} onClick={() => setXMin(m)}>{estLabel(m)}</button>)}</div>
                  <button className="btn btn-sm" type="submit">افزودن</button>
                </form>
              </div>
            </>
          )}

          {step === 'why' && (
            <>
              {!unfinished.length ? <p className="pl-lead">همه‌ی اولویت‌ها کامل شد. چیزی برای پرسیدن نیست 🙂</p> : <p className="pl-lead">چرا این‌ها کامل نشد؟ صادقانه و با یک کلیک. از همین جواب‌ها یاد می‌گیرم دفعه‌ی بعد چه بگویم.</p>}
              {unfinished.map((x) => {
                const pat = coach ? patternFrom(coach, { id: x.taskId, title: x.title, area: x.area, project: x.project }, projects) : null;
                return (
                  <div key={x.taskId} className="rv-item">
                    <div className="rv-top"><span className="rv-title">{x.title}</span><span className="faint" style={{ fontSize: 12 }}>{LEVELS[x.level][1]}</span></div>
                    {pat && <span className="rv-pat">قبلاً هم {pat.scope} {fa(pat.count)} بار به خاطر «{reasonLabel(pat.reason)}» عقب افتاده.</span>}
                    <div className="day-pills">{REASONS.filter(([k]) => k !== 'priority').map(([k, n]) => <button key={k} className="pill pill-xs" aria-pressed={x.reason === k} onClick={() => set(x.taskId, { reason: x.reason === k ? undefined : k as Reason })}>{n}</button>)}</div>
                    {x.reason && <p className="rv-remedy">{remedy(x.reason, { title: x.title })}</p>}
                  </div>
                );
              })}
            </>
          )}

          {step === 'score' && (
            <div className="rv-score">
              <div className={`rv-dial v-${sc.verdict}`} role="img" aria-label={`نمره‌ی امروز ${sc.score} از ۱۰۰`}>
                <svg viewBox="0 0 120 120" width="132" height="132" aria-hidden="true">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="10" />
                  <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(sc.score / 100) * 314} 314`} transform="rotate(-90 60 60)" />
                </svg>
                <b>{fa(sc.score)}</b>
              </div>
              <div className="rv-verdict"><b>{VERDICT[sc.verdict]}</b><span className="faint">{sc.score >= 60 ? 'روز مفید یعنی ۶۰ به بالا.' : 'از ۶۰ به بالا روز مفید حساب می‌شود.'}</span></div>
              <div className="rv-parts">
                {([['priorities', 'اولویت‌ها'], ['focus', 'حضور و تمرکز'], ['rest', 'بقیه‌ی کارها']] as const).map(([k, n]) => sc.weights[k] > 0 && (
                  <div key={k} className="rv-part"><span>{n} <small className="faint">(وزن {fa(Math.round(sc.weights[k] * 100))}٪)</small></span><div className="pl-cap-bar"><span style={{ width: `${sc.parts[k] * 100}%` }} /></div><b>{fa(Math.round(sc.parts[k] * 100))}٪</b></div>
                ))}
              </div>
              <details className="rv-how">
                <summary>این نمره چطور حساب شد؟</summary>
                <p>اولویت‌ها ۷۰٪ نمره‌اند و به ترتیب اهمیت وزن می‌گیرند (برای پنج اولویت: ۵، ۴، ۳، ۲ و ۱ از ۱۵). هر کدام به اندازه‌ای که جلو رفته امتیاز می‌گیرد: شروع ¼، نصفه ½، بیشترش ¾، کامل ۱. «حضور» (۲۰٪) وقتی است که واقعاً کار کردی در برابر وقتی که برنامه‌ریزی کرده بودی، و «بقیه» (۱۰٪) سهم کارهای دیگرِ امروز است. کاری که آگاهانه کنار گذاشتی حساب نمی‌شود. با وزن مساوی، سه از پنج یعنی ۶۰؛ با این وزن‌ها، سه‌تای اول از پنج یعنی ۸۰.</p>
                <ul>{ranked.filter((x) => x.reason !== 'priority').map((x) => <li key={x.taskId}>{x.title}: {LEVELS[x.level][1]}</li>)}</ul>
              </details>
              <div className="rv-msg">
                <p>{msg}</p>
                {!rated ? (
                  <span className="rv-rate">این حرف کمک کرد؟ <button className="pill pill-xs" onClick={() => { void rateStyle('review', style, true); setRated(true); }}>آره</button><button className="pill pill-xs" onClick={() => { void rateStyle('review', style, false); setRated(true); }}>نه</button><small className="faint">لحن: {STYLE_LABEL[style]}</small></span>
                ) : <span className="faint" style={{ fontSize: 12 }}>ممنون؛ یاد گرفتم.</span>}
              </div>
              <div className="rv-energy"><span className="te-label">حال و انرژی امروز</span>
                <div className="day-pills">{[[1, 'خیلی کم'], [2, 'کم'], [3, 'معمولی'], [4, 'خوب'], [5, 'عالی']].map(([v, n]) => <button key={v} className="pill pill-xs" aria-pressed={energy === v} onClick={() => setEnergy(v as number)}>{n}</button>)}</div>
              </div>
              {trend && trend.list.length > 1 && (
                <div className="rv-trend" aria-label="نمره‌ی روزهای اخیر">
                  <span className="te-label">روزهای اخیر{trend.avg !== null ? ` · میانگین ${fa(trend.avg)}` : ''}</span>
                  <div className="rv-bars">{[...trend.list.filter((r) => r.day !== d), { day: d, score: sc.score }].slice(-14).map((r) => <span key={r.day} title={`${fa(r.score)}`} style={{ height: `${Math.max(4, r.score)}%` }} className={r.day === d ? 'now' : r.score >= 60 ? 'ok' : ''} />)}</div>
                </div>
              )}
            </div>
          )}

          {step === 'tomorrow' && (
            <>
              <p className="pl-lead">مانده‌ها کجا بروند؟ برای هر کدام، کاری که با دلیلش جور است.</p>
              {leftovers.length === 0 && <p className="faint">چیزی نمانده. با ذهن آزاد برو. 🌙</p>}
              {leftovers.map((t: Task) => {
                const it = list.find((x) => x.taskId === t.id);
                return (
                  <div key={t.id} className="rv-item">
                    <div className="rv-top"><span className="rv-title">{t.title}</span>{it?.reason && <span className="chip">{reasonLabel(it.reason)}</span>}</div>
                    {it?.reason === 'unclear' && (
                      <form className="rv-extra-f" onSubmit={async (e) => { e.preventDefault(); const v = firstStep[t.id]?.trim(); if (!v) return; await db.tasks.update(t.id, { steps: [{ id: uid(), title: v, done: false }, ...(t.steps ?? [])] }); setFirstStep({ ...firstStep, [t.id]: '' }); }}>
                        <input className="ev-input" value={firstStep[t.id] ?? ''} onChange={(e) => setFirstStep({ ...firstStep, [t.id]: e.target.value })} placeholder="قدم اولِ دقیق، مثلاً «فایل داده را باز کن و ستون‌ها را بخوان»" aria-label={`قدم اول ${t.title}`} />
                        <button className="btn btn-sm" type="submit">ثبت</button>
                      </form>
                    )}
                    {it?.reason === 'estimate' && t.est && <button className="link-btn" onClick={() => db.tasks.update(t.id, { est: Math.round((t.est! * 1.5) / 5) * 5, len: undefined })}>برآوردش را ۱٫۵ برابر کن ({estLabel(Math.round((t.est * 1.5) / 5) * 5)})</button>}
                    {it?.reason === 'big' && <button className="link-btn" onClick={() => openProjects({ create: t.title, taskIds: [t.id] })}>پروژه‌اش کن</button>}
                    <span className="pl-acts">
                      <button className="btn btn-sm" onClick={() => reschedule(t, tomorrow())}>فردا</button>
                      <button className="btn btn-sm" onClick={() => reschedule(t, undefined, { someday: true })}>بعداً</button>
                      <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => db.tasks.delete(t.id)}>حذف</button>
                    </span>
                  </div>
                );
              })}
              {leftovers.length > 1 && <button className="link-btn" onClick={() => Promise.all(leftovers.map((t) => reschedule(t, tomorrow())))}>همه برای فردا</button>}
            </>
          )}
        </div>

        <div className="pl-foot">
          {step === 'items' && <button className="btn btn-accent" onClick={() => setStep(unfinished.length ? 'why' : 'score')}>بعدی</button>}
          {step === 'why' && <button className="btn btn-accent" onClick={() => setStep('score')}>نمره‌ی امروز</button>}
          {step === 'score' && <button className="btn btn-accent" onClick={() => void finishScore()}>ثبت و مانده‌ها</button>}
          {step === 'tomorrow' && <button className="btn btn-accent" onClick={onClose}>روز را ببند</button>}
          {step !== 'items' && step !== 'tomorrow' && <button className="btn" style={{ border: 0 }} onClick={() => setStep(step === 'score' && unfinished.length ? 'why' : 'items')}>قبلی</button>}
          <button className="btn" style={{ border: 0, marginInlineStart: 'auto' }} onClick={onClose}>بعداً</button>
        </div>
      </div>
    </div>
  );
}

export function ReviewHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const go = () => setOpen(true);
    addEventListener('ora:review', go);
    return () => removeEventListener('ora:review', go);
  }, []);
  return open ? createPortal(<Review onClose={() => setOpen(false)} />, document.body) : null;
}
