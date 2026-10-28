// Phase 4 in the real extension: the day review and its score, reasons that teach Ora, the coach chat
// (priorities, worries, rating a reply), projects with phases, and «پروژه‌اش کنیم؟».
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dist = path.resolve('dist');
const key = JSON.parse(fs.readFileSync('dist/manifest.json')).key;
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/co-'), { executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'], viewport: { width: 1440, height: 920 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let fail = 0; const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };
const shots = process.env.O || '/tmp/claude-0/coach-shots'; fs.mkdirSync(shots, { recursive: true });
const k = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = k(new Date()); const tmr = k(new Date(Date.now() + 864e5));
await page.goto(`chrome-extension://${id}/index.html`); await page.waitForTimeout(1500);
await page.evaluate(() => { localStorage.setItem('ora:tip-at', String(Date.now() + 3600e3)); localStorage.setItem('ora:ritual', JSON.stringify({ morning: new Date().toISOString().slice(0, 10), evening: new Date().toISOString().slice(0, 10) })); });
const put = (store, rows) => page.evaluate(({ store, rows }) => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const tx = r.result.transaction(store, 'readwrite'); for (const x of rows) tx.objectStore(store).put(x); tx.oncomplete = res; }; }), { store, rows });
const all = (store) => page.evaluate((st) => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const q = r.result.transaction(st).objectStore(st).getAll(); q.onsuccess = () => res(q.result); }; }), store);
const T = (o) => ({ done: false, priority: 0, order: 1, createdAt: Date.now(), when: today, ...o });
await put('tasks', [
  T({ id: 'sem', title: 'ارائه‌ی سمینار', top: true, due: tmr, est: 120, area: 'پژوهش' }),
  T({ id: 'math', title: 'تمرین ریاضی', top: true, est: 60, area: 'درس' }),
  T({ id: 'mail', title: 'جواب ایمیل‌ها', est: 30, done: true, doneAt: Date.now() }),
  T({ id: 'art', title: 'داوری مقاله', est: 90, priority: 1, due: today }),
]);
await page.reload(); await page.waitForTimeout(1500);

/* ---------- the day review ---------- */
await page.evaluate(() => dispatchEvent(new CustomEvent('ora:review')));
const rv = page.getByRole('dialog', { name: 'جمع‌بندی روز' });
await rv.waitFor();
await rv.locator('.rv-title').first().waitFor();
const titles = await rv.locator('.rv-title').allInnerTexts();
check('review lists today\'s priorities, starred first, then the urgent one', titles[0] === 'ارائه‌ی سمینار' && titles[1] === 'تمرین ریاضی' && titles[2] === 'داوری مقاله');
await rv.getByRole('radiogroup', { name: 'ارائه‌ی سمینار: تا کجا؟' }).getByRole('radio', { name: 'کامل' }).click();
await rv.getByRole('radiogroup', { name: 'تمرین ریاضی: تا کجا؟' }).getByRole('radio', { name: 'شروع شد' }).click();
await rv.getByRole('button', { name: 'پایین‌تر: ارائه‌ی سمینار' }).click();
check('priorities can be reordered', (await rv.locator('.rv-title').first().innerText()) === 'تمرین ریاضی');
await rv.getByRole('button', { name: 'بالاتر: ارائه‌ی سمینار' }).click();
await rv.getByLabel('کار پیش‌بینی‌نشده').fill('جواب فوری به استاد'); await rv.getByRole('button', { name: 'افزودن' }).click();
await page.screenshot({ path: `${shots}/1-review-items.png` });
await rv.getByRole('button', { name: 'بعدی' }).click();
const mathItem = rv.locator('.rv-item', { hasText: 'تمرین ریاضی' });
await mathItem.getByRole('button', { name: 'نمی‌دانستم از کجا شروع کنم' }).click();
check('choosing a reason shows what helps with it', /قدم اولِ دقیق/.test(await mathItem.locator('.rv-remedy').innerText()));
await rv.locator('.rv-item', { hasText: 'داوری مقاله' }).getByRole('button', { name: 'کار پیش‌بینی‌نشده یا مزاحمت' }).click();
await page.screenshot({ path: `${shots}/2-review-why.png` });
await rv.getByRole('button', { name: 'نمره‌ی امروز' }).click();
const scoreTxt = await rv.locator('.rv-dial b').innerText();
check('the day gets a score with its verdict and parts', /^[۰-۹]+$/.test(scoreTxt) && (await rv.locator('.rv-part').count()) >= 2 && /روز/.test(await rv.locator('.rv-verdict').innerText()));
check('the coach says a word about the day', (await rv.locator('.rv-msg p').innerText()).length > 20);
await rv.getByRole('button', { name: 'آره' }).first().click();
await rv.getByRole('button', { name: 'خوب', exact: true }).click();
await page.screenshot({ path: `${shots}/3-review-score.png` });
await rv.getByRole('button', { name: 'ثبت و مانده‌ها' }).click(); await page.waitForTimeout(400);
const review = (await all('reviews')).find((r) => r.day === today);
check('the review is saved with levels, reasons, extra work and energy', review && review.items.find((x) => x.taskId === 'math').reason === 'unclear' && review.extra.length === 1 && review.energy === 4 && review.score === Number(scoreTxt.replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c))));
check('a finished priority is ticked', (await all('tasks')).find((t) => t.id === 'sem').done === true);
await rv.getByLabel('قدم اول تمرین ریاضی').fill('سؤال ۱ فصل ۴ را بخوان و داده‌ها را بنویس'); await rv.getByRole('button', { name: 'ثبت' }).click(); await page.waitForTimeout(300);
check('for «unclear», the first concrete step is written into the task', ((await all('tasks')).find((t) => t.id === 'math').steps ?? [])[0]?.title.startsWith('سؤال ۱'));
await page.screenshot({ path: `${shots}/4-review-tomorrow.png` });
await rv.locator('.rv-item', { hasText: 'تمرین ریاضی' }).getByRole('button', { name: 'فردا' }).click(); await page.waitForTimeout(200);
check('leftovers can go to tomorrow', (await all('tasks')).find((t) => t.id === 'math').when === tmr);
await rv.getByRole('button', { name: 'روز را ببند' }).click();
const coachKv = await page.evaluate(() => chrome.storage.local.get('ora:coach').then((r) => r['ora:coach']));
check('reasons are learned per task, area and word', coachKv?.reasons?.['task:math']?.unclear === 1 && coachKv.reasons['area:درس']?.unclear === 1 && coachKv.reasons.all.interrupt === 1);

