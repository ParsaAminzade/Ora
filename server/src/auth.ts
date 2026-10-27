// Admin sign-in: one password (the ADMIN_PASSWORD secret), a signed session cookie, and a CSRF token
// on every form. Changing the password in Cloudflare signs every open session out.
import { kvGet, kvSet, one, run } from './db';
import { now, randomHex, type Env } from './util';

const COOKIE = 'ora_s';
const WEEK = 7 * 86400;
const enc = new TextEncoder();

async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Compare two strings without leaking where they differ. */
async function same(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([hmac('cmp', a), hmac('cmp', b)]);
  let d = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}
async function keyOf(env: Env): Promise<string> {
  let k = await kvGet<string>(env.DB, 'session_key', '');
  if (!k) { k = randomHex(32); await kvSet(env.DB, 'session_key', k); }
  return `${k}:${env.ADMIN_PASSWORD ?? ''}`;
}

export const passwordReady = (env: Env) => (env.ADMIN_PASSWORD ?? '').length >= 10;

export interface Session { exp: number; csrf: string }

export async function session(req: Request, env: Env): Promise<Session | null> {
  if (!passwordReady(env)) return null;
  const m = (req.headers.get('Cookie') ?? '').match(/(?:^|;\s*)ora_s=(\d+)\.([0-9a-f]{64})/);
  if (!m) return null;
  const exp = Number(m[1]);
  if (exp < now()) return null;
  const key = await keyOf(env);
  if (!(await same(m[2], await hmac(key, `s:${exp}`)))) return null;
  return { exp, csrf: await hmac(key, `c:${exp}`) };
}

export async function checkCsrf(s: Session, form: FormData): Promise<boolean> {
  return same(String(form.get('csrf') ?? ''), s.csrf);
}

/** Returns the Set-Cookie value on success, or an error message. */
export async function login(env: Env, password: string): Promise<{ cookie?: string; error?: string }> {
  if (!passwordReady(env)) return { error: 'رمز پنل هنوز در کلادفلر تعریف نشده.' };
  const t = now();
  await run(env.DB, 'DELETE FROM login_fail WHERE at < ?', t - 3600);
  const fails = await one<{ n: number }>(env.DB, 'SELECT COUNT(*) AS n FROM login_fail WHERE at > ?', t - 600);
  if ((fails?.n ?? 0) >= 10) return { error: 'چند بار رمز اشتباه وارد شد. ده دقیقه‌ی دیگر دوباره امتحان کن.' };
  if (!(await same(password, env.ADMIN_PASSWORD!))) {
    await run(env.DB, 'INSERT INTO login_fail(at) VALUES(?)', t);
    await new Promise((r) => setTimeout(r, 600));
    return { error: 'رمز درست نیست.' };
  }
  const exp = t + WEEK;
  const sig = await hmac(await keyOf(env), `s:${exp}`);
  return { cookie: `${COOKIE}=${exp}.${sig}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${WEEK}` };
}

export const logoutCookie = `${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
