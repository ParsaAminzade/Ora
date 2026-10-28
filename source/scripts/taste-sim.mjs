// Simulated user: loves "paradox + sharp" lines for 120 rounds, then switches to "observation + bittersweet".
// One round = one line shown and reacted to; time advances half a day per round.
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dist = path.resolve('dist');
const key = JSON.parse(fs.readFileSync('dist/manifest.json')).key;
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/sim-'), { executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'], viewport: { width: 1200, height: 800 } });
const page = await ctx.newPage();
await page.goto(`chrome-extension://${id}/index.html?safe`);
await page.waitForTimeout(2500);
const out = await page.evaluate(async () => {
  const S = await novaSentences();
  await S.seedSentences(); await S.resetTaste();
  // no seeded "gold" likes, so we measure learning from scratch
  let offset = 0; const realNow = Date.now; Date.now = () => realNow() + offset;
  const results = [];
  const want = (phase) => (phase === 0 ? 'n:paradox|sharp' : 'n:observation|bittersweet');
  let cur = null;
  for (let r = 0; r < 240; r++) {
    const phase = r < 120 ? 0 : 1;
    cur = await S.choose(cur?.sentence.id, 'skip');
    const fs = S.features(cur.sentence);
    const hit = fs.includes(want(phase));
    results.push(hit ? 1 : 0);
    if (hit) { if (Math.random() < 0.7) await S.feedback(cur.sentence, 'like'); }
    else if (Math.random() < 0.15) await S.feedback(cur.sentence, 'less');
    else if (Math.random() < 0.6) await S.feedback(cur.sentence, 'skip-fast');
    offset += 12 * 3600_000;
  }
  Date.now = realNow;
  return results;
}).catch((e) => String(e));
if (typeof out === 'string') { console.log('ERR', out); process.exit(1); }
const block = 20;
const rates = [];
for (let i = 0; i < out.length; i += block) rates.push(out.slice(i, i + block).reduce((a, b) => a + b, 0) / block);
console.log('hit rate per 20 rounds (target style), first half = style A, second half = style B:');
console.log(rates.map((r, i) => `${i < 6 ? 'A' : 'B'}${(i % 6) + 1}:${Math.round(r * 100)}%`).join('  '));
await ctx.close();
