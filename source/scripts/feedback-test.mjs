// «چرا نه؟»: declining a ritual / tip / tour card asks why, with varied reasons, and adapts.
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dist = path.resolve('dist');
const key = JSON.parse(fs.readFileSync('dist/manifest.json')).key;
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/fb-'), { executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'], viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { addEventListener('ora:say', (e) => console.log('SAY', performance.now()|0, e.detail.text?.slice(0, 30))); });
page.on('console', (m) => { if (m.text().startsWith('SAY')) console.log(m.text()); });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let fail = 0; const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };
const shots = process.env.O || '/tmp/claude-0/fb-shots'; fs.mkdirSync(shots, { recursive: true });
const url = `chrome-extension://${id}/index.html`;
await page.goto(url); await page.waitForTimeout(3200);
const skipLegal = async () => { const b = page.locator('.legal-skip'); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); } };
await skipLegal();
// a task so the rituals have something to plan; no tour / tip noise in the way
await page.getByLabel('تسک جدید').fill('یه کار'); await page.getByLabel('تسک جدید').press('Enter');
await page.evaluate(() => { localStorage.setItem('ora:tour-nudge-at', String(Date.now())); localStorage.setItem('ora:tip-at', String(Date.now())); localStorage.removeItem('ora:ritual'); });
const hour = new Date().getHours();
// make it the evening ritual's hour now (unless it's morning-ritual time anyway)
await page.evaluate((h) => { const s = globalThis.novaStore.getState(); s.setSettings({ planner: { ...(s.settings.planner ?? {}), hours: 6, buffer: 1.25, morning: true, evening: true, eveningAt: h } }); }, hour);
await page.waitForTimeout(1500);
await page.evaluate(() => { localStorage.removeItem('ora:ritual'); localStorage.setItem('ora:tip-at', String(Date.now())); });
console.log('hour', hour);
await page.reload(); await page.waitForTimeout(6000);
const bubble = page.locator('.ora-tip');
console.log('debug', await page.evaluate(() => ({ dlg: [...document.querySelectorAll('[role="dialog"]')].map((d) => d.getAttribute('aria-label')), rit: localStorage.getItem('ora:ritual'), tip: document.querySelector('.ora-tip')?.textContent, other: document.querySelector('.tour-nudge,.cause,.notify-ask')?.className, panel: globalThis.novaStore.getState().panel, quiet: localStorage.getItem('ora:quiet-until') })));
check('ritual bubble shows', await bubble.isVisible());
check('it has «الان نه»', await bubble.getByRole('button', { name: 'الان نه' }).isVisible());
await bubble.getByRole('button', { name: 'الان نه' }).click(); await page.waitForTimeout(300);
const chips1 = await bubble.locator('.why-chips .pill').allInnerTexts();
check('asks why with three reasons + skip', chips1.length === 3 && await bubble.getByText('رد شو').isVisible());
await page.screenshot({ path: `${shots}/1-why.png` });
await bubble.locator('.why-chips .pill').filter({ hasText: /ساعتش|الان وقتش|زیاده|حوصله|خسته|برنامه|کارم|نمی‌دونم|جمعش/ }).first().click(); await page.waitForTimeout(300);
const reply = await bubble.innerText(); console.log('reply:', reply.replace(/\n/g, ' | '));
check('answers in one line', reply.length > 5);
await page.screenshot({ path: `${shots}/2-reply.png` });
// second time: a different set comes first
const fb = await page.evaluate(async () => (await chrome.storage.local.get('ora:feedback'))['ora:feedback']);
console.log('stored:', JSON.stringify(fb).slice(0, 300));
check('the reason is stored on the device', JSON.stringify(fb).includes('"events"'));
// tip: «زیاد نکته می‌دی» doubles the gap
await page.evaluate(() => { localStorage.setItem('ora:tip-at', '0'); localStorage.setItem('ora:ritual', JSON.stringify({ morning: 'x', evening: 'x' })); });
await page.evaluate(() => { const d = new Date(); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; localStorage.setItem('ora:ritual', JSON.stringify({ morning: k, evening: k })); });
await page.reload(); await page.waitForTimeout(8500);
check('an unasked tip shows', await bubble.isVisible());
await bubble.getByRole('button', { name: 'بستن' }).click(); await page.waitForTimeout(300);
const tipChips = await bubble.locator('.why-chips .pill').allInnerTexts(); console.log('tip chips', tipChips);
check('tip asks why too', tipChips.length === 3);
const often = bubble.locator('.why-chips .pill', { hasText: 'زیاد نکته' });
if (await often.count()) { await often.click(); await page.waitForTimeout(200); check('«زیاد نکته می‌دی» doubles the gap', (await page.evaluate(() => localStorage.getItem('ora:tip-gapx'))) === '2'); }
else { await bubble.locator('.why-chips .pill').first().click(); }
// the Knows page lists it
await page.waitForTimeout(3500);
await page.evaluate(() => dispatchEvent(new CustomEvent('ora:settings', { detail: { section: 'اورآ درباره‌ی تو چه می‌داند' } })));
await page.waitForTimeout(800);
const card = page.locator('.knows-card', { hasText: 'وقتی پیشنهادی را رد کردی' });
console.log((await card.innerText()).slice(0, 300));
check('Knows page lists what you said', (await card.locator('li').count()) >= 1);
await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${shots}/3-knows.png` });
check('no page errors', errors.length === 0); if (errors.length) console.log(errors);
await ctx.close(); process.exit(fail ? 1 : 0);
