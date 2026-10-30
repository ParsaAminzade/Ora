// The JSON API the extension and the phone app talk to.
//
// GET  /api/pack      new lines, fixes to built-in lines, latest version, announcement (nothing about the user is sent)
// GET  /api/legal     the current terms text
// GET  /api/latest    just the newest version (the extension asks every couple of hours to tell you about updates)
// POST /api/sync      what the user agreed to share: sentence feedback, search categories, profile
// POST /api/feedback  a message the user typed and sent on purpose
// POST /api/delete    erase everything stored for an install id
// GET  /api/icon      a site's icon for the shortcuts (fetched for the user; the site name is not stored or logged)
//
// The IP address is never stored. Cloudflare tells us the country of each request; only that is kept.
import { all, eraseInstall, kvGet, one, run } from './db';
import { json, now, today, type Env } from './util';
import LEGAL from './legal.json';

const ID_RE = /^[a-z0-9]{20,40}$/;
const LINE_RE = /^[A-Za-z0-9:_-]{1,80}$/;
const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,100}\.[^@\s]{2,20}$/;
const VERSION_RE = /^(\d{1,4}(\.\d{1,4}){0,3}|dev)$/;
const UNCLEAR_WHY = ['words', 'point', 'context', 'long'];
const LINE_KINDS = new Set(['like', 'save', 'less', 'unclear', ...UNCLEAR_WHY.map((w) => `unclear:${w}`)]);
// Must match SEARCH_CATS in the extension (src/core/remote.ts).
export const SEARCH_CATS: Record<string, string> = {
  study: 'درس و پژوهش', code: 'برنامه‌نویسی و فناوری', work: 'کار و شغل', language: 'زبان و ترجمه', video: 'ویدیو',
  music: 'موسیقی', news: 'اخبار', shopping: 'خرید', travel: 'سفر و نقشه', cooking: 'آشپزی', books: 'کتاب و ادبیات',
  sport: 'ورزش', games: 'بازی و سرگرمی', other: 'سایر',
};
const MAX_BYTES = 64 * 1024;
const SYNC_GAP_DEFAULT = 30; // seconds between two syncs of one install (SYNC_GAP var overrides, for tests)

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*', // the extension calls from chrome-extension://…; no cookies are used here
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const out = (body: unknown, status = 200, extra: Record<string, string> = {}) => json(body, status, { ...CORS, ...extra });
const s = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const country = (req: Request) => {
  const c = (req as Request & { cf?: { country?: string } }).cf?.country;
  return typeof c === 'string' && /^[A-Z]{2}$/.test(c) && c !== 'T1' && c !== 'XX' ? c : null;
};

async function body(req: Request): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_BYTES) return null;
  const text = await req.text();
  if (text.length > MAX_BYTES) return null;
  try { const d = JSON.parse(text); return d && typeof d === 'object' && !Array.isArray(d) ? d : null; } catch { return null; }
}

export async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const p = url.pathname;
  try {
    if (p === '/api/pack' && req.method === 'GET') return await pack(req, env, url);
    if (p === '/api/icon' && req.method === 'GET') return await icon(req, url);
    if (p === '/api/legal' && req.method === 'GET') return out(LEGAL);
    if (p === '/api/latest' && req.method === 'GET') return out((await kvGet(env.DB, 'latest', null)) ?? {}, 200, { 'Cache-Control': 'public, max-age=300' });
    if (p === '/api/sync' && req.method === 'POST') return await sync(req, env);
    if (p === '/api/feedback' && req.method === 'POST') return await feedback(req, env);
    if (p === '/api/delete' && req.method === 'POST') return await del(req, env);
  } catch (e) {
    console.error('api error', p, e);
    return out({ ok: false, error: 500 }, 500);
  }
  return out({ ok: false, error: 404 }, 404);
}

async function pack(req: Request, env: Env, url: URL) {
  const rev = String(await kvGet(env.DB, 'pack_rev', 0));
  const etag = `"${rev}-${LEGAL.version}"`;
  if (req.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: { ...CORS, ETag: etag } });
  const rows = await all<{ id: string; text: string; by: string | null; theme: string | null; tags: string | null; meaning: string | null; builtin: number }>(
    env.DB, 'SELECT id, text, by, theme, tags, meaning, builtin FROM sentences WHERE active = 1');
  const items: Record<string, unknown>[] = [];
  const overrides: Record<string, unknown>[] = [];
  for (const r of rows) {
    const base: Record<string, unknown> = { id: r.id, text: r.text, ...(r.meaning ? { meaning: r.meaning } : {}) };
    if (r.builtin) { overrides.push(base); continue; }
    if (r.by) base.by = r.by;
    if (r.theme) base.theme = r.theme;
    if (r.tags) base.tags = r.tags.split(',').filter(Boolean);
    items.push(base);
  }
  const hide = (await all<{ id: string }>(env.DB, 'SELECT id FROM hidden')).map((r) => r.id);
  const latest = await kvGet<Record<string, unknown> | null>(env.DB, 'latest', null);
  const announce = await kvGet<Record<string, unknown> | null>(env.DB, 'announce', null);
  void url;
  return out({ rev, items, overrides, hide, latest, announce, legal: LEGAL.version }, 200, { ETag: etag, 'Cache-Control': 'public, max-age=300' });
}

