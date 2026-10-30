// The coach. Not a language model: rules grounded in what is known about planning and
// procrastination, plus statistics of *you*, kept on this browser.
//
//  · Why things slip — you say it in the evening review; Ora counts it per task, project, area and
//    word, and the next time similar work is planned it says the one thing that helps with *that*
//    reason (planning fallacy → bigger estimates; unclear → write the first concrete step; avoidance →
//    an if-then plan and a five-minute start; interruptions → a buffer; energy → your peak hours…).
//  · Worries — answered with your own numbers (time left vs. work left, your track record), one
//    small next step, and a check later: «اون نگرانی چی شد؟». Over time Ora can tell you how often
//    your worries turned out to be unfounded (worry-outcome monitoring, a CBT technique).
//  · How to say it — four ways (numbers first, warm, direct, light). After a message you can say
//    whether it helped; Ora learns which way works for you (Thompson sampling).
// A local model, if you set one up, is only used for free-form talk the rules don't cover.
import { db, uid, type CalEvent, type Project, type Reason, type Task } from './db';
import { addDays, dayKey, fa } from './dates';
import { kvGet, kvSet } from './kv';
import { isOverdue, isToday, plannerOf, today, tomorrow } from './planner';
import { loadStats, nowMin, personalEst, report, score, toMin, type Stats } from './schedule';
import { localCalendar } from './providers/calendar';
import { normalize } from './text';
import { dayLabel, estLabel } from './taskparse';
import { keyWords, projectState } from './projects';
import { reasonLabel } from './review';
import { useStore } from './state';
import { goalProgress } from './goals';

/* ---------- state ---------- */
export type Style = 'data' | 'warm' | 'direct' | 'light';
export const STYLE_LABEL: Record<Style, string> = { data: 'با عدد و شواهد', warm: 'همدلانه', direct: 'رک و کوتاه', light: 'با کمی شوخی' };
export interface Worry { id: string; text: string; taskId?: string; projectId?: string; at: number; checkOn: string; outcome?: 'fine' | 'partly' | 'bad'; askedAt?: number }
interface CoachState {
  reasons: Record<string, Partial<Record<Reason, number>>>;
  worries: Worry[];
  styles: Record<string, Partial<Record<Style, [number, number]>>>;
  dismissed: Record<string, number>;
  asked: Record<string, number>;
}
const KEY = 'ora:coach';
const empty = (): CoachState => ({ reasons: {}, worries: [], styles: {}, dismissed: {}, asked: {} });
export async function loadCoach(): Promise<CoachState> { return { ...empty(), ...((await kvGet<CoachState>(KEY)) ?? {}) }; }
async function saveCoach(s: CoachState): Promise<void> { await kvSet(KEY, s); }

/* ---------- reasons ---------- */
const reasonKeys = (t: { taskId?: string; area?: string; project?: string; title: string }) => [
  'all', ...(t.taskId ? [`task:${t.taskId}`] : []), ...(t.project ? [`proj:${t.project}`] : []), ...(t.area ? [`area:${t.area}`] : []), ...keyWords(t.title).slice(0, 4).map((w) => `word:${w}`),
];

export async function learnReasons(items: { taskId: string; title: string; area?: string; project?: string; reason?: Reason; level: number }[]): Promise<void> {
  const s = await loadCoach();
  for (const x of items) {
    if (!x.reason || x.reason === 'priority' || x.level >= 4) continue;
    for (const k of reasonKeys(x)) { const m = (s.reasons[k] ??= {}); m[x.reason] = (m[x.reason] ?? 0) + 1; }
  }
  await saveCoach(s);
}

export interface Pattern { reason: Reason; count: number; scope: string }
/** The reason this kind of work usually slips for you (at least twice, and most of the time). */
export function patternFrom(s: CoachState, t: { id?: string; title: string; area?: string; project?: string }, projects: Project[] = [], min = 2): Pattern | null {
  const scopes: [string, string][] = [
    ...(t.id ? [[`task:${t.id}`, `«${t.title}»`] as [string, string]] : []),
    ...(t.project ? [[`proj:${t.project}`, `کارهای پروژه‌ی «${projects.find((p) => p.id === t.project)?.title ?? ''}»`] as [string, string]] : []),
    ...keyWords(t.title).slice(0, 4).map((w) => [`word:${w}`, `کارهای «${w}»`] as [string, string]),
    ...(t.area ? [[`area:${t.area}`, `کارهای #${t.area}`] as [string, string]] : []),
  ];
  for (const [k, label] of scopes) {
    const m = s.reasons[k];
    if (!m) continue;
    const total = Object.values(m).reduce((a, b) => a + (b ?? 0), 0);
    const sorted = (Object.entries(m) as [Reason, number][]).sort((a, b) => b[1] - a[1]);
    const [r, c] = sorted[0];
    if (c >= min && c / total >= 0.5 && c > (sorted[1]?.[1] ?? 0)) return { reason: r, count: c, scope: label };
  }
  return null;
}

