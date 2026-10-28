// Capture every screen/state for a UI audit. O=<dir> W=<w> H=<h>
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dist = path.resolve('dist');
const key = JSON.parse(fs.readFileSync('dist/manifest.json')).key;
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const o = process.env.O || '/tmp/claude-0/audit/before'; fs.mkdirSync(o, { recursive: true });
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/au-'), { executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'], viewport: { width: W, height: H } });
await ctx.route('https://api.open-meteo.com/**', (r) => r.fulfill({ json: { current: { temperature_2m: 22.4, apparent_temperature: 21.1, weather_code: 0, is_day: 1, relative_humidity_2m: 28, wind_speed_10m: 9 }, daily: { time: ['2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10'], weather_code: [0,1,3,61,0], temperature_2m_max: [31,30,27,24,28], temperature_2m_min: [19,18,17,15,16] } } }));
const page = await ctx.newPage();
const shot = async (n) => { await page.waitForTimeout(350); await page.screenshot({ path: `${o}/${W}-${n}.png` }); };
const ymd = new Date().toISOString().slice(0, 10);
await page.goto(`chrome-extension://${id}/index.html?now=${ymd}T12:00:00`);
await page.waitForTimeout(2500);
await shot('00-empty');
for (const t of ['خواندن فصل سوم پایان‌نامه #پژوهش', 'ایمیل به استاد', 'تمرین انگلیسی ۲۰ دقیقه']) { await page.getByLabel('تسک جدید').fill(t); await page.getByLabel('تسک جدید').press('Enter'); }
await page.locator('textarea').first().fill('# ایده‌ها\n- وزن‌دهی تطبیقی برای **PINN**\n- $E=mc^2$').catch(() => {});
await page.mouse.click(5, 5);
await shot('01-home');
await page.locator('.sentence').hover(); await shot('02-sentence-hover');
await page.getByRole('button', { name: 'ویرایش چیدمان' }).first().click(); await shot('03-edit');
await page.getByRole('button', { name: 'افزودن ویجت' }).click(); await shot('04-drawer');
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'شخصی‌سازی' }).click(); await shot('05-settings');
const navs = await page.locator('.settings-nav-item').all();
let k = 0;
for (const n of navs) { await n.click(); await page.waitForTimeout(400); await shot(`06-settings-${String(k++).padStart(2, '0')}`); }
await page.keyboard.press('Escape');
await page.keyboard.press('Control+k'); await shot('07-palette');
await page.keyboard.press('Escape');
await page.locator('button[aria-label^="حالت:"]').click(); await shot('08-modes');
await page.keyboard.press('Escape');
await page.mouse.click(5, 5);
await page.evaluate(() => dispatchEvent(new Event('nova:taste-test'))); await page.waitForTimeout(600); await shot('09-taste');
await page.keyboard.press('Escape');
await page.locator('.sc-wrap').hover(); await page.getByRole('button', { name: 'ویرایش میانبرها' }).click(); await shot('10-shortcuts');
await page.keyboard.press('Escape');
await page.locator('.task-row').first().hover(); await shot('11-task-hover');
await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await shot('12-focus');
await ctx.close();
