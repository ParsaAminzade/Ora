// Loads the built extension in Chromium, opens the new tab page and exercises the main flows.
// Network calls to Open-Meteo are mocked so the test runs offline.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import http from 'node:http';
import { spawn } from 'node:child_process';

const dist = path.resolve('dist');

// A fake Ollama on :11434 that, like the real one, rejects chrome-extension:// origins with 403.
const origins = [];
const chats = [];
const server = http.createServer((req, res) => {
  origins.push(req.headers.origin ?? '(none)');
  if ((req.headers.origin ?? '').startsWith('chrome-extension://')) { res.writeHead(403); res.end('forbidden'); return; }
  if (req.url === '/quote') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ quote: 'جمله‌ی روز از API آزمایشی', author: 'سرور تست' })); return; }
  if (req.url === '/v1/models') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'test-model:8b' }] })); return; }
  if (req.url === '/v1/embeddings') {
    const bufs = [];
    req.on('data', (c) => bufs.push(c));
    req.on('end', () => {
      const input = JSON.parse(Buffer.concat(bufs).toString('utf8')).input;
      // deterministic toy embedding: character-bigram hashing into 64 dims
      const vec = (t) => { const v = new Array(64).fill(0); for (let i = 0; i < t.length - 1; i++) v[(t.charCodeAt(i) * 31 + t.charCodeAt(i + 1)) % 64] += 1; return v; };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: input.map((t, index) => ({ index, embedding: vec(t) })) }));
    });
    return;
  }
  if (req.url === '/v1/chat/completions') {
    const parts0 = [];
    req.on('data', (c) => parts0.push(c));
    req.on('end', () => { try { chats.push(JSON.parse(Buffer.concat(parts0).toString('utf8'))); } catch { /* ignore */ } });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const parts = ['۱. مرور ', 'لغات درس‌ها\n', '۲. تمرین شنیداری\n', '۳. یک آزمون نمونه با زمان‌سنج\n\n', 'فرمول انرژی: $E = mc^2$'];
    let i = 0;
    const t = setInterval(() => {
      if (i < parts.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`);
      else { res.write('data: [DONE]\n\n'); res.end(); clearInterval(t); }
    }, 60);
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(11434, '127.0.0.1', r));

// A real Radicale CalDAV server (pip install radicale), no auth, throwaway storage.
try { (await import('node:child_process')).execSync('pkill -f "[r]adicale --server-hosts"'); await new Promise((r) => setTimeout(r, 500)); } catch { /* none running */ }
const davDir = fs.mkdtempSync('/tmp/claude-0/radicale-');
const radicale = spawn('python3', ['-m', 'radicale', '--server-hosts', '127.0.0.1:5232', '--auth-type', 'none', '--storage-filesystem-folder', davDir], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const DAV = 'http://localhost:5232/test/nova/';
const davList = async () => {
  const res = await fetch(DAV, { method: 'REPORT', headers: { Depth: '1', 'Content-Type': 'application/xml' }, body: '<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"/></c:filter></c:calendar-query>' });
  return res.text();
};
const out = process.argv[2] || 'shots';
fs.mkdirSync(out, { recursive: true });
const dataDir = fs.mkdtempSync('/tmp/claude-0/nova-profile-');
const ctx = await chromium.launchPersistentContext(dataDir, {
  executablePath: '/opt/pw-browsers/chromium',
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  viewport: { width: 1440, height: 900 },
});

await ctx.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: {
  current: { temperature_2m: 22.4, apparent_temperature: 21.1, weather_code: 0, is_day: 0, relative_humidity_2m: 28, wind_speed_10m: 9 },
  daily: { time: ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'], weather_code: [0, 1, 3, 61, 0], temperature_2m_max: [31, 30, 27, 24, 28], temperature_2m_min: [19, 18, 17, 15, 16] },
} }));
// Mock ganjoor.net
await ctx.route('https://api.ganjoor.net/**', (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.endsWith('/poets')) return r.fulfill({ json: [{ id: 2, name: 'حافظ شیرازی', nickname: 'حافظ', rootCatId: 9 }, { id: 7, name: 'سعدی شیرازی', nickname: 'سعدی', rootCatId: 118 }] });
  if (u.pathname.includes('/cat/')) return r.fulfill({ json: { cat: { children: [], poems: [{ id: 100 }, { id: 101 }] } } });
  const pid = u.pathname.split('/').pop();
  return r.fulfill({ json: { fullUrl: `/hafez/ghazal/sh${pid}`, verses: [
    { coupletIndex: 0, versePosition: 0, text: `مصراع نخست آزمایشی شماره ${pid}` }, { coupletIndex: 0, versePosition: 1, text: 'مصراع دوم آزمایشی همین بیت' },
    { coupletIndex: 1, versePosition: 0, text: 'کوتاه' }, { coupletIndex: 1, versePosition: 1, text: 'مصراعی که جفتش کوتاه است' } ] } });
});
// Mock Google Calendar API
const today = new Date();
const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const gCalls = [];
await ctx.route('https://www.googleapis.com/calendar/v3/**', async (r) => {
  const req = r.request();
  const url = new URL(req.url());
  gCalls.push(`${req.method()} ${url.pathname}`);
  if (url.pathname.endsWith('/calendarList')) return r.fulfill({ json: { items: [{ id: 'me@example.com', summary: 'تقویم اصلی', backgroundColor: '#7FB3F5', accessRole: 'owner', primary: true }] } });
  if (req.method() === 'GET') return r.fulfill({ json: { items: [{ id: 'ev1', summary: 'Lab meeting', start: { dateTime: `${ymd}T23:30:00` } }] } });
  if (req.method() === 'POST') { const b = JSON.parse(req.postData()); return r.fulfill({ json: { id: 'ev2', summary: b.summary, start: b.start } }); }
  if (req.method() === 'DELETE') return r.fulfill({ status: 204, body: '' });
  return r.fulfill({ status: 404 });
});
await ctx.route('https://geocoding-api.open-meteo.com/**', (r) => r.fulfill({ json: {
  results: [{ name: 'اصفهان', latitude: 32.6525, longitude: 51.6746, timezone: 'Asia/Tehran', country: 'ایران', admin1: 'استان اصفهان' }],
} }));

// Extension id = first 32 hex chars of sha256(public key in manifest "key", or the path), mapped 0-f -> a-p.
const manifestKey = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8')).key;
const idSource = manifestKey ? Buffer.from(manifestKey, 'base64') : dist;
const id = [...createHash('sha256').update(idSource).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
console.log('extension id', id);
// Pin the clock the mode rules see to midday, so night rules don't fire depending on when the test runs.
const AT = (hm) => `now=${ymd}T${hm}:00`;
const NOON = AT('12:00');
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (process.env.NOVA_DEBUG) console.log('CONSOLE', m.type(), m.text().slice(0, 300)); });
const t0 = Date.now();
await page.goto(`chrome-extension://${id}/index.html?${NOON}`);
await page.getByText('امروز').first().waitFor();
// 2.1+: no server in tests (no terms dialog), and no tour reminder card in the way.
await page.evaluate(() => { const s = novaStore.getState(); s.setSettings({ privacy: { ...(s.settings.privacy ?? {}), server: '' } }); localStorage.setItem('ora:tour-nudge-at', String(Date.now() + 9e12)); });
await page.waitForTimeout(600);
await page.reload();
await page.getByText('امروز').first().waitFor();
console.log('first widgets visible after', Date.now() - t0, 'ms');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/1-home.png` });

const check = (name, ok) => console.log(ok ? 'PASS' : 'FAIL', name);

// Tasks
const taskInput = page.getByLabel('تسک جدید');
for (const t of ['امتحان زبان', 'خواندن مقاله‌ی PINN', '۱۵ دقیقه کتاب']) { await taskInput.fill(t); await taskInput.press('Enter'); }
await page.getByRole('checkbox', { name: 'کتاب', exact: true }).click();
await page.locator('.task-row').first().hover();
await page.getByRole('button', { name: 'علامت‌گذاری به‌عنوان مهم' }).first().click();

// Calendar event + holiday lookup
const ev = page.getByLabel('رویداد جدید'); await ev.fill('جلسه با استاد'); await ev.press('Enter');

// Notes: Markdown + LaTeX
const note = page.getByLabel('متن یادداشت');
if (!(await note.count())) await page.locator('.w-empty', { hasText: 'یادداشتی نیست' }).click();
await note.fill('**ایده:** وزن‌دهی تطبیقی\n\n$$\\mathcal{L} = \\mathcal{L}_{data} + \\lambda\\,\\mathcal{L}_{PDE}$$\n\n- چک کردن $\\lambda$ روی Burgers');
await page.getByLabel('عنوان یادداشت').click();
await page.waitForTimeout(800);
check('LaTeX rendered in note', (await page.locator('.md .katex-display').count()) === 1);

// Weather (mocked)
check('weather shows temperature', (await page.getByText('۲۲°').count()) > 0);
await page.screenshot({ path: `${out}/2-data.png` });

// Edit mode + drag
await page.getByRole('button', { name: 'ویرایش چیدمان' }).first().click();
await page.waitForTimeout(300);
const pomo = page.locator('section[aria-label="پومودورو"]');
const b = await pomo.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await page.mouse.down();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 100, { steps: 8 });
await page.mouse.up();
const b2 = await pomo.boundingBox();
check('drag moves widget', Math.abs(b2.y - b.y) > 50);
  // dragging onto another widget is refused
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2 - 200, b2.y + b2.height / 2, { steps: 8 });
  await page.mouse.up();
  const b3 = await pomo.boundingBox();
  check('no overlap on drop', b3.x === b2.x);
await page.getByRole('button', { name: 'تمام', exact: true }).click();

// Settings: city search
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
if (process.env.DBG) { await page.waitForTimeout(500); await page.screenshot({ path: '/tmp/claude-0/dbg-settings.png' }); console.log('panels', await page.locator('aside').count()); }
await page.getByLabel('جستجوی شهر').fill('اصفهان');
await page.getByRole('button', { name: /اصفهان، استان اصفهان/ }).click();
check('city changed', (await page.getByText('اصفهان، استان اصفهان، ایران').count()) > 0);
await page.screenshot({ path: `${out}/3-settings.png` });

// 3D background, if the build has it
const sceneBtn = page.getByRole('button', { name: 'کهکشان مارپیچی' });
if (await sceneBtn.count()) {
  await sceneBtn.click();
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/4-galaxy.png` });
  for (const name of ['موج‌های آرام', 'شفق قطبی', 'اجرام شناور']) {
    await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
    await page.getByRole('button', { name }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/4-${name}.png` });
  }
}

// AI: settings connect to the fake Ollama, then an AI command from Ctrl+K
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
await page.getByText(/متصل شد/).waitFor({ timeout: 5000 }).catch(() => {});
check('AI connects to local server (Origin header stripped)', (await page.getByText(/متصل شد/).count()) > 0);
await page.getByLabel('مدل embedding').selectOption('test-model:8b');
await page.keyboard.press('Escape');
await page.keyboard.press('Control+k');
await page.keyboard.type('/break آماده شدن برای امتحان زبان');
await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await page.getByText('فرمول انرژی').waitFor({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(400);
console.log('assistant text:', (await page.locator('section[aria-label="دستیار هوش مصنوعی"]').innerText().catch(() => 'none')).slice(0, 300));
check('assistant streams an answer', (await page.getByText('تمرین شنیداری').count()) > 0);
check('math renders in the answer', (await page.locator('section[aria-label="دستیار هوش مصنوعی"] .katex').count()) > 0);
await page.screenshot({ path: `${out}/5-assistant.png` });
await page.getByRole('button', { name: /افزودن ۳ مورد به تسک‌ها/ }).click();
await page.waitForTimeout(300);
check('answer list becomes tasks', (await page.locator('section[aria-label="تسک‌ها"]').getByText('مرور لغات درس‌ها').count()) > 0);

// Teachable assistant: memory, knowledge, corrections
const asst = page.locator('section[aria-label="دستیار هوش مصنوعی"]');
await asst.scrollIntoViewIfNeeded();
const ask = async (t) => { await asst.getByLabel('پیام به دستیار').fill(t); await asst.getByLabel('پیام به دستیار').press('Enter'); };
await ask('یادت باشه همیشه جواب‌ها را کوتاه و فارسی بنویس');
await page.waitForTimeout(300);
check('remember command answered locally', (await asst.getByText(/از این به بعد رعایت می‌کنم/).count()) > 0);
await asst.getByRole('tab', { name: 'دانش' }).click();
await asst.getByRole('button', { name: 'چسباندن متن' }).click();
await asst.getByLabel('عنوان متن').fill('خلاصه‌ی پروژه‌ی PGT');
await asst.getByLabel('متن دانش').fill('مدل PGT یک ترنسفورمر فیزیک‌محور برای بازسازی میدان‌های جریان است. داده‌ی آزمایشی آن معادله‌ی برگرز است.\n\nنتیجه‌ی اصلی: خطای نسبی L2 کمتر از روش PINN استاندارد.');
await asst.getByRole('button', { name: 'افزودن' }).click();
await page.waitForTimeout(800);
check('knowledge doc indexed', (await asst.getByText('خلاصه‌ی پروژه‌ی PGT').count()) > 0);
{
  const pdfPage = await ctx.newPage();
  await pdfPage.setContent('<html><body style="font-family:sans-serif"><h1>Reynolds note</h1><p>The R-PET model estimates the Reynolds number from sparse velocity probes.</p></body></html>');
  const pdf = await pdfPage.pdf({ format: 'A4' });
  await pdfPage.close();
  await page.setInputFiles('input[accept^=".pdf"]', { name: 'reynolds-note.pdf', mimeType: 'application/pdf', buffer: pdf });
  await asst.getByText('reynolds-note').waitFor({ timeout: 8000 }).catch(() => {});
  check('PDF text extracted into knowledge base', (await asst.getByText('reynolds-note').count()) > 0);
}
await asst.getByRole('tab', { name: 'گفتگو' }).click();
const before = chats.length;
await ask('داده‌ی آزمایشی PGT چیست؟');
await page.waitForTimeout(500);
await asst.getByText(/منابع:/).first().waitFor({ timeout: 5000 }).catch(() => {});
const sys = chats.at(-1)?.messages?.[0]?.content ?? '';
check('rule from memory reaches the model', chats.length > before && sys.includes('کوتاه و فارسی'));
check('knowledge passage reaches the model', sys.includes('معادله‌ی برگرز'));
check('answer lists its sources', (await asst.getByText(/منابع: \[۱\] خلاصه‌ی پروژه‌ی PGT/).count()) > 0);
await asst.getByRole('button', { name: 'اصلاحش کن' }).last().click();
await asst.getByLabel('اصلاح جواب').fill('PGT مخفف Physics-Guided Transformer است، نه چیز دیگر');
await asst.getByLabel('اصلاح جواب').press('Enter');
await page.waitForTimeout(1200);
const sys2 = chats.at(-1)?.messages?.[0]?.content ?? '';
check('correction is learned and used in the next answer', sys2.includes('Physics-Guided Transformer'));
await asst.getByRole('tab', { name: 'حافظه' }).click();
await asst.getByLabel('متن حافظه').first().waitFor({ timeout: 3000 }).catch(() => {});
const memCount = await asst.getByLabel('متن حافظه').count();
check(`memory panel lists rule and correction (${memCount})`, memCount === 2);
await page.screenshot({ path: `${out}/7-memory.png` });
await asst.getByRole('tab', { name: 'گفتگو' }).click();
await page.screenshot({ path: `${out}/7-assistant.png` });

// Google Calendar (token injected; the OAuth window can't run headless)
await page.evaluate(() => chrome.storage.local.set({ 'nova:google-token': { accessToken: 'test', expiresAt: Date.now() + 3600e3 } }));
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
await page.getByLabel('Client ID').fill('test-client.apps.googleusercontent.com');
check('redirect URI uses fixed extension id', (await page.getByLabel('Redirect URI').inputValue()).includes(id));
await page.getByRole('button', { name: 'ورود با حساب گوگل' }).click();
await page.getByText('وصل شد').waitFor({ timeout: 5000 }).catch(() => {});
await page.getByLabel('تقویم پیش‌فرض').selectOption('me@example.com');
await page.setInputFiles('input[accept=".ics,text/calendar"]', { name: 'uni.ics', mimeType: 'text/calendar', buffer: Buffer.from(`BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:abc\r\nSUMMARY:کلاس یادگیری ماشین\r\nDTSTART:${ymd.replace(/-/g, '')}T140000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`) });
await page.getByText('۱ رویداد وارد شد').waitFor({ timeout: 3000 }).catch(() => {});
check('ICS import', (await page.getByText('۱ رویداد وارد شد').count()) > 0);
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
const cal = page.locator('section[aria-label="تقویم"]');
check('Google event shows in calendar', (await cal.getByText('Lab meeting').count()) > 0);
check('ICS event shows with time', (await cal.getByText('کلاس یادگیری ماشین').count()) > 0 && (await cal.getByText('۱۴:۰۰').count()) > 0);
await page.getByLabel('رویداد جدید').fill('۱۶:۳۰ جلسه با استاد راهنما');
await page.getByLabel('رویداد جدید').press('Enter');
await page.waitForTimeout(500);
check('new event goes to Google', gCalls.some((c) => c.startsWith('POST')) && (await cal.getByText('جلسه با استاد راهنما').count()) > 0);
await page.keyboard.press('Control+k');
await page.keyboard.type('برنامه‌ی پیش‌رو');
await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'تمام', exact: true }).click().catch(() => {});
await page.waitForTimeout(500);
const agenda = page.locator('section[aria-label="برنامه‌ی پیش‌رو"]');
await agenda.scrollIntoViewIfNeeded().catch(() => {});
check('agenda lists upcoming Google event', (await agenda.getByText('Lab meeting').count()) > 0);
await page.screenshot({ path: `${out}/6-calendar.png` });
await cal.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${out}/6-calendar-top.png` });

// Recurring event (Jalali yearly) from the calendar widget
await page.getByLabel('رویداد جدید').fill('سالگرد شروع دکتری');
await page.getByLabel('تکرار').selectOption('jyearly');
await page.getByLabel('رویداد جدید').press('Enter');
await page.waitForTimeout(400);
check('recurring event shows with its rule', (await cal.getByText(/هر سال شمسی/).count()) > 0);
// it was sent to Google (target is Google) → Jalali yearly falls back to the local calendar
check('Jalali repeat kept locally with a note', (await cal.getByText(/تکرار شمسی در گوگل ممکن نیست/).count()) > 0);

// CalDAV against a real Radicale server
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
await page.getByLabel('آدرس CalDAV').fill(DAV);
await page.getByRole('button', { name: 'همگام‌سازی الان' }).click();
await page.getByText(/همگام شد|همگام است/).waitFor({ timeout: 8000 }).catch(() => {});
let serverIcs = await davList();
check('local events pushed to Radicale', serverIcs.includes('سالگرد شروع دکتری') && serverIcs.includes('X-NOVA-JALALI-RRULE') && serverIcs.includes('RDATE'));
// simulate the phone adding an event on the server
await fetch(`${DAV}phone-1.ics`, { method: 'PUT', headers: { 'Content-Type': 'text/calendar' }, body: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//phone//EN\r\nBEGIN:VEVENT\r\nUID:phone-1\r\nDTSTAMP:20261005T000000Z\r\nSUMMARY:قرار از گوشی\r\nDTSTART;VALUE=DATE:${ymd.replace(/-/g, '')}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n` });
await page.getByRole('button', { name: 'همگام‌سازی الان' }).click();
await page.waitForTimeout(1500);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
check('event added on the server appears in Nova', (await cal.getByText('قرار از گوشی').count()) > 0);
// delete a local event in Nova → gone from the server after sync
const icsRow = cal.locator('div', { hasText: 'کلاس یادگیری ماشین' }).last();
await icsRow.getByRole('button', { name: 'حذف رویداد' }).click();
await page.waitForTimeout(2500); // debounced auto-sync
serverIcs = await davList();
check('deletion in Nova reaches the server', !serverIcs.includes('کلاس یادگیری ماشین') && serverIcs.includes('قرار از گوشی'));

// Custom widget in the sandbox
await page.keyboard.press('Control+k');
await page.keyboard.type('ویجت خودت');
await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'تمام', exact: true }).click().catch(() => {});
const cw = page.locator('section[aria-label="ویجت خودت"]');
await cw.scrollIntoViewIfNeeded();
await page.waitForTimeout(1200);
const cframe = page.frameLocator('iframe[title="ویجت خودت"]');
check('custom widget runs its script in the sandbox', /روز/.test(await cframe.locator('#d').innerText().catch(() => '')));
await cw.getByRole('button', { name: 'ویرایش کد ویجت' }).click();
await cw.getByLabel('نمونه‌ها').selectOption('counter');
await cw.getByRole('button', { name: 'اجرا' }).click();
await page.waitForTimeout(1200);
// The layout is scaled to fit the screen; Playwright can't map clicks into a scaled sandboxed
// iframe, so these go through the DOM (the check is about widget storage, not input routing).
await cframe.locator('#b').evaluate((e) => e.click());
await cframe.locator('#b').evaluate((e) => e.click());
await page.waitForTimeout(400);
check('sandbox widget storage works', (await cframe.locator('#n').innerText()) === '۲');
await cw.getByRole('button', { name: 'ویرایش کد ویجت' }).click();
await cw.getByLabel('نمونه‌ها').selectOption('important');
await cw.getByRole('button', { name: 'اجرا' }).click();
await page.waitForTimeout(1200);
check('sandbox widget reads tasks through nova API', (await cframe.getByText('امتحان زبان').count()) > 0);
await page.screenshot({ path: `${out}/8-custom.png` });

// Search engine, backup, storage
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
await page.getByLabel('موتور جستجو').selectOption('duckduckgo');
await page.getByRole('button', { name: 'الان پشتیبان بگیر' }).click();
await page.getByText(/ذخیره شد: ora-backup/).waitFor({ timeout: 5000 }).catch(() => {});
check('automatic backup writes a file', (await page.getByText(/ذخیره شد: ora-backup/).count()) > 0);
check('storage report shown', (await page.getByText(/فضای استفاده‌شده/).count()) > 0);
await page.keyboard.press('Escape');
check('search placeholder follows chosen engine', /DuckDuckGo/.test(await page.locator('input[aria-label="جستجو"]').getAttribute('placeholder')));

// Command palette
await page.keyboard.press('Control+k');
await page.waitForTimeout(200);
const pal = page.getByRole('dialog', { name: 'فرمان‌ها' });
if (await pal.count()) {
  await page.keyboard.type('+ خرید نان');
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/5-palette.png` });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('palette adds task', (await page.getByText('خرید نان').count()) > 0);
}

// Persistence
await page.reload();
await page.getByText('امروز').first().waitFor();
await page.waitForTimeout(1200);
check('tasks persist', (await page.getByText('خواندن مقاله‌ی PINN').count()) > 0);
check('city persists', (await page.getByText('اصفهان').count()) > 0);
check('sandbox widget storage persists', (await page.frameLocator('iframe[title="ویجت خودت"]').getByText('امتحان زبان').count()) > 0);
await page.screenshot({ path: `${out}/6-reload.png` });
if (process.env.NOVA_DEBUG) console.log('EVENTS', await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const tx = r.result.transaction('events'); const q = tx.objectStore('events').getAll(); q.onsuccess = () => res(JSON.stringify(q.result.map((e) => [e.id, e.title, e.day, e.source, e.rrule ? 'R' : '', e.dav ? 'D' : ''])) ); }; })));
// Safe mode
await page.goto(`chrome-extension://${id}/index.html?safe&${NOON}`);
await page.waitForTimeout(1200);
check('safe mode starts with its banner', (await page.getByText(/حالت امن/).count()) > 0 && (await page.getByText('امتحان زبان').count()) > 0);
await page.screenshot({ path: `${out}/9-safe.png` });
// Backup round trip: export here, import into a brand-new profile
// ---------- Modes ----------
await page.goto(`chrome-extension://${id}/index.html?${NOON}`);
await page.waitForTimeout(1200);
const modeIs = async (name) => (await page.locator(`button[aria-label="حالت: ${name}"]`).count()) === 1;
check('starts in normal mode', await modeIs('عادی'));
await page.keyboard.press('Alt+Digit2');
await page.waitForTimeout(500);
check('Alt+2 switches to work mode with its own layout', (await modeIs('کار')) && (await page.locator('section[aria-label="پومودورو"]').count()) === 1 && (await page.getByText('۲۲°').count()) === 0);
await page.screenshot({ path: `${out}/m1-work.png` });
await page.keyboard.press('Alt+Digit3');
await page.waitForTimeout(600);
const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
check('tired mode: one task at a time, warm accent', (await modeIs('خستگی')) && (await page.getByText('فقط همین یکی').count()) === 1 && accent.toLowerCase() === '#e9b48f');
await page.screenshot({ path: `${out}/m2-tired.png` });
await page.keyboard.press('Alt+Digit4');
await page.waitForTimeout(800);
await page.getByLabel('نوشتن و رها کردن').fill('امروز سنگین بود');
await page.getByRole('button', { name: 'رها کن' }).click();
await page.waitForTimeout(2000);
check('sad mode: write and let go leaves nothing behind', (await modeIs('دل‌گرفته')) && (await page.getByLabel('نوشتن و رها کردن').inputValue()) === '');
await page.screenshot({ path: `${out}/m3-sad.png` });
await page.locator('button[aria-label^="حالت:"]').click();
await page.getByRole('menuitemradio', { name: /عادی/ }).click();
await page.waitForTimeout(800);
check('back to normal mode keeps the original layout', (await modeIs('عادی')) && (await page.getByText('۲۲°').count()) > 0 && (await page.getByText('خواندن مقاله‌ی PINN').count()) > 0);
// Offline rule
await ctx.setOffline(true);
await page.waitForTimeout(1500);
check('losing the internet switches to offline mode automatically', (await modeIs('آفلاین')) && (await page.getByText('بدون اینترنت', { exact: true }).count()) === 1 && (await page.getByText(/خودکار روشن شد/).count()) === 1);
await page.screenshot({ path: `${out}/m4-offline.png` });
await ctx.setOffline(false);
await page.waitForTimeout(1500);
check('internet back → returns to the previous mode', await modeIs('عادی'));
// Blocked sites follow the active mode
await page.keyboard.press('Alt+Digit2');
await page.evaluate(() => { chrome.permissions.request = async () => true; });
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
await page.locator('#modes-section summary', { hasText: 'کار' }).click();
await page.getByLabel('سایت‌های بسته · کار').fill('https://www.example.com/feed\nx.com');
await page.getByRole('button', { name: 'ذخیره‌ی سایت‌های کار' }).click();
await page.waitForTimeout(800);
const rulesOn = await page.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
check('work mode installs block rules for its sites', rulesOn.filter((r) => r.id >= 7000).map((r) => r.condition.requestDomains[0]).join(',') === 'example.com,x.com');
await page.keyboard.press('Escape');
await page.keyboard.press('Alt+Digit1');
await page.waitForTimeout(800);
check('leaving the mode removes the block rules', (await page.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())).filter((r) => r.id >= 7000).length === 0);
// Evening light + night rule
await page.goto(`chrome-extension://${id}/index.html?${AT('12:00')}`);
await page.waitForTimeout(800);
const lvl = async () => Number(await page.locator('[data-testid="night"]').getAttribute('data-level'));
check('no night veil at midday', (await lvl()) === 0);
await page.goto(`chrome-extension://${id}/index.html?${AT('21:00')}`);
await page.waitForTimeout(800);
const evening = await lvl();
check('evening light is partly dimmed', evening > 0.1 && evening < 1);
await page.screenshot({ path: `${out}/m5-evening.png` });
await page.goto(`chrome-extension://${id}/index.html?${AT('23:45')}`);
await page.waitForTimeout(1500);
check('after bedtime: full night veil and night mode switched on by its rule', (await lvl()) === 1 && (await modeIs('شب')));
await page.screenshot({ path: `${out}/m6-night.png` });
await page.goto(`chrome-extension://${id}/index.html?${NOON}`);
await page.waitForTimeout(1500);
check('next day the night rule hands back to the previous mode', await modeIs('عادی'));
// Save the current page as a new mode
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
await page.getByLabel('اسم حالت تازه').fill('مطالعه');
await page.getByRole('button', { name: 'از صفحه‌ی فعلی' }).click();
await page.waitForTimeout(400);
check('custom mode saved from the current page', await modeIs('مطالعه'));
await page.keyboard.press('Escape');
await page.keyboard.press('Alt+Digit1');
await page.waitForTimeout(600);

// Several new tabs opened quickly must not be taken for a crash loop
for (let i = 0; i < 5; i++) { await page.goto(`chrome-extension://${id}/index.html?${NOON}`); await page.waitForTimeout(250); }
await page.waitForTimeout(1800);
check('opening tabs quickly does not trigger safe mode', (await page.getByText(/حالت امن/).count()) === 0);
// ---------- Font library: each mode its own fonts ----------
await page.goto(`chrome-extension://${id}/index.html?${NOON}`);
await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
const fdir = path.resolve('node_modules/@fontsource/vazirmatn/files');
const fA = path.join(out, 'Light.woff2'); fs.copyFileSync(path.join(fdir, 'vazirmatn-arabic-200-normal.woff2'), fA);
const fB = path.join(out, 'Bold.woff2'); fs.copyFileSync(path.join(fdir, 'vazirmatn-arabic-700-normal.woff2'), fB);
await page.setInputFiles('input[aria-label="فایل فونت"]', [fA, fB]);
await page.getByText('به کتابخانه اضافه شد.', { exact: false }).waitFor({ timeout: 5000 }).catch(() => {});
check('several fonts uploaded into the library', (await page.getByRole('radio', { name: /^پیش‌فرض: / }).count()) === 2);
await page.locator('#modes-section summary', { hasText: 'کار' }).click();
await page.getByLabel('فونت صفحه · کار').selectOption({ label: 'Bold' });
await page.getByLabel('فونت جمله · کار').selectOption({ label: 'Light' });
await page.keyboard.press('Escape');
const cssVar = (n) => page.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v), n);
await page.waitForTimeout(500);
const homeFont = await cssVar('--font');
await page.keyboard.press('Alt+Digit2');
await page.waitForTimeout(800);
const workFont = await cssVar('--font');
const workSentence = await cssVar('--font-sentence');

