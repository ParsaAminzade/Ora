// The big calendar in the real extension: drag to create / move / resize, the event card and editor,
// repeating events («فقط همین»), all-day and multi-day, month, list, search, shortcuts, undo, drop a task.
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dist = path.resolve('dist');
const key = JSON.parse(fs.readFileSync('dist/manifest.json')).key;
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/ct-'), { executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'], viewport: { width: 1500, height: 940 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let fail = 0; const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };
const shots = process.env.O || '/tmp/claude-0/cal-shots'; fs.mkdirSync(shots, { recursive: true });
await page.goto(`chrome-extension://${id}/index.html`); await page.waitForTimeout(1800);
await page.evaluate(() => { localStorage.setItem('ora:tip-at', String(Date.now())); localStorage.setItem('ora:ritual', JSON.stringify({ morning: new Date().toISOString().slice(0, 10), evening: new Date().toISOString().slice(0, 10) })); });
const events = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const q = r.result.transaction('events').objectStore('events').getAll(); q.onsuccess = () => res(q.result); }; }));
const tasksDb = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const q = r.result.transaction('tasks').objectStore('tasks').getAll(); q.onsuccess = () => res(q.result); }; }));
const k = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = k(new Date());

await page.getByRole('button', { name: 'برنامه‌ی زمانی' }).click();
const dlg = page.getByRole('dialog', { name: 'تقویم و برنامه' });
check('calendar opens', await dlg.isVisible());
await page.keyboard.press('d'); await page.waitForTimeout(200);
check('D switches to the day view', (await dlg.locator('.cal-col').count()) === 1);
const H = 48;
const scrollTo = async (min) => { await dlg.locator('.cal-tg-scroll').evaluate((el, y) => { el.scrollTop = y; }, (min / 60) * H - 20); await page.waitForTimeout(100); };
const colBox = async (i = 0) => dlg.locator('.cal-col').nth(i).boundingBox();
const yOf = async (min, i = 0) => { const b = await colBox(i); return b.y + (min / 60) * H; };
await scrollTo(9 * 60);
let b = await colBox();
await page.mouse.move(b.x + b.width / 2, await yOf(10 * 60 + 2));
await page.mouse.down();
await page.mouse.move(b.x + b.width / 2, await yOf(11 * 60), { steps: 6 });
await page.mouse.move(b.x + b.width / 2, await yOf(11 * 60 + 30), { steps: 6 });
await page.mouse.up();
const quick = page.getByRole('dialog', { name: 'ساختن سریع' });
check('dragging on empty time opens a quick create card', await quick.isVisible());
check('a quick create starts as a task', (await quick.getByRole('tab', { name: 'کار' }).getAttribute('aria-selected')) === 'true');
check('the card shows the dragged range', /۱۰:۰۰–۱۱:۳۰/.test(await quick.innerText()));
await page.screenshot({ path: `${shots}/1-drag-create.png` });
await quick.getByRole('tab', { name: 'رویداد' }).click();
await quick.getByLabel('عنوان').fill('جلسه با استاد');
await quick.getByLabel('عنوان').press('Enter'); await page.waitForTimeout(400);
let ev = (await events()).find((e) => e.title === 'جلسه با استاد');
check('the event is saved with start and end', ev && ev.day === today && ev.time === '10:00' && ev.end === '11:30' && ev.remind?.[0] === 10);
const block = dlg.locator('.cal-b.cal-event', { hasText: 'جلسه با استاد' });
check('the block is drawn 1.5 hours tall', Math.abs((await block.boundingBox()).height - 1.5 * H) < 4);

