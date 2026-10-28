// «پروژه‌ها»: long-term aims done in phases. A project page shows where you are (phase, progress,
// time this week against your target, whether the deadline still works) and always its next step.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, type Project, type Task } from '../core/db';
import { fa } from '../core/dates';
import { attachTask, completePhase, createProject, PROJECT_COLORS, projectState, type ProjectsOpen } from '../core/projects';
import { addParsed, setFocusTask, today, toggleDone } from '../core/planner';
import { dayLabel, estLabel, parseTask } from '../core/taskparse';
import { withUndo } from '../core/undo';
import { ask } from './Dialog';
import { openTaskEditor } from './TaskEditor';
import { DateField } from './cal/EventEditor';
import { IconCheck, IconFolder, IconPlus, IconTarget, IconTrash, IconX } from './icons';
import { NONE } from '../core/none';

const TEMPLATES: [string, string[]][] = [
  ['پژوهش و مقاله', ['مرور منابع', 'طراحی روش', 'آزمایش‌ها', 'نوشتن', 'ویرایش و ارسال']],
  ['یادگیری یک مهارت', ['پایه‌ها', 'تمرین هدفمند', 'یک پروژه‌ی کوچک', 'مرور و تثبیت']],
  ['امتحان', ['جمع کردن منابع', 'خواندن اول', 'حل نمونه سؤال', 'مرور آخر']],
  ['ساختن یک محصول', ['ایده و نیازها', 'نمونه‌ی اولیه', 'ساخت', 'آزمایش با کاربر', 'انتشار']],
];

function NewProject({ init, onDone, onCancel }: { init?: ProjectsOpen; onDone(id: string): void; onCancel(): void }) {
  const [title, setTitle] = useState(init?.create ?? '');
  const [why, setWhy] = useState('');
  const [phases, setPhases] = useState<string[]>(['']);
  const [due, setDue] = useState<string | undefined>();
  const [weekly, setWeekly] = useState(0);
  const save = async () => {
    if (!title.trim()) return;
    const p = await createProject({ title, why, phases: phases.filter((x) => x.trim()), due, weekly: weekly ? weekly * 60 : undefined, taskIds: init?.taskIds });
    onDone(p.id);
  };
  return (
    <div className="pj-new">
      <input className="ev-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="نام پروژه، مثلاً «پایان‌نامه» یا «یادگیری اسپانیایی»" aria-label="نام پروژه" />
      {init?.taskIds?.length ? <span className="faint" style={{ fontSize: 12 }}>{fa(init.taskIds.length)} کارِ مرتبط به این پروژه وصل می‌شود.</span> : null}
      <textarea className="ev-input ev-notes" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="چرا مهم است؟ و «تمام شد» یعنی چه؟ (یک جمله)" aria-label="چرا مهم است" />
      <div className="te-field">
        <span className="te-label">فازها (به ترتیب)</span>
        <div className="day-pills">{TEMPLATES.map(([n, ph]) => <button key={n} className="pill pill-xs" onClick={() => setPhases(ph)}>{n}</button>)}</div>
        {phases.map((p, i) => (
          <div key={i} className="pj-phase-in">
            <span className="rv-rank">{fa(i + 1)}</span>
            <input className="ev-input" value={p} onChange={(e) => setPhases(phases.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 ? 'فاز اول' : 'فاز بعدی'} aria-label={`فاز ${i + 1}`}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setPhases([...phases.slice(0, i + 1), '', ...phases.slice(i + 1)]); } }} />
            {phases.length > 1 && <button className="icon-btn" aria-label="حذف فاز" onClick={() => setPhases(phases.filter((_, j) => j !== i))}><IconX size={13} /></button>}
          </div>
        ))}
        <button className="link-btn" onClick={() => setPhases([...phases, ''])}>+ فاز</button>
      </div>
      <div className="ev-line">
        <span className="te-label">مهلت</span>
        {due ? <><DateField value={due} onChange={setDue} label="مهلت پروژه" min={today()} /><button className="link-btn" onClick={() => setDue(undefined)}>بدون مهلت</button></> : <button className="pill pill-xs" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 30); setDue(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); }}>مهلت دارد</button>}
      </div>
      <label className="set-slider"><span className="set-slider-top"><span>چند ساعت در هفته برایش می‌گذاری؟</span><span className="set-val">{weekly ? `${fa(weekly)} ساعت` : 'مشخص نیست'}</span></span>
        <input type="range" min={0} max={30} value={weekly} onChange={(e) => setWeekly(Number(e.target.value))} style={{ '--p': `${(weekly / 30) * 100}%` } as React.CSSProperties} /></label>
      <div className="pl-acts" style={{ gap: 8 }}>
        <button className="btn btn-accent" disabled={!title.trim()} onClick={() => void save()}>ساختن پروژه</button>
        <button className="btn" style={{ border: 0 }} onClick={onCancel}>انصراف</button>
      </div>
    </div>
  );
}

