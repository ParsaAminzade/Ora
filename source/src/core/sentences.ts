// The sentence engine: lines on the background drawn from several sources with weights you set.
// Everything is stored locally; API and model sources are only cached into the same table,
// so the background keeps working when the internet is gone.
import { db, uid, type Sentence, type SentenceWhen, type UnclearWhy } from './db';
import { kvGet, kvSet } from './kv';
import { useStore } from './state';
import { nowDate } from './modes';
import { ensureHostPermission, streamChat } from './providers/ai';
import { harvest } from './ganjoor';
import { features, loadTaste, posterior, rank, record, type Signal } from './taste';
import { interestThemes, invalidatePack, noteLine, POETRY_INTEREST, profileOf } from './remote';
export { features, tasteSummary, resetTaste } from './taste';

import { DEFAULT_SENTENCES, type SentenceSettings, type SourceGroup } from './sentence-settings';
export { DEFAULT_SENTENCES, type SentenceSettings, type SourceGroup };

export const GROUP_NAMES: Record<SourceGroup, string> = {
  nova: 'جمله‌های اورآ',
  classic: 'شعر کلاسیک فارسی',
  mine: 'جمله‌های خودت',
  insight: 'برداشت‌های خودت',
  packs: 'بسته‌ها',
  api: 'API دلخواه',
  ai: 'مدل محلی',
};

export const groupOf = (source: string): SourceGroup =>
  source.startsWith('pack:') ? 'packs' : source.startsWith('api:') ? 'api' : source === 'ora' || source === 'dev' ? 'nova' : (source as SourceGroup);

export const sourceLabel = (s: Sentence): string => {
  if (s.source.startsWith('pack:')) return `بسته‌ی ${s.source.slice(5)}`;
  if (s.source.startsWith('api:')) return s.source.slice(4);
  return { nova: 'اورآ', ora: 'اورآ (تازه)', dev: 'جمله‌ی دولوپر', classic: 'شعر کلاسیک', mine: 'جمله‌ی خودت', insight: 'برداشت خودت', ai: 'مدل محلی' }[s.source] ?? s.source;
};

/* ---------- built-in lines ---------- */
// A few verified classical couplets (public domain); many more arrive from ganjoor.net.
type Classic = [text: string, by: string, theme: string, tone: string];
const CLASSIC: Classic[] = [
  ['توانا بود هر که دانا بود\nز دانش دل پیر برنا بود', 'فردوسی', 'learning', 'energizing'],
  ['میازار موری که دانه‌کش است\nکه جان دارد و جان شیرین خوش است', 'فردوسی', 'people', 'calm'],
  ['بنی‌آدم اعضای یکدیگرند\nکه در آفرینش ز یک گوهرند', 'سعدی', 'people', 'calm'],
  ['چو عضوی به درد آورد روزگار\nدگر عضوها را نماند قرار', 'سعدی', 'people', 'bittersweet'],
  ['صبر و ظفر هر دو دوستان قدیمند\nبر اثر صبر نوبت ظفر آید', 'سعدی', 'grit', 'calm'],
  ['ابر و باد و مه و خورشید و فلک در کارند\nتا تو نانی به کف آری و به غفلت نخوری', 'سعدی', 'time', 'neutral'],
  ['یوسف گم‌گشته بازآید به کنعان غم مخور\nکلبه‌ی احزان شود روزی گلستان غم مخور', 'حافظ', 'meaning', 'calm'],
  ['رسید مژده که ایام غم نخواهد ماند\nچنان نماند و چنین نیز هم نخواهد ماند', 'حافظ', 'meaning', 'calm'],
  ['دلا بسوز که سوز تو کارها بکند\nنیاز نیم‌شبی دفع صد بلا بکند', 'حافظ', 'meaning', 'bittersweet'],
  ['سال‌ها دل طلب جام جم از ما می‌کرد\nوان چه خود داشت ز بیگانه تمنا می‌کرد', 'حافظ', 'self', 'bittersweet'],
  ['بیا تا گل برافشانیم و می در ساغر اندازیم\nفلک را سقف بشکافیم و طرحی نو دراندازیم', 'حافظ', 'action', 'energizing'],
  ['هر گنج سعادت که خدا داد به حافظ\nاز یمن دعای شب و ورد سحری بود', 'حافظ', 'meaning', 'calm'],
  ['هر کسی کو دور ماند از اصل خویش\nباز جوید روزگار وصل خویش', 'مولوی', 'meaning', 'bittersweet'],
  ['بشنو این نی چون شکایت می‌کند\nاز جدایی‌ها حکایت می‌کند', 'مولوی', 'meaning', 'bittersweet'],
  ['این جهان کوه است و فعل ما ندا\nسوی ما آید نداها را صدا', 'مولوی', 'people', 'neutral'],
  ['از محبت تلخ‌ها شیرین شود\nاز محبت مس‌ها زرین شود', 'مولوی', 'people', 'calm'],
  ['این قافله‌ی عمر عجب می‌گذرد\nدریاب دمی که با طرب می‌گذرد', 'خیام', 'time', 'bittersweet'],
];
/** The three lines you said you love: the starting point of your taste. */
const GOLD: Omit<Sentence, 'addedAt' | 'source'>[] = [
  { id: 'gold-1', text: 'اگر تشویق معیار موفقیت بود، دلقک‌ها از همه موفق‌تر بودند.', theme: 'measure', form: 'paradox', tone: 'sharp' },
  { id: 'gold-2', text: 'قدر لحظه‌ها را نمی‌دانیم تا وقتی که خاطره شوند.', theme: 'time', form: 'observation', tone: 'bittersweet' },
  { id: 'gold-3', text: 'آدم‌ها از تاریکی نمی‌ترسند؛ از چیزهایی می‌ترسند که ذهنشان در تاریکی می‌سازد.', theme: 'mind', form: 'contrast', tone: 'sharp' },
];

