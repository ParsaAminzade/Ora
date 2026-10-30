// M2 mirror: test mode, a real «unlike your normal» moment, brakes, answers, trust.
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dist = path.resolve('dist');
const key = JSON.parse(fs.readFileSync('dist/manifest.json')).key;
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/mi-'), { executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'], viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { Math.random = () => 0.5; }); // no intentional silence in the test
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let fail = 0; const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };
const shots = '/tmp/claude-0/mi-shots'; fs.mkdirSync(shots, { recursive: true });
const url = `chrome-extension://${id}/index.html`;
await page.goto(url); await page.waitForTimeout(3200);
await page.locator('.legal-skip').click({ timeout: 6000 }).catch(() => console.log('no legal')); await page.waitForTimeout(500);
const calm = () => page.evaluate(() => { localStorage.setItem('ora:tour-nudge-at', String(Date.now())); localStorage.setItem('ora:tip-at', String(Date.now() - 120_000)); const d = new Date(); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; localStorage.setItem('ora:ritual', JSON.stringify({ morning: k, evening: k })); localStorage.setItem('ora:cause-asked', ''); });
// bedtime far away so «late» doesn't fire unless we want it
await page.evaluate(() => { const s = globalThis.novaStore.getState(); s.setSettings({ night: { ...s.settings.night, bedtime: '04:00' } }); });
const spike = (n) => page.evaluate(async (n) => { const pad = (x) => String(x).padStart(2, '0'); const d = new Date(); const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${Math.floor(d.getMinutes() / 10)}`; const r = (await chrome.storage.local.get('oraRhythm')).oraRhythm ?? { since: Date.now(), slots: {} }; r.slots[k] = { ...(r.slots[k] ?? {}), s: n }; await chrome.storage.local.set({ oraRhythm: r }); }, n);

// 1. without test mode: new user → trust step 0/1 → silence
await calm(); await spike(30); await page.reload(); await page.waitForTimeout(11500);
check('new user: no mirror even with a spike (ladder < 2)', (await page.locator('.mirror').count()) === 0);
// 2. test mode on, normal moment → silence
await page.evaluate(() => localStorage.setItem('ora:mirror-sim', String(Date.now())));
await calm(); await spike(4); await page.reload(); await page.waitForTimeout(11500);
check('test mode, ordinary moment: silence', (await page.locator('.mirror').count()) === 0);
// 3. test mode, many switches → mirror
await calm(); await spike(28); await page.reload(); await page.waitForTimeout(11500);
const m = page.locator('.mirror');
check('test mode, 28 switches: the mirror speaks', await m.isVisible());
if (await m.isVisible()) {
  console.log('  ', (await m.innerText()).replace(/\n/g, ' | '));
  check('it has the «test mode» tag', /حالت آزمایشی/.test(await m.innerText()));
  await m.getByRole('button', { name: 'چرا الان؟' }).click();
  check('«چرا الان؟» explains with your normal', /معمولاً/.test(await m.innerText()));
  await page.screenshot({ path: `${shots}/1-mirror.png` });
  await m.getByRole('button', { name: 'دارم کار می‌کنم' }).click(); await page.waitForTimeout(300);
  check('«دارم کار می‌کنم» → «مزاحم نمی‌شم»', /مزاحم نمی‌شم/.test(await m.innerText()));
}
// 4. right after: the 10-minute cap of test mode holds it
await page.waitForTimeout(4000); await calm(); await page.reload(); await page.waitForTimeout(11500);
check('cap: not again within 10 minutes', (await page.locator('.mirror').count()) === 0);
// 5. touching Ora = using it → silence
// 6. «مزاحم نشو» lowers trust and quiets the day
await page.evaluate(async () => { const r = (await chrome.storage.local.get('ora:mirror'))['ora:mirror']; r.events.forEach((e) => { e.at -= 3600_000 * 3; }); await chrome.storage.local.set({ 'ora:mirror': r }); });
await calm(); await page.reload(); await page.waitForTimeout(11500);
if (await m.isVisible()) {
  await m.getByRole('button', { name: 'مزاحم نشو' }).click(); await page.waitForTimeout(400);
  const st = await page.evaluate(async () => ({ down: (await chrome.storage.local.get('ora:mirror'))['ora:mirror'].down, quiet: Number(localStorage.getItem('ora:quiet-until')) > Date.now() }));
  check('«مزاحم نشو»: one step down + quiet today', st.down === 1 && st.quiet);
} else check('second moment after 3 h shows', false);
// 7. the Knows page: trace
await page.evaluate(() => localStorage.removeItem('ora:quiet-until'));
await page.evaluate(() => dispatchEvent(new CustomEvent('ora:settings', { detail: { section: 'اورآ درباره‌ی تو چه می‌داند' } }))); await page.waitForTimeout(800);
const card = page.locator('.knows-card', { hasText: 'آزمایش آینه روی خودم' });
await card.getByRole('button', { name: 'همین الان یک بار امتحان کن' }).click(); await page.waitForTimeout(800);
const tr = await page.locator('.mirror-trace').innerText().catch(() => ''); console.log('   trace:', tr.replace(/\n/g, ' | '));
const shown = await page.locator('.mirror').isVisible();
check('test button: shows the mirror or explains why not', /تصمیم|ترمز/.test(tr) || shown);
await page.screenshot({ path: `${shots}/2-test-button.png` });
check('no page errors', errors.length === 0); if (errors.length) console.log(errors);
await ctx.close(); process.exit(fail ? 1 : 0);
