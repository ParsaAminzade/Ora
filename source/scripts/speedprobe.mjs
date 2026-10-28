import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dist = path.resolve('dist');
const key = JSON.parse(fs.readFileSync('dist/manifest.json')).key;
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/sp-'), { executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'], viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const ymd = new Date().toISOString().slice(0, 10);
await page.goto(`chrome-extension://${id}/index.html?now=${ymd}T12:00:00`);
await page.waitForTimeout(2000);
for (const sp of [0, 100]) {
  await page.evaluate((v) => { const st = novaStore.getState(); st.setSettings({ background: { ...st.settings.background, kind: 'scene', scene: 'waves', speed: v, fps: 60 } }); }, sp);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/claude-0/sp-${sp}-a.png`, clip: { x: 0, y: 330, width: 1440, height: 100 } });
  await page.waitForTimeout(60);
  await page.screenshot({ path: `/tmp/claude-0/sp-${sp}-b.png`, clip: { x: 0, y: 330, width: 1440, height: 100 } });
}
await ctx.close();