check('a mode uses its own page and sentence fonts', homeFont.includes('NovaF-') && workFont.includes('NovaF-') && homeFont !== workFont && workSentence.includes('NovaF-') && !workSentence.includes(workFont.split(',')[0]));
await page.screenshot({ path: `${out}/f1-work-fonts.png` });
await page.keyboard.press('Alt+Digit1');
await page.waitForTimeout(500);
check('back home the default font returns', (await cssVar('--font')) === homeFont);
// A font with very tall line metrics must still fit inside the clock card
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
await page.setInputFiles('input[aria-label="فایل فونت"]', path.resolve('scripts/fixtures-tall.ttf'));
await page.waitForTimeout(800);
await page.getByRole('radio', { name: 'پیش‌فرض: fixtures-tall' }).check();
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
const fits = await page.evaluate(() => [...document.querySelectorAll('.clock-time')].every((t) => {
  const box = t.closest('section').getBoundingClientRect(); const r = t.getBoundingClientRect();
  return r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.left >= box.left - 1 && r.right <= box.right + 1;
}));
await page.screenshot({ path: `${out}/f2-tall-font.png` });
check('clock stays inside its card with a tall font', fits);
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
await page.getByRole('radio', { name: 'پیش‌فرض: Light' }).check();
await page.keyboard.press('Escape');