function ProjectPage({ p, tasks }: { p: Project; tasks: Task[] }) {
  const st = projectState(p, tasks);
  const [draft, setDraft] = useState('');
  const [newPhase, setNewPhase] = useState('');
  const mine = tasks.filter((t) => t.project === p.id);
  const up = (x: Partial<Project>) => db.projects.update(p.id, x);
  const pct = Math.round(st.progress * 100);
  return (
    <div className="pj-page">
      <div className="pj-head">
        <i className="pj-color" style={{ background: p.color }} />
        <input className="pj-title" value={p.title} onChange={(e) => up({ title: e.target.value })} aria-label="نام پروژه" />
        <select className="mini-select" value={p.status} aria-label="وضعیت" onChange={(e) => up({ status: e.target.value as Project['status'] })}>
          <option value="active">فعال</option><option value="paused">متوقف</option><option value="done">تمام‌شده</option>
        </select>
      </div>
      <textarea className="ev-input ev-notes pj-why" rows={2} value={p.why ?? ''} onChange={(e) => up({ why: e.target.value || undefined })} placeholder="چرا مهم است؟ «تمام شد» یعنی چه؟" aria-label="چرا مهم است" />

      <div className="pj-stats">
        <div><span>پیشرفت</span><b>{fa(pct)}٪</b><div className="pl-cap-bar"><span style={{ width: `${pct}%`, background: p.color }} /></div></div>
        <div><span>این هفته</span><b>{estLabel(st.weekMin)}{p.weekly ? <small> از {estLabel(p.weekly)}</small> : null}</b>{st.weekPlanned ? <small className="faint">{estLabel(st.weekPlanned)} دیگر در برنامه</small> : null}</div>
        <div><span>مهلت</span><b>{p.due ? dayLabel(p.due) : '—'}</b>{st.dueRisk && <small className={`pj-risk r-${st.dueRisk}`}>{{ ok: 'در مسیر', tight: 'تنگ است', late: 'دیر شده' }[st.dueRisk]}</small>}</div>
      </div>
      {st.stalledDays >= 7 && p.status === 'active' && <div className="sch-risk">{fa(st.stalledDays)} روز است این پروژه تکان نخورده. یک قدم کوچک برایش بگذار، یا اگر الان وقتش نیست «متوقف» کن تا ذهنت را شلوغ نکند.</div>}

      <div className="pj-next">
        <span className="te-label">قدم بعدی</span>
        {st.next ? (
          <div className="pj-next-row">
            <b>{st.next.title}</b>
            <span className="faint">{st.next.when ? dayLabel(st.next.when) : 'بی‌تاریخ'}{st.next.est ? ` · ${estLabel(st.next.est)}` : ''}</span>
            <button className="btn btn-sm btn-accent" onClick={() => { setFocusTask(st.next!.id); dispatchEvent(new Event('ora:focus-start')); }}><IconTarget size={14} />شروع</button>
            {st.next.when !== today() && <button className="btn btn-sm" onClick={() => db.tasks.update(st.next!.id, { when: today(), someday: false })}>برای امروز</button>}
          </div>
        ) : <p className="faint" style={{ margin: 0, fontSize: 13 }}>قدم بعدی مشخص نیست. پروژه‌ای که قدم بعدی ندارد جلو نمی‌رود؛ یک کار مشخص و کوچک برای فاز فعلی بنویس.</p>}
      </div>

      <div className="pj-phases">
        <span className="te-label">فازها</span>
        {p.phases.map((ph, i) => {
          const ts = mine.filter((t) => t.phase === ph.id);
          const cur = st.phase?.id === ph.id;
          return (
            <div key={ph.id} className={`pj-phase${ph.done ? ' done' : ''}${cur ? ' cur' : ''}`}>
              <div className="pj-phase-h">
                <button className="pj-check" role="checkbox" aria-checked={ph.done} aria-label={`فاز ${ph.title} تمام شد`} onClick={() => void completePhase(p, ph.id, !ph.done)}>{ph.done ? <IconCheck size={12} /> : fa(i + 1)}</button>
                <input className="pj-phase-t" value={ph.title} aria-label={`نام فاز ${i + 1}`} onChange={(e) => up({ phases: p.phases.map((x) => (x.id === ph.id ? { ...x, title: e.target.value } : x)) })} />
                {cur && <span className="chip">فاز فعلی</span>}
                <span className="faint" style={{ fontSize: 12 }}>{ts.length ? `${fa(ts.filter((t) => t.done).length)} از ${fa(ts.length)}` : ''}</span>
                {!ts.length && p.phases.length > 1 && <button className="icon-btn" aria-label={`حذف فاز ${ph.title}`} onClick={() => up({ phases: p.phases.filter((x) => x.id !== ph.id) })}><IconX size={13} /></button>}
              </div>
              {(cur || !ph.done) && ts.filter((t) => !t.done || cur).map((t) => (
                <div key={t.id} className="pj-task">
                  <input type="checkbox" className="chk" checked={t.done} onChange={() => void toggleDone(t)} aria-label={t.title} />
                  <button className="pj-task-t" onClick={() => openTaskEditor(t.id)}>{t.title}</button>
                  <span className="faint">{t.when ? dayLabel(t.when) : t.someday ? 'بعداً' : 'بی‌تاریخ'}</span>
                </div>
              ))}
            </div>
          );
        })}
        <form className="pj-add" onSubmit={(e) => { e.preventDefault(); if (!newPhase.trim()) return; void up({ phases: [...p.phases, { id: uid(), title: newPhase.trim(), done: false }], status: p.status === 'done' ? 'active' : p.status }); setNewPhase(''); }}>
          <input className="ev-input" value={newPhase} onChange={(e) => setNewPhase(e.target.value)} placeholder="+ فاز تازه" aria-label="فاز تازه" />
        </form>
      </div>

      <form className="field" onSubmit={async (e) => {
        e.preventDefault(); if (!draft.trim()) return;
        const parsed = parseTask(draft);
        const t = await addParsed({ ...parsed, when: parsed.when, someday: false });
        if (!parsed.when) await db.tasks.update(t.id, { when: undefined });
        await attachTask(t.id, p.id);
        setDraft('');
      }}>
        <IconPlus size={16} className="ico faint" />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`کار تازه برای «${st.phase?.title ?? p.title}»، مثلاً «خواندن مقاله‌ی اسمیت ۴۵ دقیقه فردا»`} aria-label="کار تازه‌ی پروژه" />
      </form>
      <div className="pj-foot">
        <div className="ev-colors">{PROJECT_COLORS.map((c) => <button key={c} className="ev-col" role="radio" aria-checked={p.color === c} aria-label="رنگ" style={{ background: c }} onClick={() => up({ color: c })} />)}</div>
        <label className="ev-line"><span className="te-label">ساعت در هفته</span><input className="ev-num" type="number" min={0} max={60} value={p.weekly ? p.weekly / 60 : 0} onChange={(e) => up({ weekly: Number(e.target.value) ? Number(e.target.value) * 60 : undefined })} aria-label="ساعت در هفته" /></label>
        <span className="ev-line"><span className="te-label">مهلت</span>{p.due ? <><DateField value={p.due} onChange={(v) => up({ due: v })} label="مهلت پروژه" /><button className="link-btn" onClick={() => up({ due: undefined })}>بدون مهلت</button></> : <button className="link-btn" onClick={() => up({ due: today() })}>افزودن مهلت</button>}</span>
        <button className="btn btn-sm" style={{ border: 0, color: 'var(--danger)', marginInlineStart: 'auto' }} onClick={async () => { if (await ask(`پروژه‌ی «${p.title}» حذف شود؟ کارهایش می‌مانند ولی دیگر به پروژه وصل نیستند.`, { danger: true })) await withUndo('پروژه حذف شد', async () => { await db.tasks.filter((t) => t.project === p.id).modify((t) => { delete t.project; delete t.phase; }); await db.projects.delete(p.id); }); }}><IconTrash size={14} />حذف</button>
      </div>
    </div>
  );
}

