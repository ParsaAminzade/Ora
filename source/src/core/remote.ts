// The Ora server (Cloudflare Worker): receiving new lines, fixes, news and the terms; and, only
// with consent, sending likes, search categories and the profile. Nothing else ever leaves the device.
import { useStore } from './state';
import { kvGet, kvSet } from './kv';
import { db, type Sentence } from './db';
import { APP_VERSION, IS_EXTENSION, IS_WEB_BUILD } from './platform';
import LEGAL from '../data/legal.json';

export interface Legal { version: string; updated: string; title: string; summary: string[]; sections: { title: string; body: string }[] }
export interface Consent { likes: boolean; search: boolean; profile: boolean; email: boolean }
export interface PrivacySettings {
  /** e.g. https://ora.p128parsa.workers.dev ('' = no server: nothing is fetched or sent). */
  server: string;
  receive: boolean;
  consent: Consent;
  terms?: { v: string; at: number };
  declinedAt?: number;
  id?: string;
  lastSync: number;
  lastPack: number;
}
export interface Profile { name: string; interests: string[]; email: string }
export interface Signal { k: string; r: string; t?: string; by?: string; d?: string; n?: number }
export interface SentRecord { at: number; payload: unknown; ok: boolean; note?: string }
export interface PackItem { id: string; text: string; by?: string; theme?: string; tags?: string[]; meaning?: string }
export interface Pack {
  rev?: string;
  items?: PackItem[];
  overrides?: { id: string; text: string; meaning?: string }[];
  hide?: string[];
  latest?: { version: string; notes?: string; url?: string; at?: number } | null;
  announce?: { id: string; text: string; link?: string | null } | null;
  legal?: string;
}

// The phone app talks to the server it was opened from; only the copy on GitHub Pages (no server
// there) and the extension use the built-in address.
const onPages = typeof location !== 'undefined' && /\.github\.io$/i.test(location.hostname);
const sameOrigin = () => (IS_WEB_BUILD && typeof location !== 'undefined' && /^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(location.origin) ? location.origin : '');
const ENV_SERVER = (IS_WEB_BUILD && !onPages && sameOrigin()) || (import.meta.env.VITE_ORA_SERVER as string | undefined) || '';

export const NO_CONSENT: Consent = { likes: false, search: false, profile: false, email: false };
/** «قبول دارم» turns everything on at once; the switch in settings turns it all off again. */
export const ALL_CONSENT: Consent = { likes: true, search: true, profile: true, email: true };
export const DEFAULT_PRIVACY: PrivacySettings = { server: ENV_SERVER, receive: true, consent: NO_CONSENT, lastSync: 0, lastPack: 0 };
export const DEFAULT_PROFILE: Profile = { name: '', interests: [], email: '' };
export const BUNDLED_LEGAL = LEGAL as Legal;

export const privacyOf = (): PrivacySettings => {
  const p = useStore.getState().settings.privacy;
  const r = { ...DEFAULT_PRIVACY, ...p, consent: { ...NO_CONSENT, ...p?.consent } };
  // The first server (PythonAnywhere) is filtered in Iran; anyone still pointing at it moves to the new one.
  if (ENV_SERVER && /pythonanywhere\.com/i.test(r.server)) r.server = ENV_SERVER;
  return r;
};
export const profileOf = (): Profile => ({ ...DEFAULT_PROFILE, ...useStore.getState().settings.profile });
export const setPrivacy = (patch: Partial<PrivacySettings>) => {
  useStore.getState().setSettings({ privacy: { ...privacyOf(), ...patch } });
  if ('server' in patch || 'receive' in patch) void tellWorker();
};
export const setProfile = (patch: Partial<Profile>) => useStore.getState().setSettings({ profile: { ...profileOf(), ...patch } });

/** The terms in force: the bundled ones, or newer ones the server sent. */
export async function currentLegal(): Promise<Legal> {
  const r = await kvGet<Legal>('ora:legal-remote');
  return r && Number(r.version) > Number(BUNDLED_LEGAL.version) ? r : BUNDLED_LEGAL;
}
export async function termsOk(p = privacyOf()): Promise<boolean> {
  return !!p.terms && p.terms.v === (await currentLegal()).version;
}
export function serverBase(p = privacyOf()): string | null {
  const s = p.server.trim().replace(/\/+$/, '');
  if (/^https:\/\/[\w.-]+(:\d+)?$/i.test(s) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(s)) return s;
  return null;
}
const anyConsent = (c: Consent) => c.likes || c.search || c.profile;

