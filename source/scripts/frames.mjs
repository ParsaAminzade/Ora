import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dist = path.resolve('dist');
const key = JSON.parse(fs.readFileSync('dist/manifest.json')).key;
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/fr-'), { executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'], viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const ymd = new Date().toISOString().slice(0, 10);
await page.goto(`chrome-extension://${id}/index.html?now=${ymd}T12:00:00`);
await page.waitForTimeout(2000);
await page.evaluate(() => { const st = novaStore.getState(); st.setSettings({ background: { ...st.settings.background, kind: 'scene', scene: 'galaxy', speed: 0 } }); });
await page.waitForTimeout(2500);
for (const f of ['glass', 'bevel', 'halo', 'none']) {
  await page.evaluate((fr) => { const st = novaStore.getState(); st.setSettings({ sentences: { ...st.settings.sentences, frame: fr } }); }, f);
  await page.mouse.move(5, 890);
  await page.waitForTimeout(700);
  const b = await page.locator('figure.sentence').boundingBox();
  await page.screenshot({ path: `/tmp/claude-0/frame-${f}.png`, clip: { x: b.x - 40, y: b.y - 30, width: b.width + 80, height: b.height + 50 } });
}
await page.evaluate(() => { const st = novaStore.getState(); st.setSettings({ sentences: { ...st.settings.sentences, frame: 'glass' } }); });
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/claude-0/frame-full.png' });
await ctx.close();