/* ---------- the coach chat ---------- */
await put('tasks', [T({ id: 'math', title: 'تمرین ریاضی', top: false, est: 60, area: 'درس', when: today })]);
await page.reload(); await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'گفتگو با اورآ' }).click();
const co = page.getByRole('dialog', { name: 'گفتگو با اورآ' });
await co.getByRole('button', { name: 'اولویت‌هام درسته؟' }).click(); await page.waitForTimeout(500);
const pr = await co.locator('.coach-msg.ora').last().innerText();
check('«اولویت‌هام درسته؟» spots the urgent task that is not among the three', /داوری مقاله/.test(pr) && /مهلتش/.test(pr));
await co.locator('.coach-msg.ora').last().getByRole('button', { name: /داوری مقاله.*مهم کن/ }).click(); await page.waitForTimeout(300);
check('its action stars the task', (await all('tasks')).find((t) => t.id === 'art').top === true);
await co.getByLabel('پیام به اورآ').fill('خیلی نگرانم به ارائه‌ی سمینار نرسم'); await co.getByRole('button', { name: 'بفرست' }).click(); await page.waitForTimeout(600);
const wr = await co.locator('.coach-msg.ora').last().innerText();
check('a worry about finished work says so', /سمینار/.test(wr) && /تمام کرده‌ای/.test(wr));
await co.getByLabel('پیام به اورآ').fill('استرس دارم داوری مقاله رو نرسونم'); await co.getByRole('button', { name: 'بفرست' }).click(); await page.waitForTimeout(600);
const wr2 = await co.locator('.coach-msg.ora').last().innerText();
check('a worry is answered with your own numbers and a next step', /داوری مقاله/.test(wr2) && /(ساعت|دقیقه)/.test(wr2) && /شروع با تایمر/.test(wr2));
const w = await page.evaluate(() => chrome.storage.local.get('ora:coach').then((r) => r['ora:coach'].worries));
check('the worry is logged to be checked later', w.length === 1 && w[0].taskId === 'art' && w[0].checkOn >= new Date().toISOString().slice(0, 10).replace(/-\d\d$/, ''));
await co.locator('.coach-msg.ora').last().getByRole('button', { name: 'آره' }).click();
const styles = await page.evaluate(() => chrome.storage.local.get('ora:coach').then((r) => r['ora:coach'].styles));
check('rating a reply teaches Ora how to talk to you', !!styles?.worry && Object.values(styles.worry).some(([a]) => a === 2));
await co.getByLabel('پیام به اورآ').fill('چرا تمرین ریاضی همش عقب میفته؟'); await co.getByRole('button', { name: 'بفرست' }).click(); await page.waitForTimeout(500);
check('«چرا…؟» answers from what you told it', /دفعه‌ی قبل به خاطر «نمی‌دانستم از کجا شروع کنم»/.test(await co.locator('.coach-msg.ora').last().innerText()));
await co.getByLabel('پیام به اورآ').fill('الان چی کار کنم؟'); await co.getByRole('button', { name: 'بفرست' }).click(); await page.waitForTimeout(500);
check('«الان چی کار کنم؟» names one task and why', /^الان «/.test(await co.locator('.coach-msg.ora p').last().innerText()));
await page.screenshot({ path: `${shots}/5-coach.png` });
await page.keyboard.press('Escape');