// Searches about health, religion, politics, money, sex, law or migration, and anything with an
// address or long number, are never recorded at all.
const SENSITIVE = /(بیمار|درد|دارو|قرص|دکتر|پزشک|بیمارستان|سرطان|افسردگ|اضطراب|روانپزشک|روان‌پزشک|مشاور|باردار|حاملگ|علائم|علایم|آزمایش خون|symptom|disease|doctor|pain|cancer|depress|anxiety|pregnan|medic|drug|therap|clinic|covid|نماز|قرآن|دعا|مذهب|دین|خدا|شیعه|سنی|مسیحی|یهود|بهائی|حدیث|امام|religio|quran|bible|church|mosque|\bgod\b|انتخابات|سیاس|اعتراض|رهبر|دولت|مجلس|زندان|اعدام|election|politic|protest|government|وام|بدهی|حقوق|یارانه|قرض|بانک|کارت|رمز|password|loan|debt|salary|\bbank|ارز دیجیتال|crypto|bitcoin|سکس|sex|porn|دوستیابی|dating|طلاق|divorce|ویزا|مهاجرت|اقامت|پناهندگ|visa|immigra|asylum|وکیل|دادگاه|شکایت|lawyer|court|@|\d{7,})/i;
export const SEARCH_CATS: [string, RegExp][] = [
  ['study', /(پایان.?نامه|مقاله|پژوهش|تحقیق|دانشگاه|درس|امتحان|کنکور|کلاس|استاد|فرمول|ریاضی|فیزیک|شیمی|زیست|paper|thesis|arxiv|scholar|research|journal|lecture|course|tutorial|theorem|equation|neural|pinn|dataset)/i],
  ['code', /(python|javascript|typescript|react|\bjava\b|c\+\+|rust|golang|\bsql\b|linux|\bgit\b|docker|\bapi\b|error|exception|\bnpm\b|\bpip\b|stack ?overflow|github|برنامه.?نویسی|کدنویسی|خطای|لینوکس|ویندوز|windows|excel|اکسل|pytorch|tensorflow|cuda)/i],
  ['work', /(رزومه|استخدام|شغل|مصاحبه|linkedin|\bjob|resume|\bcv\b|interview|career|freelanc|فریلنس)/i],
  ['language', /(ترجمه|معنی|meaning of|translat|dictionary|دیکشنری|انگلیسی|grammar|گرامر|تلفظ|pronunciation|ielts|toefl|آیلتس|تافل)/i],
  ['video', /(youtube|یوتیوب|آپارات|aparat|فیلم|سریال|movie|series|netflix|trailer|انیمیشن)/i],
  ['music', /(آهنگ|موزیک|موسیقی|music|song|lyrics|spotify|خواننده|آلبوم)/i],
  ['news', /(اخبار|خبر|news|قیمت دلار|قیمت طلا|weather|هوا)/i],
  ['shopping', /(خرید|قیمت|فروش|دیجی.?کالا|digikala|amazon|price|\bbuy\b|ارزان|تخفیف|سفارش)/i],
  ['travel', /(بلیط|بلیت|هتل|پرواز|قطار|نقشه|مسیر|\bmap|flight|hotel|travel|سفر|اتوبوس)/i],
  ['cooking', /(طرز تهیه|دستور پخت|آشپزی|غذا|کیک|recipe|\bcook)/i],
  ['books', /(کتاب|رمان|شعر|حافظ|سعدی|مولوی|مولانا|خیام|فردوسی|\bbook|novel|poem|poet)/i],
  ['sport', /(فوتبال|ورزش|باشگاه|بدنسازی|football|soccer|\bgym\b|workout|\bnba\b|والیبال)/i],
  ['games', /(بازی|\bgame|gaming|ps5|xbox|steam|minecraft)/i],
];
/** Only the broad category of a search, never its text; null for anything sensitive. */
export function searchCategory(q: string, engine?: string): string | null {
  const s = q.trim().toLowerCase();
  if (!s || SENSITIVE.test(s)) return null;
  if (engine === 'arXiv' || engine === 'Scholar') return 'study';
  if (engine === 'YouTube') return 'video';
  if (engine === 'Translate') return 'language';
  return SEARCH_CATS.find(([, re]) => re.test(s))?.[0] ?? 'other';
}

