// Text helpers for search: Persian/Arabic letter normalisation, tokenising, scoring.

const STOP = new Set(('و در به از که این را با است برای آن یک تا هم می شود شد کرد بود ها های ای اما یا پس اگر چه هر نه ' +
  'the a an and or of to in on for is are was were be with as at by it this that from').split(' '));

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[ً-ٰٟ]/g, '') // diacritics
    .replace(/‌/g, ' ')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

export function tokens(s: string): string[] {
  return normalize(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Simple BM25-style score of a text for a query (used when no embedding model is set). */
export function keywordScore(queryTokens: string[], text: string, avgLen = 120): number {
  const toks = tokens(text);
  if (!toks.length) return 0;
  const tf = new Map<string, number>();
  for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
  const k1 = 1.2, b = 0.75;
  let score = 0;
  for (const q of new Set(queryTokens)) {
    // prefix match helps with Persian suffixes (کتاب / کتاب‌ها / کتابم)
    let f = tf.get(q) ?? 0;
    if (!f) for (const [t, n] of tf) if (t.startsWith(q) || (t.length > 3 && q.startsWith(t))) f += n * 0.7;
    if (f) score += (f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks.length) / avgLen));
  }
  return score;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Split text into ~800-character chunks on paragraph/sentence boundaries, with a little overlap. */
export function chunkText(text: string, size = 800, overlap = 120): string[] {
  const paras = text.replace(/\r/g, '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  const flush = () => { if (cur.trim()) out.push(cur.trim()); };
  for (const p of paras) {
    if ((cur + '\n\n' + p).length <= size) { cur = cur ? `${cur}\n\n${p}` : p; continue; }
    flush();
    if (p.length <= size) { cur = p; continue; }
    // a very long paragraph: cut by sentences
    const sentences = p.split(/(?<=[.!?؟。])\s+/);
    cur = '';
    for (const s of sentences) {
      if ((cur + ' ' + s).length > size && cur) { out.push(cur.trim()); cur = cur.slice(-overlap); }
      cur += (cur ? ' ' : '') + s;
    }
  }
  flush();
  return out;
}
