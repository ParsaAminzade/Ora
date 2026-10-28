// While a tab is open, Ora follows the time plan: it says when a block starts, and when one ends
// it asks whether it is done. «Fifteen more minutes» is answered honestly: what moves, what
// falls to tomorrow, and whether that is a good trade given your priorities.
import { db, type Task } from './db';
import { fa } from './dates';
import { plannerOf, today, toggleDone } from './planner';
import { applyReplan, faHM, logOutcome, nowMin, personalEst, replan, scheduleInputs, toMin, loadStats } from './schedule';

const ASKED = 'ora:live-asked';
const asked = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(ASKED) ?? '{}'); } catch { return {}; } };
const mark = (k: string) => { try { const a = asked(); a[k] = Date.now(); for (const [x, t] of Object.entries(a)) if (Date.now() - t > 2 * 864e5) delete a[x]; localStorage.setItem(ASKED, JSON.stringify(a)); } catch { /* private */ } };
const say = (detail: object) => dispatchEvent(new CustomEvent('ora:say', { detail }));

async function offerExtension(t: Task, extra: number, startNow = false) {
  const { tasks, events, stats } = await scheduleInputs(1);
  const cur = startNow ? { ...t, time: undefined } : t;
  const r = replan(startNow ? { ...cur, time: `${String(Math.floor(nowMin() / 60)).padStart(2, '0')}:${String(nowMin() % 60).padStart(2, '0')}` } : cur, extra, tasks, events, plannerOf(), stats);
  say({
    title: startNow ? `اگر «${t.title}» را الان شروع کنی` : `اگر ${fa(extra)} دقیقه‌ی دیگر روی «${t.title}» بمانی`,
    text: r.text,
    sticky: true,
    mood: r.advice === 'stop' ? 'firm' : undefined,
    action: { label: r.advice === 'stop' ? 'باز هم ادامه می‌دهم' : startNow ? 'شروع می‌کنم' : 'ادامه می‌دهم', run: () => void applyReplan(t, extra, r, { startNow }) },
    choices: startNow ? [{ label: 'امروز نه؛ فردا', run: () => void db.tasks.update(t.id, { when: undefined, time: undefined }).then(() => say({ text: 'باشه، از برنامه‌ی امروز برداشتم.' })) }]
      : [{ label: 'نه، همین‌جا تمامش می‌کنم', run: () => void toggleDone(t).then(() => say({ text: `«${t.title}» تمام شد. آفرین.` })) }],
  });
}

async function check() {
  const p = plannerOf();
  if (!p.liveCheck || document.visibilityState !== 'visible') return;
  const d = today();
  const n = nowMin();
  const stats = await loadStats();
  const tasks = (await db.tasks.toArray()).filter((t) => t.when === d && t.time && !t.done && !t.someday);
  for (const t of tasks.sort((a, b) => toMin(a.time!) - toMin(b.time!))) {
    const start = toMin(t.time!), end = start + personalEst(t, stats);
    // the block just started
    const sKey = `start:${t.id}@${d}@${t.time}`;
    if (n >= start && n < start + 10 && !asked()[sKey]) {
      mark(sKey);
      say({ text: `وقت «${t.title}» است؛ تا ${faHM(end)}.`, choices: [{ label: 'هنوز نمی‌توانم شروع کنم', run: () => void offerExtension(t, personalEst(t, stats), true) }] });
      return;
    }
    // the block should be over
    const eKey = `end:${t.id}@${d}@${t.time}@${t.est ?? 0}`;
    if (n >= end && n < end + 120 && !asked()[eKey]) {
      mark(eKey);
      say({
        text: `«${t.title}» تمام شد؟`,
        sticky: true,
        choices: [
          { label: 'تمام شد', run: () => void toggleDone(t).then(() => say({ text: 'عالی. بریم سراغ بعدی.' })) },
          { label: '۱۵ دقیقه‌ی دیگر', run: () => void offerExtension(t, 15) },
          { label: '۳۰ دقیقه‌ی دیگر', run: () => void offerExtension(t, 30) },
          { label: 'شروعش نکردم', run: () => { void logOutcome({ area: t.area ?? '—', est: t.est ?? 30, actual: 0, hour: start / 60 | 0, done: false }); void offerExtension(t, personalEst(t, stats), true); } },
        ],
      });
      return;
    }
  }
}

export function watchBlocks(): () => void {
  const tick = () => void check().catch(() => {});
  const t0 = window.setTimeout(tick, 5000);
  const iv = window.setInterval(tick, 30_000);
  document.addEventListener('visibilitychange', tick);
  return () => { window.clearTimeout(t0); window.clearInterval(iv); document.removeEventListener('visibilitychange', tick); };
}
