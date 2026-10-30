// A task that keeps slipping (moved 3 times or more) no longer gets another reminder. Instead, once,
// on a new tab, Ora asks *why* — with one-tap answers — and helps in the way that fits that reason
// (the six causes of the «قلب اورآ» plan). Built to be safe when the guess is wrong: a question, not a
// verdict; «دارم روش کار می‌کنم» and «الان نه» are always there; «چرا الان؟» says why it asked.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { db, type Reason, type Task } from '../core/db';
import { fa } from '../core/dates';
import { kvGet, kvSet } from '../core/kv';
import { learnReasons } from '../core/coach';
import { setFocusTask, today } from '../core/planner';
import { isQuiet } from '../core/safety';
import { useStore } from '../core/state';
import { IconX } from './icons';

const ASKED = 'ora:cause-asked';
type Asked = { day?: string; tasks: Record<string, number> };
type Cause = 'tired' | 'avoid' | 'meaning' | 'cant' | 'lost' | 'bored' | 'waiting' | 'working';
const CHOICES: [Cause, string][] = [
  ['tired', 'خسته‌ام'],
  ['avoid', 'یه حس بدی بهش دارم'],
  ['meaning', 'به چه دردم می‌خوره؟'],
  ['cant', 'نمی‌کشم، زیادیه'],
  ['lost', 'نمی‌دونم از کجا شروع کنم'],
  ['bored', 'فقط حوصله‌شو ندارم'],
  ['waiting', 'منتظر جوابم / دست من نیست'],
  ['working', 'دارم روش کار می‌کنم'],
];
const REASON: Partial<Record<Cause, Reason>> = { tired: 'energy', avoid: 'avoid', cant: 'big', lost: 'unclear', bored: 'avoid', waiting: 'blocked' };

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function Card({ task, onClose }: { task: Task; onClose(): void }) {
  const [cause, setCause] = useState<Cause | null>(null);
  const [why, setWhy] = useState(false);
  const [text, setText] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const finish = (msg: string) => { setDone(msg); window.setTimeout(onClose, 4500); };

  const pick = async (c: Cause) => {
    setCause(c);
    const r = REASON[c];
    if (r) void learnReasons([{ taskId: task.id, title: task.title, area: task.area, reason: r, level: 0 }]);
    if (c === 'working') { await db.tasks.update(task.id, { slips: 0 }); finish('باشه، مزاحم نمی‌شم.'); }
    if (c === 'waiting') { await db.tasks.update(task.id, { slips: 0, waiting: true, time: undefined }); finish('باشه؛ تا وقتی منتظری، یادآوری نمی‌گیرد. جواب که آمد، تیکش بزن یا دوباره برایش وقت بگذار.'); }
  };
  const act = {
    tomorrowMorning: async () => { await db.tasks.update(task.id, { when: tomorrow(), time: '09:00', slips: task.slips }); finish('گذاشتمش برای فردا ساعت ۹. امشب استراحت کن.'); },
    restToday: () => finish('باشه. خستگی دلیل واقعیه، نه تنبلی.'),
    start2: async () => { await db.tasks.update(task.id, { when: today(), time: nowHM(), est: 2 }); setFocusTask(task.id); dispatchEvent(new Event('ora:focus-start')); finish('فقط دو دقیقه. بعدش اگه خواستی ببند.'); },
    start15: async () => { await db.tasks.update(task.id, { when: today(), time: nowHM(), est: 15 }); setFocusTask(task.id); dispatchEvent(new Event('ora:focus-start')); finish('پانزده دقیقه، با تایمر. یه جور دیگه هم گاهی جواب می‌ده.'); },
    saveWhy: async () => { const t = text.trim(); if (!t) return; await db.tasks.update(task.id, { notes: `${task.notes ? `${task.notes}\n` : ''}چرا برایم مهم است: ${t}`, slips: 0 }); finish('نوشتمش کنار کار؛ دفعه‌ی بعد که بازش کنی، همین را می‌بینی.'); },
    saveStep: async () => {
      const t = text.trim(); if (!t) return;
      await db.tasks.update(task.id, { steps: [...(task.steps ?? []), { id: `s${Date.now()}`, title: t, done: false }], when: today(), slips: 0 });
      finish(`قدم بعدی: «${t}». برای امروز گذاشتمش.`);
    },
  };

  return createPortal(
    <div className="cause glass" role="dialog" aria-label={`اورآ: ${task.title}`}>
      <button className="icon-btn cause-x" aria-label="الان نه" title="الان نه" onClick={onClose}><IconX size={16} /></button>
      {done ? <p className="cause-done">{done}</p> : !cause ? (
        <>
          <p className="cause-q">«{task.title}» {fa(task.slips ?? 3)} بار عقب افتاده. چی جلوشو گرفته؟</p>
          <div className="cause-chips">
            {CHOICES.map(([k, l]) => <button key={k} className="pill" onClick={() => void pick(k)}>{l}</button>)}
          </div>
          <div className="cause-foot">
            <button className="btn-link" onClick={onClose}>الان نه</button>
            <button className="btn-link" aria-expanded={why} onClick={() => setWhy((x) => !x)}>چرا الان؟</button>
          </div>
          {why && <p className="cause-why">چون این کار {fa(task.slips ?? 3)} بار جابه‌جا شده و یادآوری دوباره کمکی نکرده. به‌جای یک یادآوری دیگر، یک بار می‌پرسم چه چیزی جلوش است. این را فقط روی همین دستگاه نگه می‌دارم.</p>}
        </>
      ) : (
        <>
          {cause === 'tired' && (<><p>خستگی دلیل واقعیه، تنبلی نیست. امروز سراغش نرو؛ برای فردا صبح بذاریمش؟</p>
            <div className="cause-acts"><button className="btn btn-accent" onClick={() => void act.tomorrowMorning()}>فردا ساعت ۹</button><button className="btn" onClick={act.restToday}>نه، فقط امروز نه</button></div></>)}
          {cause === 'avoid' && (<><p>گاهی خود کار سخت نیست؛ حسی که کنارشه سخته. فقط دو دقیقه بازش کن، بعد اگه خواستی ببند.</p>
            <div className="cause-acts"><button className="btn btn-accent" onClick={() => void act.start2()}>دو دقیقه، همین الان</button><button className="btn" onClick={onClose}>امشب نه</button></div></>)}
          {cause === 'meaning' && (<><p>اگه این کار به یه چیزی که برات مهمه وصل بود، اون چی بود؟ (حتی یه چیز کوچیک)</p>
            <input className="cause-in" value={text} onChange={(e) => setText(e.target.value.slice(0, 140))} placeholder="مثلاً: نمره‌ی این درس برای رشته‌ای که می‌خوام" aria-label="چرا مهم است" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') void act.saveWhy(); }} />
            <div className="cause-acts"><button className="btn btn-accent" disabled={!text.trim()} onClick={() => void act.saveWhy()}>نگه دار</button><button className="btn" onClick={onClose}>نمی‌دونم</button></div></>)}
          {(cause === 'cant' || cause === 'lost') && (<><p>{cause === 'cant' ? 'کوچیک‌ترین قدمش چیه که حتی امروز هم بشه؟' : 'لازم نیست کل راه معلوم باشه. فقط قدم بعدی چیه؟'}</p>
            <input className="cause-in" value={text} onChange={(e) => setText(e.target.value.slice(0, 100))} placeholder="مثلاً: فقط سؤال اول" aria-label="قدم بعدی" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') void act.saveStep(); }} />
            <div className="cause-acts"><button className="btn btn-accent" disabled={!text.trim()} onClick={() => void act.saveStep()}>همین برای امروز</button><button className="btn" onClick={onClose}>بعداً</button></div></>)}
          {cause === 'bored' && (<><p>یه جور دیگه انجامش بدی چی؟ مثلاً فقط پانزده دقیقه با تایمر، یا یه جای دیگه.</p>
            <div className="cause-acts"><button className="btn btn-accent" onClick={() => void act.start15()}>پانزده دقیقه، همین الان</button><button className="btn" onClick={onClose}>امروز نه</button></div></>)}
        </>
      )}
    </div>,
    document.body,
  );
}