/** Only Ora's own lines and classical poetry can be shared; your own lines never. */
const sharable = (s: Pick<Sentence, 'id' | 'source'>) => ['nova', 'ora', 'dev', 'classic'].includes(s.source) && /^[A-Za-z0-9:_-]{1,80}$/.test(s.id);
const OUTBOX = 'ora:outbox';
type Outbox = Record<string, Signal>;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function queue(sig: Signal) {
  const box = (await kvGet<Outbox>(OUTBOX)) ?? {};
  const d = today();
  const key = `${sig.k}|${sig.r}|${d}`;
  box[key] = { ...sig, d, n: (box[key]?.n ?? 0) + 1 };
  const keys = Object.keys(box);
  if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete box[k];
  await kvSet(OUTBOX, box);
}
/** like · save · less · unclear · unclear:<why> on a line */
export async function noteLine(s: Pick<Sentence, 'id' | 'source' | 'text' | 'by'>, kind: string) {
  const p = privacyOf();
  if (!p.consent.likes || !serverBase(p) || !sharable(s)) return;
  await queue({ k: kind, r: s.id, ...(s.source === 'classic' ? { t: s.text.slice(0, 300), by: s.by?.slice(0, 60) } : {}) });
}
export async function noteSearch(q: string, engine?: string) {
  const p = privacyOf();
  if (!p.consent.search || !serverBase(p)) return;
  const c = searchCategory(q, engine);
  if (c) await queue({ k: 'search', r: c });
}

export const appVersion = () => APP_VERSION;
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => (b % 36).toString(36)).join('') + Date.now().toString(36);

async function post(path: string, body: unknown) {
  const base = serverBase();
  if (!base) throw new Error('آدرس سرور تنظیم نشده.');
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as Record<string, unknown> };
}

let retryTimer = 0;
/** Send what is waiting (and the profile). At most every 20 hours unless forced. */
export async function syncNow(force = false): Promise<SentRecord | null> {
  let p = privacyOf();
  if (!serverBase(p) || !navigator.onLine) return null;
  const on = anyConsent(p.consent);
  if ((!on && !p.id) || !(await termsOk(p))) return null;
  if (on && !p.id) { setPrivacy({ id: newId() }); p = privacyOf(); }
  const box = (await kvGet<Outbox>(OUTBOX)) ?? {};
  const keys = Object.keys(box);
  if (!force && on && !keys.length && Date.now() - p.lastSync < 72e6) return null;
  const prof = profileOf();
  const payload = {
    id: p.id, v: appVersion(), platform: IS_WEB_BUILD ? 'web' : 'extension', terms: p.terms!.v, termsAt: p.terms!.at, consent: p.consent,
    ...(p.consent.profile ? { profile: { name: prof.name.trim(), interests: prof.interests, ...(p.consent.email && prof.email.trim() ? { email: prof.email.trim() } : {}) } } : {}),
    signals: keys.map((k) => box[k]).filter((s) => (s.k === 'search' ? p.consent.search : p.consent.likes)),
  };
  let rec: SentRecord;
  try {
    const { status, data } = await post('/api/sync', payload);
    if (status === 409) {
      await refreshLegal();
      rec = { at: Date.now(), payload, ok: false, note: 'قوانین تازه‌ای آمده؛ تا پذیرفته نشود چیزی فرستاده نمی‌شود.' };
    } else if (status === 429) {
      // Too soon after the last one: try once more when the server says (so a switch-off still lands).
      retryTimer ||= window.setTimeout(() => { retryTimer = 0; void syncNow(true).catch(() => null); }, (Number(data.retry) || 30) * 1000 + 500);
      return null;
    } else if (status >= 200 && status < 300) {
      const now = (await kvGet<Outbox>(OUTBOX)) ?? {};
      for (const k of keys) delete now[k];
      await kvSet(OUTBOX, now);
      if (!on || data.erased) setPrivacy({ id: undefined, lastSync: Date.now() });
      else setPrivacy({ lastSync: Date.now() });
      rec = { at: Date.now(), payload, ok: true, note: on ? undefined : 'همه‌ی کلیدها خاموش است؛ سرور داده‌های این مرورگر را پاک کرد.' };
    } else rec = { at: Date.now(), payload, ok: false, note: `پاسخ سرور: ${status}` };
  } catch {
    return null;
  }
  await kvSet('ora:last-sent', rec);
  return rec;
}

/** Turn switches on or off. Turning one off drops what was waiting for it and tells the server to erase it. */
export async function setConsent(patch: Partial<Consent>): Promise<void> {
  const consent = { ...privacyOf().consent, ...patch };
  if (!consent.profile) consent.email = false;
  setPrivacy({ consent });
  const box = (await kvGet<Outbox>(OUTBOX)) ?? {};
  for (const [k, s] of Object.entries(box)) if ((s.k === 'search' && !consent.search) || (s.k !== 'search' && !consent.likes)) delete box[k];
  await kvSet(OUTBOX, box);
  await syncNow(true).catch(() => null);
}

