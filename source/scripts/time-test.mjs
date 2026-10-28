// Phase 3 in the real extension: recurring goals (placed, spread, moved out of the way), the free-time
// finder, focus time in the editor, and «بینش زمان».
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dist = path.resolve('dist');
const key = JSON.parse(fs.readFileSync('dist/manifest.json')).key;
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/tt-'), { executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'], viewport: { width: 1500, height: 940 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let fail = 0; const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };
const shots = process.env.O || '/tmp/claude-0/time-shots'; fs.mkdirSync(shots, { recursive: true });
await page.goto(`chrome-extension://${id}/index.html`); await page.waitForTimeout(1800);
await page.evaluate(() => { localStorage.setItem('ora:tip-at', String(Date.now())); localStorage.setItem('ora:ritual', JSON.stringify({ morning: new Date().toISOString().slice(0, 10), evening: new Date().toISOString().slice(0, 10) })); });
const all = (store) => page.evaluate((st) => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const q = r.result.transaction(st).objectStore(st).getAll(); q.onsuccess = () => res(q.result); }; }), store);
const k = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = k(new Date());

await page.getByRole('button', { name: 'برنامه‌ی زمانی' }).click();
const dlg = page.getByRole('dialog', { name: 'تقویم و برنامه' });
await dlg.getByRole('button', { name: '+ هدف تازه' }).click();
const gd = page.getByRole('dialog', { name: 'هدف تازه' });
await gd.getByLabel('عنوان هدف').fill('ورزش');
await gd.getByRole('button', { name: '۳', exact: true }).click();
await gd.getByRole('button', { name: '۴۵ دقیقه' }).click();
await gd.getByRole('button', { name: 'هر وقت' }).click();
await page.screenshot({ path: `${shots}/1-goal.png` });
await gd.getByRole('button', { name: 'ذخیره' }).click(); await page.waitForTimeout(800);
let sessions = (await all('tasks')).filter((t) => t.goal);
const ws = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return k(d); })();
const nextWs = (() => { const d = new Date(`${ws}T12:00`); d.setDate(d.getDate() + 7); return k(d); })();
const nextWeek = sessions.filter((t) => t.when >= nextWs);
console.log('SESS', JSON.stringify(sessions.map((t) => [t.when, t.time, t.len])), ws, nextWs);
check('goal sessions are placed: three next week, each 45 minutes with a time', nextWeek.length === 3 && nextWeek.every((t) => t.time && t.len === 45 && t.title === 'ورزش'));
check('sessions are spread over different days', new Set(nextWeek.map((t) => t.when)).size === 3 && nextWeek.every((t, i, a) => a.every((u) => u === t || Math.abs(new Date(t.when) - new Date(u.when)) >= 2 * 864e5)));
check('the goal shows its week in the side panel', (await dlg.locator('.goal', { hasText: 'ورزش' }).count()) === 1);