// Scene speed applies live (no rebuild needed): the scene's own clock runs faster
const sceneClock = () => page.evaluate(() => Number(document.querySelector('canvas[data-clock]')?.dataset.clock ?? NaN));
await page.evaluate(() => { const st = novaStore.getState(); st.setSettings({ background: { ...st.settings.background, kind: 'scene', scene: 'waves', speed: 0, fps: 30 } }); });
await page.waitForTimeout(1500);
let c0 = await sceneClock(); await page.waitForTimeout(1000); const slow = (await sceneClock()) - c0;
await page.evaluate(() => { const st = novaStore.getState(); st.setSettings({ background: { ...st.settings.background, speed: 100 } }); });
await page.waitForTimeout(200);
c0 = await sceneClock(); await page.waitForTimeout(1000); const fast = (await sceneClock()) - c0;
console.log('scene clock per second slow/fast', slow.toFixed(3), fast.toFixed(3));
check('scene speed changes live without touching density', slow > 0 && fast > slow * 5);
await page.evaluate(() => { const st = novaStore.getState(); st.setSettings({ background: { ...st.settings.background, kind: 'starfield' } }); });

// HTML code as background, isolated, with the mouse forwarded
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
await page.getByRole('button', { name: 'پس‌زمینه', exact: true }).click().catch(() => {});
await page.getByRole('button', { name: 'کد HTML', exact: true }).click();
await page.getByLabel('کد HTML پس‌زمینه').fill('<!doctype html><html><head><style>body{margin:0;background:#123;color:#fff;font:40px sans-serif}</style></head><body><canvas id="cv" width="320" height="200" style="position:fixed;inset:0;z-index:-1"></canvas><div id="o">ready-html</div><div id="m">x=none</div><script>{const g=document.getElementById("cv").getContext("2d");g.fillStyle="#c84";g.fillRect(0,0,320,200);}addEventListener("mousemove",e=>{document.getElementById("m").textContent="x="+Math.round(e.clientX)});let leak="none";try{leak=typeof chrome!=="undefined"&&chrome.storage?"storage":"none"}catch(e){};document.getElementById("o").textContent="ready-html leak="+leak;</script></body></html>');
await page.getByRole('button', { name: 'اجرای کد' }).click();
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);
const bgFrame = page.frameLocator('iframe[title="پس‌زمینه‌ی HTML"]');
check('HTML background runs its own script, without access to Nova storage', (await bgFrame.getByText('ready-html leak=none').count()) === 1);
await page.mouse.move(700, 450);
await page.waitForTimeout(400);
check('mouse movement reaches the HTML background', (await bgFrame.getByText('x=700').count()) === 1);
await page.screenshot({ path: `${out}/b1-html-bg.png` });
// Saved backgrounds: the HTML code was kept automatically; switch away and back with one click
await page.evaluate(() => { const st = novaStore.getState(); st.setSettings({ background: { ...st.settings.background, kind: 'starfield' } }); });
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
await page.getByLabel('اسم پس‌زمینه').fill('آسمان آرام');
await page.getByRole('button', { name: 'ذخیره‌ی پس‌زمینه‌ی فعلی' }).click();
await page.waitForTimeout(300);
const tiles = page.locator('[aria-label="پس‌زمینه‌های من"] button[aria-label^="پس‌زمینه: "]');
check('backgrounds are saved: the HTML one automatically, the current one by name', (await tiles.count()) === 2 && (await page.getByRole('button', { name: 'پس‌زمینه: آسمان آرام' }).count()) === 1);
await page.getByRole('button', { name: /^پس‌زمینه: کد HTML/ }).click();
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);
check('one click brings a saved HTML background back', (await bgFrame.getByText(/ready-html/).count()) === 1);
await page.screenshot({ path: `${out}/b2-gallery.png` });
await page.evaluate(() => { const st = novaStore.getState(); st.setSettings({ background: { ...st.settings.background, kind: 'starfield' } }); });

