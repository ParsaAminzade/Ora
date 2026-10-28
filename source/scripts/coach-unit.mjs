// Unit checks for the coach: day score, intents, slip patterns, project suggestions, project state.
import { rolldown } from 'rolldown';
import path from 'node:path'; import fs from 'node:fs';
const S = path.resolve('scripts/stubs') + '/';
const dir = fs.mkdtempSync('/tmp/claude-0/co-');
const entry = path.join(dir, 'entry.ts');
fs.writeFileSync(entry, `export { computeScore, defaultItems } from '${path.resolve('src/core/review.ts')}'; export { intentOf, patternFrom, remedy, reviewMessage } from '${path.resolve('src/core/coach.ts')}'; export { projectCandidates, projectState, keyWords, suggestProject } from '${path.resolve('src/core/projects.ts')}';`);
const b = await rolldown({ input: entry, platform: 'node', logLevel: 'silent',
  plugins: [{ name: 'stub', resolveId(src) { return { './db': S + 'db.ts', './state': S + 'state.ts', './kv': S + 'kv.ts', './providers/calendar': S + 'calendar.ts', './providers/ai': S + 'ai.ts' }[src] ?? null; } }] });
await b.write({ file: path.join(dir, 'out.mjs'), format: 'esm' });
const m = await import(path.join(dir, 'out.mjs'));
let fail = 0; const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };
const d = new Date(); const k = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; const today = k(d);
const T = (o) => ({ done: false, priority: 0, order: 1, createdAt: Date.now(), when: today, ...o });
const items = (levels) => levels.map((l, i) => ({ taskId: `t${i}`, title: `کار ${i + 1}`, rank: i + 1, level: l }));
// priorities only (no planned minutes, no other tasks) → the score is the rank-weighted completion
const s3top = m.computeScore(items([4, 4, 4, 0, 0]), []);
const s3bot = m.computeScore(items([0, 0, 4, 4, 4]), []);
check('top three of five = 80, bottom three = 40 (rank-sum weights)', s3top.score === 80 && s3bot.score === 40);
check('a useful day is 60+', s3top.verdict === 'great' && m.computeScore(items([4, 4, 0, 0, 0]), []).score === 60 && m.computeScore(items([4, 4, 0, 0, 0]), []).verdict === 'useful');
check('partial credit: half of the only priority = 50', m.computeScore(items([2]), []).score === 50);
const dropped = items([4, 0, 4]); dropped[1].reason = 'priority';
check('a priority consciously set aside does not count', m.computeScore(dropped, []).score === 100);
const tk = [T({ id: 't0', title: 'الف', est: 60, time: '09:00', done: true }), T({ id: 't1', title: 'ب', est: 60, time: '11:00' }), T({ id: 'o1', title: 'ج', est: 30, done: true }), T({ id: 'o2', title: 'د', est: 30 })];
const mixed = m.computeScore(items([4, 0]), tk);
check('focus and the rest of the list are weighted in (70/20/10)', Math.abs(mixed.weights.priorities - 0.7) < 1e-9 && Math.abs(mixed.weights.focus - 0.2) < 1e-9 && Math.abs(mixed.parts.rest - 0.5) < 1e-9 && mixed.score === Math.round(100 * (0.7 * (2 / 3) + 0.2 * mixed.parts.focus + 0.1 * 0.5)));
const def = m.defaultItems([T({ id: 'a', title: 'ستاره‌دار', top: true }), T({ id: 'b', title: 'مهلت امروز', due: today, priority: 1 }), T({ id: 'c', title: 'معمولی' }), T({ id: 'x', title: 'انجام‌شده', done: true, doneAt: Date.now() })]);
check('default priorities: starred first, then by deadline and importance', def[0].taskId === 'a' && def[1].taskId === 'b' && def.find((x) => x.taskId === 'x').level === 4);
// intents
const I = (s) => m.intentOf(s);
check('intents: worry / priorities / behind / next / done / week', I('خیلی نگرانم به ارائه نرسم') === 'worry' && I('اولویت‌هام درسته؟') === 'priorities' && I('خیلی عقبم') === 'behind' && I('الان چی کار کنم؟') === 'next' && I('تمرین فیزیک رو انجام دادم') === 'done' && I('هفته‌ام چطوره؟') === 'week');
check('intents: why / add / review', I('چرا مقاله‌م همش عقب میفته و نمیشه') === 'why' && I('اضافه کن خرید نان') === 'add' && I('جمع‌بندی امروز') === 'review');
// patterns
const coach = { reasons: { 'word:ریاضی': { unclear: 3, energy: 1 }, 'area:درس': { energy: 2, estimate: 2 } }, worries: [], styles: {}, dismissed: {}, asked: {} };
const p = m.patternFrom(coach, { title: 'تمرین ریاضی فصل ۴', area: 'درس' });
check('slip pattern: «ریاضی» usually slips because the first step is unclear', p && p.reason === 'unclear' && p.count === 3);
check('no pattern without a clear majority', m.patternFrom(coach, { title: 'زبان', area: 'درس' }) === null);
check('each reason has its remedy', /قدم اولِ دقیق/.test(m.remedy('unclear', { title: 'x' })) && /اگر ساعت/.test(m.remedy('avoid')));
// project candidates
const days = [0, 2, 4, 6].map((i) => { const x = new Date(); x.setDate(x.getDate() - i); return k(x); });
const thesis = days.map((w, i) => T({ id: `th${i}`, title: i % 2 ? 'نوشتن پایان‌نامه فصل ۲' : 'پایان‌نامه: مرور منابع', when: w, done: i > 0, est: 60 }));
const cands = m.projectCandidates([...thesis, T({ id: 'z', title: 'خرید نان' })], []);
check('repeated work over several days is offered as a project', cands.length >= 1 && /پایان/.test(cands[0].label) && cands[0].taskIds.length === 4);
check('a dismissed suggestion stays quiet', m.projectCandidates(thesis, [], { [cands[0].key]: Date.now() + 1e9 }).every((c) => c.key !== cands[0].key));
const big = m.projectCandidates([T({ id: 'bg', title: 'بازطراحی سایت', est: 300, slips: 4 })], []);
check('a big task that keeps slipping is a project in disguise', big[0]?.why === 'big');
// project state
const proj = { id: 'p1', title: 'پایان‌نامه', status: 'active', createdAt: Date.now() - 20 * 864e5, phases: [{ id: 'f1', title: 'مرور', done: true }, { id: 'f2', title: 'روش', done: false }, { id: 'f3', title: 'نوشتن', done: false }], weekly: 600 };
const pt = [T({ id: 'q1', title: 'خواندن مقاله الف', project: 'p1', phase: 'f2', done: true, doneAt: Date.now(), est: 60 }), T({ id: 'q2', title: 'طراحی آزمایش', project: 'p1', phase: 'f2', est: 90 })];
const st = m.projectState(proj, pt);
check('project state: current phase, next step, progress between phases', st.phase.id === 'f2' && st.next.id === 'q2' && st.progress > 1 / 3 && st.progress < 2 / 3);
check('a new task is matched to its project by its words', m.suggestProject('فصل دوم پایان‌نامه', [{ ...proj, keys: ['پایان', 'نامه', 'پایان‌نامه', 'فصل'] }])?.id === 'p1');
// the evening word
const msg = m.reviewMessage('data', { score: 72, verdict: 'روز مفید', over: true }, [{ title: 'الف', level: 4, rank: 1 }, { title: 'ب', level: 1, rank: 2 }], 2, 55);
check('the evening message states the facts, the plan-was-too-heavy caveat and tomorrow', /۷۲/.test(msg) && /بیشتر از وقتت/.test(msg) && /فردا اول «ب»/.test(msg));
process.exit(fail ? 1 : 0);