// move it to 13:00
let bb = await block.boundingBox();
await page.mouse.move(bb.x + bb.width / 2, bb.y + 12); await page.mouse.down();
await page.mouse.move(bb.x + bb.width / 2, bb.y + 12 + 3 * H / 2, { steps: 5 });
await page.mouse.move(bb.x + bb.width / 2, bb.y + 12 + 3 * H, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(400);
ev = (await events()).find((e) => e.title === 'جلسه با استاد');
check('dragging moves it, keeping its length', ev.time === '13:00' && ev.end === '14:30');
check('an undo toast appears', /جابه‌جا شد/.test(await dlg.locator('.cal-toast').innerText().catch(() => '')));
await page.keyboard.press('Control+z'); await page.waitForTimeout(400);
ev = (await events()).find((e) => e.title === 'جلسه با استاد');
check('Ctrl+Z puts it back', ev.time === '10:00' && ev.end === '11:30');

// resize the bottom edge to 12:00
bb = await block.boundingBox();
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height - 3); await page.mouse.down();
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height + H / 4, { steps: 4 });
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height + H / 2 - 2, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(400);
ev = (await events()).find((e) => e.title === 'جلسه با استاد');
check('dragging the bottom edge changes the end', ev.time === '10:00' && ev.end === '12:00');

// open the card → edit → place, notes, weekly repeat
await block.click(); await page.waitForTimeout(200);
const card = page.getByRole('dialog', { name: 'رویداد جلسه با استاد' });
check('clicking opens the event card', /۱۰:۰۰–۱۲:۰۰/.test(await card.innerText()));
await card.getByRole('button', { name: 'ویرایش' }).click();
const ed = page.getByRole('dialog', { name: 'ویرایش رویداد' });
await ed.getByLabel('مکان').fill('دانشکده، اتاق ۳۱۲');
await ed.getByLabel('توضیح').fill('پیش‌نویس فصل ۲ را ببر\nhttps://meet.example.com/abc');
await ed.getByLabel('تکرار').selectOption('weekly');
await page.screenshot({ path: `${shots}/2-editor.png` });
await ed.getByRole('button', { name: 'ذخیره' }).click(); await page.waitForTimeout(400);
ev = (await events()).find((e) => e.title === 'جلسه با استاد');
check('editor saves place, notes and a weekly repeat', ev.location === 'دانشکده، اتاق ۳۱۲' && /فصل ۲/.test(ev.notes) && ev.rrule?.freq === 'weekly' && ev.recurring === 1);

// next week: change only that occurrence
await page.keyboard.press('w'); await page.keyboard.press('j'); await page.waitForTimeout(300);
const occ = dlg.locator('.cal-b.cal-event', { hasText: 'جلسه با استاد' });
check('the repeat shows up next week', (await occ.count()) === 1);
await occ.click(); await page.waitForTimeout(150);
await page.locator('.cal-pop').getByRole('button', { name: 'ویرایش' }).click();
await page.getByRole('dialog', { name: 'ویرایش رویداد' }).getByLabel('عنوان رویداد').fill('جلسه با استاد (آنلاین)');
await page.getByRole('dialog', { name: 'ویرایش رویداد' }).getByRole('button', { name: 'ذخیره' }).click();
const scope = page.getByRole('alertdialog', { name: 'تغییر رویداد تکراری' });
check('a repeating event asks «فقط همین / همین و بعدی‌ها / همه»', await scope.isVisible() && /همین و بعدی‌ها/.test(await scope.innerText()));
await page.screenshot({ path: `${shots}/3-scope.png` });
await scope.getByRole('button', { name: 'تأیید' }).click(); await page.waitForTimeout(400);
const all = await events();
const master = all.find((e) => e.title === 'جلسه با استاد');
const one = all.find((e) => e.title === 'جلسه با استاد (آنلاین)');
check('«فقط همین» skips that day in the series and keeps a one-day copy', master.exdates?.length === 1 && one && !one.rrule && one.overrideOf === master.id && one.location === 'دانشکده، اتاق ۳۱۲');
await page.keyboard.press('k'); await page.waitForTimeout(200);
check('this week still shows the original', (await dlg.locator('.cal-b.cal-event', { hasText: /^جلسه با استاد$/ }).count()) === 1 || (await dlg.locator('.cal-bt', { hasText: 'جلسه با استاد' }).count()) >= 1);