// Settings sheet: version, search, peek while dragging a slider
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
const ver = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'))).version;
const faVer = ver.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
check('settings show the version', (await page.locator('.settings-version').innerText()).includes(faVer));
await page.getByLabel('جستجو در تنظیمات').fill('فونت');
await page.waitForTimeout(200);
check('settings search narrows the sections', await page.locator('section[data-title="فونت‌ها"]').isVisible() && !(await page.locator('section[data-title="هوش مصنوعی"]').isVisible()));
await page.getByLabel('جستجو در تنظیمات').fill('');
const slider = page.locator('section[data-title="رنگ و پنل‌ها"] input[type="range"]').first();
const sb = await slider.boundingBox();
await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
await page.mouse.down();
await page.waitForTimeout(250);
const peekOn = await page.locator('.settings-overlay.peek').count();
await page.mouse.up();
await page.waitForTimeout(250);
check('the sheet fades while a slider is dragged, and comes back', peekOn === 1 && (await page.locator('.settings-overlay.peek').count()) === 0);
check('live preview is shown', (await page.locator('[aria-label="پیش‌نمایش زنده"]').count()) === 1);
// Gallery: inline rename (no browser prompt)
await page.locator('section[data-title="پس‌زمینه"]').scrollIntoViewIfNeeded();
const tile = page.locator('.bg-tile').first();
await tile.hover();
await tile.getByRole('button', { name: /^تغییر نام/ }).click();
await page.keyboard.press('Control+a');
await page.keyboard.type('کهکشان من');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('a saved background is renamed inline', (await page.getByRole('button', { name: 'پس‌زمینه: کهکشان من' }).count()) === 1);
const htmlThumb = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const q = r.result.transaction('backgrounds').objectStore('backgrounds').getAll(); q.onsuccess = () => res(q.result.some((b) => b.bg.kind === 'html' && typeof b.thumb === 'string' && b.thumb.startsWith('data:image'))); }; }));
check('the HTML background got a real preview image', htmlThumb);
await page.screenshot({ path: `${out}/st1-settings.png` });
await page.keyboard.press('Escape');

