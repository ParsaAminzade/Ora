// Day one: two questions → Ora may speak today; tips ask «به دردت خورد؟».
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dist = path.resolve('dist');
const key = JSON.parse(fs.readFileSync('dist/manifest.json')).key;
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/qs-'), { executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'], viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage(); await page.addInitScript(() => { Math.random = () => 0.5; });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let fail = 0; const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };
await page.goto(`chrome-extension://${id}/index.html`);
await page.locator('.legal-skip').click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(400);
await page.evaluate(() => { const d = new Date(); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; localStorage.setItem('ora:ritual', JSON.stringify({ morning: k, evening: k })); localStorage.setItem('ora:tour-nudge-at', String(Date.now())); localStorage.setItem('ora:tip-at', String(Date.now() - 120000)); });
await page.waitForTimeout(19000);
const q = page.locator('.quick');
check('day one: the two questions come', await q.isVisible());
await page.screenshot({ path: '/tmp/claude-0/qs1.png' });
await q.getByRole('button', { name: 'چرا می‌پرسی؟' }).click();
check('«چرا می‌پرسی؟» names the method', /روش «آینه»/.test(await q.innerText()));
await q.getByRole('button', { name: 'عصر' }).click(); await q.getByRole('button', { name: 'شب', exact: true }).click();
await q.getByRole('button', { name: 'بعدی' }).click();
await q.getByRole('button', { name: 'هر وقت دیدی لازمه' }).click(); await page.waitForTimeout(300);
const done = await q.innerText(); console.log('   ', done);
check('closes the loop with what it understood', /عصر، شب/.test(done));
// trust: brand-new install + answers → step 2 today
const st = await page.evaluate(async () => (await chrome.storage.local.get('ora:self-report'))['ora:self-report']);
check('answers stored on the device', st && st.bands.length === 2);
// a tip asks «به دردت خورد؟»
await page.waitForTimeout(6500);
await page.locator('.ora-eye').click(); await page.waitForTimeout(400);
const tip = page.locator('.ora-tip');
check('every tip asks «به دردت خورد؟»', await tip.getByText('به دردت خورد؟').isVisible());
await tip.getByRole('button', { name: 'نه' }).click(); await page.waitForTimeout(300);
check('«نه» → reasons', (await tip.locator('.why-chips .pill').count()) >= 3);
await page.screenshot({ path: '/tmp/claude-0/qs2.png' });
check('no page errors', errors.length === 0); if (errors.length) console.log(errors);
await ctx.close(); process.exit(fail ? 1 : 0);
