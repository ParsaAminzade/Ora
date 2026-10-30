// Phone app: «add Ora to your home screen» — Android one-tap, iPhone steps, in-app browsers, header button, «why not».
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const base = process.env.URL || 'http://localhost:8766/';
let fail = 0; const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };
const shots = '/tmp/claude-0/in-shots'; fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function run(name, dev, init) {
  const ctx = await browser.newContext({ ...dev });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  if (init) await page.addInitScript(init);
  await page.addInitScript(() => { localStorage.setItem('ora:tour-nudge-at', String(Date.now())); localStorage.setItem('ora:tour-first', String(Date.now())); });
  await page.goto(base); await page.waitForTimeout(3000);
  await page.locator('.legal-skip').click({ timeout: 4000 }).catch(() => {});
  await page.evaluate(() => localStorage.setItem('ora:tip-at', '0')); // the «باشه» line after skipping the terms
  return { ctx, page, errors };
}
// 1. Android Chrome with an install offer
{
  const { ctx, page, errors } = await run('android', devices['Pixel 7'], () => {
    addEventListener('load', () => setTimeout(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => { window.__prompted = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); dispatchEvent(e); }, 500));
  });
  check('android: «نصب» button in the header', await page.locator('.install-btn').isVisible());
  await page.waitForTimeout(14000);
  const card = page.locator('.install');
  check('android: the card comes by itself', await card.isVisible());
  await page.screenshot({ path: `${shots}/1-android.png` });
  await card.getByRole('button', { name: 'نصب' }).click(); await page.waitForTimeout(400);
  check('android: one tap opens Chrome\'s install', await page.evaluate(() => !!window.__prompted));
  check('android: thanks after install', /صفحه‌ی اصلی/.test(await card.innerText()));
  check('android: no errors', errors.length === 0); if (errors.length) console.log(errors);
  await ctx.close();
}
// 2. iPhone Safari: steps; «بعداً» asks why
{
  const { ctx, page, errors } = await run('ios', devices['iPhone 13']);
  await page.waitForTimeout(14000);
  const card = page.locator('.install');
  check('iphone: card with Share → Add to Home Screen', /Add to Home Screen/.test(await card.innerText().catch(() => '')));
  await page.screenshot({ path: `${shots}/2-iphone.png` });
  await card.getByRole('button', { name: 'بعداً' }).last().click(); await page.waitForTimeout(300);
  const chips = await card.locator('.why-chips .pill').allInnerTexts(); console.log('   why:', chips);
  check('iphone: «بعداً» → «چرا؟» with reasons', chips.length === 3);
  await page.screenshot({ path: `${shots}/3-why.png` });
  await card.locator('.why-chips .pill').first().click(); await page.waitForTimeout(300);
  const next = await page.evaluate(() => JSON.parse(localStorage.getItem('ora:install-ask')));
  check('iphone: next ask is at least a day later', next.next - Date.now() > 20 * 3600_000);
  check('iphone: header button still there', await page.locator('.install-btn').isVisible());
  await page.locator('.install-btn').click(); await page.waitForTimeout(300);
  check('iphone: header button opens it any time', await page.locator('.install').isVisible());
  check('iphone: no errors', errors.length === 0); if (errors.length) console.log(errors);
  await ctx.close();
}
// 3. inside Telegram
{
  const dev = { ...devices['Pixel 7'], userAgent: devices['Pixel 7'].userAgent + ' Telegram-Android/10.0' };
  const { ctx, page } = await run('inapp', dev);
  await page.locator('.install-btn').click(); await page.waitForTimeout(300);
  check('telegram: «open in browser» steps', /باز کردن در مرورگر/.test(await page.locator('.install').innerText()));
  await ctx.close();
}
// 4. installed (standalone): nothing
{
  const { ctx, page } = await run('standalone', devices['Pixel 7'], () => { localStorage.setItem('ora:installed', '1'); });
  check('installed: no button', (await page.locator('.install-btn').count()) === 0);
  await ctx.close();
}
await browser.close(); process.exit(fail ? 1 : 0);