// all-day + multi-day in the lane
await page.keyboard.press('t'); await page.waitForTimeout(150);
const idx = await dlg.locator('.cal-dh').evaluateAll((els, t) => els.findIndex((e) => e.className.includes('is-today')), today);
await dlg.locator('.cal-lane-cell').nth(Math.max(0, idx)).click(); await page.waitForTimeout(150);
await page.getByRole('dialog', { name: 'ساختن سریع' }).getByRole('tab', { name: 'رویداد' }).click();
await page.getByRole('dialog', { name: 'ساختن سریع' }).getByLabel('عنوان').fill('کنفرانس');
await page.getByRole('dialog', { name: 'ساختن سریع' }).getByRole('button', { name: 'گزینه‌های بیشتر' }).click();
const ed2 = page.getByRole('dialog', { name: 'رویداد تازه' });
check('«گزینه‌های بیشتر» opens the full editor as all-day', await ed2.getByRole('checkbox', { name: 'تمام‌روز' }).isChecked());
await ed2.getByLabel('تاریخ پایان').click();
const two = new Date(); two.setDate(two.getDate() + 2);
const jd = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric' }).format(two);
await ed2.locator('.datef-pop .mini-d:not(.out)', { hasText: new RegExp(`^${jd}$`) }).first().click();
await ed2.getByRole('button', { name: 'ذخیره' }).click(); await page.waitForTimeout(400);
const conf = (await events()).find((e) => e.title === 'کنفرانس');
check('a three-day all-day event is saved', conf && !conf.time && conf.day === today && conf.endDay === k(two));
const chip = dlg.locator('.cal-ad', { hasText: 'کنفرانس' });
check('it spans its days in the all-day lane', (await chip.count()) === 1 && ((await chip.boundingBox()).width > 1.5 * (await colBox()).width || idx >= 5));
await page.screenshot({ path: `${shots}/4-week.png` });

// month and list views, search
await page.keyboard.press('m'); await page.waitForTimeout(250);
check('M shows the month with the events', (await dlg.locator('.cal-mc').count()) >= 28 && (await dlg.locator('.cal-mi', { hasText: 'جلسه با استاد' }).count()) >= 2);
await page.screenshot({ path: `${shots}/5-month.png` });
await page.keyboard.press('a'); await page.waitForTimeout(250);
check('A shows the list', (await dlg.locator('.cal-ag-row', { hasText: 'جلسه با استاد' }).count()) >= 2);
await page.keyboard.press('/'); await page.waitForTimeout(120); await page.keyboard.type('آنلاین'); await page.waitForTimeout(300);
check('search finds the changed occurrence', (await dlg.locator('.cal-ag-row').count()) === 1 && /آنلاین/.test(await dlg.locator('.cal-agenda').innerText()));
await page.screenshot({ path: `${shots}/6-search.png` });
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
check('Escape clears the search first (calendar stays open)', await dlg.isVisible());

// drop an unscheduled task onto the grid
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
await page.getByLabel('تسک جدید').fill('خواندن مقاله ۴۵ دقیقه'); await page.getByLabel('تسک جدید').press('Enter');
await page.getByRole('button', { name: 'برنامه‌ی زمانی' }).click(); await page.keyboard.press('d'); await page.waitForTimeout(300);
await scrollTo(15 * 60);
const chipT = dlg.locator('.sch-chip', { hasText: 'خواندن مقاله' });
const target = await colBox();
await chipT.dragTo(dlg.locator('.cal-col').first(), { targetPosition: { x: target.width / 2, y: 16 * H + 4 } });
await page.waitForTimeout(400);
const tk = (await tasksDb()).find((t) => t.title === 'خواندن مقاله');
check('dragging a task from the side onto the grid gives it a time', tk?.time === '16:00' && tk.when === today);
check('the task block is drawn', (await dlg.locator('.cal-b.cal-task', { hasText: 'خواندن مقاله' }).count()) === 1);

