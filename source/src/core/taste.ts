// Taste learning for the background sentence.
//
// Every sentence is described by a handful of features (theme, rhetorical form, tone, the
// form×tone "style niche", source, poet, length). For each feature we keep Beta pseudo-counts of
// positive and negative feedback, separately per mode and globally. Choosing a sentence is
// Thompson sampling: draw a plausible preference for every feature from its Beta posterior, add the
// draws up (log-odds) and take the best. That explores on its own where we know little and exploits
// where we know a lot. Old feedback fades exponentially (half-life, default 30 days), so the model
// follows you when your taste changes.
import { kvGet, kvSet } from './kv';
import type { Sentence } from './db';

export type Signal = 'like' | 'pin' | 'less' | 'skip-fast' | 'dwell' | 'test-win' | 'test-lose';

const REWARD: Record<Signal, [pos: number, neg: number]> = {
  like: [2, 0],
  pin: [1.2, 0],
  less: [0, 1.6],
  'skip-fast': [0, 0.35],
  dwell: [0.25, 0],
  'test-win': [1.2, 0],
  'test-lose': [0, 0.5],
};

/** Feature weights in the summed log-odds. The style niche (form × tone) matters most. */
const FEATURE_WEIGHT: Record<string, number> = { t: 1, f: 0.8, o: 0.8, n: 1.2, s: 0.6, p: 0.7, l: 0.3 };

export const THEMES: Record<string, string> = {
  mind: 'ذهن و ادراک', learning: 'کنجکاوی و یادگیری', measure: 'موفقیت و معیارها', grit: 'پشتکار و شکست', action: 'عمل و شروع',
  self: 'خودشناسی و صداقت با خود', people: 'روابط و مهربانی', focus: 'تمرکز و خودمهاری', time: 'زمان و قدردانی', meaning: 'امید، معنا و آرامش',
};
export const FORMS: Record<string, string> = {
  paradox: 'وارونه‌سازی', contrast: 'تقابل (نه این، بلکه آن)', metaphor: 'استعاره و تصویر', observation: 'مشاهده‌ی دقیق',
  reframe: 'نگاه تازه', question: 'پرسش تأملی', advice: 'توصیه‌ی نرم', verse: 'بیت کلاسیک',
};
export const TONES: Record<string, string> = { calm: 'آرام', energizing: 'پرانرژی', bittersweet: 'تلخ‌وشیرین', sharp: 'تیز و طنزآمیز', neutral: 'تحلیلی' };
const LENS: Record<string, string> = { short: 'کوتاه', medium: 'متوسط', long: 'بلند' };

export function features(s: Sentence): string[] {
  const out: string[] = [];
  if (s.theme) out.push(`t:${s.theme}`);
  const form = s.form ?? (s.source === 'classic' ? 'verse' : undefined);
  if (form) out.push(`f:${form}`);
  if (s.tone) out.push(`o:${s.tone}`);
  if (form && s.tone) out.push(`n:${form}|${s.tone}`);
  out.push(`s:${s.source.split(':')[0]}`);
  if (s.source === 'classic' && s.by) out.push(`p:${s.by}`);
  const w = s.text.split(/\s+/).length;
  out.push(`l:${w <= 9 ? 'short' : w <= 15 ? 'medium' : 'long'}`);
  return out;
}

export function featureLabel(k: string): string {
  const [kind, v] = [k.slice(0, 1), k.slice(2)];
  if (kind === 't') return THEMES[v] ?? v;
  if (kind === 'f') return FORMS[v] ?? v;
  if (kind === 'o') return `لحن ${TONES[v] ?? v}`;
  if (kind === 'n') { const [f, o] = v.split('|'); return `${FORMS[f] ?? f} + ${TONES[o] ?? o}`; }
  if (kind === 's') return ({ nova: 'جمله‌های اورآ', classic: 'شعر کلاسیک', mine: 'جمله‌های خودت', insight: 'برداشت‌های خودت', pack: 'بسته‌ها', api: 'API', ai: 'مدل محلی' } as Record<string, string>)[v] ?? v;
  if (kind === 'p') return v;
  if (kind === 'l') return `جمله‌ی ${LENS[v] ?? v}`;
  return k;
}

/* ---------- the model ---------- */
type Stat = [pos: number, neg: number, t: number];
export interface TasteModel { v: 1; ctx: Record<string, Record<string, Stat>>; events: number }
const KEY = 'nova:taste';
const DAY = 86_400_000;

let cache: TasteModel | null = null;
export async function loadTaste(): Promise<TasteModel> {
  if (!cache) cache = (await kvGet<TasteModel>(KEY)) ?? { v: 1, ctx: {}, events: 0 };
  return cache;
}
async function save() { if (cache) await kvSet(KEY, cache); }
export async function resetTaste(): Promise<void> { cache = { v: 1, ctx: {}, events: 0 }; await save(); }

const decayed = (st: Stat | undefined, now: number, halfLifeDays: number): [number, number] => {
  if (!st) return [0, 0];
  const f = Math.pow(0.5, Math.max(0, now - st[2]) / (halfLifeDays * DAY));
  return [st[0] * f, st[1] * f];
};