const SEED_VERSION = 4;

export async function seedSentences(): Promise<void> {
  const have = await kvGet<number>('nova:sentences-seed');
  if (have === SEED_VERSION) return;
  const { default: lib } = await import('../data/nova-sentences.json');
  const rows: Sentence[] = [
    ...CLASSIC.map(([text, by, theme, tone], i): Sentence => ({ id: `c-${i + 1}`, text, by, theme, tone, form: 'verse', source: 'classic', addedAt: 0 })),
    ...(lib as Omit<Sentence, 'source' | 'addedAt'>[]).map((r): Sentence => ({ ...r, source: 'nova', by: 'Ora', addedAt: 0 })),
  ];
  // keep likes / lastShown / dislikes of lines that already exist
  const old = new Map((await db.sentences.bulkGet(rows.map((r) => r.id))).filter(Boolean).map((r) => [r!.id, r!]));
  await db.transaction('rw', db.sentences, async () => {
    // v1 had a few placeholder Nova lines and a couplet you didn't like; the library replaces them.
    await db.sentences.where('source').equals('pack:Nova').delete();
    await db.sentences.where('id').anyOf(['c-18', 'c-19']).delete();
    // lines removed from the library in a later edition (e.g. the clarity pass) go away too
    const keep = new Set(rows.map((r) => r.id));
    await db.sentences.where('source').equals('nova').filter((x) => !keep.has(x.id)).delete();
    await db.sentences.bulkPut(rows.map((r) => { const o = old.get(r.id); return { ...r, likes: o?.likes, lastShown: o?.lastShown, dislikedAt: o?.dislikedAt }; }));
  });
  if (!have || have < 2) {
    // The three lines the developer wrote: shown as «جمله‌ی دولوپر», not as the user's own.
    const gold = GOLD.map((g): Sentence => ({ ...g, source: 'dev', addedAt: Date.now(), likes: 1 }));
    await db.sentences.bulkPut(gold);
    for (const g of gold) await record(g, 'like', 'home');
  }
  // Before 2.4 they were seeded as 'mine' («جمله‌ی خودت»), which they are not.
  await db.sentences.where('id').anyOf(GOLD.map((g) => g.id)).filter((x) => x.source === 'mine').modify({ source: 'dev' });
  await kvSet('nova:sentences-seed', SEED_VERSION);
  await invalidatePack();
}

/* ---------- choosing ---------- */
export const whenNow = (d: Date): SentenceWhen => {
  const h = d.getHours();
  return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'evening' : 'night';
};

