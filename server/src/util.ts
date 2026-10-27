// Small helpers shared by the API and the pages: escaping, Persian digits, Jalali dates, responses.

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_PASSWORD?: string;
  SYNC_GAP?: string;
}

export const now = () => Math.floor(Date.now() / 1000);

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape for HTML text and attribute values. Everything user-provided goes through this. */
export const esc = (v: unknown): string => (v === null || v === undefined ? '' : String(v).replace(/[&<>"']/g, (c) => ESC[c]));

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const fa = (v: unknown): string => (v === null || v === undefined ? '' : String(v).replace(/\d/g, (d) => FA_DIGITS[+d]).replace(/\./g, '٫'));

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + gdm[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = days < 186 ? 1 + (days % 31) : 1 + ((days - 186) % 30);
  return [jy, jm, jd];
}
/** Seconds since epoch → «۵ آبان ۱۴۰۵» in Tehran time (optionally with the time). */
export function jdate(ts: number | null | undefined, withTime = false): string {
  if (!ts) return '—';
  const d = new Date((ts + 3.5 * 3600) * 1000); // Tehran is UTC+3:30
  const [y, m, dd] = toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  let s = `${dd} ${MONTHS[m - 1]} ${y}`;
  if (withTime) s += `، ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return fa(s);
}
export function ago(ts: number | null | undefined): string {
  if (!ts) return 'هرگز';
  const s = now() - ts;
  if (s < 90) return 'همین حالا';
  if (s < 3600) return fa(`${Math.floor(s / 60)} دقیقه پیش`);
  if (s < 86400) return fa(`${Math.floor(s / 3600)} ساعت پیش`);
  if (s < 86400 * 45) return fa(`${Math.floor(s / 86400)} روز پیش`);
  return jdate(ts);
}

const COUNTRIES: Record<string, string> = {
  IR: 'ایران', US: 'آمریکا', DE: 'آلمان', GB: 'انگلستان', CA: 'کانادا', TR: 'ترکیه', AE: 'امارات', NL: 'هلند', FR: 'فرانسه',
  SE: 'سوئد', AU: 'استرالیا', IQ: 'عراق', AF: 'افغانستان', IT: 'ایتالیا', FI: 'فنلاند', NO: 'نروژ', AT: 'اتریش', CH: 'سوئیس',
  QA: 'قطر', OM: 'عمان', AM: 'ارمنستان', GE: 'گرجستان', MY: 'مالزی', JP: 'ژاپن', CN: 'چین', IN: 'هند', RU: 'روسیه', ES: 'اسپانیا',
};
export const countryName = (c: string | null | undefined) => (!c ? '—' : COUNTRIES[c] ?? c);

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
export const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS, ...headers } });
export const redirect = (to: string, headers: Record<string, string> = {}) => new Response(null, { status: 303, headers: { Location: to, ...headers } });

/** A bare HTML page in Ora's look (RTL, local fonts, no external requests). */
export const page = (title: string, body: string) => `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><link rel="icon" href="/static/icon.png"><link rel="stylesheet" href="/static/style.css"></head>
<body>${body}</body></html>`;

export const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
export const today = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
