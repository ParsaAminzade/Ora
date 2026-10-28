// The end-of-day review and its score.
//
// How the score works (and why):
//  · Priorities count most (70%). Your ranked priorities (up to five) are weighted by rank with
//    rank-sum weights — for five: 5/15, 4/15, 3/15, 2/15, 1/15 — a standard way in decision analysis
//    to turn an order into weights. Finishing #1 matters more than finishing #5, but every one counts.
//  · Each priority gets partial credit by how far it got: not done 0 · started ¼ · half ½ · most ¾ · done 1.
//  · Showing up (20%): focused time (timer + finished blocks + unplanned work) against the time you
//    planned, capped at what a day can hold.
//  · Everything else on today's list (10%).
//  · A priority you consciously set aside («اولویتم عوض شد») is not a failure: it leaves the count.
//  · Parts with nothing in them drop out and the rest are re-weighted.
// «A useful day» is 60+: your own rule of thumb — three of five priorities done — is 60% with equal
// weights; with rank weights, doing the top three of five scores 80%.
import { db, type DayReview, type Reason, type Task } from './db';
import { addDays, dayKey, fa } from './dates';
import { byPlan, isToday, plannerOf, today } from './planner';
import { score as taskScore } from './schedule';

export const LEVELS: [0 | 1 | 2 | 3 | 4, string][] = [[0, 'انجام نشد'], [1, 'شروع شد'], [2, 'نصفه'], [3, 'بیشترش'], [4, 'کامل']];
export const REASONS: [Reason, string, string][] = [
  ['estimate', 'بیشتر از فکرم طول کشید', 'برآورد'],
  ['interrupt', 'کار پیش‌بینی‌نشده یا مزاحمت', 'مزاحمت'],
  ['energy', 'انرژی یا حوصله نداشتم', 'انرژی'],
  ['unclear', 'نمی‌دانستم از کجا شروع کنم', 'نامشخص'],
  ['avoid', 'سراغش نرفتم؛ طفره رفتم', 'طفره'],
  ['blocked', 'منتظر کس یا چیز دیگری بودم', 'منتظر'],
  ['priority', 'اولویتم عوض شد (آگاهانه کنارش گذاشتم)', 'تغییر اولویت'],
  ['big', 'بزرگ‌تر از یک روز بود', 'بزرگ'],
];
export const reasonLabel = (r: Reason) => REASONS.find(([k]) => k === r)?.[1] ?? r;

export type Item = DayReview['items'][number];

const blockLen = (t: Task) => t.len ?? t.est ?? 30;

/** Today's priorities, best first: the starred three, then what matters most by deadline and importance. */
export function defaultItems(tasks: Task[], d = today()): Item[] {
  const todays = tasks.filter((t) => (t.when === d || (t.done && t.doneAt && dayKey(new Date(t.doneAt)) === d) || isToday(t, d)) && !t.someday && !t.goal);
  const ranked = [...todays].sort((a, b) => Number(!!b.top) - Number(!!a.top) || taskScore(b, d) - taskScore(a, d) || byPlan(a, b));
  return ranked.slice(0, 5).map((t, i) => ({ taskId: t.id, title: t.title, rank: i + 1, level: t.done ? 4 : t.spent && t.est ? (Math.min(3, Math.max(1, Math.round((t.spent / t.est) * 4))) as 1 | 2 | 3) : 0, area: t.area, project: t.project }));
}

export interface Score { score: number; parts: DayReview['parts']; weights: { priorities: number; focus: number; rest: number }; verdict: 'great' | 'useful' | 'half' | 'hard'; over: boolean }

