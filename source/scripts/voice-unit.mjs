// «لحن اورآ»: what Ora says for different weather, prayer times and tones.
import { rolldown } from 'rolldown';
import path from 'node:path'; import fs from 'node:fs';
const S = path.resolve('scripts/stubs') + '/';
const dir = fs.mkdtempSync('/tmp/claude-0/vo-');
const entry = path.join(dir, 'entry.ts');
fs.writeFileSync(entry, `export { weatherLine, prayerLine, emptyAgendaLine } from '${path.resolve('src/core/voice.ts')}';`);
const b = await rolldown({ input: entry, platform: 'node', logLevel: 'silent', plugins: [{ name: 'stub', resolveId(src) { return { './state': S + 'state.ts' }[src] ?? null; } }] });
await b.write({ file: path.join(dir, 'out.mjs'), format: 'esm' });
const m = await import(path.join(dir, 'out.mjs'));
let fail = 0; const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };
const W = (temp, feels, code, o = {}) => ({ fetchedAt: 0, key: '', current: { temp, feels, code, isDay: true, humidity: 40, wind: o.wind ?? 8 }, daily: [{ date: '', code: o.today ?? code, max: o.max ?? temp + 3, min: o.min ?? temp - 5 }, { date: '', code: o.tc ?? code, max: o.tmax ?? temp + 3, min: temp - 5 }] });
const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };
const cases = [
  ['clear 22° noon', W(22, 22, 0), 12, /عالیه|ملایم|آفتابی/],
  ['cool 13° (feels 12)', W(13, 12, 2), 10, /خنک/],
  ['cold 6°', W(6, 4, 3), 9, /سرد/],
  ['freezing', W(-3, -7, 0), 8, /یخ|صفر/],
  ['rain now', W(15, 14, 63), 14, /بارون|چتر/],
  ['rain later today', W(18, 18, 2, { today: 61 }), 9, /بارون می‌گیره|احتمال بارون/],
  ['snow', W(-1, -4, 73), 9, /برف/],
  ['storm', W(20, 20, 95), 16, /رعد|طوفان/],
  ['hot 38°', W(38, 40, 0), 13, /خیلی گرم|گرمای/],
  ['night mild', W(20, 20, 0), 22, /شب|امشب/],
  ['feels much colder (wind chill)', W(10, 4, 2), 10, /حسِ/],
  ['big day/night swing', W(18, 18, 0, { max: 26, min: 9 }), 9, /لایه/],
  ['much colder tomorrow', W(20, 20, 0, { max: 24, tmax: 15, min: 16 }), 15, /فردا.*سردتر/],
  ['rain tomorrow', W(20, 20, 0, { tc: 63, min: 15 }), 15, /فردا بارونیه/],
];
for (const [n, w, h, re] of cases) { const l = m.weatherLine(w, at(h), 'friendly'); console.log(`   ${n}: ${l}`); check(n, re.test(l)); }
const f = m.weatherLine(W(13, 12, 2), at(10), 'formal'); console.log('   formal:', f); check('formal tone is written Persian', /است|داشته باشید/.test(f) && !/خنکه/.test(f));
check('«فقط عدد» says nothing', m.weatherLine(W(13, 12, 2), at(10), 'numbers') === '');
const now = new Date();
for (const [min, re] of [[25, /۲۵ دقیقه مونده/], [7, /نزدیکه/], [95, /یه ساعت و ۳۵ دقیقه/], [300, /۵ ساعت/]]) { const l = m.prayerLine('maghrib', new Date(now.getTime() + min * 60_000 + 1000), now, 'friendly'); console.log(`   prayer +${min}: ${l}`); check(`prayer in ${min} min`, re.test(l)); }
check('lines stay short (≤ 120 chars)', cases.every(([, w, h]) => m.weatherLine(w, at(h), 'friendly').length <= 120));
process.exit(fail ? 1 : 0);
