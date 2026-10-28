// Time plan in the real extension: wizard → plan applied, day/week views, live block check, «برنامه‌ی الان».
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dist = path.resolve('dist');
const key = JSON.parse(fs.readFileSync('dist/manifest.json')).key;
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/sc-'), { executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'], viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let fail = 0; const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };
const shots = process.env.O || '/tmp/claude-0/sch-shots'; fs.mkdirSync(shots, { recursive: true });
await page.goto(`chrome-extension://${id}/index.html`); await page.waitForTimeout(1800);
await page.evaluate(() => { localStorage.setItem('ora:tip-at', String(Date.now())); localStorage.setItem('ora:ritual', JSON.stringify({ morning: new Date().toISOString().slice(0, 10), evening: new Date().toISOString().slice(0, 10) })); });
const input = page.getByLabel('تسک جدید');
for (const t of ['ریاضی ۹۰ دقیقه !', 'ورزش ۳۰ دقیقه #سلامت', 'زبان ۴۵ دقیقه', 'مقاله ۲ ساعت !!', 'کلاس ساعت ۱۴ ۶۰ دقیقه']) { await input.fill(t); await input.press('Enter'); }
await page.getByRole('button', { name: 'برنامه‌ی زمانی' }).click();
const dlg = page.getByRole('dialog', { name: 'تقویم و برنامه' });
check('time plan opens', await dlg.isVisible());
await dlg.getByRole('button', { name: 'چیدن هوشمند' }).click();
await dlg.locator('.wz-card', { hasText: 'فردا' }).click();
await dlg.getByRole('button', { name: 'بعدی' }).click();
await dlg.getByRole('button', { name: 'بعدی' }).click();
// tasks step: make the class a fixed-time commitment
await dlg.locator('.wz-task', { hasText: 'کلاس' }).getByRole('button', { name: 'ساعت ثابت' }).click();
await page.screenshot({ path: `${shots}/1-wizard-tasks.png` });
await dlg.getByRole('button', { name: 'بعدی' }).click(); await page.waitForTimeout(400);
const ghosts = await dlg.locator('.cal-b.ghost').count();
const told = await dlg.locator('.wz-side').innerText();
check('preview places tasks and explains what did not fit', ghosts >= 3 && (ghosts === 4 || /جا نشد/.test(told)));
check('preview shows a load verdict', /کار داری برای/.test(await dlg.locator('.sch-load').innerText()));
await page.screenshot({ path: `${shots}/2-wizard-preview.png` });
await dlg.getByRole('button', { name: 'اعمال برنامه' }).click(); await page.waitForTimeout(500);
const tm = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const q = r.result.transaction('tasks').objectStore('tasks').getAll(); q.onsuccess = () => res(q.result.map((x) => [x.title, x.when, x.time])); }; }));
const tmr = new Date(Date.now() + 864e5); const tk = `${tmr.getFullYear()}-${String(tmr.getMonth() + 1).padStart(2, '0')}-${String(tmr.getDate()).padStart(2, '0')}`;
check('applied: placed tasks have a time tomorrow, the fixed class kept 14:00', tm.filter(([n]) => n !== 'کلاس' && n !== 'زبان').every(([, w, t]) => w === tk && t) && tm.find(([n]) => n === 'کلاس')[2] === '14:00');
const toM = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
check('the top task sits at your peak (morning)', Math.abs(toM(tm.find(([n]) => n === 'مقاله')[2]) - 9 * 60) <= 30);
check('after applying, the day view shows the blocks', (await dlg.locator('.cal-b.cal-task').count()) >= 3);
await page.screenshot({ path: `${shots}/3-day.png` });
await dlg.getByRole('tab', { name: 'هفته' }).click(); await page.waitForTimeout(300);
check('week view has seven columns', (await dlg.locator('.cal-col').count()) === 7);
await page.screenshot({ path: `${shots}/4-week.png` });
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

// live: a block that ended ten minutes ago
await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const n = new Date(Date.now() - 40 * 60000); const d = new Date(); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const tx = r.result.transaction('tasks', 'readwrite'); tx.objectStore('tasks').put({ id: 'live1', title: 'تمرین فیزیک', done: false, priority: 0, order: 1, createdAt: 1, when: k, time: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`, est: 24 }); tx.oncomplete = res; }; }));
if (new Date(Date.now() - 40 * 60000).getDate() === new Date().getDate()) {
  await page.reload(); await page.waitForTimeout(7000);
  check('Ora asks whether the block is done', /تمرین فیزیک» تمام شد؟/.test(await page.locator('.ora-tip-text').innerText().catch(() => '')));
  await page.locator('.ora-tip-choices .pill', { hasText: '۱۵ دقیقه‌ی دیگر' }).click(); await page.waitForTimeout(600);
  check('the extension is answered with its consequences', /اگر ۱۵ دقیقه/.test(await page.locator('.ora-tip-title').innerText().catch(() => '')));
  await page.screenshot({ path: `${shots}/5-live.png` });
  await page.locator('.ora-tip .btn-accent').click(); await page.waitForTimeout(300);
  const est = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const q = r.result.transaction('tasks').objectStore('tasks').get('live1'); q.onsuccess = () => res(q.result.est); }; }));
  check('accepting extends the block', est === 39);
} else console.log('SKIP live check (too close to midnight)');

// «برنامه‌ی الان» widget
await page.getByRole('button', { name: 'ویرایش چیدمان' }).first().click();
await page.getByRole('button', { name: 'افزودن ویجت' }).click();
await page.locator('.drawer-item', { hasText: 'برنامه‌ی الان' }).click();
await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'تمام', exact: true }).click(); await page.waitForTimeout(500);
const dp = page.locator('section[aria-label="برنامه‌ی الان"]');
check('«برنامه‌ی الان» shows where you are', (await dp.count()) === 1 && /الان|وقت آزاد|استراحت|تمام شد|برنامه‌ی زمانی نداری/.test(await dp.innerText()));
await dp.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${shots}/6-widget.png` });
check('no page errors', errors.length === 0); if (errors.length) console.log(errors);
await ctx.close();
process.exit(fail ? 1 : 0);