/** «پاک کردن همه‌ی داده‌هایم از سرور» */
export async function eraseRemote(): Promise<string> {
  const p = privacyOf();
  await kvSet(OUTBOX, {});
  setPrivacy({ consent: NO_CONSENT });
  if (!p.id) return 'چیزی روی سرور نبود؛ همه‌ی کلیدها خاموش شد.';
  const { status } = await post('/api/delete', { id: p.id });
  if (status >= 300) throw new Error(`پاسخ سرور: ${status}`);
  setPrivacy({ id: undefined });
  await kvSet('ora:last-sent', { at: Date.now(), payload: { id: p.id }, ok: true, note: 'همه‌ی داده‌های این مرورگر از سرور پاک شد.' } satisfies SentRecord);
  return 'همه‌ی داده‌هایت از سرور پاک شد و کلیدها خاموش شدند.';
}

/** «به سازنده بگو»: a message you typed and sent on purpose. */
export async function sendFeedback(text: string): Promise<void> {
  const t = text.trim();
  if (t.length < 2) throw new Error('پیام خالی است.');
  const p = privacyOf();
  const { status } = await post('/api/feedback', { text: t.slice(0, 2000), v: appVersion(), ...(p.id && anyConsent(p.consent) ? { id: p.id } : {}) });
  if (status >= 300) throw new Error(status === 503 ? 'سرور الان شلوغ است؛ کمی بعد دوباره بفرست.' : `پاسخ سرور: ${status}`);
}

export async function testServer(): Promise<string> {
  const base = serverBase();
  if (!base) throw new Error('آدرس باید با https:// شروع شود، مثل https://ora.p128parsa.workers.dev');
  const res = await fetch(`${base}/api/pack`, { cache: 'no-store' }).catch(() => null);
  if (!res) throw new Error('به سرور نرسیدم. اینترنت یا آدرس را ببین، یا شاید برنامه‌ی سرور خاموش شده.');
  if (!res.ok) throw new Error(`سرور جواب داد ولی با خطای ${res.status}.`);
  const k = (await res.json()) as Pack;
  return `وصل است. ${k.items?.length ?? 0} جمله‌ی سرور${k.latest ? `، آخرین نسخه ${k.latest.version}` : ''}.`;
}

/** New lines, fixes to built-in lines (the original kept) and hidden lines. */
export async function applyPack(k: Pack): Promise<void> {
  const items = (k.items ?? []).filter((x) => x && typeof x.text === 'string' && /^r-[\w-]{1,40}$/.test(x.id) && x.text.length <= 400);
  const fixes = new Map((k.overrides ?? []).filter((x) => x && typeof x.text === 'string' && x.text.length <= 400).map((x) => [x.id, x]));
  const hide = new Set((k.hide ?? []).filter((x) => typeof x === 'string'));
  await db.transaction('rw', db.sentences, async () => {
    const had = new Map((await db.sentences.where('source').equals('ora').toArray()).map((s) => [s.id, s]));
    await db.sentences.bulkPut(items.map((x) => {
      const old = had.get(x.id);
      return {
        ...old, id: x.id, text: x.text, by: x.by, theme: x.theme, tags: x.tags, source: 'ora', addedAt: old?.addedAt ?? Date.now(),
        ...(x.meaning ? { meaning: x.meaning, meaningSrc: 'ora' as const } : { meaning: undefined, meaningSrc: undefined }),
        ...(old && old.text !== x.text ? { unclearAt: undefined, unclearWhy: undefined } : {}),
      } as Sentence;
    }));
    const keep = new Set(items.map((x) => x.id));
    await db.sentences.bulkDelete([...had.keys()].filter((id) => !keep.has(id)));
    const touched = await db.sentences.filter((s) => fixes.has(s.id) || s.origText !== undefined || !!s.hidden || hide.has(s.id)).toArray();
    for (const s of touched) {
      const f = fixes.get(s.id);
      const ch: Partial<Sentence> = {};
      if (f) {
        if (s.text !== f.text) Object.assign(ch, { origText: s.origText ?? s.text, text: f.text, unclearAt: undefined, unclearWhy: undefined });
        if (f.meaning) Object.assign(ch, { meaning: f.meaning, meaningSrc: 'ora' });
      } else if (s.origText !== undefined) {
        Object.assign(ch, { text: s.origText, origText: undefined });
        if (s.meaningSrc === 'ora') Object.assign(ch, { meaning: undefined, meaningSrc: undefined });
      }
      if (hide.has(s.id) !== !!s.hidden) ch.hidden = hide.has(s.id) || undefined;
      if (Object.keys(ch).length) await db.sentences.update(s.id, ch);
    }
  });
}