export function CauseHost() {
  const loaded = useStore((s) => s.loaded);
  const [task, setTask] = useState<Task | null>(null);
  useEffect(() => {
    if (!loaded) return;
    // after a few seconds, if you didn't open the tab just to go somewhere
    const t = window.setTimeout(async () => {
      const st = useStore.getState();
      if (document.visibilityState !== 'visible' || isQuiet() || st.panel !== 'none' || st.editing || document.querySelector('[role="dialog"]')) return;
      try { if (Date.now() - Number(localStorage.getItem('ora:tip-at') ?? 0) < 60_000) return; } catch { /* */ }
      const asked = (await kvGet<Asked>(ASKED)) ?? { tasks: {} };
      if (asked.day === today()) return; // one a day at most
      const now = Date.now();
      const cand = (await db.tasks.filter((x) => !x.done && !x.someday && !x.waiting && (x.slips ?? 0) >= 3).toArray())
        .filter((x) => now - (asked.tasks[x.id] ?? 0) > 2 * 86_400_000)
        .sort((a, b) => (b.slips ?? 0) - (a.slips ?? 0) || (b.priority ?? 0) - (a.priority ?? 0))[0];
      if (!cand) return;
      await kvSet(ASKED, { day: today(), tasks: { ...asked.tasks, [cand.id]: now } });
      try { localStorage.setItem('ora:tip-at', String(now)); } catch { /* */ }
      setTask(cand);
    }, 6000);
    return () => window.clearTimeout(t);
  }, [loaded]);
  return task ? <Card task={task} onClose={() => setTask(null)} /> : null;
}

