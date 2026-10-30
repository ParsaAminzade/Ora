// Task reminders on the phone (Web Push), sent by the server at the right minute even when the
// app is closed.
//
// What the server knows: a delivery address the browser gave (the "endpoint"), and when to send.
// What it never knows: the reminder's text. The phone encrypts it for itself (RFC 8291) before
// sending it here; the server only stores the sealed bytes and passes them on. Sent reminders
// are deleted after a day (kept that long only so «۱۵ دقیقه بعد» can send the same one again).
//
// The signing key (VAPID) is made on first use and kept in D1, so nothing has to be set up.
import { all, kvGet, kvSet, run } from './db';
import type { Env } from './util';

const ENDPOINT_RE = /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|notify\.windows\.com|push\.apple\.com)\/\S{10,600}$/i;
const ID_RE = /^[A-Za-z0-9:_-]{1,80}$/;
const MAX_JOBS = 80;
const MAX_BODY = 5000; // base64url of the sealed message

const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));


type Vapid = { pub: string; jwk: JsonWebKey };
async function vapid(db: D1Database): Promise<Vapid> {
  const have = await kvGet<Vapid | null>(db, 'vapid', null);
  if (have) return have;
  const k = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = b64u((await crypto.subtle.exportKey('raw', k.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey('jwk', k.privateKey)) as JsonWebKey;
  const v = { pub, jwk };
  await kvSet(db, 'vapid', v);
  return v;
}
let signer: Promise<{ pub: string; key: CryptoKey }> | null = null;
const getSigner = (db: D1Database) => (signer ??= vapid(db).then(async (v) => ({ pub: v.pub, key: await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) })));

async function jwt(db: D1Database, aud: string): Promise<string> {
  const { key } = await getSigner(db);
  const enc = (o: unknown) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const head = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://ora.p128parsa.workers.dev' })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head));
  return `${head}.${b64u(sig as ArrayBuffer)}`;
}

/* ---------- API ---------- */
export async function pushKey(env: Env): Promise<{ key: string }> {
  return { key: (await vapid(env.DB)).pub };
}

/** Replace this phone's upcoming reminders with a new list (the app sends the next two days). */
export async function pushSchedule(env: Env, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; n?: number }> {
  const endpoint = String(body.endpoint ?? '');
  if (!ENDPOINT_RE.test(endpoint)) return { ok: false, error: 'endpoint' };
  const jobs = Array.isArray(body.jobs) ? body.jobs.slice(0, MAX_JOBS) : [];
  const nowS = Math.floor(Date.now() / 1000);
  const rows: { id: string; at: number; body: string }[] = [];
  for (const j of jobs as Record<string, unknown>[]) {
    const id = String(j.id ?? ''), at = Number(j.at), b = String(j.body ?? '');
    if (!ID_RE.test(id) || !Number.isFinite(at) || at < nowS - 60 || at > nowS + 3 * 86400 || !/^[A-Za-z0-9_-]{100,}$/.test(b) || b.length > MAX_BODY) continue;
    rows.push({ id, at: Math.floor(at), body: b });
  }
  const stmts = [env.DB.prepare('DELETE FROM push_jobs WHERE endpoint = ? AND sent = 0').bind(endpoint)];
  for (const r of rows) stmts.push(env.DB.prepare('INSERT OR REPLACE INTO push_jobs(endpoint, id, at, body, sent) VALUES(?,?,?,?,0)').bind(endpoint, r.id, r.at, r.body));
  await env.DB.batch(stmts);
  return { ok: true, n: rows.length };
}

/** «۱۵ دقیقه بعد» on a notification: send the same sealed reminder again a bit later. */
export async function pushSnooze(env: Env, body: Record<string, unknown>): Promise<{ ok: boolean }> {
  const endpoint = String(body.endpoint ?? ''), id = String(body.id ?? '');
  const minutes = Math.min(120, Math.max(5, Number(body.minutes) || 15));
  if (!ENDPOINT_RE.test(endpoint) || !ID_RE.test(id)) return { ok: false };
  await run(env.DB, 'UPDATE push_jobs SET at = ?, sent = 0 WHERE endpoint = ? AND id = ?', Math.floor(Date.now() / 1000) + minutes * 60, endpoint, id);
  return { ok: true };
}

/** Turned off on the phone: forget this phone completely. */
export async function pushRemove(env: Env, body: Record<string, unknown>): Promise<{ ok: boolean }> {
  const endpoint = String(body.endpoint ?? '');
  if (!ENDPOINT_RE.test(endpoint)) return { ok: false };
  await run(env.DB, 'DELETE FROM push_jobs WHERE endpoint = ?', endpoint);
  return { ok: true };
}

/* ---------- sending (every minute, from the cron trigger) ---------- */
export async function sendDue(env: Env): Promise<void> {
  const nowS = Math.floor(Date.now() / 1000);
  // older than an hour: too late to be useful (the phone was off the network)
  const due = await all<{ endpoint: string; id: string; body: string }>(env.DB, 'SELECT endpoint, id, body FROM push_jobs WHERE sent = 0 AND at <= ? AND at > ? ORDER BY at LIMIT 200', nowS, nowS - 3600);
  const { pub } = await getSigner(env.DB);
  const gone = new Set<string>();
  await Promise.all(due.map(async (j) => {
    try {
      const aud = new URL(j.endpoint).origin;
      const res = await fetch(j.endpoint, {
        method: 'POST',
        headers: { Authorization: `vapid t=${await jwt(env.DB, aud)}, k=${pub}`, TTL: '900', Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' },
        body: unb64u(j.body),
      });
      if (res.status === 404 || res.status === 410) gone.add(j.endpoint); // the phone unsubscribed
      else if (!res.ok) console.warn('push', res.status, await res.text().catch(() => ''));
    } catch (e) { console.warn('push failed', e); }
    await run(env.DB, 'UPDATE push_jobs SET sent = 1 WHERE endpoint = ? AND id = ?', j.endpoint, j.id);
  }));
  for (const e of gone) await run(env.DB, 'DELETE FROM push_jobs WHERE endpoint = ?', e);
  await run(env.DB, 'DELETE FROM push_jobs WHERE (sent = 1 AND at < ?) OR at < ?', nowS - 86400, nowS - 2 * 86400);
}