// delete with undo
await dlg.locator('.cal-b.cal-event', { hasText: 'جلسه با استاد' }).click(); await page.waitForTimeout(150);
await page.locator('.cal-pop').getByRole('button', { name: 'حذف' }).click();
await page.getByRole('alertdialog', { name: 'حذف رویداد تکراری' }).getByText('همه‌ی تکرارها').click();
await page.getByRole('alertdialog', { name: 'حذف رویداد تکراری' }).getByRole('button', { name: 'حذف' }).click(); await page.waitForTimeout(400);
check('deleting the whole series removes it', !(await events()).some((e) => e.title === 'جلسه با استاد'));
await dlg.locator('.cal-toast .link-btn').click(); await page.waitForTimeout(400);
check('«برگردان» brings it back', (await events()).some((e) => e.title === 'جلسه با استاد' && e.rrule));

// a second local calendar, hidden
await dlg.getByRole('button', { name: '+ تقویم تازه' }).click();
await page.getByRole('alertdialog').getByRole('textbox').fill('دانشگاه'); await page.getByRole('alertdialog').getByRole('button', { name: 'ذخیره' }).click();
check('a new calendar can be added', (await dlg.locator('.cal-cal-l', { hasText: 'دانشگاه' }).count()) === 1);
await page.screenshot({ path: `${shots}/7-day.png` });

// event reminders: an alarm for the system notification, and the eye says it while the tab is open
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
const soon = new Date(Date.now() + 12 * 60000); // HH:MM drops the seconds: the reminder lands 1–2 minutes from now
if (soon.getDate() === new Date().getDate() && soon.getHours() < 23) {
  await page.evaluate(({ d, t, e }) => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const tx = r.result.transaction('events', 'readwrite'); tx.objectStore('events').put({ id: 'rem1', title: 'تماس با بابا', day: d, time: t, end: e, remind: [10], source: 'local', updatedAt: Date.now(), recurring: 0 }); tx.oncomplete = res; }; }),
    { d: k(soon), t: `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`, e: `${String(soon.getHours() + 1).padStart(2, '0')}:00` });
  await page.reload();
  for (let i = 0; i < 30 && !(await page.evaluate(() => chrome.alarms.getAll().then((a) => a.some((x) => x.name.startsWith('event|rem1'))))); i++) await page.waitForTimeout(500);
  const al = await page.evaluate(() => chrome.alarms.getAll().then((a) => a.filter((x) => x.name.startsWith('event|')).map((x) => x.name)));
  check('an alarm is scheduled for the event reminder', al.some((n) => n.includes('rem1') && n.includes('تماس با بابا'))); if (!al.length) console.log('ALARMS', await page.evaluate(() => chrome.alarms.getAll().then((a) => a.map((x) => x.name))));
  await page.waitForFunction(() => /تماس با بابا/.test(document.querySelector('.ora-tip-text')?.textContent ?? ''), null, { timeout: 150000 }).catch(() => {});
  check('the eye says the reminder when it is time', /۱۰ دقیقه دیگر: «تماس با بابا»/.test(await page.locator('.ora-tip-text').innerText().catch(() => '')));
  await page.screenshot({ path: `${shots}/8-reminder.png` });
} else console.log('SKIP reminder (too close to midnight)');