// ---------- Sentences ----------
await page.goto(`chrome-extension://${id}/index.html?${NOON}`);
await page.waitForTimeout(1500);
const fig = page.locator('figure[aria-label="جمله روی پس‌زمینه"]');
const firstLine = (await fig.locator('blockquote').innerText()).trim();
check('a sentence is on the background with its source', firstLine.length > 5 && (await fig.locator('figcaption').innerText()).length > 2);
await page.screenshot({ path: `${out}/s1-sentence.png` });
await fig.hover();
await fig.getByRole('button', { name: 'دیگری' }).click();
await page.waitForTimeout(500);
check('"another" shows a different line', (await fig.locator('blockquote').innerText()).trim() !== firstLine);
await fig.getByRole('button', { name: 'سنجاق تا فردا' }).click();
await page.waitForTimeout(400);
const pinnedLine = (await fig.locator('blockquote').innerText()).trim();
await page.reload();
await page.waitForTimeout(1500);
check('pinned line survives a new tab', (await fig.locator('blockquote').innerText()).trim() === pinnedLine && (await fig.getByText('سنجاق تا فردا').count()) >= 1);
await fig.hover();
await fig.getByRole('button', { name: 'برداشتن سنجاق' }).click();
// Your own line from the palette
await page.keyboard.press('Control+k');
await page.keyboard.type('«کار کوچک امروز، عادت بزرگ فردا»');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
// Task areas
const ti = page.getByLabel('تسک جدید');
await ti.fill('مرور فصل دوم #پژوهش');
await ti.press('Enter');
await page.waitForTimeout(400);
check('#area in a task sets its life area', (await page.locator('.task-row', { hasText: 'مرور فصل دوم' }).locator('.tm-area').innerText()) === '#پژوهش');
// API + local model sources
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
await page.getByLabel('آدرس API جمله').fill('http://127.0.0.1:11434/quote');
await page.getByRole('button', { name: 'دریافت از API' }).click();
await page.getByText(/جمله‌ی تازه از API ذخیره شد/).waitFor({ timeout: 5000 }).catch(() => {});
if (process.env.NOVA_DEBUG3) console.log('API MSG', await page.getByText(/API|مدل|خطا|نشد/).allInnerTexts());
// The line may already have been pulled by the automatic refresh a moment earlier (then the button reports ۰ new).
check('API lines are fetched and cached', (await page.getByText(/[۰۱] جمله‌ی تازه از API ذخیره شد\./).count()) === 1
  && (await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const q = r.result.transaction('sentences').objectStore('sentences').getAll(); q.onsuccess = () => res(q.result.filter((x) => String(x.source).startsWith('api')).length); }; }))) >= 1);