interface Sig { k: string; r: string; d: string; n: number; t: string; by: string }
function cleanSignals(raw: unknown): Sig[] {
  if (!Array.isArray(raw)) return [];
  const lo = today(-60), hi = today(2);
  const outList: Sig[] = [];
  for (const x of raw.slice(0, 300)) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const k = o.k, r = o.r, d = o.d;
    if (typeof k !== 'string' || typeof r !== 'string' || typeof d !== 'string') continue;
    if (!(LINE_KINDS.has(k) || k === 'search')) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < lo || d > hi) continue;
    if (k === 'search' ? !(r in SEARCH_CATS) : !LINE_RE.test(r)) continue;
    const n = typeof o.n === 'number' && Number.isInteger(o.n) && o.n > 0 && o.n <= 1000 ? o.n : 1;
    const t = r.startsWith('c-') || r.startsWith('g-') ? s(o.t, 300) : '';
    outList.push({ k, r, d, n, t, by: s(o.by, 60) });
  }
  return outList;
}

async function sync(req: Request, env: Env) {
  const data = await body(req);
  if (!data) return out({ ok: false, error: 400 }, 400);
  const id = data.id;
  if (typeof id !== 'string' || !ID_RE.test(id)) return out({ ok: false, error: 400 }, 400);
  if (data.terms !== LEGAL.version) return out({ ok: false, need_terms: LEGAL.version }, 409);
  const c = (data.consent && typeof data.consent === 'object' ? data.consent : {}) as Record<string, unknown>;
  const likes = !!c.likes, search = !!c.search, profile = !!c.profile;
  const emailOk = profile && !!c.email;
  const db = env.DB;
  if (!likes && !search && !profile) {
    await eraseInstall(db, id);
    return out({ ok: true, erased: true });
  }
  // A switch turned off erases what it had sent, even when this sync comes too soon.
  const wipe: D1PreparedStatement[] = [];
  if (!likes) wipe.push(db.prepare("DELETE FROM signals WHERE install = ? AND kind != 'search'").bind(id));
  if (!search) wipe.push(db.prepare("DELETE FROM signals WHERE install = ? AND kind = 'search'").bind(id));
  if (!profile) wipe.push(db.prepare('UPDATE installs SET name = NULL, interests = NULL, email = NULL, extra = NULL, c_profile = 0, c_email = 0 WHERE id = ?').bind(id));
  else if (!emailOk) wipe.push(db.prepare('UPDATE installs SET email = NULL, c_email = 0 WHERE id = ?').bind(id));
  wipe.push(db.prepare('UPDATE installs SET c_likes = ?, c_search = ? WHERE id = ?').bind(+likes, +search, id));
  await db.batch(wipe);

  const t = now();
  const prev = await one<{ last_sync: number }>(db, 'SELECT last_sync FROM installs WHERE id = ?', id);
  const gap = Number(env.SYNC_GAP) || SYNC_GAP_DEFAULT;
  if (prev && t - prev.last_sync < gap) return out({ ok: false, retry: gap - (t - prev.last_sync) + 1 }, 429);

  const version = typeof data.v === 'string' && VERSION_RE.test(data.v) ? data.v : null;
  const pr = (profile && data.profile && typeof data.profile === 'object' ? data.profile : {}) as Record<string, unknown>;
  const name = s(pr.name, 40) || null;
  const interests = (Array.isArray(pr.interests) ? pr.interests : []).slice(0, 15).map((i) => s(i, 30)).filter(Boolean);
  const email0 = s(pr.email, 120);
  const email = emailOk && EMAIL_RE.test(email0) ? email0 : null;
  const extraIn = (pr.extra && typeof pr.extra === 'object' ? pr.extra : {}) as Record<string, unknown>;
  const extra = Object.fromEntries(Object.entries(extraIn).slice(0, 10).filter(([k, v]) => s(k, 30) && typeof v === 'string').map(([k, v]) => [s(k, 30), s(v, 200)]));
  let termsAt = typeof data.termsAt === 'number' && Number.isInteger(data.termsAt) ? data.termsAt : null;
  if (termsAt && termsAt > 1e11) termsAt = Math.floor(termsAt / 1000);
  const platform = data.platform === 'web' || data.platform === 'extension' ? data.platform : null;

  const stmts: D1PreparedStatement[] = [db.prepare(
    `INSERT INTO installs(id, created, last_seen, version, terms_version, terms_at, c_likes, c_search, c_profile, c_email,
                          name, interests, email, extra, syncs, country, platform, last_sync)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)
     ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen, version=excluded.version, terms_version=excluded.terms_version,
       terms_at=excluded.terms_at, c_likes=excluded.c_likes, c_search=excluded.c_search, c_profile=excluded.c_profile,
       c_email=excluded.c_email, name=excluded.name, interests=excluded.interests, email=excluded.email, extra=excluded.extra,
       syncs=installs.syncs + 1, country=COALESCE(excluded.country, installs.country),
       platform=COALESCE(excluded.platform, installs.platform), last_sync=excluded.last_sync`,
  ).bind(id, t, t, version, LEGAL.version, termsAt, +likes, +search, +profile, +emailOk,
    profile ? name : null, profile ? JSON.stringify(interests) : null, email,
    profile && Object.keys(extra).length ? JSON.stringify(extra) : null, country(req), platform, t)];
  let stored = 0;
  for (const g of cleanSignals(data.signals)) {
    if (g.k === 'search' ? !search : !likes) continue;
    stmts.push(db.prepare(
      'INSERT INTO signals(install, kind, ref, day, n) VALUES(?,?,?,?,?) ON CONFLICT(install, kind, ref, day) DO UPDATE SET n = signals.n + excluded.n',
    ).bind(id, g.k, g.r, g.d, g.n));
    if (g.t) stmts.push(db.prepare('INSERT OR IGNORE INTO ext_lines(id, text, by) VALUES(?,?,?)').bind(g.r, g.t, g.by || null));
    stored++;
  }
  await db.batch(stmts);
  return out({ ok: true, stored });
}