export function isNewer(a: string, b: string): boolean {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

async function refreshLegal() {
  const base = serverBase();
  if (!base) return;
  const res = await fetch(`${base}/api/legal`).catch(() => null);
  if (!res?.ok) return;
  const l = (await res.json()) as Legal;
  if (l?.version && Array.isArray(l.sections) && Array.isArray(l.summary)) await kvSet('ora:legal-remote', l);
}

const say = (detail: unknown) => dispatchEvent(new CustomEvent('ora:say', { detail }));
const openLink = (u: string) => { if (/^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(u)) window.open(u, '_blank', 'noopener'); };

/** Lines, fixes, news and the terms version. At most every 20 hours unless forced; sends nothing. */
export async function fetchPack(force = false): Promise<Pack | null> {
  const p = privacyOf();
  const base = serverBase(p);
  if (!base || !p.receive || !navigator.onLine || (!force && Date.now() - p.lastPack < 72e6)) return null;
  const etag = await kvGet<string>('ora:pack-etag');
  const res = await fetch(`${base}/api/pack`, { headers: etag && !force ? { 'If-None-Match': etag } : {}, cache: 'no-store' }).catch(() => null);
  if (!res) return null;
  setPrivacy({ lastPack: Date.now() });
  if (res.status === 304 || !res.ok) return null;
  const k = (await res.json()) as Pack;
  await applyPack(k);
  await kvSet('ora:pack-etag', res.headers.get('ETag') ?? '');
  await kvSet('ora:pack-info', { latest: k.latest, announce: k.announce, at: Date.now(), count: k.items?.length ?? 0 });
  if (k.legal && k.legal !== BUNDLED_LEGAL.version) await refreshLegal();
  const t = privacyOf().terms;
  if (t && k.legal && t.v !== k.legal) dispatchEvent(new Event('ora:legal'));
  const v = appVersion();
  // A newer extension: the update bar and the worker's notification take it from here (ui/Update.tsx).
  if (!IS_WEB_BUILD && k.latest?.version && v !== 'dev' && isNewer(k.latest.version, v)) {
    dispatchEvent(new CustomEvent('ora:update-available', { detail: k.latest }));
  } else if (k.announce?.id && (await kvGet<string>('ora:announce-seen')) !== k.announce.id) {
    await kvSet('ora:announce-seen', k.announce.id);
    const link = k.announce.link;
    say({ text: k.announce.text, sticky: true, action: link ? { label: 'ببین', run: () => openLink(link) } : undefined });
  }
  return k;
}

/** The extension's background worker checks for new versions on its own (public/sw.js); it reads
 *  the server address and the «receive» switch from here. */
export async function tellWorker(): Promise<void> {
  if (!IS_EXTENSION || !chrome.storage?.local) return;
  const p = privacyOf();
  await chrome.storage.local.set({ oraServer: serverBase(p) ?? '', oraReceive: p.receive }).catch(() => {});
}
/** Called a few seconds after start and every few hours. */
export async function remoteTick(): Promise<void> {
  await tellWorker();
  await fetchPack().catch(() => null);
  await syncNow().catch(() => null);
}
/** After the built-in lines are re-seeded, fetch the pack again so fixes and hidden lines re-apply. */
export async function invalidatePack(): Promise<void> {
  await kvSet('ora:pack-etag', '');
  if (useStore.getState().settings.privacy) setPrivacy({ lastPack: 0 });
}

/** «پروفایل من»: interests that map to sentence themes. */
export const INTEREST_THEMES: [string, string][] = [
  ['زمان و گذر عمر', 'time'],
  ['ذهن و احساس', 'mind'],
  ['یادگیری', 'learning'],
  ['پشتکار', 'grit'],
  ['معنای زندگی', 'meaning'],
  ['آدم‌ها و رابطه‌ها', 'people'],
  ['شناخت خود', 'self'],
  ['شروع کردن و عمل', 'action'],
  ['تمرکز', 'focus'],
  ['معیار موفقیت', 'measure'],
];
export const POETRY_INTEREST = 'شعر کلاسیک';
export function interestThemes(): Set<string> {
  const mine = new Set(profileOf().interests);
  return new Set(INTEREST_THEMES.filter(([l]) => mine.has(l)).map(([, t]) => t));
}
