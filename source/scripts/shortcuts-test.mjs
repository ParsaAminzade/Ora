// Shortcuts: reorder by drag and by the edit panel, rename, add, delete, persistence.
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
await page.goto(`chrome-extension://${id}/index.html`); await page.waitForTimeout(1800);
const names = () => page.locator('.sc-grid .sc-name').allInnerTexts();
check('default order', (await names())[0] === 'Google');
// drag GitHub onto Google's tile
await page.locator('.sc-item', { hasText: 'GitHub' }).dragTo(page.locator('.sc-item', { hasText: 'Google' }));
await page.waitForTimeout(300);
check('drag moves GitHub first', (await names())[0] === 'GitHub');
// edit panel
await page.locator('.sc-wrap').hover();
await page.getByRole('button', { name: 'ویرایش میانبرها' }).click();
const dlg = page.getByRole('dialog', { name: 'ویرایش میانبرها' });
check('panel opens', await dlg.isVisible());
await dlg.getByRole('button', { name: 'Claude اولین شود' }).click();
check('"first" button', (await names())[0] === 'Claude');
await dlg.getByRole('button', { name: 'Claude پایین‌تر' }).click();
check('down button', (await names())[1] === 'Claude');
const row = dlg.locator('.sc-row').nth(0);
await row.getByLabel('اسم').fill('گیت‌هاب');
check('rename live', (await names())[0] === 'گیت‌هاب');
await dlg.getByLabel('آدرس سایت جدید').fill('news.ycombinator.com');
await dlg.getByLabel('اسم سایت جدید').fill('HN');
await dlg.getByRole('button', { name: 'افزودن' }).click();
check('add', (await names()).includes('HN'));
const hnUrl = await page.locator('.sc-item', { hasText: 'HN' }).locator('a').getAttribute('href');
check('url normalized', hnUrl === 'https://news.ycombinator.com');
await dlg.getByRole('button', { name: 'حذف YouTube' }).click();
check('delete', !(await names()).includes('YouTube'));
await page.keyboard.press('Escape');
check('panel closes on Esc', !(await dlg.isVisible()));
// right-click opens the panel too, and the "add" tile focuses the new-site field
await page.locator('.sc-grid').click({ button: 'right' });
check('context menu opens panel', await dlg.isVisible());
await page.keyboard.press('Escape');
await page.locator('.sc-addtile').click();
check('add tile focuses url field', await dlg.getByLabel('آدرس سایت جدید').evaluate((e) => e === document.activeElement));
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await page.reload(); await page.waitForTimeout(1800);
const after = await names();
check('persists after reload', after[0] === 'گیت‌هاب' && after.includes('HN') && !after.includes('YouTube'));
check('no page errors', errors.length === 0);
await page.evaluate(() => { const r = document.querySelector('.sc-item'); r?.scrollIntoView(); });
await page.screenshot({ path: '/tmp/claude-0/sc-home.png' });
await page.locator('.sc-wrap').hover(); await page.getByRole('button', { name: 'ویرایش میانبرها' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/claude-0/sc-panel.png' });
await ctx.close();
process.exit(fail ? 1 : 0);