await page.getByRole('button', { name: 'یک جمله از مدل محلی' }).click();
await page.getByText(/مدل نوشت/).waitFor({ timeout: 8000 }).catch(() => {});
check('local model writes a line into the library', (await page.getByText(/مدل نوشت/).count()) === 1);
await page.getByLabel('جستجوی جمله').fill('عادت بزرگ');
check('own line from the palette is in the library', (await page.getByText('کار کوچک امروز، عادت بزرگ فردا').count()) >= 1);
for (const g of ['جمله‌های اورآ', 'شعر کلاسیک فارسی', 'جمله‌های خودت', 'برداشت‌های خودت', 'بسته‌ها', 'مدل محلی']) await page.getByLabel(new RegExp(`^${g} \\(`)).fill('0');
await page.keyboard.press('Escape');
await fig.hover();
await fig.getByRole('button', { name: 'دیگری' }).click();
await page.waitForTimeout(500);
check('source weights decide what is shown (only API left on)', (await fig.locator('blockquote').innerText()).includes('جمله‌ی روز از API آزمایشی') && (await fig.getByText(/سرور تست/).count()) === 1);
await page.screenshot({ path: `${out}/s2-api.png` });
// Pack file import
const packPath = path.join(out, 'pack.json');
fs.writeFileSync(packPath, JSON.stringify({ name: 'آزمایشی', items: [{ text: 'خط اول بسته', tags: ['focus'] }, 'خط دوم بسته'] }));
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
await page.setInputFiles('input[aria-label="فایل بسته‌ی جمله"]', packPath);
await page.getByText(/بسته‌ی «آزمایشی» با ۲ جمله اضافه شد/).waitFor({ timeout: 4000 }).catch(() => {});
check('a pack file is imported', (await page.getByText(/بسته‌ی «آزمایشی» با ۲ جمله اضافه شد/).count()) === 1);
// Ganjoor: real poetry cached locally
await page.getByRole('button', { name: 'همین الان ۳۰ بیت بگیر' }).click();
await page.getByText(/بیت تازه از گنجور ذخیره شد/).waitFor({ timeout: 15000 }).catch(() => {});
check('couplets fetched from Ganjoor and stored (only valid couplets, no duplicates)', (await page.getByText(/^۲ بیت از گنجور ذخیره شده/).count()) === 1 && (await page.getByText(/^[۰۲] بیت تازه از گنجور ذخیره شد/).count()) === 1);
check('taste panel lists the lines you love (your three favourites to start)', (await page.getByText('اگر تشویق معیار موفقیت بود، دلقک‌ها از همه موفق‌تر بودند.').count()) >= 1);
await page.keyboard.press('Escape');
// One-minute taste test
await page.evaluate(() => { const st = novaStore.getState(); st.setSettings({ sentences: { ...st.settings.sentences, weights: { ...st.settings.sentences.weights, nova: 7, classic: 5 } } }); });
await fig.getByRole('button', { name: /سلیقه‌ات را به اورآ یاد بده/ }).click();
for (let k = 0; k < 10; k++) { await page.locator('.taste-card').first().click(); await page.waitForTimeout(120); }
check('taste test runs ten rounds and summarises with example lines, no jargon', (await page.getByText('سلیقه‌ات را شناختم').count()) === 1 && (await page.locator('.taste-quote').count()) >= 1);
await page.screenshot({ path: `${out}/s3-taste-test.png` });
await page.getByRole('button', { name: 'تمام', exact: true }).click();
await page.waitForTimeout(500);
check('taste-test offer disappears once done', (await fig.getByRole('button', { name: /سلیقه‌ات را به اورآ یاد بده/ }).count()) === 0);
// «کمتر از این نوع» hides that very line
const lessLine = (await fig.locator('blockquote').innerText()).trim();
await fig.hover();
await fig.getByRole('button', { name: 'کمتر از این نوع' }).click();
await page.waitForTimeout(500);
const hidden = await page.evaluate((t) => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const q = r.result.transaction('sentences').objectStore('sentences').getAll(); q.onsuccess = () => res(q.result.some((x) => x.text.replace(/\s+/g, '') === t.replace(/\s+/g, '') && x.dislikedAt)); }; }), lessLine);
check('"less of this kind" hides that line and moves on', (await fig.locator('blockquote').innerText()).trim() !== lessLine && hidden);
await page.screenshot({ path: `${out}/s4-nova-line.png` });
await page.keyboard.press('Escape');