// a second clock beside the hours
await page.getByRole('button', { name: 'شخصی‌سازی' }).click(); await page.waitForTimeout(300);
await page.locator('.settings-nav-item', { hasText: 'تقویم‌ها' }).first().click(); await page.waitForTimeout(400);
await page.getByLabel('ساعت دوم').selectOption('Asia/Tehran');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.getByRole('button', { name: 'برنامه‌ی زمانی' }).click(); await page.keyboard.press('w'); await page.waitForTimeout(300);
const tz2 = await page.locator('.cal-hours .tz2').allInnerTexts();
check('a second clock (Tehran) runs beside the hours', tz2.length === 23 && /تهران/.test(await page.locator('.cal-tz-h').innerText()) && tz2.some((x) => x.includes('۳۰')));
await page.screenshot({ path: `${shots}/9-tz.png` });
// school days: Saturday to Wednesday (a preset), and from «هر روز» by unticking Thursday and Friday
await page.keyboard.press('c'); await page.waitForTimeout(200);
let edS = page.getByRole('dialog', { name: 'رویداد تازه' });
await edS.getByLabel('عنوان رویداد').fill('مدرسه');
await edS.getByLabel('تکرار').selectOption('sat-wed');
await edS.getByRole('button', { name: 'ذخیره' }).click(); await page.waitForTimeout(300);
let sch = (await events()).find((e) => e.title === 'مدرسه');
check('preset «شنبه تا چهارشنبه» repeats on five days', sch?.rrule?.freq === 'weekly' && [...sch.rrule.byWeekday].sort().join() === '0,1,2,3,6');
await page.keyboard.press('c'); await page.waitForTimeout(200);
edS = page.getByRole('dialog', { name: 'رویداد تازه' });
await edS.getByLabel('عنوان رویداد').fill('کلاس زبان');
await edS.getByLabel('تکرار').selectOption('daily');
await edS.getByLabel('تکرار').selectOption('custom');
await edS.locator('.ev-rep-box').getByRole('button', { name: 'جمعه' }).click();
await edS.locator('.ev-rep-box').getByRole('button', { name: 'پنجشنبه' }).click();
await page.screenshot({ path: `${shots}/10-weekdays.png` });
await edS.getByRole('button', { name: 'ذخیره' }).click(); await page.waitForTimeout(300);
sch = (await events()).find((e) => e.title === 'کلاس زبان');
check('«هر روز» minus Thursday and Friday becomes Saturday to Wednesday', sch?.rrule?.freq === 'weekly' && [...sch.rrule.byWeekday].sort().join() === '0,1,2,3,6');
// switching format: a new one as a task, a saved repeating event → repeating task, a task → event
await page.keyboard.press('c'); await page.waitForTimeout(200);
edS = page.getByRole('dialog', { name: 'رویداد تازه' });
await edS.getByLabel('عنوان رویداد').fill('خرید کتاب');
await edS.getByRole('radio', { name: 'کار', exact: true }).click();
await edS.getByRole('button', { name: 'ذخیره' }).click(); await page.waitForTimeout(300);
check('the editor can save a new item as a task', (await tasksDb()).some((t) => t.title === 'خرید کتاب' && t.time) && !(await events()).some((e) => e.title === 'خرید کتاب'));
const lang = (await events()).find((e) => e.title === 'کلاس زبان');
await page.evaluate((e) => dispatchEvent(new CustomEvent('ora:event-editor', { detail: { event: e } })), lang); await page.waitForTimeout(200);
edS = page.getByRole('dialog', { name: 'ویرایش رویداد' });
await edS.getByRole('radio', { name: 'کار', exact: true }).click();
await edS.getByRole('button', { name: 'ذخیره' }).click();
await page.waitForTimeout(300);
if (await page.getByRole('alertdialog', { name: 'تغییر رویداد تکراری' }).isVisible().catch(() => false)) {
  await page.getByRole('alertdialog', { name: 'تغییر رویداد تکراری' }).getByText('همه‌ی تکرارها').click();
  await page.getByRole('alertdialog', { name: 'تغییر رویداد تکراری' }).getByRole('button', { name: 'تأیید' }).click();
}
await page.waitForTimeout(400);
const lt = (await tasksDb()).find((t) => t.title === 'کلاس زبان');
check('a saved repeating event becomes a repeating task', lt && lt.repeat?.freq === 'weekly' && lt.time && !(await events()).some((e) => e.title === 'کلاس زبان'));
await page.evaluate((id) => dispatchEvent(new CustomEvent('ora:edit-task', { detail: id })), lt.id); await page.waitForTimeout(300);
await page.getByRole('dialog', { name: 'جزئیات کار' }).getByRole('button', { name: 'تبدیل به رویداد' }).click(); await page.waitForTimeout(400);
const back = (await events()).find((e) => e.title === 'کلاس زبان');
check('and a task can become an event again (with its repeat and length)', back && back.rrule?.freq === 'weekly' && back.time === lt.time && back.end && !(await tasksDb()).some((t) => t.id === lt.id));
check('no page errors', errors.length === 0); if (errors.length) console.log(errors);
await ctx.close();
process.exit(fail ? 1 : 0);
