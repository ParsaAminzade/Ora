// What the coach brings up by itself — at most one thing per new tab, and each kind rarely:
//  · a worry whose day has come: «اون نگرانی چی شد؟»
//  · in the morning, a heads-up for today's work that usually slips for a known reason
//  · work you keep coming back to that isn't a project yet: «پروژه‌اش کنیم؟»
import { db } from './db';
import { askedRecently, dismiss, dismissedMap, loadCoach, markAsked, patternFrom, remedy, settleWorry, worriesToCheck } from './coach';
import { isToday, today } from './planner';
import { projectCandidates } from './projects';
import { reasonLabel } from './review';
import { estLabel } from './taskparse';
import { fa } from './dates';

const say = (detail: object) => dispatchEvent(new CustomEvent('ora:say', { detail: { sticky: true, ...detail } }));
const recentlySpoke = () => { try { return Date.now() - Number(localStorage.getItem('ora:tip-at') ?? 0) < 90_000; } catch { return false; } };
const spoke = () => { try { localStorage.setItem('ora:tip-at', String(Date.now())); } catch { /* private */ } };

export async function coachTick(): Promise<string | null> {
  if (document.visibilityState !== 'visible' || recentlySpoke()) return null;
  const { useStore } = await import('./state');
  if (useStore.getState().settings.coachPrompts === false) return null;
  // 1. worries
  const w = (await worriesToCheck())[0];
  if (w) {
    await settleWorry(w.id, undefined);
    spoke();
    const done = (o: 'fine' | 'partly' | 'bad', text: string) => { void settleWorry(w.id, o); say({ text, sticky: false }); };
    say({ title: 'یک سؤال کوتاه', text: `چند روز پیش نگران بودی: «${w.text.length > 70 ? `${w.text.slice(0, 70)}…` : w.text}». چی شد؟`,
      choices: [
        { label: 'بی‌مورد بود', run: () => done('fine', 'خوب است بدانی. دفعه‌ی بعد که همین نگرانی آمد، یادت می‌آورم چند بار بی‌مورد بوده.') },
        { label: 'تا حدی درست بود', run: () => done('partly', 'ثبت شد. بیشترِ نگرانی‌ها نه کاملاً درست‌اند نه کاملاً غلط؛ برای همین با عدد نگاهشان می‌کنیم.') },
        { label: 'درست بود', run: () => done('bad', 'ثبت شد. این‌جور وقت‌ها زودتر بگو تا زودتر برنامه را عوض کنیم.') },
      ] });
    return 'worry';
  }
  const tasks = await db.tasks.toArray();
  // 2. a morning heads-up
  const h = new Date().getHours();
  if (h >= 6 && h < 13 && !(await askedRecently('heads-up', 20))) {
    const coach = await loadCoach();
    const projects = await db.projects.toArray();
    const t = tasks.filter((x) => isToday(x, today()) && !x.done).map((x) => [x, patternFrom(coach, x, projects)] as const).find(([, p]) => p);
    if (t) {
      await markAsked('heads-up'); spoke();
      const [task, pat] = t;
      say({ title: 'یک نکته برای امروز', text: `${pat!.scope} معمولاً به خاطر «${reasonLabel(pat!.reason)}» عقب می‌افتد. ${remedy(pat!.reason, task)}` });
      return 'heads-up';
    }
  }
  // 3. a project in disguise
  if (!(await askedRecently('project', 48))) {
    const cands = projectCandidates(tasks, await db.projects.toArray(), await dismissedMap());
    const c = cands[0];
    if (c) {
      await markAsked('project'); spoke();
      const text = c.why === 'big'
        ? `«${c.label}» ${fa(tasks.find((x) => x.id === c.taskIds[0])?.slips ?? 3)} بار عقب افتاده و ${estLabel(c.minutes)} کار است. شاید یک کار نیست، یک پروژه است. فازبه‌فازش کنیم؟`
        : `به نظرم این چند وقت زیاد روی «${c.label}» کار می‌کنی (${fa(c.taskIds.length)} کار در ${fa(c.days)} روز). می‌خواهی تبدیلش کنیم به یک پروژه، با فاز و قدم بعدی؟`;
      say({ title: 'پیشنهاد', text, choices: [
        { label: 'آره، پروژه‌اش کن', run: () => dispatchEvent(new CustomEvent('ora:projects', { detail: { create: c.label, taskIds: c.taskIds } })) },
        { label: 'نه', run: () => { void dismiss(c.key, 30); say({ text: 'باشه، تا یک ماه دیگر درباره‌اش نمی‌پرسم.', sticky: false }); } },
      ] });
      return 'project';
    }
  }
  return null;
}

export function watchCoach(): () => void {
  // after the morning/evening ritual (4 s) and before the eye's general tips (7 s)
  const t = window.setTimeout(() => void coachTick().catch(() => {}), 5500);
  return () => window.clearTimeout(t);
}