export function computeScore(items: Item[], tasks: Task[], extra: { minutes: number }[] = [], d = today()): Score {
  const counted = items.filter((x) => x.reason !== 'priority').sort((a, b) => a.rank - b.rank);
  const n = counted.length;
  const sum = (n * (n + 1)) / 2;
  const pr = n ? counted.reduce((a, x, i) => a + ((n - i) / sum) * (x.level / 4), 0) : NaN;
  // showing up: focused minutes vs planned minutes (capped by what a day can hold)
  const todays = tasks.filter((t) => t.when === d && !t.someday);
  const planned = Math.min(plannerOf().hours * 60, todays.filter((t) => t.time || t.est).reduce((a, t) => a + blockLen(t), 0));
  const did = todays.filter((t) => t.done).reduce((a, t) => a + Math.max(blockLen(t), t.spent ?? 0), 0) + todays.filter((t) => !t.done).reduce((a, t) => a + (t.spent ?? 0), 0) + extra.reduce((a, x) => a + x.minutes, 0)
    // priorities you just marked (not ticked in the list yet) count for how far they got
    + counted.filter((x) => x.level > 0).reduce((a, x) => { const t = tasks.find((y) => y.id === x.taskId); return a + (t && !t.done ? Math.max(0, blockLen(t) * (x.level / 4) - (t.spent ?? 0)) : 0); }, 0);
  const fo = planned ? Math.min(1, did / planned) : NaN;
  const ids = new Set(items.map((x) => x.taskId));
  const others = todays.filter((t) => !ids.has(t.id) && !t.goal);
  const re = others.length ? others.filter((t) => t.done).length / others.length : NaN;
  const W = { priorities: 0.7, focus: 0.2, rest: 0.1 };
  const parts = { priorities: pr, focus: fo, rest: re };
  const live = (Object.keys(W) as (keyof typeof W)[]).filter((k) => !Number.isNaN(parts[k]));
  const tw = live.reduce((a, k) => a + W[k], 0);
  const weights = { priorities: 0, focus: 0, rest: 0 };
  for (const k of live) weights[k] = W[k] / tw;
  const score = tw ? Math.round(100 * live.reduce((a, k) => a + weights[k] * parts[k], 0)) : 0;
  const verdict: Score['verdict'] = score >= 80 ? 'great' : score >= 60 ? 'useful' : score >= 40 ? 'half' : 'hard';
  const plannedAll = todays.filter((t) => !t.goal).reduce((a, t) => a + blockLen(t) * plannerOf().buffer, 0);
  return { score, parts: { priorities: Number.isNaN(pr) ? 0 : pr, focus: Number.isNaN(fo) ? 0 : fo, rest: Number.isNaN(re) ? 0 : re }, weights, verdict, over: plannedAll > plannerOf().hours * 60 * 1.1 };
}

export const VERDICT: Record<Score['verdict'], string> = { great: 'روز عالی', useful: 'روز مفید', half: 'نیمه‌کاره، ولی رو به جلو', hard: 'روز سخت' };

export async function saveReview(r: DayReview): Promise<void> {
  await db.reviews.put(r);
  // finished priorities are ticked; partial ones keep a note of how far they got
  for (const x of r.items) {
    const t = await db.tasks.get(x.taskId);
    if (!t) continue;
    if (x.level === 4 && !t.done) await db.tasks.update(t.id, { done: true, doneAt: Date.now() });
    if (x.level > 0 && x.level < 4 && t.est) await db.tasks.update(t.id, { spent: Math.max(t.spent ?? 0, Math.round((t.est * x.level) / 4)) });
  }
}

/** Last N reviews (newest last), the average, and the run of useful days up to today. */
export async function recentReviews(n = 14): Promise<{ list: DayReview[]; avg: number | null; streak: number }> {
  const list = (await db.reviews.toArray()).sort((a, b) => a.day.localeCompare(b.day)).slice(-n);
  const avg = list.length ? Math.round(list.reduce((a, r) => a + r.score, 0) / list.length) : null;
  let streak = 0;
  for (let i = list.length - 1, d = today(); i >= 0; i--) {
    if (list[i].day !== d && list[i].day !== dayKey(addDays(new Date(`${d}T12:00`), -1))) break;
    if (list[i].score < 60) break;
    streak++; d = list[i].day;
  }
  return { list, avg, streak };
}

export const scoreLine = (s: Score) => `${fa(s.score)} از ۱۰۰ · ${VERDICT[s.verdict]}`;