async function feedback(req: Request, env: Env) {
  const data = await body(req);
  const text = s(data?.text, 2000);
  if (!data || text.length < 2) return out({ ok: false, error: 400 }, 400);
  // a little brake on floods: at most 60 messages a minute in total
  const recent = await one<{ n: number }>(env.DB, 'SELECT COUNT(*) AS n FROM feedback WHERE created > ?', now() - 60);
  if ((recent?.n ?? 0) > 60) return out({ ok: false, error: 503 }, 503);
  let id = typeof data.id === 'string' && ID_RE.test(data.id) ? data.id : null;
  if (id && !(await one(env.DB, 'SELECT 1 AS x FROM installs WHERE id = ?', id))) id = null; // linked only to installs that share
  const v = typeof data.v === 'string' && VERSION_RE.test(data.v) ? data.v : null;
  await run(env.DB, 'INSERT INTO feedback(install, text, version, country, created) VALUES(?,?,?,?,?)', id, text, v, country(req), now());
  return out({ ok: true });
}

async function del(req: Request, env: Env) {
  const data = await body(req);
  const id = data?.id;
  if (typeof id !== 'string' || !ID_RE.test(id)) return out({ ok: false, error: 400 }, 400);
  await eraseInstall(env.DB, id);
  return out({ ok: true, erased: true });
}

/* ---------- site icons ---------- */
// The phone app can't read the browser's own icon cache, and an image from another site can't be
// read for its colour. So the server fetches the icon and hands it back from Ora's own address.
// Nothing about the request is stored; the answer is cached for a week by Cloudflare.
const HOST_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
async function icon(req: Request, url: URL): Promise<Response> {
  const host = (url.searchParams.get('d') ?? '').toLowerCase().replace(/^www\./, '');
  if (!HOST_RE.test(host)) return out({ ok: false, error: 'host' }, 400);
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://ora-icon.cache/${host}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  let res: Response | null = null;
  try {
    res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`, { redirect: 'follow', cf: { cacheTtl: 604800 } } as RequestInit);
  } catch { /* offline upstream */ }
  // Google answers 404 (with a grey globe) for sites it doesn't know: the app shows a monogram instead.
  const type = res?.headers.get('Content-Type') ?? '';
  if (!res || !res.ok || !type.startsWith('image/')) {
    return new Response(null, { status: 404, headers: { ...CORS, 'Cache-Control': 'public, max-age=86400' } });
  }
  const body = await res.arrayBuffer();
  if (body.byteLength > 200_000) return new Response(null, { status: 404, headers: CORS });
  const answer = new Response(body, { headers: { ...CORS, 'Content-Type': type, 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff' } });
  await cache.put(key, answer.clone()).catch(() => {});
  return answer;
}
