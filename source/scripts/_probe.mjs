import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dist = path.resolve('dist');
const key = JSON.parse(fs.readFileSync('dist/manifest.json')).key;
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/pr-'), { executablePath: '/opt/pw-browsers/chromium', headless: true, args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'], viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`chrome-extension://${id}/index.html`); await page.waitForTimeout(1500);
for (const t of ['خواندن فصل سوم پایان‌نامه', 'ایمیل به استاد']) { await page.getByLabel('تسک جدید').fill(t); await page.getByLabel('تسک جدید').press('Enter'); }
await page.locator('button[aria-label^="حالت:"]').click(); await page.waitForTimeout(1500);
const m = await page.locator('[role=menu]').boundingBox();
await page.screenshot({ path: '/tmp/claude-0/menu.png', clip: { x: m.x - 20, y: m.y - 20, width: m.width + 40, height: m.height + 40 } });
console.log(await page.evaluate(() => { const m = document.querySelector('[role=menu]'); const cs = getComputedStyle(m); return [cs.backgroundImage.slice(0,200), cs.backgroundColor, cs.opacity, cs.getPropertyValue('--glass-solid'), cs.backdropFilter].join(' | '); }));
await ctx.close();
