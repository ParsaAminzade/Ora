// Calendar math for the Solar Hijri (Jalali), Gregorian and lunar Hijri calendars.
// Everything is built on the browser's own Intl calendars, so there are no tables to maintain.

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const fa = (v: number | string): string => String(v).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
export const pad2 = (n: number) => String(n).padStart(2, '0');

export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const WEEKDAYS_FULL = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
export const WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const GREG_MONTHS = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];

export interface JDate { jy: number; jm: number; jd: number }

const persianParts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });

export function toJalali(d: Date): JDate {
  let jy = 0, jm = 0, jd = 0;
  for (const p of persianParts.formatToParts(d)) {
    if (p.type === 'year') jy = Number(p.value);
    else if (p.type === 'month') jm = Number(p.value);
    else if (p.type === 'day') jd = Number(p.value);
  }
  return { jy, jm, jd };
}

const cmp = (a: JDate, b: JDate) => (a.jy - b.jy) || (a.jm - b.jm) || (a.jd - b.jd);

/** Gregorian Date (local noon, to dodge DST edges) for a Jalali date. */
export function fromJalali(jy: number, jm: number, jd: number): Date {
  const approxDayOfYear = (jm <= 6 ? (jm - 1) * 31 : 186 + (jm - 7) * 30) + jd - 1;
  const d = new Date(jy + 621, 2, 21 + approxDayOfYear, 12);
  const target = { jy, jm, jd };
  for (let i = 0; i < 6; i++) {
    const c = cmp(toJalali(d), target);
    if (c === 0) break;
    d.setDate(d.getDate() - Math.sign(c));
  }
  return d;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return toJalali(addDays(fromJalali(jy, 12, 29), 1)).jd === 30 ? 30 : 29;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Column index in a Saturday-first week (0 = شنبه … 6 = جمعه). */
export const weekCol = (d: Date) => (d.getDay() + 1) % 7;

export function formatJalaliLong(d: Date): string {
  const j = toJalali(d);
  return `${WEEKDAYS_FULL[weekCol(d)]}، ${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${fa(j.jy)}`;
}

export function formatGregorian(d: Date): string {
  return `${fa(d.getDate())} ${GREG_MONTHS[d.getMonth()]} ${fa(d.getFullYear())}`;
}

const hijriFmt = new Intl.DateTimeFormat('fa-IR-u-ca-islamic-umalqura', { year: 'numeric', month: 'long', day: 'numeric' });

/** Lunar Hijri date. `offsetDays` corrects for Iran's moon-sighting calendar (usually −1 or 0 vs Umm al-Qura). */
export function formatHijri(d: Date, offsetDays = 0): string {
  return hijriFmt.format(addDays(d, offsetDays)).replace(/\s*ه‍?\.ق\.?/, '').trim();
}

export function formatTime(d: Date, seconds = false): string {
  const t = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return fa(seconds ? `${t}:${pad2(d.getSeconds())}` : t);
}

/** ISO date key (YYYY-MM-DD, local) used to index events by day. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
