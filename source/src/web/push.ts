// Task reminders on the phone, even with Ora closed (Web Push through the Ora server).
//
// The reminder text is sealed on this phone for this phone (RFC 8291, aes128gcm) before it leaves:
// the server stores and forwards bytes it cannot read, plus the time to send them. Turning it off
// deletes everything the server has for this phone.
import { upcomingTaskReminders } from '../core/task-reminders';
import { kvGet, kvSet } from '../core/kv';
import { serverBase } from '../core/remote';

const KEY = 'ora:push';
type PushState = { on: boolean; endpoint?: string; asked?: number; askedAt?: number; lastSync?: number };
export const pushState = async (): Promise<PushState> => (await kvGet<PushState>(KEY)) ?? { on: false };
const save = async (patch: Partial<PushState>) => kvSet(KEY, { ...(await pushState()), ...patch });

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** iPhone and iPad: notifications only work once Ora is on the home screen (iOS 16.4+). */
export const needsHomeScreen = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone && !matchMedia('(display-mode: standalone)').matches;
export const permission = (): NotificationPermission | 'unsupported' => (pushSupported() ? Notification.permission : 'unsupported');

/* ---------- RFC 8291 sealing ---------- */
type Bytes = Uint8Array<ArrayBuffer>;
const enc = { encode: (t: string) => new TextEncoder().encode(t) as Bytes };
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string): Bytes => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const cat = (...a: Uint8Array[]): Bytes => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
/** Seal `text` so that only the browser holding this subscription can open it. */
export async function seal(text: string, p256dh: Bytes, auth: Bytes): Promise<Bytes> {
  const eph = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const prkKey = await hmac(auth, shared);
  const ikm = (await hmac(prkKey, cat(enc.encode('WebPush: info\0'), p256dh, asPub, new Uint8Array([1])))).slice(0, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

/* ---------- turning it on and off ---------- */
async function serverKey(base: string): Promise<Bytes> {
  const r = await fetch(`${base}/api/push/key`);
  if (!r.ok) throw new Error('server');
  return unb64u(((await r.json()) as { key: string }).key);
}
async function subscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Ask the browser (the user already said yes on Ora's own screen), subscribe, send the reminders. */
export async function enablePush(): Promise<'on' | 'denied' | 'unsupported' | 'error'> {
  if (!pushSupported()) return 'unsupported';
  const base = serverBase();
  if (!base) return 'error';
  const p = await Notification.requestPermission();
  if (p !== 'granted') { await save({ on: false }); return 'denied'; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: await serverKey(base) }));
    await save({ on: true, endpoint: sub.endpoint });
    await syncPush(true);
    return 'on';
  } catch (e) {
    console.warn('[Ora] push', e);
    return 'error';
  }
}
export async function disablePush(): Promise<void> {
  const sub = await subscription().catch(() => null);
  const base = serverBase();
  const endpoint = sub?.endpoint ?? (await pushState()).endpoint;
  if (base && endpoint) await fetch(`${base}/api/push/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }) }).catch(() => {});
  await sub?.unsubscribe().catch(() => {});
  await save({ on: false, endpoint: undefined });
}

/** Send the next two days of reminders (sealed) to the server. Cheap; called when tasks change. */
export async function syncPush(force = false): Promise<void> {
  const st = await pushState();
  if (!st.on || !pushSupported() || Notification.permission !== 'granted' || !navigator.onLine) return;
  if (!force && Date.now() - (st.lastSync ?? 0) < 20_000) return;
  const base = serverBase();
  const sub = await subscription().catch(() => null);
  if (!base || !sub) { await save({ on: false }); return; }
  const p256dh = new Uint8Array(sub.getKey('p256dh')!), auth = new Uint8Array(sub.getKey('auth')!);
  const jobs = await Promise.all((await upcomingTaskReminders()).map(async (r) => ({
    id: r.id,
    at: Math.floor(r.at / 1000),
    body: b64u(await seal(JSON.stringify({ t: r.title, b: r.body, id: r.id, s: base }), p256dh, auth)),
  })));
  const res = await fetch(`${base}/api/push/schedule`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint, jobs }) }).catch(() => null);
  if (res?.ok) await save({ lastSync: Date.now(), endpoint: sub.endpoint });
}
