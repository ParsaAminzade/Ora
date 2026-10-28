// Planner: natural entry, views, top three, editor, repeat, rollover, planner ritual, binge guard, prayer reminder.
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dist = path.resolve('dist');
const key = JSON.parse(fs.readFileSync('dist/manifest.json')).key;
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/pl-'), { executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'], viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let fail = 0; const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };
const shots = process.env.O || '/tmp/claude-0/pl-shots'; fs.mkdirSync(shots, { recursive: true });
await page.goto(`chrome-extension://${id}/index.html`); await page.waitForTimeout(1800);
const tasks = page.locator('section[aria-label="تسک‌ها"]');
const input = page.getByLabel('تسک جدید');

// natural entry with live chips
await input.fill('فردا ساعت ۵ عصر مقاله رو بخونم ۴۵ دقیقه #پژوهش !');
check('chips preview while typing', (await tasks.locator('.chip').allInnerTexts()).join('|') === 'فردا|ساعت ۱۷:۰۰|۴۵ دقیقه|مهم|#پژوهش');
await input.press('Enter');
check('tomorrow task is not in today', (await tasks.locator('.task-row', { hasText: 'مقاله رو بخونم' }).count()) === 0);
await tasks.getByRole('tab', { name: 'پیش‌رو' }).click();
check('upcoming shows it under «فردا»', (await tasks.locator('.task-group-h').first().innerText()).startsWith('فردا') && (await tasks.locator('.task-row', { hasText: 'مقاله رو بخونم' }).count()) === 1);
await tasks.getByRole('tab', { name: 'امروز' }).click();
for (const t of ['ارسال گزارش ۳۰ دقیقه', 'تمرین انگلیسی هر روز نیم ساعت', 'جواب ایمیل‌ها ۲ ساعت', 'خواندن فصل سوم ۳ ساعت', 'کار کوچک']) { await input.fill(t); await input.press('Enter'); }
await page.waitForTimeout(400);
const n5 = await tasks.locator('.task-row').count(); if (n5 !== 5) console.log('rows:', await tasks.locator('.task-title').allInnerTexts());
check('typed in today → today', n5 === 5);
check('capacity line warns when over the day', /بیشتر از وقتت/.test(await tasks.locator('.task-cap').innerText()));

// top three
for (const t of ['ارسال گزارش', 'جواب ایمیل‌ها', 'کار کوچک']) { const r = tasks.locator('.task-row', { hasText: t }); await r.hover(); await r.getByRole('button', { name: 'از سه کار مهم امروز' }).click(); }
check('top three grouped first', (await tasks.locator('.task-group-h').first().innerText()) === 'سه کار مهم امروز');
const fourth = tasks.locator('.task-row', { hasText: 'خواندن فصل سوم' }); await fourth.hover(); await fourth.getByRole('button', { name: 'از سه کار مهم امروز' }).click();
await page.waitForTimeout(200);
check('a fourth star is refused', (await tasks.locator('.task-toast').count()) === 1);
await page.screenshot({ path: `${shots}/1-today.png` });

// repeat: done → next day
const rep = tasks.locator('.task-row', { hasText: 'تمرین انگلیسی' });
await rep.locator('.chk').click(); await page.waitForTimeout(300);
const repRows = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const q = r.result.transaction('tasks').objectStore('tasks').getAll(); q.onsuccess = () => res(q.result.filter((x) => x.title === 'تمرین انگلیسی').map((x) => ({ done: x.done, when: x.when }))); }; }));
const tmr = new Date(Date.now() + 864e5); const tk = `${tmr.getFullYear()}-${String(tmr.getMonth() + 1).padStart(2, '0')}-${String(tmr.getDate()).padStart(2, '0')}`;
check('repeating task: a done copy + the next one tomorrow', repRows.length === 2 && repRows.some((x) => x.done) && repRows.some((x) => !x.done && x.when === tk));

// editor
await tasks.locator('.task-row', { hasText: 'کار کوچک' }).locator('.task-main').click();
const ed = page.getByRole('dialog', { name: 'جزئیات کار' });
await ed.waitFor({ timeout: 3000 }).catch(() => {});
check('editor opens', await ed.isVisible());
await ed.getByRole('button', { name: '۱ ساعت' }).click();
await ed.getByPlaceholder(/مرحله‌ی بعدی/).fill('قدم اول'); await ed.getByPlaceholder(/مرحله‌ی بعدی/).press('Enter');
await page.screenshot({ path: `${shots}/2-editor.png` });
await page.keyboard.press('Escape');
check('editor changes show on the row', /۱ ساعت/.test(await tasks.locator('.task-row', { hasText: 'کار کوچک' }).innerText()) && /۰\/۱/.test(await tasks.locator('.task-row', { hasText: 'کار کوچک' }).innerText()));

// reschedule menu
const r2 = tasks.locator('.task-row', { hasText: 'خواندن فصل سوم' }); await r2.hover(); await r2.getByRole('button', { name: 'جابه‌جایی به روز دیگر' }).click();
await page.getByRole('menuitem', { name: 'فردا' }).click(); await page.waitForTimeout(200);
check('moved to tomorrow leaves today', (await tasks.locator('.task-row', { hasText: 'خواندن فصل سوم' }).count()) === 0);