/** What helps with each reason (the one thing worth saying). */
export function remedy(r: Reason, t?: { title: string }): string {
  const name = t ? `«${t.title}»` : 'این کار';
  return {
    estimate: `آدم‌ها تقریباً همیشه زمان را کم تخمین می‌زنند (خطای برنامه‌ریزی). برای ${name} وقت بیشتری بگذار؛ اورآ هم از این به بعد برآورد این نوع کار را خودش بیشتر حساب می‌کند.`,
    interrupt: `یک بلوک خالی سی‌دقیقه‌ای برای غافلگیری‌ها بگذار، و موقع ${name} حالت کار و بستن سایت‌ها را روشن کن.`,
    energy: `${name} را بگذار برای ساعتی که معمولاً سرحال‌تری، نه آخر روز. خواب و استراحت هم بخشی از برنامه است.`,
    unclear: `گیر کار در شروع است، نه در خود کار. همین حالا قدم اولِ دقیق ${name} را بنویس؛ چیزی که در پنج دقیقه بشود شروعش کرد.`,
    avoid: `یک قرار با خودت بگذار: «اگر ساعت … شد، آن‌وقت فقط پنج دقیقه ${name} را شروع می‌کنم.» برنامه‌های «اگر… آن‌وقت…» شروع را خیلی راحت‌تر می‌کنند، و بعد از پنج دقیقه معمولاً ادامه می‌دهی.`,
    blocked: `پیگیری را خودش یک کار کن: یک پیام کوتاه به کسی که منتظرش هستی، همین امروز.`,
    priority: `کنار گذاشتن آگاهانه شکست نیست؛ فقط مطمئن شو جایش در برنامه‌ی روزهای بعد مشخص است.`,
    big: `${name} برای یک روز بزرگ است. خردش کن به قدم‌های یک‌ساعته، یا اگر چند هفته طول می‌کشد پروژه‌اش کن تا فازبه‌فاز جلو برود.`,
  }[r];
}

/** Across recent reviews: what most often gets in the way. */
export async function reasonSummary(days = 30): Promise<{ reason: Reason; count: number; total: number } | null> {
  const since = dayKey(addDays(new Date(), -days));
  const rs = (await db.reviews.toArray()).filter((r) => r.day >= since);
  const c = new Map<Reason, number>();
  let total = 0;
  for (const r of rs) for (const x of r.items) if (x.reason && x.reason !== 'priority' && x.level < 4) { c.set(x.reason, (c.get(x.reason) ?? 0) + 1); total++; }
  const top = [...c].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 3 ? { reason: top[0], count: top[1], total } : null;
}