// an event lands on a session → Ora moves the session
const s0 = nextWeek[0];
await page.evaluate((s) => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const tx = r.result.transaction('events', 'readwrite'); const [h, m] = s.time.split(':').map(Number); const e = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`; tx.objectStore('events').put({ id: 'clash', title: 'جلسه‌ی فوری', day: s.when, time: s.time, end: e, source: 'local', updatedAt: Date.now(), recurring: 0 }); tx.oncomplete = res; }; }), s0);
await page.keyboard.press('Escape'); await page.reload(); await page.waitForTimeout(4500);
const moved = (await all('tasks')).find((t) => t.id === s0.id);
const toM = (x) => { const [a, b] = x.split(':').map(Number); return a * 60 + b; };
check('a session that clashes with a new event is moved out of its way', moved.time && (moved.when !== s0.when || toM(moved.time) >= toM(s0.time) + 60 || toM(moved.time) + 45 <= toM(s0.time)));

// free time finder → quick create there
await page.getByRole('button', { name: 'برنامه‌ی زمانی' }).click(); await page.waitForTimeout(300);
const slot = dlg.locator('.free-slot').first();
check('free time finder lists slots', (await dlg.locator('.free-slot').count()) >= 1);
await slot.click(); await page.waitForTimeout(250);
check('picking a free slot opens a quick create for it', await page.getByRole('dialog', { name: 'ساختن سریع' }).isVisible());
await page.keyboard.press('Escape');

// focus time via the editor
await page.keyboard.press('c'); await page.waitForTimeout(200);
const ed = page.getByRole('dialog', { name: 'رویداد تازه' });
await ed.getByRole('radio', { name: 'زمان تمرکز' }).click();
check('choosing focus time fills a title and explains it', (await ed.getByLabel('عنوان رویداد').inputValue()) === 'زمان تمرکز' && /مهم‌ترین|کارهای مهمت/.test(await ed.innerText()));
await ed.getByRole('button', { name: 'ذخیره' }).click(); await page.waitForTimeout(400);
check('focus time is saved as its own kind', (await all('events')).some((e) => e.kind === 'focus'));
await page.keyboard.press('d'); await page.waitForTimeout(200);
check('focus time is drawn as a band', (await dlg.locator('.cal-band').count()) >= 1 || (await all('events')).find((e) => e.kind === 'focus').day !== today);

// insights
// a done task with a time today, and a meeting, so there is something to see
await page.evaluate((d) => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const tx = r.result.transaction(['tasks', 'events'], 'readwrite'); tx.objectStore('tasks').put({ id: 'w1', title: 'نوشتن فصل', done: true, doneAt: Date.now(), priority: 1, order: 1, createdAt: 1, when: d, time: '09:00', est: 90, area: 'پژوهش' }); tx.objectStore('tasks').put({ id: 'w2', title: 'ایمیل‌ها', done: false, priority: 0, order: 2, createdAt: 1, when: d, time: '11:00', est: 30, area: 'کار' }); tx.objectStore('events').put({ id: 'mt', title: 'جلسه‌ی گروه', day: d, time: '13:00', end: '14:30', source: 'local', updatedAt: 1, recurring: 0 }); tx.oncomplete = res; }; }), today);
await page.keyboard.press('Escape'); await page.reload(); await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'برنامه‌ی زمانی' }).click(); await page.waitForTimeout(300);
await page.keyboard.press('i'); await page.waitForTimeout(500);
const ins = dlg.locator('.ins');
check('I opens time insights with tiles and a bar per day', (await ins.locator('.ins-tile').count()) === 4 && (await ins.locator('.ins-col').count()) === 7);
check('insights count meetings and planned/done work', /۱٫۵ ساعت|۱\.۵ ساعت/.test(await ins.locator('.ins-tile').first().innerText()) && /انجام شد/.test(await ins.locator('.ins-notes').innerText()));
check('work by area lists #پژوهش', (await ins.locator('.ins-row', { hasText: '#پژوهش' }).count()) === 1);
await page.screenshot({ path: `${shots}/2-insights.png` });
await ins.getByRole('radio', { name: 'این ماه' }).click(); await page.waitForTimeout(300);
check('the month view of insights has a bar per day of the month', (await ins.locator('.ins-col').count()) >= 29);
await page.keyboard.press('w'); await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/3-week-goals.png` });
// zoom into parts of tomorrow
await page.keyboard.press('d'); await page.keyboard.press('j'); await page.waitForTimeout(300);
const hourPx = async () => { const a = await dlg.locator('.cal-hours span').nth(0).boundingBox(); const b = await dlg.locator('.cal-hours span').nth(1).boundingBox(); return b.y - a.y; };
const h0 = await hourPx();
await dlg.locator('.cal-zoom').getByRole('button', { name: 'صبح' }).click(); await page.waitForTimeout(400);
const h1 = await hourPx();
const top6 = await dlg.locator('.cal-tg-scroll').evaluate((el) => el.scrollTop);
check('«زوم روی صبح» fits the morning to the screen', h1 > h0 * 1.6 && Math.abs(top6 - 6 * h1 + 4) < h1 / 2 && (await dlg.locator('.cal-hours .half').count()) > 0);
await page.screenshot({ path: `${shots}/4-zoom-morning.png` });
await page.keyboard.press('Minus'); await page.waitForTimeout(200);
check('− zooms out', (await hourPx()) < h1);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

// a task planned for tomorrow can't be ticked today, unless you say you did it early
const tmr = k(new Date(Date.now() + 864e5));
await page.evaluate((d) => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const tx = r.result.transaction('tasks', 'readwrite'); tx.objectStore('tasks').put({ id: 'fut', title: 'تمرین فردا', done: false, priority: 0, order: 0, createdAt: 1, when: d, est: 30 }); tx.oncomplete = res; }; }), tmr);
await page.reload(); await page.waitForTimeout(1500);
await page.evaluate(() => dispatchEvent(new CustomEvent('ora:edit-task', { detail: 'fut' }))); await page.waitForTimeout(300);
await page.getByRole('dialog', { name: 'جزئیات کار' }).getByRole('checkbox', { name: 'انجام شد' }).click(); await page.waitForTimeout(300);
check('ticking tomorrow\'s task today is refused, with a reason', !(await all('tasks')).find((t) => t.id === 'fut').done && /روز دیگری|فردا/.test(await page.locator('.ora-tip').innerText()));
await page.locator('.ora-tip-choices .pill', { hasText: 'زودتر انجامش دادم' }).click(); await page.waitForTimeout(300);
const fut = (await all('tasks')).find((t) => t.id === 'fut');
check('«زودتر انجامش دادم» records it as done today', fut.done && fut.when === today);
check('no page errors', errors.length === 0); if (errors.length) console.log(errors);
await ctx.close();
process.exit(fail ? 1 : 0);