// rollover: make a task from two days ago, then the planner offers it
await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const d = new Date(Date.now() - 2 * 864e5); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const tx = r.result.transaction('tasks', 'readwrite'); tx.objectStore('tasks').put({ id: 'old1', title: 'کار جامانده', done: false, priority: 0, order: 1, createdAt: 1, when: k }); tx.oncomplete = res; }; }));
await page.reload(); await page.waitForTimeout(1800);
check('rolled-over task is shown with its lateness', /۲ روز عقب/.test(await tasks.locator('.task-row', { hasText: 'کار جامانده' }).innerText()));
await page.evaluate(() => dispatchEvent(new CustomEvent('ora:planner', { detail: 'plan' })));
await page.waitForTimeout(400);
const pl = page.getByRole('dialog', { name: /برنامه‌ریزی امروز|جمع‌بندی امروز/ });
check('planner opens', await pl.isVisible());
if (await pl.getByText('کار جامانده').count()) {
  await pl.locator('.pl-row', { hasText: 'کار جامانده' }).getByRole('button', { name: 'امروز' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/3-planner.png` });
  while (await pl.getByRole('button', { name: 'بعدی' }).count()) { await pl.getByRole('button', { name: 'بعدی' }).click(); await page.waitForTimeout(150); }
  await pl.getByRole('button', { name: 'بچین' }).click(); await page.waitForTimeout(300);
  check('time blocking gives tasks start times', /زمان‌بندی شد/.test(await pl.innerText()));
  await page.screenshot({ path: `${shots}/4-planner-time.png` });
  await pl.getByRole('button', { name: 'برنامه آماده است' }).click();
} else { console.log('planner text:', (await pl.innerText()).slice(0, 300)); check('planner shows the slipped task', false); }
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

// binge guard
const fig = page.locator('figure.sentence');
for (let i = 0; i < 7; i++) { await fig.hover(); await fig.getByRole('button', { name: 'دیگری' }).click({ force: true }).catch(() => {}); await page.waitForTimeout(120); }
check('Ora steps in after rapid skipping', /کاکتوس|ورق می‌زنی|آمار|ماه رسیده|یه جمله کافیه|سکوی پرتابه/.test(await page.locator('.ora-tip').innerText().catch(() => '')));
check('«دیگری» rests for a while', await fig.getByRole('button', { name: 'دیگری' }).isDisabled());
await page.screenshot({ path: `${shots}/5-binge.png` });
await page.getByRole('button', { name: /برو سراغ/ }).click().catch(() => {});
await page.waitForTimeout(400);
check('«برو سراغ» lights up the task', (await tasks.locator('.task-row.pulse').count()) === 1);

// prayer reminder through the eye
await page.evaluate(() => dispatchEvent(new CustomEvent('ora:say', { detail: { text: '۱۰ دقیقه تا اذان ظهر', sticky: true } })));
await page.waitForTimeout(200);
check('reminder appears beside the eye', (await page.locator('.ora-tip-text').innerText()) === '۱۰ دقیقه تا اذان ظهر');
const alarms = await page.evaluate(() => chrome.alarms.getAll().then((a) => a.filter((x) => x.name.startsWith('prayer|')).length));
check('prayer alarms scheduled for the coming days', alarms >= 6);
check('compact prayer widget shows sunset', (await page.locator('section[aria-label="اوقات شرعی"]').innerText()).includes('غروب'));
// «منظورش را نفهمیدم»
await page.locator('.ora-tip-x').click().catch(() => {});
const before = await fig.locator('blockquote').innerText();
await fig.hover(); await fig.getByRole('button', { name: 'منظورش را نفهمیدم' }).click();
await page.waitForTimeout(400);
const card = page.getByRole('dialog', { name: 'معنی جمله' });
if (await card.isVisible().catch(() => false)) {
  check('a line with a meaning offers the meaning first', /برداشت اورآ|معنی از گنجور/.test(await card.innerText()) && (await card.locator('.meaning-text').innerText()).length > 20);
  await page.screenshot({ path: `${shots}/7-meaning.png` });
  await card.getByRole('button', { name: 'هنوز گنگ است' }).click(); await page.waitForTimeout(400);
}
check('Ora asks what was unclear, with choices', (await page.locator('.ora-tip-choices .pill').count()) === 4);
check('the unclear line is replaced', (await fig.locator('blockquote').innerText()) !== before);
await page.locator('.ora-tip-choices .pill', { hasText: 'منظور کلی‌اش' }).click(); await page.waitForTimeout(300);
check('thanks after choosing a reason', /فهرست «نامفهوم‌ها»/.test(await page.locator('.ora-tip-text').innerText()));
const unc = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const q = r.result.transaction('sentences').objectStore('sentences').getAll(); q.onsuccess = () => res(q.result.filter((x) => x.unclearAt).map((x) => x.unclearWhy)); }; }));
check('stored as unclear with its reason', unc.length === 1 && unc[0] === 'point');
await page.getByRole('button', { name: 'شخصی‌سازی' }).click(); await page.waitForTimeout(300);
await page.locator('.settings-nav-item', { hasText: 'جمله‌ها' }).click(); await page.waitForTimeout(900);
check('settings lists it with the pattern', /منظورشان را نفهمیدی \(۱\)/.test(await page.locator('aside').innerText()) && /بیشتر به خاطر: منظور کلی‌اش/.test(await page.locator('.unclear-sum').innerText()));
await page.locator('.unclear-sum').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${shots}/6-unclear-settings.png` });
await page.keyboard.press('Escape');
check('no page errors', errors.length === 0);
if (errors.length) console.log(errors);
await ctx.close();
process.exit(fail ? 1 : 0);