/** Old-style tags on packs and your own lines, matched to the built-in modes. */
export const MODE_TAGS: Record<string, string[]> = { work: ['focus'], tired: ['gentle'], sad: ['comfort', 'calm'], night: ['calm'] };

/** The area most of today's open, important tasks belong to. */
export async function focusArea(): Promise<string | undefined> {
  const open = await db.tasks.filter((t) => !t.done && !!t.area).toArray();
  if (!open.length) return undefined;
  const score = new Map<string, number>();
  for (const t of open) score.set(t.area!, (score.get(t.area!) ?? 0) + (t.priority ? 3 : 1));
  return [...score.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export interface Pick { id: string; at: number; mode: string; pinnedUntil?: number; reason: string; views?: number; explore?: boolean; prevShown?: number; replay?: boolean }

const MONTH = 30 * 86_400_000;
const PICK_KEY = 'nova:sentence';
const periodMs = { tab: 0, hour: 3_600_000, day: 86_400_000 } as const;

/** Hard filters: source switched off, wrong time of day or mode, disliked, not for a sad day. */
function eligible(s: Sentence, weights: Record<SourceGroup, number>, mode: string, when: SentenceWhen, now: number): boolean {
  if ((weights[groupOf(s.source)] ?? 0) <= 0) return false;
  if (s.when?.length && !s.when.includes(when)) return false;
  if (s.modes?.length && !s.modes.includes(mode)) return false;
  if (s.dislikedAt && now - s.dislikedAt < 6 * MONTH) return false;
  if (s.hidden) return false; // hidden by the Ora server
  if (s.unclearAt) return false; // set aside until rewritten (or brought back by hand)
  if (mode === 'sad' && s.sadUnsafe) return false;
  return true;
}

export async function choose(exclude?: string, how: 'rotate' | 'skip' = 'rotate'): Promise<{ sentence: Sentence; pick: Pick } | null> {
  const st = useStore.getState().settings;
  const mode = st.modes.find((m) => m.id === st.mode.active) ?? st.modes[0];
  const now = nowDate();
  const t = Date.now();
  const cfg = st.sentences;

  // A line that stayed through several tabs without being skipped was probably liked a little.
  const prev = await kvGet<Pick>(PICK_KEY);
  if (how === 'rotate' && prev && (prev.views ?? 0) >= 3) {
    const ps = await db.sentences.get(prev.id);
    if (ps) await record(ps, 'dwell', prev.mode, cfg.halfLife);
  }

  const when = whenNow(now);
  const area = await focusArea();
  const all = (await db.sentences.toArray()).filter((s) => s.id !== exclude && eligible(s, cfg.weights, mode.id, when, t));
  if (!all.length) return null;
  const model = await loadTaste();
  const want = MODE_TAGS[mode.id] ?? [];
  const liked = interestThemes();
  const poetry = profileOf().interests.includes(POETRY_INTEREST);

  let hit: { s: Sentence; why: string[] };
  let explore = false;
  const fresh = all.filter((s) => !s.lastShown || t - s.lastShown > MONTH);
  if (Math.random() < cfg.explore && fresh.length > 20) {
    // Exploration: something from a corner of the library we know little about.
    // Half the time a uniform pick, half the time the least-known of a random sample.
    const sample = Array.from({ length: 30 }, () => fresh[Math.floor(Math.random() * fresh.length)]);
    const known = (s: Sentence) => features(s).reduce((a, k) => a + posterior(model, k, mode.id, t, cfg.halfLife).evidence, 0);
    hit = { s: Math.random() < 0.5 ? sample[0] : sample.sort((a, b) => known(a) - known(b))[0], why: [] };
    explore = true;
  } else {
    const ranked = rank(all, model, mode.id, cfg.halfLife, (s) => {
      let x = Math.log(Math.max(0.5, cfg.weights[groupOf(s.source)]) / 5);
      if (s.lastShown && t - s.lastShown < MONTH) x -= 4 * (1 - (t - s.lastShown) / MONTH);
      x += 0.4 * (s.likes ?? 0);
      if (want.length && s.tags?.some((g) => want.includes(g))) x += 1;
      if (area && s.area === area) x += 1.2;
      if (s.when?.includes(when)) x += 0.3;
      if (s.theme && liked.has(s.theme)) x += 0.5; // «پروفایل من»: interests
      if (poetry && s.source === 'classic') x += 0.5;
      return x;
    });
    hit = ranked[0];
  }

  const s = hit.s;
  const reason = explore ? 'کاوش: چیزی تازه برای شناختن سلیقه‌ات'
    : hit.why.length ? `چون «${hit.why.join('» و «')}» را دوست داری`
    : area && s.area === area ? `چون تمرکز امروزت «${area}» است`
    : mode.id !== 'home' ? `برای حالت «${mode.name}»`
    : sourceLabel(s);
  const pick: Pick = { id: s.id, at: Date.now(), mode: mode.id, reason, views: 1, explore, prevShown: s.lastShown };
  await db.sentences.update(s.id, { lastShown: Date.now() });
  await kvSet(PICK_KEY, pick);
  return { sentence: s, pick };
}

/** The line to show now: keeps the current one until it is pinned-out, its period ends or the mode changes. */
export async function current(): Promise<{ sentence: Sentence; pick: Pick } | null> {
  await seedSentences();
  const st = useStore.getState().settings;
  const pick = await kvGet<Pick>(PICK_KEY);
  if (pick) {
    const s = await db.sentences.get(pick.id);
    const pinned = pick.pinnedUntil && pick.pinnedUntil > Date.now();
    const fresh = Date.now() - pick.at < periodMs[st.sentences.rotate] && pick.mode === st.mode.active;
    if (s && (pinned || fresh)) {
      const next = { ...pick, views: (pick.views ?? 1) + 1 };
      await kvSet(PICK_KEY, next);
      return { sentence: s, pick: next };
    }
  }
  return choose();
}

/** Feedback from the buttons under the line. */
export async function feedback(s: Sentence, signal: Signal): Promise<void> {
  const st = useStore.getState().settings;
  await record(s, signal, st.mode.active, st.sentences.halfLife);
  if (signal === 'like') await db.sentences.update(s.id, { likes: (s.likes ?? 0) + 1 });
  if (signal === 'less') await db.sentences.update(s.id, { dislikedAt: Date.now() });
  if (signal === 'like' || signal === 'less') await noteLine(s, signal).catch(() => {});
}

export const UNCLEAR_WHY: Record<UnclearWhy, string> = {
  words: 'کلمه‌ها یا اصطلاحش',
  point: 'منظور کلی‌اش',
  context: 'به چه موقعیتی ربط دارد',
  long: 'زیادی پیچیده یا طولانی',
};

/** «منظورش را نفهمیدم»: the line is set aside and kept on a list for rewriting. No taste
 *  signal: an unclear line says nothing about the style you like. */
export async function markUnclear(s: Sentence, why?: UnclearWhy): Promise<void> {
  await db.sentences.update(s.id, { unclearAt: Date.now(), ...(why ? { unclearWhy: why } : {}) });
  await noteLine(s, why ? `unclear:${why}` : 'unclear').catch(() => {});
}

/** A plain one-or-two-sentence explanation from your local model (if one is set up). */
export async function explainLine(s: Sentence): Promise<string> {
  const ai = useStore.getState().settings.ai;
  if (!ai.model) throw new Error('مدلی تنظیم نشده');
  const prompt = `این جمله را خیلی ساده و در حداکثر دو جمله‌ی کوتاه فارسی توضیح بده؛ با یک مثال از زندگی روزمره. فقط توضیح را بنویس.\n\n«${s.text}»`;
  return (await streamChat(ai, [{ role: 'user', content: prompt }], () => {}, undefined, 'تو جمله‌های کوتاه را برای یک دوست، ساده و بی‌تعارف توضیح می‌دهی.')).trim();
}

/** «دیگری»: a quick skip (first seconds) counts as a small «not this kind».
 *  A line flashed for under 1.5 s was not read: it stays "unseen" and teaches nothing.
 *  With `replay`, a line you already loved (or saw lately) comes back instead of a new one. */
export async function next(cur: { sentence: Sentence; pick: Pick } | null, opts: { replay?: boolean } = {}) {
  if (cur && !cur.pick.replay) {
    const age = Date.now() - cur.pick.at;
    if (age < 1500) await db.sentences.update(cur.sentence.id, { lastShown: cur.pick.prevShown });
    else if (age < 8000 && !cur.pick.explore) await feedback(cur.sentence, 'skip-fast');
  }
  if (opts.replay) {
    const t = Date.now();
    const pool = (await db.sentences.toArray()).filter((s) => s.id !== cur?.sentence.id && !s.dislikedAt);
    const loved = pool.filter((s) => (s.likes ?? 0) > 0);
    const recent = pool.filter((s) => s.lastShown && t - s.lastShown < 7 * 86_400_000);
    const from = loved.length >= 3 ? loved : recent.length ? recent : loved;
    if (from.length) {
      const s = from[Math.floor(Math.random() * from.length)];
      const pick: Pick = { id: s.id, at: t, mode: useStore.getState().settings.mode.active, reason: 'از جمله‌هایی که دوست داشتی', views: 1, replay: true };
      await kvSet(PICK_KEY, pick);
      return { sentence: s, pick };
    }
  }
  return choose(cur?.sentence.id, 'skip');
}

export async function pinUntilTomorrow(): Promise<void> {
  const pick = await kvGet<Pick>(PICK_KEY);
  if (!pick) return;
  const t = new Date();
  t.setHours(24, 0, 0, 0);
  await kvSet(PICK_KEY, { ...pick, pinnedUntil: t.getTime() });
  const s = await db.sentences.get(pick.id);
  if (s) await noteLine(s, 'save').catch(() => {});
}

export async function unpin(): Promise<void> {
  const pick = await kvGet<Pick>(PICK_KEY);
  if (pick) await kvSet(PICK_KEY, { ...pick, pinnedUntil: undefined });
}

/** Show a specific line now (used by the taste test and the library). */
export async function showNow(s: Sentence): Promise<void> {
  const mode = useStore.getState().settings.mode.active;
  await kvSet(PICK_KEY, { id: s.id, at: Date.now(), mode, reason: sourceLabel(s), views: 1 } satisfies Pick);
  dispatchEvent(new Event('nova:sentence-reload'));
}

/* ---------- your own lines ---------- */
export async function addSentence(text: string, opts: Partial<Sentence> = {}): Promise<Sentence | null> {
  const t = text.trim();
  if (!t) return null;
  const s: Sentence = { id: uid(), text: t, source: 'mine', addedAt: Date.now(), ...opts };
  await db.sentences.put(s);
  return s;
}

/* ---------- packs and API (same JSON format) ---------- */
// { "name": "…", "items": [ { "text": "…", "by": "…", "area": "…", "tags": ["focus"], "when": ["morning"], "modes": ["work"] } ] }
// Also accepted: an array of items, an array of strings, or one item { "text": … } (a "quote of the day" API).
const WHENS: SentenceWhen[] = ['morning', 'day', 'evening', 'night'];

export function normalizeItems(data: unknown): { name?: string; items: Omit<Sentence, 'id' | 'source' | 'addedAt'>[] } {
  const obj = data as Record<string, unknown>;
  const raw: unknown[] = Array.isArray(data) ? data
    : Array.isArray(obj?.items) ? (obj.items as unknown[])
    : obj && typeof obj === 'object' && (obj.text || obj.quote || obj.content) ? [obj] : [];
  const items = raw.map((x) => {
    if (typeof x === 'string') return { text: x.trim() };
    const o = (x ?? {}) as Record<string, unknown>;
    const text = String(o.text ?? o.quote ?? o.content ?? o.q ?? '').trim();
    const by = String(o.by ?? o.author ?? o.a ?? '').trim() || undefined;
    const strs = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : undefined);
    return {
      text, by,
      area: typeof o.area === 'string' ? o.area : undefined,
      tags: strs(o.tags),
      when: strs(o.when)?.filter((w): w is SentenceWhen => WHENS.includes(w as SentenceWhen)),
      modes: strs(o.modes),
    };
  }).filter((x) => x.text && x.text.length <= 400);
  return { name: typeof obj?.name === 'string' ? obj.name : undefined, items };
}

/** Replace a pack with the file's lines. Returns how many were added. */
export async function importPack(file: File): Promise<{ name: string; count: number }> {
  let data: unknown;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('فایل JSON معتبر نیست.'); }
  const { name: n, items } = normalizeItems(data);
  if (!items.length) throw new Error('جمله‌ای در این فایل پیدا نشد.');
  const name = (n || file.name.replace(/\.json$/i, '')).slice(0, 40);
  const source = `pack:${name}`;
  await db.transaction('rw', db.sentences, async () => {
    await db.sentences.where('source').equals(source).delete();
    await db.sentences.bulkPut(items.map((it, i) => ({ ...it, id: `p-${name}-${i}`, source, addedAt: Date.now() })));
  });
  return { name, count: items.length };
}