/* ---------- how to say it: a small bandit over four styles ---------- */
function gamma(k: number): number {
  if (k < 1) return gamma(k + 1) * Math.random() ** (1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { const u1 = Math.random(), u2 = Math.random(); x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = Math.random();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
const beta = (a: number, b: number) => { const x = gamma(a); return x / (x + gamma(b)); };
const STYLES: Style[] = ['data', 'warm', 'direct', 'light'];

export async function pickStyle(ctx: string): Promise<Style> {
  const s = await loadCoach();
  const m = { ...(s.styles.all ?? {}), ...(s.styles[ctx] ?? {}) };
  // a slight prior towards numbers-first: it is what a planner is for
  const prior: Record<Style, [number, number]> = { data: [2, 1], warm: [1.5, 1], direct: [1, 1], light: [1, 1.5] };
  let best: Style = 'data', bv = -1;
  for (const st of STYLES) { const [a, b] = m[st] ?? prior[st]; const v = beta(a, b); if (v > bv) { bv = v; best = st; } }
  return best;
}
export async function rateStyle(ctx: string, st: Style, helped: boolean): Promise<void> {
  const s = await loadCoach();
  for (const c of [ctx, 'all']) {
    const m = (s.styles[c] ??= {});
    const [a, b] = m[st] ?? [1, 1];
    m[st] = helped ? [a + 1, b] : [a, b + 1];
  }
  await saveCoach(s);
}
export async function styleStats(): Promise<{ style: Style; rate: number; n: number }[]> {
  const m = (await loadCoach()).styles.all ?? {};
  return STYLES.map((st) => { const [a, b] = m[st] ?? [1, 1]; return { style: st, rate: a / (a + b), n: a + b - 2 }; }).filter((x) => x.n > 0).sort((x, y) => y.rate - x.rate);
}

/* ---------- replies ---------- */
export interface Action { label: string; kind: 'focus' | 'star' | 'tomorrow' | 'review' | 'wizard' | 'project-new' | 'projects' | 'open-task' | 'dismiss' | 'lighten' | 'add-step'; taskId?: string; payload?: string }
export interface Reply { text: string; ctx?: string; style?: Style; actions?: Action[]; title?: string; crisis?: 'first' | 'after' | 'help' }

interface Data { tasks: Task[]; projects: Project[]; events: CalEvent[]; stats: Stats; now: Date; coach: CoachState }
async function data(): Promise<Data> {
  const now = new Date();
  const [tasks, projects, events, stats, coach] = await Promise.all([db.tasks.toArray(), db.projects.toArray(), localCalendar.list(today(), dayKey(addDays(now, 30))), loadStats(), loadCoach()]);
  return { tasks, projects, events, stats, now, coach };
}

const wrap = (st: Style, core: string, extra: { warm?: string; light?: string } = {}) =>
  st === 'warm' ? `${extra.warm ?? 'طبیعی است.'} ${core}` : st === 'light' ? `${core} ${extra.light ?? ''}`.trim() : core;

/** What to do now, and why. */
export async function nextAction(d?: Data): Promise<Reply> {
  const x = d ?? await data();
  const t0 = today();
  const n = nowMin(x.now);
  const timed = x.tasks.filter((t) => t.when === t0 && t.time && !t.done);
  const cur = timed.find((t) => toMin(t.time!) <= n && toMin(t.time!) + personalEst(t, x.stats) > n);
  const open = x.tasks.filter((t) => isToday(t, t0) && !t.done);
  const best = cur ?? [...open].sort((a, b) => score(b, t0) - score(a, t0) || Number(!!b.time) - Number(!!a.time))[0];
  if (!best) {
    const tm = x.tasks.filter((t) => t.when === tomorrow() && !t.done).length;
    return { text: tm ? `برای امروز کاری نمانده. ${fa(tm)} کار برای فردا داری؛ اگر انرژی داری، کوچک‌ترینش را جلو بینداز، وگرنه استراحت هم کار است.` : 'برای امروز کاری نمانده. یا یک کار تازه بنویس، یا با خیال راحت استراحت کن.', ctx: 'next' };
  }
  const why = cur ? `ساعتش است (${fa(cur.time!)})` : best.top ? 'از سه کار مهم امروز است' : best.due && best.due <= t0 ? 'مهلتش امروز است' : best.due ? `مهلتش ${dayLabel(best.due)} است` : best.priority ? 'مهم علامتش زده‌ای' : 'از بقیه‌ی کارهای امروز جلوتر است';
  const pat = patternFrom(x.coach, best, x.projects);
  const proj = best.project ? x.projects.find((p) => p.id === best.project) : null;
  let text = `الان «${best.title}»؛ چون ${why}.${best.est ? ` حدود ${estLabel(personalEst(best, x.stats))} با برآورد واقعی خودت.` : ''}${proj ? ` این کار پروژه‌ی «${proj.title}» را جلو می‌برد.` : ''}`;
  if (pat) text += ` دفعه‌های قبل ${pat.scope} بیشتر به خاطر «${reasonLabel(pat.reason)}» عقب افتاده؛ ${remedy(pat.reason, best)}`;
  return { text, ctx: 'next', actions: [{ label: 'شروع با تایمر', kind: 'focus', taskId: best.id }] };
}

/** «اولویت‌هام درسته؟» */
export async function checkPriorities(d?: Data): Promise<Reply> {
  const x = d ?? await data();
  const t0 = today();
  const open = x.tasks.filter((t) => !t.done && !t.someday);
  const tops = open.filter((t) => t.top);
  const findings: string[] = [];
  const actions: Action[] = [];
  // 1. something urgent and important that isn't among your three
  const urgent = open.filter((t) => !t.top && t.due && t.due <= tomorrow() && (t.priority || t.due <= t0)).sort((a, b) => score(b, t0) - score(a, t0));
  if (urgent[0]) {
    const weak = [...tops].filter((t) => !t.due).sort((a, b) => score(a, t0) - score(b, t0))[0];
    findings.push(`«${urgent[0].title}» مهلتش ${dayLabel(urgent[0].due!)} است ولی جزو سه کار مهم امروز نیست${weak ? `، در حالی که «${weak.title}» مهلتی ندارد` : ''}.`);
    actions.push({ label: `«${urgent[0].title}» را مهم کن`, kind: 'star', taskId: urgent[0].id });
  }
  if (!tops.length && open.some((t) => isToday(t, t0))) findings.push('هنوز سه کار مهم امروز را انتخاب نکرده‌ای. وقتی همه‌چیز مهم است، هیچ‌چیز مهم نیست؛ سه تا کافی است.');
  // 2. more work than time
  const r = report({ tasks: x.tasks, events: x.events, settings: plannerOf(), stats: x.stats, now: x.now, scope: 'day' });
  if (r.verdict === 'over') {
    const drop = open.filter((t) => isToday(t, t0) && !t.top && !t.fixed && !(t.due && t.due <= t0)).sort((a, b) => score(a, t0) - score(b, t0)).slice(0, 3);
    findings.push(`امروز ${estLabel(r.plannedMin)} کار داری برای ${estLabel(r.availableMin)} وقت.${drop.length ? ` کم‌اهمیت‌ترها: ${drop.map((t) => `«${t.title}»`).join('، ')}؛ بهتر است همین الان بروند فردا تا شب حس عقب‌ماندن نداشته باشی.` : ''}`);
    if (drop.length) actions.push({ label: 'کم‌اهمیت‌ها را بفرست فردا', kind: 'lighten', payload: drop.map((t) => t.id).join(',') });
  }
  // 3. a project that is falling behind its weekly time and has nothing today
  for (const p of x.projects.filter((p) => p.status === 'active' && p.weekly)) {
    const st = projectState(p, x.tasks, x.now);
    const dow = (x.now.getDay() + 1) % 7; // days into the (Saturday) week
    const expected = (p.weekly! * (dow + 1)) / 7;
    const planned = st.weekMin + st.weekPlanned;
    if (planned < expected * 0.6 && !open.some((t) => t.project === p.id && isToday(t, t0))) {
      findings.push(`پروژه‌ی «${p.title}» این هفته ${estLabel(st.weekMin)} وقت گرفته، از هدف ${estLabel(p.weekly!)}؛ و امروز هیچ کاری برایش نیست.${st.next ? ` قدم بعدی‌اش «${st.next.title}» است.` : ''}`);
      if (st.next) actions.push({ label: `«${st.next.title}» را امروز بگذار`, kind: 'star', taskId: st.next.id });
    }
  }
  // 4. a task that keeps slipping
  const slipper = open.filter((t) => (t.slips ?? 0) >= 3).sort((a, b) => (b.slips ?? 0) - (a.slips ?? 0))[0];
  if (slipper) findings.push(`«${slipper.title}» ${fa(slipper.slips!)} بار عقب افتاده. یا خردش کن، یا تصمیم بگیر که اصلاً لازم است؛ نگه داشتنش فقط ذهنت را شلوغ می‌کند.`);
  if (!findings.length) {
    const why = tops.length ? `سه کار مهمت (${tops.map((t) => `«${t.title}»`).join('، ')}) با مهلت‌ها و اهمیت‌ها جور است و برنامه در وقتت جا می‌شود.` : 'چیز ناجوری نمی‌بینم.';
    return { text: `اولویت‌هایت درست است: ${why}`, ctx: 'priorities' };
  }
  return { text: findings.map((f, i) => `${fa(i + 1)}. ${f}`).join('\n'), title: 'چند جا را جابه‌جا کن', ctx: 'priorities', actions };
}

/** «عقبم» */
export async function catchUp(d?: Data): Promise<Reply> {
  const x = d ?? await data();
  const t0 = today();
  const over = x.tasks.filter((t) => isOverdue(t, t0));
  const todays = x.tasks.filter((t) => isToday(t, t0) && !t.done);
  const st = await pickStyle('behind');
  if (!over.length && todays.length <= 3) return { text: wrap(st, `در واقع عقب نیستی: کار عقب‌مانده‌ای نداری و امروز ${fa(todays.length)} کار مانده. شاید حسِ عقب‌ماندن از فهرست‌های ذهنی است؛ بنویسشان تا از سرت بیرون بروند.`, { warm: 'این حس آشناست.' }), ctx: 'behind', style: st };
  const mins = [...over, ...todays].reduce((a, t) => a + personalEst(t, x.stats), 0);
  const r = report({ tasks: x.tasks, events: x.events, settings: plannerOf(), stats: x.stats, now: x.now, scope: 'week' });
  const pat = (await reasonSummary());
  const core = `${over.length ? `${fa(over.length)} کار از روزهای قبل مانده و ` : ''}${fa(todays.length)} کار برای امروز؛ روی هم حدود ${estLabel(mins)}. این هفته ${estLabel(r.availableMin)} وقت آزاد داری${r.risks.length ? ` ولی «${r.risks[0].title}» تا ${dayLabel(r.risks[0].due)} جا نمی‌شود` : '، پس با یک چیدن درست جا می‌شود'}.${pat ? ` بیشترِ عقب‌ماندن‌هایت این ماه به خاطر «${reasonLabel(pat.reason)}» بوده؛ ${remedy(pat.reason)}` : ''}`;
  return {
    text: wrap(st, core, { warm: 'عقب افتادن برای همه پیش می‌آید؛ مهم این است که از کجا دوباره شروع کنی.', light: 'خبر خوب: عقب‌ماندن قابل چیدن است؛ برعکسِ کاکتوس که فقط آب می‌خواهد.' }),
    ctx: 'behind', style: st,
    actions: [{ label: 'برای این هفته بچین', kind: 'wizard' }, { label: 'فقط سه تا برای امروز', kind: 'lighten', payload: 'keep3' }],
  };
}

/** «هفته‌ام چطوره؟» */
export async function weekView(d?: Data): Promise<Reply> {
  const x = d ?? await data();
  const r = report({ tasks: x.tasks, events: x.events, settings: plannerOf(), stats: x.stats, now: x.now, scope: 'week', history: x.tasks });
  const v = { light: 'سبک است', ok: 'متعادل است', heavy: 'سنگین است', over: 'بیشتر از وقتت است' }[r.verdict];
  const lines = [`این هفته ${estLabel(r.plannedMin)} کار داری برای ${estLabel(r.availableMin)} وقت؛ ${v}.`];
  for (const k of r.risks.slice(0, 2)) lines.push(`به «${k.title}» تا ${dayLabel(k.due)} نمی‌رسی (${estLabel(k.shortMin)} کم).`);
  const goals = await db.goals.toArray();
  for (const g of goals.filter((g) => g.active)) { const p = goalProgress(g, x.tasks); lines.push(`${g.title}: ${fa(p.done)} از ${fa(p.target)} این هفته.`); }
  for (const p of x.projects.filter((p) => p.status === 'active')) { const s = projectState(p, x.tasks, x.now); if (s.dueRisk === 'tight' || s.dueRisk === 'late') lines.push(`پروژه‌ی «${p.title}» برای مهلتش (${dayLabel(p.due!)}) ${s.dueRisk === 'late' ? 'دیر شده' : 'تنگ است'}.`); else if (s.stalledDays >= 7) lines.push(`پروژه‌ی «${p.title}» ${fa(s.stalledDays)} روز است تکان نخورده.`); }
  if (r.pace) lines.push(`هفته‌ی گذشته ${fa(r.pace.done)} از ${fa(r.pace.planned)} کار برنامه‌ریزی‌شده انجام شد.`);
  return { text: lines.join('\n'), ctx: 'week', actions: r.risks.length || r.verdict === 'over' ? [{ label: 'برنامه‌ی هفته را بچین', kind: 'wizard' }] : [] };
}

/* ---------- worries ---------- */
const WORRY = /نگران|میترسم|می ترسم|بترسم|استرس|اضطراب|دلشوره|نمیرسم|نمی رسم|نرسم|خراب میشه|خراب می شه|از پسش بر|ترس/;

function capacityUntil(due: string, x: Data): number {
  const p = plannerOf();
  let cap = 0;
  for (let d = new Date(x.now); dayKey(d) <= due; d = addDays(d, 1)) {
    const k = dayKey(d);
    if (p.daysOff.includes(d.getDay())) continue;
    const r = report({ tasks: [], events: x.events, settings: p, stats: x.stats, now: k === dayKey(x.now) ? x.now : new Date(`${k}T00:00:00`), scope: 'day', from: k });
    cap += r.availableMin;
  }
  return cap;
}

export async function worryReply(text: string, d?: Data): Promise<Reply> {
  const x = d ?? await data();
  const st = await pickStyle('worry');
  const words = new Set(keyWords(text));
  const hit = (title: string) => keyWords(title).filter((w) => words.has(w) || [...words].some((v) => v.length > 3 && (w.startsWith(v) || v.startsWith(w)))).length;
  const proj = [...x.projects].filter((p) => p.status === 'active').map((p) => [p, hit(p.title) + (p.keys ?? []).filter((k) => words.has(k)).length] as const).sort((a, b) => b[1] - a[1]).find(([, n]) => n > 0)?.[0];
  const task = [...x.tasks].filter((t) => !t.done).map((t) => [t, hit(t.title)] as const).sort((a, b) => b[1] - a[1] || Number(!!b[0].due) - Number(!!a[0].due)).find(([, n]) => n > 0)?.[0];
  const parts: string[] = [];
  const actions: Action[] = [];
  if (!proj && !task) {
    const done = [...x.tasks].filter((t) => t.done).map((t) => [t, hit(t.title)] as const).sort((a, b) => b[1] - a[1] || (b[0].doneAt ?? 0) - (a[0].doneAt ?? 0)).find(([, n]) => n > 0)?.[0];
    if (done) return { text: wrap(st, `«${done.title}» را ${done.doneAt ? dayLabel(dayKey(new Date(done.doneAt))) : ''} تمام کرده‌ای و تیک خورده. اگر نگرانی‌ات درباره‌ی بخش دیگری از آن است، همان را به‌عنوان یک کار بنویس تا با عدد بسنجمش.`, { warm: 'خیالت راحت باشد.', light: 'گاهی ذهن نگرانِ کاری می‌شود که قبلاً تمامش کرده‌ایم.' }), title: 'بیا با عدد نگاهش کنیم', ctx: 'worry', style: st };
  }
  let due: string | undefined;
  let next: Task | null = null;
  if (proj) {
    const s = projectState(proj, x.tasks, x.now);
    due = proj.due; next = s.next;
    if (due) {
      const cap = capacityUntil(due, x), need = Math.round(s.remainingMin * plannerOf().buffer);
      parts.push(cap >= need
        ? `برای «${proj.title}» تا ${dayLabel(due)} حدود ${estLabel(cap)} وقت آزاد داری و کارهای ثبت‌شده‌اش حدود ${estLabel(need)} است. یعنی جا داری${need ? `؛ حتی اگر ${fa(Math.round((cap / Math.max(need, 1)) * 10) / 10)} برابرِ برآوردت طول بکشد` : ''}.`
        : `برای «${proj.title}» تا ${dayLabel(due)} حدود ${estLabel(cap)} وقت داری ولی کارهایش حدود ${estLabel(need)} است؛ ${estLabel(need - cap)} کم می‌آوری. نگرانی‌ات بی‌دلیل نیست، ولی قابل حل است: بخشی را کوچک‌تر کن، یا مهلت را جابه‌جا کن.`);
      if (cap < need) actions.push({ label: 'برنامه‌ی هفته را بچین', kind: 'wizard' });
    } else parts.push(`پروژه‌ی «${proj.title}» الان در فاز «${s.phase?.title ?? 'آخر'}» است و ${fa(Math.round(s.progress * 100))}٪ جلو رفته؛ این هفته ${estLabel(s.weekMin)} رویش کار کرده‌ای.`);
  } else if (task) {
    due = task.due; next = task;
    if (task.due) {
      const cap = capacityUntil(task.due, x);
      const earlier = x.tasks.filter((t) => !t.done && t.id !== task.id && t.due && t.due <= task.due!).reduce((a, t) => a + personalEst(t, x.stats), 0);
      const need = personalEst(task, x.stats);
      const free = cap - earlier;
      parts.push(free >= need
        ? `«${task.title}» حدود ${estLabel(need)} کار است و تا ${dayLabel(task.due)}${earlier ? `، بعد از کارهای مهلت‌دار دیگر،` : ''} ${estLabel(Math.max(0, free))} وقت برایش داری. با عدد، جا داری.`
        : `«${task.title}» حدود ${estLabel(need)} کار است ولی تا ${dayLabel(task.due)} فقط ${estLabel(Math.max(0, free))} وقت خالی می‌ماند. پس باید چیزی را جابه‌جا کنی؛ این کار را الان بکن، نه شب قبلش.`);
      if (free < need) actions.push({ label: 'برنامه را بچین', kind: 'wizard' });
    } else parts.push(`«${task.title}» مهلت ثبت‌شده‌ای ندارد؛ اگر مهلت دارد، واردش کن تا بتوانم با عدد بگویم می‌رسی یا نه.`);
  } else {
    const r = report({ tasks: x.tasks, events: x.events, settings: plannerOf(), stats: x.stats, now: x.now, scope: 'week' });
    parts.push(`نتوانستم بفهمم دقیقاً درباره‌ی کدام کار است. کلی‌اش این است: این هفته ${estLabel(r.plannedMin)} کار داری برای ${estLabel(r.availableMin)} وقت${r.risks.length ? `، و فقط «${r.risks[0].title}» در خطر است` : '، و هیچ مهلتی در خطر نیست'}.`);
  }
  // your own track record
  const settled = x.coach.worries.filter((w) => w.outcome);
  if (settled.length >= 3) {
    const fine = settled.filter((w) => w.outcome === 'fine').length;
    parts.push(`از ${fa(settled.length)} نگرانیِ قبلی که ثبت کردی، ${fa(fine)} تا بی‌مورد درآمد.`);
  } else {
    const since = dayKey(addDays(x.now, -14));
    const dues = x.tasks.filter((t) => t.due && t.due >= since && t.due < today());
    if (dues.length >= 3) parts.push(`در دو هفته‌ی اخیر ${fa(Math.round((dues.filter((t) => t.done && t.doneAt && dayKey(new Date(t.doneAt)) <= t.due!).length / dues.length) * 100))}٪ کارهای مهلت‌دارت را سر وقت تمام کردی.`);
  }
  if (next) { parts.push(`قدم بعدی: «${next.title}». فقط ۲۵ دقیقه شروعش کن؛ نگرانی با شروع کردن کوچک می‌شود، نه با فکر کردن.`); actions.unshift({ label: 'شروع با تایمر', kind: 'focus', taskId: next.id }); }
  // log it, to ask later how it turned out
  const w: Worry = { id: uid(), text: text.slice(0, 200), taskId: task?.id, projectId: proj?.id, at: Date.now(), checkOn: due && due > today() ? due : dayKey(addDays(x.now, 3)) };
  const s = await loadCoach(); s.worries = [...s.worries.slice(-60), w]; await saveCoach(s);
  const core = parts.join(' ');
  return {
    text: st === 'direct' ? parts.filter((_, i) => i === 0 || i === parts.length - 1).join(' ') : wrap(st, core, { warm: 'نگرانی یعنی برایت مهم است؛ بیا با عدد نگاهش کنیم.', light: '(ذهن در تاریکی بدترین فیلم را پخش می‌کند؛ عددها چراغ را روشن می‌کنند.)' }),
    title: 'بیا با عدد نگاهش کنیم', ctx: 'worry', style: st, actions,
  };
}

/** Worries whose day has come: «اون نگرانی چی شد؟» */
export async function worriesToCheck(): Promise<Worry[]> {
  const s = await loadCoach();
  return s.worries.filter((w) => !w.outcome && w.checkOn <= today() && (!w.askedAt || Date.now() - w.askedAt > 20 * 3600_000));
}
export async function settleWorry(id: string, outcome?: Worry['outcome']): Promise<void> {
  const s = await loadCoach();
  s.worries = s.worries.map((w) => (w.id === id ? { ...w, outcome, askedAt: Date.now() } : w));
  await saveCoach(s);
}
export async function worryStats(): Promise<{ total: number; fine: number; partly: number; bad: number }> {
  const w = (await loadCoach()).worries.filter((x) => x.outcome);
  return { total: w.length, fine: w.filter((x) => x.outcome === 'fine').length, partly: w.filter((x) => x.outcome === 'partly').length, bad: w.filter((x) => x.outcome === 'bad').length };
}

/* ---------- prompts Ora raises by itself ---------- */
export async function dismiss(key: string, days = 30): Promise<void> { const s = await loadCoach(); s.dismissed[key] = Date.now() + days * 864e5; await saveCoach(s); }
export async function dismissedMap(): Promise<Record<string, number>> { return (await loadCoach()).dismissed; }
export async function askedRecently(kind: string, hours: number): Promise<boolean> { const s = await loadCoach(); return Date.now() - (s.asked[kind] ?? 0) < hours * 3600_000; }
export async function markAsked(kind: string): Promise<void> { const s = await loadCoach(); s.asked[kind] = Date.now(); await saveCoach(s); }

import { CRISIS_AFTER, CRISIS_TEXT, isCrisis, quietRestOfDay } from './safety';

/* ---------- the conversation ---------- */
export type Intent = 'next' | 'priorities' | 'behind' | 'worry' | 'week' | 'why' | 'done' | 'add' | 'review' | 'projects' | 'hello' | 'thanks' | 'help' | 'unknown';
const N = (s: string) => normalize(s).replace(/\s+/g, ' ').trim();
export function intentOf(text: string): Intent {
  const t = N(text);
  if (!t) return 'help';
  if (WORRY.test(t.replace(/‌/g, ' '))) return 'worry';
  if (/اولویت|درسته|درست است|مهم ترین|مهمترین/.test(t)) return 'priorities';
  if (/چرا .*(نشد|نمیشه|نمی شه|نرسیدم|عقب|نکردم|موند)|چرا هیچ/.test(t)) return 'why';
  if (/عقب|جا موندم|جا ماندم|نرسیدم|تلنبار|ریخته/.test(t)) return 'behind';
  if (/(انجام دادم|تموم شد|تمام شد|تموم کردم|تمام کردم|انجامش دادم)/.test(t)) return 'done';
  if (/^(اضافه کن|یادم بنداز|بنویس|باید)/.test(t)) return 'add';
  if (/جمع بندی|جمعبندی|نمره|روزم چطور/.test(t)) return 'review';
  if (/هفته/.test(t)) return 'week';
  if (/پروژه/.test(t)) return 'projects';
  if (/چیکار کنم|چی کار کنم|چه کار کنم|الان چی|از کجا شروع|بعدی چی|چی بخونم|شروع کنم/.test(t)) return 'next';
  if (/^(سلام|درود|صبح بخیر|عصر بخیر|شب بخیر)/.test(t)) return 'hello';
  if (/ممنون|مرسی|دمت گرم|تشکر/.test(t)) return 'thanks';
  if (/کمک|چی بلدی|چیکار میکنی|راهنما/.test(t)) return 'help';
  return 'unknown';
}

export const HELP = 'می‌توانم بگویم الان چه کاری بکنی و چرا، اولویت‌هایت را با مهلت‌ها و وقتت بسنجم، وقتی عقبی یک راه برگشت بچینم، نگرانی‌ات را با عدد بسنجم، بگویم چرا کاری مدام عقب می‌افتد، و روز را جمع‌بندی کنم. کافی است بنویسی؛ مثلاً «نگرانم به ارائه نرسم» یا «اولویت‌هام درسته؟».';

export async function respond(text: string, opts: { afterCrisis?: boolean } = {}): Promise<Reply> {
  // Someone in a very bad place: a fixed message and people to talk to — never coaching (core/safety).
  if (isCrisis(text)) { quietRestOfDay(); return { text: CRISIS_TEXT, crisis: 'first' }; }
  if (opts.afterCrisis) return { text: CRISIS_AFTER, crisis: 'after' };
  const x = await data();
  const it = intentOf(text);
  switch (it) {
    case 'next': return nextAction(x);
    case 'priorities': return checkPriorities(x);
    case 'behind': return catchUp(x);
    case 'worry': return worryReply(text, x);
    case 'week': return weekView(x);
    case 'review': return { text: 'جمع‌بندی امروز را باز می‌کنم: هر اولویت چقدر جلو رفت، و نمره‌ی روز.', actions: [{ label: 'جمع‌بندی روز', kind: 'review' }], ctx: 'review' };
    case 'projects': {
      const act = x.projects.filter((p) => p.status === 'active');
      if (!act.length) return { text: 'هنوز پروژه‌ای نداری. پروژه یعنی هدفی چندهفته‌ای که فازبه‌فاز جلو می‌رود؛ مثلاً «پایان‌نامه» با فازهای «مرور منابع، روش، آزمایش، نوشتن».', actions: [{ label: 'پروژه‌ی تازه', kind: 'project-new' }] };
      return { text: act.map((p) => { const s = projectState(p, x.tasks, x.now); return `«${p.title}»: فاز ${fa(s.phaseIndex + 1)} از ${fa(p.phases.length)} (${s.phase?.title ?? 'تمام'})، ${fa(Math.round(s.progress * 100))}٪${s.next ? `؛ قدم بعدی «${s.next.title}»` : '؛ قدم بعدی‌اش مشخص نیست'}${s.stalledDays >= 7 ? `؛ ${fa(s.stalledDays)} روز است تکان نخورده` : ''}.`; }).join('\n'), actions: [{ label: 'پروژه‌ها', kind: 'projects' }] };
    }
    case 'why': {
      const words = new Set(keyWords(text));
      const t = x.tasks.find((y) => keyWords(y.title).some((w) => words.has(w)));
      if (!t) { const sum = await reasonSummary(); return { text: sum ? `این ماه بیشترِ عقب‌ماندن‌ها (${fa(sum.count)} از ${fa(sum.total)}) به خاطر «${reasonLabel(sum.reason)}» بوده. ${remedy(sum.reason)}` : 'هنوز داده‌ی کافی ندارم. در جمع‌بندی شب‌ها بگو چرا کاری کامل نشد؛ بعد از چند روز الگویش را می‌بینم.' }; }
      const pat = patternFrom(x.coach, t, x.projects) ?? patternFrom(x.coach, t, x.projects, 1);
      return { text: pat ? `${pat.scope} ${pat.count > 1 ? `${fa(pat.count)} بار` : 'دفعه‌ی قبل'} به خاطر «${reasonLabel(pat.reason)}» عقب افتاد. ${remedy(pat.reason, t)}` : `برای «${t.title}» هنوز دلیل تکراری‌ای ثبت نشده${(t.slips ?? 0) ? `، ولی ${fa(t.slips!)} بار عقب افتاده` : ''}. امشب در جمع‌بندی بگو چرا؛ از دفعه‌ی بعد دقیق‌تر کمک می‌کنم.`, ctx: 'why' };
    }
    case 'done': {
      const words = new Set(keyWords(text));
      const t = x.tasks.filter((y) => !y.done).map((y) => [y, keyWords(y.title).filter((w) => words.has(w)).length] as const).sort((a, b) => b[1] - a[1])[0];
      if (!t || !t[1]) return { text: 'کدام کار؟ اسمش را بنویس تا تیکش بزنم.' };
      const { toggleDone } = await import('./planner');
      if (!(await toggleDone(t[0]))) return { text: `«${t[0].title}» هنوز وقتش نرسیده؛ اگر واقعاً زودتر انجامش دادی، در پیام کنار چشم «زودتر انجامش دادم» را بزن.` };
      const left = x.tasks.filter((y) => isToday(y, today()) && !y.done && y.id !== t[0].id).length;
      return { text: `«${t[0].title}» تیک خورد. ${left ? `امروز ${fa(left)} کار دیگر مانده.` : 'برای امروز چیزی نمانده؛ آفرین.'}`, ctx: 'done' };
    }
    case 'add': {
      const { parseTask } = await import('./taskparse');
      const { addParsed } = await import('./planner');
      const raw = text.replace(/^(اضافه کن|یادم بنداز|بنویس)\s*(که)?\s*/, '').replace(/^باید\s*/, '');
      const t = await addParsed(parseTask(raw));
      return { text: `نوشتم: «${t.title}»${t.when ? `، برای ${dayLabel(t.when)}` : ''}.` };
    }
    case 'hello': { const n = x.tasks.filter((t) => isToday(t, today()) && !t.done).length; return { text: `سلام! امروز ${fa(n)} کار داری. بپرس «الان چی کار کنم؟» یا هر چیزی که ذهنت را مشغول کرده.` }; }
    case 'thanks': return { text: 'خواهش می‌کنم. برو سراغش.' };
    case 'help': return { text: HELP };
    default: return askModel(text, x);
  }
}

/** Free-form talk: only with a local model; it gets a compact picture of your day. */
async function askModel(text: string, x: Data): Promise<Reply> {
  const ai = useStore.getState().settings.ai;
  if (!ai.model) return { text: `این را با قاعده‌هایم نفهمیدم. ${HELP}` };
  const t0 = today();
  const ctx = {
    today: x.tasks.filter((t) => isToday(t, t0)).map((t) => ({ title: t.title, done: t.done, top: !!t.top, due: t.due, est: t.est, time: t.time })),
    projects: x.projects.filter((p) => p.status === 'active').map((p) => ({ title: p.title, phase: projectState(p, x.tasks, x.now).phase?.title, due: p.due })),
    week: (({ plannedMin, availableMin, verdict, risks }) => ({ plannedMin, availableMin, verdict, risks }))(report({ tasks: x.tasks, events: x.events, settings: plannerOf(), stats: x.stats, now: x.now, scope: 'week' })),
  };
  const { streamChat } = await import('./providers/ai');
  try {
    const out = await streamChat(ai, [{ role: 'user', content: `${text}\n\n[وضعیت برنامه‌ی من، برای اطلاع]\n${JSON.stringify(ctx)}` }], () => {}, undefined,
      'تو «اورآ» هستی، مربی برنامه‌ریزی. کوتاه (حداکثر چهار جمله)، صادق و مشخص جواب بده؛ از عددهای وضعیت استفاده کن؛ تعریف بی‌دلیل نکن؛ اگر نمی‌دانی بگو.');
    return { text: out.trim(), ctx: 'model' };
  } catch {
    return { text: `الان به مدل دسترسی ندارم. ${HELP}` };
  }
}

/* ---------- applying an action from a reply ---------- */
export async function runAction(a: Action): Promise<string | null> {
  const { setFocusTask, setTop, reschedule } = await import('./planner');
  if (a.kind === 'focus' && a.taskId) { setFocusTask(a.taskId); dispatchEvent(new Event('ora:focus-start')); return 'تایمر روی این کار شروع شد.'; }
  if (a.kind === 'star' && a.taskId) { const t = await db.tasks.get(a.taskId); if (t && !(await setTop(t, true))) return 'سه کار مهم پر است؛ اول یکی را بردار.'; return 'جزو سه کار مهم امروز شد.'; }
  if (a.kind === 'tomorrow' && a.taskId) { const t = await db.tasks.get(a.taskId); if (t) await reschedule(t, tomorrow()); return 'رفت برای فردا.'; }
  if (a.kind === 'lighten') {
    if (a.payload === 'keep3') {
      const t0 = today();
      const open = (await db.tasks.toArray()).filter((t) => (isToday(t, t0) || isOverdue(t, t0)) && !t.done && !t.fixed);
      const keep = [...open].sort((p, q) => score(q, t0) - score(p, t0)).slice(0, 3);
      for (const t of open) if (!keep.includes(t)) await reschedule(t, tomorrow());
      for (const t of keep) { await db.tasks.update(t.id, { when: t0 }); await setTop(t, true); }
      return `سه کار برای امروز ماند (${keep.map((t) => `«${t.title}»`).join('، ')})؛ بقیه رفتند فردا.`;
    }
    for (const id of (a.payload ?? '').split(',').filter(Boolean)) { const t = await db.tasks.get(id); if (t) await reschedule(t, tomorrow()); }
    return 'رفتند برای فردا.';
  }
  if (a.kind === 'review') { dispatchEvent(new CustomEvent('ora:review')); return null; }
  if (a.kind === 'wizard') { dispatchEvent(new CustomEvent('ora:schedule', { detail: { wizard: true } })); return null; }
  if (a.kind === 'projects' || a.kind === 'project-new') { dispatchEvent(new CustomEvent('ora:projects', { detail: { create: a.kind === 'project-new' ? (a.payload ?? '') : undefined } })); return null; }
  if (a.kind === 'open-task' && a.taskId) { dispatchEvent(new CustomEvent('ora:edit-task', { detail: a.taskId })); return null; }
  if (a.kind === 'dismiss' && a.payload) { await dismiss(a.payload); return 'باشه، دیگر نمی‌پرسم.'; }
  return null;
}

/* ---------- the evening's last word ---------- */
export function reviewMessage(st: Style, s: { score: number; verdict: string; over: boolean }, items: { title: string; level: number; rank: number; reason?: Reason }[], streak: number, avg: number | null): string {
  const counted = items.filter((x) => x.reason !== 'priority');
  const done = counted.filter((x) => x.level === 4).length;
  const first = counted.find((x) => x.rank === Math.min(...counted.map((y) => y.rank)));
  const left = counted.filter((x) => x.level < 4).sort((a, b) => a.rank - b.rank)[0];
  const facts = `${fa(done)} از ${fa(counted.length)} اولویت کامل شد${first ? first.level === 4 ? `، و مهم‌ترینش («${first.title}») هم` : `؛ مهم‌ترینش («${first.title}») ${first.level ? 'نیمه‌کاره ماند' : 'انجام نشد'}` : ''}.`;
  const tomorrowLine = left ? `فردا اول «${left.title}».` : 'فردا با ذهن آزاد شروع کن.';
  const overLine = s.over ? ' برنامه‌ی امروز از اول بیشتر از وقتت بود؛ بخشی از این نمره مال برنامه است، نه تو. فردا سبک‌تر بچین.' : '';
  const trend = avg !== null && Math.abs(s.score - avg) >= 10 ? ` (میانگین روزهای اخیرت ${fa(avg)} است.)` : '';
  const run = streak >= 2 ? ` ${fa(streak)} روز مفید پشت سر هم.` : '';
  if (st === 'direct') return `${fa(s.score)}، ${s.verdict}. ${tomorrowLine}${overLine}`;
  if (st === 'warm') return `${s.score >= 60 ? 'روز خوبی بود.' : 'روز ساده‌ای نبود، و همین که نشستی و جمع‌بندی‌اش کردی یعنی رهایش نکرده‌ای.'} ${facts}${run}${overLine} ${tomorrowLine}`;
  if (st === 'light') return `${facts}${run}${s.score >= 80 ? ' کاکتوس هم به این نظم حسودی می‌کند.' : s.score >= 60 ? ' نه شاهکار، نه فاجعه؛ یک روز درست و حسابی.' : ' فردا روز دیگری است؛ و فهرستت هم.'}${overLine} ${tomorrowLine}`;
  return `نمره ${fa(s.score)} از ۱۰۰ (${s.verdict}).${trend} ${facts}${run}${overLine} ${tomorrowLine}`;
}
