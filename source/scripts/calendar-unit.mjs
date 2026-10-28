// Unit checks for event time math and ICS round trips (end time, place, notes, alarms, multi-day).
import { rolldown } from 'rolldown';
import path from 'node:path'; import fs from 'node:fs';
const S = path.resolve('scripts/stubs') + '/';
const dir = fs.mkdtempSync('/tmp/claude-0/cu-');
const entry = path.join(dir, 'entry.ts');
fs.writeFileSync(entry, `export * from '${path.resolve('src/core/ics.ts')}'; export * from '${path.resolve('src/core/events.ts')}'; export { expand } from '${path.resolve('src/core/recurrence.ts')}';`);
const b = await rolldown({ input: entry, platform: 'node', logLevel: 'silent',
  plugins: [{ name: 'stub', resolveId(src) { return { './db': S + 'db.ts' }[src] ?? null; } }] });
await b.write({ file: path.join(dir, 'out.mjs'), format: 'esm' });
const m = await import(path.join(dir, 'out.mjs'));
let fail = 0; const check = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };

const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x1\r\nSUMMARY:کارگاه\r\nDTSTART:20261012T140000\r\nDTEND:20261012T163000\r\nLOCATION:سالن ۲\\, دانشکده\r\nDESCRIPTION:خط اول\\nخط دوم\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\nBEGIN:VALARM\r\nTRIGGER:-P1D\r\nEND:VALARM\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:x2\r\nSUMMARY:سفر\r\nDTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261023\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
const [a, t] = m.parseICS(ics);
check('ICS: end, place, notes and alarms are read', a.time === '14:00' && a.end === '16:30' && a.location === 'سالن ۲, دانشکده' && a.notes === 'خط اول\nخط دوم' && a.remind.join() === '15,1440');
check('ICS: an all-day trip of three days (exclusive end)', !t.time && t.day === '2026-10-20' && t.endDay === '2026-10-22');
const ev = { id: 'e1', title: 'شب‌کاری', day: '2026-10-12', time: '22:00', end: '01:30', endDay: '2026-10-13', location: 'خانه', notes: 'یادداشت', remind: [0, 30], source: 'local', updatedAt: 1 };
const back = m.parseICS(m.eventToICS(ev))[0];
check('ICS round trip keeps an event that runs past midnight', back.time === '22:00' && back.end === '01:30' && back.endDay === '2026-10-13' && back.location === 'خانه' && back.remind.join() === '0,30');
check('rangeOn splits it into two days', JSON.stringify(m.rangeOn(ev, '2026-10-12')) === '[1320,1440]' && JSON.stringify(m.rangeOn(ev, '2026-10-13')) === '[0,90]');
check('duration is 3.5 hours', m.durationMin(ev) === 210);
const mv = m.moved({ ...ev, endDay: undefined, end: '23:00' }, '2026-10-14', '23:30');
check('moving keeps the length and can cross midnight', mv.day === '2026-10-14' && mv.time === '23:30' && mv.end === '00:30' && mv.endDay === '2026-10-15');
const rs = m.resized({ id: 'r', title: 'x', day: '2026-10-12', time: '10:00', end: '11:00', source: 'local', updatedAt: 1 }, 12 * 60 + 15, '2026-10-12');
check('resizing changes only the end', rs.end === '12:15' && !rs.endDay);
const series = { id: 's', title: 'کلاس', day: '2026-10-10', endDay: '2026-10-11', rrule: { freq: 'weekly', interval: 1, calendar: 'jalali' }, source: 'local', updatedAt: 1 };
const occ = m.expand(series, '2026-10-18', '2026-10-24');
check('a two-day weekly series shows the occurrence that started before the range', occ.some((o) => o.day === '2026-10-17' && o.endDay === '2026-10-18'));
check('timeLabel for an all-day multi-day event', m.timeLabel({ id: 'z', title: 'z', day: '2026-10-20', endDay: '2026-10-22', source: 'local', updatedAt: 1 }) === 'تمام‌روز · ۳ روز');
process.exit(fail ? 1 : 0);