export async function exportMine(): Promise<void> {
  const rows = await db.sentences.where('source').anyOf(['mine', 'insight']).toArray();
  const pack = { name: 'جمله‌های من', items: rows.map(({ text, by, area, tags, when, modes }) => ({ text, by, area, tags, when, modes })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nova-sentences.json';
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Fetch new lines from your API and cache them (offline-safe). Returns how many were new. */
export async function fetchApi(): Promise<number> {
  const st = useStore.getState();
  const { apiUrl, apiName } = st.settings.sentences;
  if (!apiUrl) throw new Error('آدرس API خالی است.');
  if (!(await ensureHostPermission(apiUrl))) throw new Error('اجازه‌ی دسترسی به این آدرس داده نشد.');
  const res = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`پاسخ API: ${res.status}`);
  const { items } = normalizeItems(await res.json());
  const source = `api:${apiName || 'API'}`;
  const existing = new Set((await db.sentences.where('source').equals(source).toArray()).map((s) => s.text));
  const fresh = items.filter((x) => !existing.has(x.text));
  await db.sentences.bulkPut(fresh.map((it) => ({ ...it, id: uid(), source, addedAt: Date.now() })));
  // keep the cache bounded
  const all = await db.sentences.where('source').equals(source).sortBy('addedAt');
  if (all.length > 500) await db.sentences.bulkDelete(all.slice(0, all.length - 500).map((s) => s.id));
  const s2 = useStore.getState().settings;
  st.setSettings({ sentences: { ...s2.sentences, apiLast: Date.now() } });
  return fresh.length;
}

/** Ask the local model for one short line that fits the current mode and focus. */
export async function generateLine(): Promise<Sentence | null> {
  const st = useStore.getState();
  const s = st.settings;
  const mode = s.modes.find((m) => m.id === s.mode.active);
  const area = await focusArea();
  const prompt = `یک جمله‌ی کوتاه فارسی (حداکثر ۱۸ کلمه) برای نوشتن روی پس‌زمینه‌ی صفحه بنویس.${mode ? ` حال‌وهوای کاربر: «${mode.name}».` : ''}${area ? ` تمرکز امروزش: «${area}».` : ''} شعار و نصیحت کلیشه‌ای نباشد، ساده و صمیمی باشد. فقط خود جمله را بنویس، بدون گیومه و توضیح.`;
  const text = (await streamChat(s.ai, [{ role: 'user', content: prompt }], () => {}, undefined, 'تو نویسنده‌ی جمله‌های کوتاه و صمیمی فارسی هستی.')).trim().replace(/^[«"']+|[»"']+$/g, '');
  if (!text) return null;
  const line = await addSentence(text.split('\n')[0], { source: 'ai', by: s.ai.model || 'مدل محلی', area, modes: mode && MODE_TAGS[mode.id] ? [mode.id] : undefined });
  st.setSettings({ sentences: { ...useStore.getState().settings.sentences, aiLast: Date.now() } });
  return line;
}

/** Daily top-ups for API / model sources, quietly (failures are fine offline). */
export async function refreshSources(): Promise<void> {
  const s = useStore.getState().settings.sentences;
  const day = 20 * 3_600_000;
  if (s.apiUrl && s.weights.api > 0 && Date.now() - s.apiLast > day && navigator.onLine) await fetchApi().catch(() => 0);
  if (s.weights.ai > 0 && Date.now() - s.aiLast > day) await generateLine().catch(() => null);
  if (s.ganjoor.enabled && s.weights.classic > 0 && navigator.onLine && Date.now() - s.ganjoor.last > day) {
    const n = await harvest(s.ganjoor.perDay, s.ganjoor.poets).catch(() => 0);
    const cur = useStore.getState().settings.sentences;
    if (n > 0) useStore.getState().setSettings({ sentences: { ...cur, ganjoor: { ...cur.ganjoor, last: Date.now() } } });
  }
}