function Projects({ init, onClose }: { init: ProjectsOpen; onClose(): void }) {
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? NONE;
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? NONE;
  const [sel, setSel] = useState<string | 'new' | null>(init.create !== undefined ? 'new' : init.id ?? null);
  useEffect(() => { if (!sel && projects.length) setSel(projects.find((p) => p.status === 'active')?.id ?? projects[0].id); }, [projects, sel]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[aria-label="جزئیات کار"], .datef-pop, [role="alertdialog"]')) { e.stopPropagation(); onClose(); } };
    addEventListener('keydown', esc, true);
    return () => removeEventListener('keydown', esc, true);
  }, [onClose]);
  const cur = projects.find((p) => p.id === sel);
  const groups: [Project['status'], string][] = [['active', 'فعال'], ['paused', 'متوقف'], ['done', 'تمام‌شده']];
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="پروژه‌ها" className="glass pj">
        <div className="pl-head"><IconFolder size={18} /><h2 style={{ flex: 1 }}>پروژه‌ها</h2><button className="icon-btn" aria-label="بستن" onClick={onClose}><IconX size={18} /></button></div>
        <div className="pj-main">
          <aside className="pj-list scroll">
            <button className="btn cal-create" onClick={() => setSel('new')}><IconPlus size={16} />پروژه‌ی تازه</button>
            {groups.map(([g, n]) => {
              const ps = projects.filter((p) => p.status === g);
              if (!ps.length) return null;
              return (
                <div key={g} className="pj-group">
                  <span className="te-label">{n}</span>
                  {ps.map((p) => { const s = projectState(p, tasks); return (
                    <button key={p.id} className="pj-item" aria-pressed={sel === p.id} onClick={() => setSel(p.id)}>
                      <i style={{ background: p.color }} />
                      <span className="pj-item-t">{p.title}<small>{s.phase ? `فاز ${fa(s.phaseIndex + 1)}: ${s.phase.title}` : 'همه‌ی فازها تمام'}</small></span>
                      <span className="pj-ring" style={{ '--p': `${Math.round(s.progress * 100)}%`, '--c': p.color } as React.CSSProperties} aria-label={`${fa(Math.round(s.progress * 100))}٪`} />
                    </button>
                  ); })}
                </div>
              );
            })}
            {!projects.length && <p className="faint" style={{ fontSize: 12.5, lineHeight: 1.9 }}>پروژه یعنی کاری با هدف بلندمدت که فازبه‌فاز جلو می‌رود؛ مثل پایان‌نامه، یادگیری یک زبان، یا ساختن یک محصول.</p>}
          </aside>
          <div className="pj-body scroll">
            {sel === 'new' ? <NewProject init={init.create !== undefined ? init : undefined} onDone={(id) => setSel(id)} onCancel={() => setSel(projects[0]?.id ?? null)} />
              : cur ? <ProjectPage p={cur} tasks={tasks} /> : <div className="w-empty"><IconFolder /><b>یک پروژه بساز</b><span>اورآ قدم بعدی، پیشرفت و وقتِ هر هفته‌اش را نگه می‌دارد.</span></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectsHost() {
  const [open, setOpen] = useState<ProjectsOpen | null>(null);
  useEffect(() => {
    const go = (e: Event) => setOpen((e as CustomEvent<ProjectsOpen>).detail ?? {});
    addEventListener('ora:projects', go);
    return () => removeEventListener('ora:projects', go);
  }, []);
  return open ? createPortal(<Projects init={open} onClose={() => setOpen(null)} />, document.body) : null;
}