/* ---------- projects ---------- */
await page.getByRole('button', { name: 'پروژه‌ها' }).click();
const pj = page.getByRole('dialog', { name: 'پروژه‌ها' });
await pj.getByRole('button', { name: 'پروژه‌ی تازه' }).click();
await pj.getByLabel('نام پروژه').fill('پایان‌نامه');
await pj.getByLabel('چرا مهم است').fill('دفاع تا آخر بهار');
await pj.getByRole('button', { name: 'پژوهش و مقاله' }).click();
await pj.getByRole('button', { name: 'ساختن پروژه' }).click(); await page.waitForTimeout(400);
const p = (await all('projects'))[0];
check('a project is created with its phases', p && p.title === 'پایان‌نامه' && p.phases.length === 5 && p.status === 'active');
await pj.getByLabel('کار تازه‌ی پروژه').fill('خواندن مقاله‌ی اسمیت ۴۵ دقیقه'); await pj.getByLabel('کار تازه‌ی پروژه').press('Enter'); await page.waitForTimeout(400);
const pt = (await all('tasks')).find((t) => t.title.startsWith('خواندن مقاله‌ی اسمیت'));
check('a task added on the project page belongs to its current phase', pt?.project === p.id && pt.phase === p.phases[0].id);
check('the project shows its next step', /خواندن مقاله‌ی اسمیت/.test(await pj.locator('.pj-next').innerText()));
await pj.getByRole('checkbox', { name: 'فاز مرور منابع تمام شد' }).click(); await page.waitForTimeout(300);
const p2 = (await all('projects'))[0];
check('finishing a phase moves the project (and its open tasks) to the next phase', p2.phases[0].done && (await all('tasks')).find((t) => t.id === pt.id).phase === p2.phases[1].id && /فاز فعلی/.test(await pj.locator('.pj-phase.cur').innerText()));
await page.screenshot({ path: `${shots}/6-project.png` });
await page.keyboard.press('Escape');

/* ---------- «پروژه‌اش کنیم؟» ---------- */
const ago = (n) => k(new Date(Date.now() - n * 864e5));
await put('tasks', [0, 2, 4, 6].map((n, i) => T({ id: `lang${i}`, title: i % 2 ? 'تمرین اسپانیایی' : 'اسپانیایی: لغت و گرامر', when: ago(n), done: n > 0, est: 45, createdAt: Date.now() - n * 864e5 })));
await page.evaluate(() => { localStorage.setItem('ora:tip-at', '0'); return chrome.storage.local.get('ora:coach').then((r) => chrome.storage.local.set({ 'ora:coach': { ...r['ora:coach'], asked: {}, worries: [] } })); });
await page.reload();
await page.waitForFunction(() => /پروژه/.test(document.querySelector('.ora-tip-text')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => {});
const tip = await page.locator('.ora-tip-text').innerText().catch(() => '');
check('Ora notices repeated work and offers to make it a project', /اسپانیایی/.test(tip) && /پروژه/.test(tip));
await page.screenshot({ path: `${shots}/7-suggest.png` });
await page.locator('.ora-tip-choices .pill', { hasText: 'آره، پروژه‌اش کن' }).click(); await page.waitForTimeout(300);
check('«آره» opens a new project with the title and the tasks to attach', (await page.getByRole('dialog', { name: 'پروژه‌ها' }).getByLabel('نام پروژه').inputValue()).includes('اسپانیایی') && /۴ کارِ مرتبط/.test(await page.getByRole('dialog', { name: 'پروژه‌ها' }).innerText()));
await page.getByRole('dialog', { name: 'پروژه‌ها' }).getByRole('button', { name: 'ساختن پروژه' }).click(); await page.waitForTimeout(400);
check('the related tasks are attached', (await all('tasks')).filter((t) => t.id.startsWith('lang')).every((t) => t.project));
check('no page errors', errors.length === 0); if (errors.length) console.log(errors);
await ctx.close();
process.exit(fail ? 1 : 0);