export async function record(s: Sentence, signal: Signal, mode: string, halfLifeDays = 30): Promise<void> {
  const m = await loadTaste();
  const now = Date.now();
  const [p, n] = REWARD[signal];
  for (const ctx of ['all', `mode:${mode}`]) {
    const table = (m.ctx[ctx] ??= {});
    for (const k of features(s)) {
      let [dp, dn] = decayed(table[k], now, halfLifeDays);
      // Taste drift: a "no" also wears down old "yes" points (and vice versa) a little,
      // so a style you've grown out of fades in days of use, not only in calendar time.
      if (n > 0) dp *= 1 - 0.12 * n;
      if (p > 0) dn *= 1 - 0.06 * p;
      table[k] = [dp + p, dn + n, now];
    }
  }
  m.events++;
  await save();
}

/* ---------- mode priors (used only until you teach it otherwise) ---------- */
const MODE_PRIOR: Record<string, { like?: string[]; avoid?: string[] }> = {
  work: { like: ['t:focus', 't:action', 't:grit', 't:measure', 't:learning', 'o:energizing', 'o:sharp'], avoid: ['o:bittersweet'] },
  tired: { like: ['o:calm', 'l:short', 't:meaning', 't:time', 't:grit'], avoid: ['o:sharp', 'f:advice', 'l:long'] },
  sad: { like: ['o:calm', 'o:bittersweet', 't:meaning', 't:people', 't:time', 'f:verse'], avoid: ['o:sharp', 'f:advice', 't:measure', 'f:paradox'] },
  night: { like: ['o:calm', 'o:bittersweet', 't:time', 't:meaning', 'f:verse'], avoid: ['o:energizing'] },
};
const PRIOR_STRENGTH = 2;

/* ---------- Thompson sampling ---------- */
// Gamma(k, 1) sampling (Marsaglia & Tsang), then Beta(a, b) = X / (X + Y).
function gauss(): number { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function gamma(k: number): number {
  if (k < 1) return gamma(k + 1) * Math.pow(Math.random(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = gauss(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
export const betaSample = (a: number, b: number) => { const x = gamma(a), y = gamma(b); return x / (x + y); };
const logit = (p: number) => Math.log(Math.max(1e-4, p) / Math.max(1e-4, 1 - p));

export interface Posterior { pos: number; neg: number; mean: number; evidence: number }

/** Posterior for a feature in a mode: mode data + half of the global data (shrinkage) + mode prior. */
export function posterior(m: TasteModel, k: string, mode: string, now: number, halfLifeDays: number): Posterior {
  const [mp, mn] = decayed(m.ctx[`mode:${mode}`]?.[k], now, halfLifeDays);
  const [gp, gn] = decayed(m.ctx.all?.[k], now, halfLifeDays);
  const prior = MODE_PRIOR[mode];
  const pp = prior?.like?.includes(k) ? PRIOR_STRENGTH : 0;
  const pn = prior?.avoid?.includes(k) ? PRIOR_STRENGTH : 0;
  const pos = mp + 0.5 * gp + pp, neg = mn + 0.5 * gn + pn;
  return { pos, neg, mean: (1 + pos) / (2 + pos + neg), evidence: mp + mn + gp + gn };
}

/** Features worth talking about (style, theme, tone, poet), not source or length. */
export const MEANINGFUL = /^[tfonp]:/;

export interface Scored { s: Sentence; score: number; why: string[] }

/** One Thompson draw over all candidates. `extra(s)` adds non-learned terms (source weight, recency…). */
export function rank(cands: Sentence[], m: TasteModel, mode: string, halfLifeDays: number, extra: (s: Sentence) => number): Scored[] {
  const now = Date.now();
  const draws = new Map<string, number>();
  const post = new Map<string, Posterior>();
  const draw = (k: string) => {
    let d = draws.get(k);
    if (d === undefined) {
      const p = posterior(m, k, mode, now, halfLifeDays);
      post.set(k, p);
      d = logit(betaSample(1 + p.pos, 1 + p.neg));
      draws.set(k, d);
    }
    return d;
  };
  return cands.map((s) => {
    const fs = features(s);
    let score = extra(s);
    for (const k of fs) score += (FEATURE_WEIGHT[k[0]] ?? 0.5) * draw(k);
    // Why: the learned features that pushed it up the most.
    const why = fs
      .map((k) => ({ k, p: post.get(k)! }))
      .filter((x) => MEANINGFUL.test(x.k) && x.p && x.p.evidence >= 1.5 && x.p.mean > 0.62)
      .sort((a, b) => b.p.mean - a.p.mean)
      // a style niche (form + tone) already says what its form and tone say
      .filter((x, _i, arr) => !(/^[fo]:/.test(x.k) && arr.some((y) => y.k.startsWith('n:') && y.k.includes(x.k.slice(2)))))
      .slice(0, 2)
      .map((x) => featureLabel(x.k));
    return { s, score, why };
  }).sort((a, b) => b.score - a.score);
}

/** What the model believes, for the «سلیقه‌ی من» page. */
export async function tasteSummary(mode: string | 'all', halfLifeDays = 30): Promise<{ k: string; label: string; mean: number; evidence: number }[]> {
  const m = await loadTaste();
  const now = Date.now();
  const keys = new Set<string>([...Object.keys(m.ctx.all ?? {}), ...Object.keys(m.ctx[`mode:${mode}`] ?? {})]);
  return [...keys].map((k) => {
    const p = mode === 'all'
      ? (() => { const [a, b] = decayed(m.ctx.all?.[k], now, halfLifeDays); return { mean: (1 + a) / (2 + a + b), evidence: a + b }; })()
      : posterior(m, k, mode, now, halfLifeDays);
    return { k, label: featureLabel(k), mean: p.mean, evidence: p.evidence };
  }).filter((x) => x.evidence >= 0.5 && MEANINGFUL.test(x.k));
}
