// Real classical Persian poetry from ganjoor.net (public API), cached locally so it keeps working
// offline. We walk a poet's table of contents at random, open a poem and keep one couplet.
import { db, type Sentence } from './db';
import { kvGet, kvSet } from './kv';

const API = 'https://api.ganjoor.net/api/ganjoor';

export interface GPoet { id: number; name: string; nickname?: string; rootCatId: number }

async function getJSON<T>(url: string, ms = 12_000): Promise<T> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`گنجور: ${res.status}`);
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(t);
  }
}

const POETS_KEY = 'nova:ganjoor-poets';
export async function ganjoorPoets(force = false): Promise<GPoet[]> {
  const cached = await kvGet<{ at: number; list: GPoet[] }>(POETS_KEY);
  if (cached && !force && Date.now() - cached.at < 30 * 86_400_000) return cached.list;
  const raw = await getJSON<GPoet[]>(`${API}/poets`);
  const list = raw.map(({ id, name, nickname, rootCatId }) => ({ id, name, nickname, rootCatId }));
  await kvSet(POETS_KEY, { at: Date.now(), list });
  return list;
}

export const poetName = (p: GPoet) => (p.nickname?.trim() || p.name).trim();

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

interface Cat { cat: { children?: { id: number }[]; poems?: { id: number }[] } }
interface Poem { fullUrl?: string; verses?: { coupletIndex: number; versePosition: number; text: string; coupletSummary?: string | null }[] }
const POEM_Q = '?catInfo=false&catPoems=false&rhymes=false&recitations=false&images=false&songs=false&comments=false&verseDetails=true&navigation=false&relatedpoems=false';

/** Ganjoor's plain-prose meaning of one couplet (written by its contributors), if it has one. */
export async function coupletMeaning(poemId: number, ci: number): Promise<string | null> {
  const poem = await getJSON<Poem>(`${API}/poem/${poemId}${POEM_Q}`);
  const v = (poem.verses ?? []).filter((x) => x.coupletIndex === ci).map((x) => x.coupletSummary?.trim()).find((x) => !!x);
  return v || null;
}

/** Fetch up to `n` new couplets from the chosen poets. Returns how many were added. */
export async function harvest(n: number, poetIds: number[]): Promise<number> {
  const poets = (await ganjoorPoets()).filter((p) => poetIds.includes(p.id));
  if (!poets.length) throw new Error('هیچ شاعری انتخاب نشده.');
  let added = 0;
  for (let tries = 0; added < n && tries < n * 3; tries++) {
    const poet = pick(poets);
    // random walk down the table of contents
    let catId = poet.rootCatId;
    let poemId: number | undefined;
    for (let depth = 0; depth < 6 && !poemId; depth++) {
      const { cat } = await getJSON<Cat>(`${API}/cat/${catId}?poems=true`);
      const kids = cat.children ?? [];
      const poems = cat.poems ?? [];
      if (poems.length && (!kids.length || Math.random() < 0.5)) poemId = pick(poems).id;
      else if (kids.length) catId = pick(kids).id;
      else break;
    }
    if (!poemId) continue;
    const poem = await getJSON<Poem>(`${API}/poem/${poemId}${POEM_Q}`);
    const pairs = new Map<number, [string?, string?]>();
    for (const v of poem.verses ?? []) {
      if (v.versePosition !== 0 && v.versePosition !== 1) continue;
      const p = pairs.get(v.coupletIndex) ?? [];
      p[v.versePosition] = v.text.trim();
      pairs.set(v.coupletIndex, p);
    }
    const ok = [...pairs.entries()].filter(([, [a, b]]) => a && b && a.length >= 6 && b.length >= 6 && a.length <= 70 && b.length <= 70);
    if (!ok.length) continue;
    const [ci, [a, b]] = Math.random() < 0.3 ? ok[0] : pick(ok);
    const id = `g-${poemId}-${ci}`;
    if (await db.sentences.get(id)) continue;
    const sum = (poem.verses ?? []).filter((v) => v.coupletIndex === ci).map((v) => v.coupletSummary?.trim()).find((v) => !!v);
    const s: Sentence = {
      id, text: `${a}\n${b}`, by: poetName(poet), source: 'classic', form: 'verse', addedAt: Date.now(),
      link: poem.fullUrl ? `https://ganjoor.net${poem.fullUrl}` : undefined,
      ...(sum ? { meaning: sum, meaningSrc: 'ganjoor' as const } : {}),
    };
    await db.sentences.put(s);
    added++;
  }
  return added;
}
