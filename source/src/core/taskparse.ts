// Natural Persian task entry, Todoist-style: «فردا ساعت ۵ عصر مقاله رو بخونم ۴۵ دقیقه #پژوهش !»
// → title «مقاله رو بخونم», tomorrow, 17:00, 45 min, area پژوهش, important.
import type { Recurrence } from './db';
import { addDays, dayKey, fromJalali, JALALI_MONTHS, pad2, toJalali, weekCol, WEEKDAYS_FULL, fa } from './dates';

export interface Parsed {
  title: string;
  when?: string; due?: string; time?: string; est?: number;
  priority?: 1; top?: boolean; area?: string; repeat?: Recurrence; someday?: boolean;
  chips: { kind: 'when' | 'due' | 'time' | 'est' | 'pri' | 'area' | 'repeat' | 'someday'; label: string }[];
}

const toLatin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const WORD_NUM: Record<string, number> = { یک: 1, یه: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, یازده: 11, دوازده: 12, نیم: 0.5 };
// weekday name → JS getDay()
const WD: [string, number][] = [['سه‌شنبه', 2], ['سه شنبه', 2], ['چهارشنبه', 3], ['پنجشنبه', 4], ['پنج‌شنبه', 4], ['یکشنبه', 0], ['یک‌شنبه', 0], ['دوشنبه', 1], ['جمعه', 5], ['شنبه', 6]];
const E = '(?![\\p{L}\\u200c])';  // end of a word