await page.goto(`chrome-extension://${id}/index.html?${NOON}`);
await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'شخصی‌سازی' }).click();
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'خروجی دستی' }).click()]);
const backupPath = path.join(out, 'backup.json');
await dl.saveAs(backupPath);
const ctx2 = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/nova-profile2-'), {
  executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'], viewport: { width: 1440, height: 900 },
});
const p2 = await ctx2.newPage();
await p2.goto(`chrome-extension://${id}/index.html?${NOON}`);
await p2.waitForTimeout(1000);
await p2.getByRole('button', { name: 'شخصی‌سازی' }).click();
await p2.setInputFiles('input[accept="application/json,.json"]', backupPath);
await p2.getByText(/بازگردانی انجام شد/).waitFor({ timeout: 5000 }).catch(() => {});
if (process.env.NOVA_DEBUG2) console.log('P2', (await p2.locator('aside').innerText()).slice(-600));
await p2.keyboard.press('Escape');
await p2.waitForTimeout(800);
check('backup restores tasks in a fresh profile', (await p2.getByText('خواندن مقاله‌ی PINN').count()) > 0);
check('backup restores your own sentences', (await p2.evaluate(() => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const q = r.result.transaction('sentences').objectStore('sentences').getAll(); q.onsuccess = () => res(q.result.filter((x) => x.source === 'mine').length); }; }))) === 4);
check('backup restores memories', (await p2.evaluate(() => new Promise((res) => { const r = indexedDB.open('nova'); r.onsuccess = () => { const q = r.result.transaction('memories').objectStore('memories').count(); q.onsuccess = () => res(q.result); }; }))) === 2);
await ctx2.close();
console.log('google calls:', gCalls.join(' | '));
console.log('origins seen by fake Ollama:', [...new Set(origins)].join(', '));
console.log('errors:', errors.length ? errors : 'none');
await ctx.close();
server.close();
radicale.kill();