/** A day phrase at the start of `s` → [dayKey, matched length]. */
function dayPhrase(s: string, today: Date): [string, number] | null {
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^(امروز|امشب)${E}`, 'u').exec(s))) return [dayKey(today), m[0].length];
  if ((m = new RegExp(`^(پس[\\s\\u200c]?فردا)${E}`, 'u').exec(s))) return [dayKey(addDays(today, 2)), m[0].length];
  if ((m = new RegExp(`^(فردا)${E}`, 'u').exec(s))) return [dayKey(addDays(today, 1)), m[0].length];
  if ((m = new RegExp(`^(آخر[\\s\\u200c]هفته)${E}`, 'u').exec(s))) { const d = (4 - today.getDay() + 7) % 7; return [dayKey(addDays(today, d)), m[0].length]; }
  if ((m = new RegExp(`^(هفته[\\s\\u200c](?:بعد|دیگه|دیگر|آینده))${E}`, 'u').exec(s))) { const toSat = (6 - today.getDay() + 7) % 7 || 7; return [dayKey(addDays(today, toSat)), m[0].length]; }
  for (const [name, g] of WD) {
    if ((m = new RegExp(`^((?:این[\\s\\u200c])?${name}(?:[\\s\\u200c](?:بعد|آینده|هفته[\\s\\u200c]بعد))?)${E}`, 'u').exec(s))) {
      let d = (g - today.getDay() + 7) % 7;
      if (/بعد|آینده/.test(m[1]) ) d += d === 0 ? 7 : 7;
      return [dayKey(addDays(today, d)), m[0].length];
    }
  }
  // «۲۰ مهر» (this year, or next year if it has passed)
  if ((m = new RegExp(`^(\\d{1,2})[\\s\\u200c]+(${JALALI_MONTHS.join('|')})${E}`, 'u').exec(toLatin(s)))) {
    const jd = Number(m[1]), jm = JALALI_MONTHS.indexOf(m[2]) + 1;
    const j = toJalali(today);
    let d = fromJalali(j.jy, jm, jd);
    if (dayKey(d) < dayKey(today)) d = fromJalali(j.jy + 1, jm, jd);
    return [dayKey(d), m[0].length];
  }
  return null;
}

export function dayLabel(key: string, today = new Date()): string {
  const t = dayKey(today);
  if (key === t) return 'امروز';
  if (key === dayKey(addDays(today, 1))) return 'فردا';
  if (key === dayKey(addDays(today, -1))) return 'دیروز';
  const d = new Date(`${key}T12:00:00`);
  const diff = Math.round((d.getTime() - new Date(`${t}T12:00:00`).getTime()) / 864e5);
  if (diff > 1 && diff < 7) return WEEKDAYS_FULL[weekCol(d)];
  const j = toJalali(d);
  return `${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]}`;
}
export const estLabel = (m: number) => (m < 60 ? `${fa(m)} دقیقه` : m % 60 === 0 ? `${fa(m / 60)} ساعت` : `${fa((m / 60).toFixed(1)).replace('.', '٫')} ساعت`);

export function parseTask(raw: string, today = new Date()): Parsed {
  const out: Parsed = { title: '', chips: [] };
  let s = ` ${raw.trim()} `;
  const cut = (re: RegExp, fn: (m: RegExpExecArray) => boolean | void) => {
    const m = re.exec(s);
    if (m && fn(m) !== false) s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
  };

  // #area
  cut(/(?:^|\s)#([\p{L}\p{N}_‌-]+)/u, (m) => { out.area = m[1].replace(/_/g, ' '); });
  // !! = one of today's top three, ! = important
  cut(/(?:^|\s)!!(?=\s)/u, () => { out.top = true; out.priority = 1; });
  cut(/(?:^|\s)!(?=\s)/u, () => { out.priority = 1; });
  // someday
  cut(new RegExp(`\\s(بعداً|بعدا|یه[\\s\\u200c]روزی|یک[\\s\\u200c]روزی)${E}`, 'u'), () => { out.someday = true; });
  // repeat
  cut(new RegExp(`\\sهر[\\s\\u200c]+(روز|هفته|ماه|سال|${WD.map((w) => w[0]).join('|')})${E}`, 'u'), (m) => {
    const w = m[1];
    if (w === 'روز') out.repeat = { freq: 'daily', interval: 1, calendar: 'jalali' };
    else if (w === 'هفته') out.repeat = { freq: 'weekly', interval: 1, calendar: 'jalali' };
    else if (w === 'ماه') out.repeat = { freq: 'monthly', interval: 1, calendar: 'jalali' };
    else if (w === 'سال') out.repeat = { freq: 'yearly', interval: 1, calendar: 'jalali' };
    else {
      const g = WD.find((x) => x[0] === w)![1];
      out.repeat = { freq: 'weekly', interval: 1, calendar: 'jalali', byWeekday: [g] };
      if (!out.when) out.when = dayKey(addDays(today, (g - today.getDay() + 7) % 7));
    }
  });
  // deadline: «تا جمعه», «مهلت ۲۰ مهر», «ددلاین فردا»
  for (let i = 0; i < s.length; i++) {
    const m = new RegExp(`^\\s(تا|مهلت|ددلاین)[\\s\\u200c]+`, 'u').exec(s.slice(i));
    if (!m) continue;
    const hit = dayPhrase(s.slice(i + m[0].length), today);
    if (hit) { out.due = hit[0]; s = s.slice(0, i) + ' ' + s.slice(i + m[0].length + hit[1]); break; }
  }
  // time: «ساعت ۵ عصر», «ساعت ۱۷:۳۰», «۱۷:۳۰»
  cut(new RegExp(`\\s(?:ساعت[\\s\\u200c]*)?([0-9۰-۹]{1,2})(?::([0-9۰-۹]{2}))?(?:[\\s\\u200c]*(صبح|ظهر|عصر|بعدازظهر|بعد[\\s\\u200c]از[\\s\\u200c]ظهر|شب))?(?=\\s)`, 'u'), (m) => {
    const hasWord = /ساعت/.test(m[0]) || m[2] || m[3];
    if (!hasWord) return false;
    let h = Number(toLatin(m[1])); const mm = m[2] ? Number(toLatin(m[2])) : 0;
    if (h > 23 || mm > 59) return false;
    if (m[3] && /عصر|بعد|شب/.test(m[3]) && h < 12) h += 12;
    if (m[3] === 'ظهر' && h < 5) h += 12;
    out.time = `${pad2(h)}:${pad2(mm)}`;
  });
  // estimate: «۴۵ دقیقه», «۲ ساعت», «۱.۵ ساعت», «نیم ساعت», «یک ساعت و نیم»
  cut(new RegExp(`\\s([0-9۰-۹]+(?:[.٫/][0-9۰-۹]+)?|${Object.keys(WORD_NUM).join('|')})[\\s\\u200c]*(دقیقه|دقه|ساعت)(?:[\\s\\u200c]+و[\\s\\u200c]+نیم)?${E}`, 'u'), (m) => {
    const n = WORD_NUM[m[1]] ?? Number(toLatin(m[1]).replace(/[٫/]/, '.'));
    if (!n || Number.isNaN(n)) return false;
    let min = /ساعت/.test(m[2]) ? n * 60 : n;
    if (/و[\s‌]+نیم/.test(m[0])) min += 30;
    out.est = Math.round(min);
  });
  // plan day: first day phrase found anywhere
  if (!out.when) {
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && !/\s/.test(s[i - 1])) continue;
      const hit = dayPhrase(s.slice(i), today);
      if (hit) { out.when = hit[0]; s = s.slice(0, i) + ' ' + s.slice(i + hit[1]); break; }
    }
  }
  if (!out.when && (out.time || out.repeat)) out.when = dayKey(today);

  out.title = s.replace(/\s+/g, ' ').trim() || raw.trim();
  if (out.when) out.chips.push({ kind: 'when', label: dayLabel(out.when, today) });
  if (out.time) out.chips.push({ kind: 'time', label: `ساعت ${fa(out.time)}` });
  if (out.est) out.chips.push({ kind: 'est', label: estLabel(out.est) });
  if (out.due) out.chips.push({ kind: 'due', label: `مهلت ${dayLabel(out.due, today)}` });
  if (out.repeat) out.chips.push({ kind: 'repeat', label: out.repeat.byWeekday?.length ? `هر ${WD.find((w) => w[1] === out.repeat!.byWeekday![0])![0]}` : { daily: 'هر روز', weekly: 'هر هفته', monthly: 'هر ماه', yearly: 'هر سال' }[out.repeat.freq] });
  if (out.top) out.chips.push({ kind: 'pri', label: 'از سه کار مهم امروز' });
  else if (out.priority) out.chips.push({ kind: 'pri', label: 'مهم' });
  if (out.area) out.chips.push({ kind: 'area', label: `#${out.area}` });
  if (out.someday) out.chips.push({ kind: 'someday', label: 'بعداً' });
  if (out.top && !out.when) { out.when = dayKey(today); }
  return out;
}
