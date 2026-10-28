// Two-way sync between Nova's own calendar and a CalDAV calendar on your own server
// (Radicale on your PC, or any CalDAV server). Phones join through DAVx5 (Android) or the
// built-in CalDAV account (iOS). Works on a home network with no internet at all.
//
// Rules: Nova keeps an ETag per event. A side that changed since the last sync wins; if both
// changed, Nova's copy wins (it is the one you were looking at). Deletions on either side are
// carried over (Nova remembers its own deletions as tombstones until the server has them).
import { db, type CalEvent } from '../db';
import { kvGet, kvSet } from '../kv';
import { useStore } from '../state';
import { eventToICS, icalUid, parseICS, parsedToEvent } from '../ics';
import { ensureHostPermission } from './ai';


const STATE_KEY = 'nova:caldav-state';
interface SyncState { lastSync: number; lastError?: string }

const cfg = () => useStore.getState().settings.caldav;
const base = () => (cfg().url.endsWith('/') ? cfg().url : `${cfg().url}/`);

function headers(extra: Record<string, string> = {}): Headers {
  const h = new Headers(extra);
  const { username, password } = cfg();
  if (username) h.set('Authorization', `Basic ${btoa(unescape(encodeURIComponent(`${username}:${password}`)))}`);
  return h;
}

async function dav(method: string, url: string, body?: string, extra: Record<string, string> = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: headers(extra), body });
  } catch {
    throw new Error('به سرور تقویم وصل نشد. Radicale روشن است و آدرس درست است؟');
  }
  if (res.status === 401 || res.status === 403) throw new Error('نام کاربری یا رمز سرور تقویم درست نیست.');
  return res;
}

/** Resolve an href from the server against the collection URL. */
const abs = (href: string) => new URL(href, base()).toString();

/** Make sure the calendar exists; create it if the server says it doesn't. */
export async function ensureCalendar(): Promise<void> {
  if (!(await ensureHostPermission(base()))) throw new Error('اجازه‌ی دسترسی به این آدرس داده نشد.');
  const probe = await dav('PROPFIND', base(), '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>', { Depth: '0', 'Content-Type': 'application/xml' });
  if (probe.status === 404) {
    // The parent (your user folder on the server) may not exist yet either.
    const parent = new URL('..', base()).toString();
    if (new URL(parent).pathname !== '/') await dav('MKCOL', parent).catch(() => undefined);
    const mk = await dav('MKCALENDAR', base(), `<?xml version="1.0"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop><d:displayname>Ora</d:displayname></d:prop></d:set></c:mkcalendar>`, { 'Content-Type': 'application/xml' });
    if (!mk.ok) throw new Error(`ساخت تقویم روی سرور انجام نشد (${mk.status}).`);
  } else if (!probe.ok && probe.status !== 207) {
    throw new Error(`سرور تقویم خطا داد (${probe.status}).`);
  }
}

interface Remote { href: string; etag: string; ics: string }

async function listRemote(): Promise<Remote[]> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter>
</c:calendar-query>`;
  const res = await dav('REPORT', base(), body, { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' });
  if (res.status !== 207) throw new Error(`خواندن رویدادها از سرور انجام نشد (${res.status}).`);
  const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
  const out: Remote[] = [];
  for (const r of Array.from(xml.getElementsByTagNameNS('DAV:', 'response'))) {
    const href = r.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent?.trim();
    const etag = r.getElementsByTagNameNS('DAV:', 'getetag')[0]?.textContent?.trim() ?? '';
    const ics = r.getElementsByTagNameNS('urn:ietf:params:xml:ns:caldav', 'calendar-data')[0]?.textContent ?? '';
    if (href && ics) out.push({ href: abs(href), etag, ics });
  }
  return out;
}

async function put(e: CalEvent, create: boolean): Promise<CalEvent> {
  const href = e.dav?.href ?? abs(`${encodeURIComponent(icalUid(e).replace(/[^\w.@-]/g, '_'))}.ics`);
  const res = await dav('PUT', href, eventToICS(e), {
    'Content-Type': 'text/calendar; charset=utf-8',
    ...(create ? { 'If-None-Match': '*' } : {}),
  });
  if (!res.ok) throw new Error(`ذخیره‌ی «${e.title}» روی سرور انجام نشد (${res.status}).`);
  return { ...e, icalUid: icalUid(e), dav: { href, etag: res.headers.get('ETag') ?? undefined } };
}

let running: Promise<string> | null = null;

/** Runs one full sync; returns a short Persian summary. Concurrent calls share one run. */
export function syncCalDav(): Promise<string> {
  running ??= doSync().finally(() => { running = null; });
  return running;
}

async function doSync(): Promise<string> {
  if (!cfg().enabled) return 'همگام‌سازی CalDAV خاموش است.';
  const state = (await kvGet<SyncState>(STATE_KEY)) ?? { lastSync: 0 };
  const start = Date.now();
  let pushed = 0, pulled = 0, removed = 0;
  try {
    await ensureCalendar();

    // 1. Deletions made in Nova.
    for (const t of await db.tombstones.toArray()) {
      const res = await dav('DELETE', t.href);
      if (res.ok || res.status === 404) await db.tombstones.delete(t.id);
      removed++;
    }

    const remote = await listRemote();
    const remoteByHref = new Map(remote.map((r) => [r.href, r]));
    const local = (await db.events.toArray()).filter((e) => e.source === 'local');
    const localByHref = new Map(local.filter((e) => e.dav).map((e) => [e.dav!.href, e]));
    const localByUid = new Map(local.filter((e) => e.icalUid).map((e) => [e.icalUid!, e]));
    const changedHere = (e: CalEvent) => e.updatedAt > state.lastSync;

    // 2. Everything on the server.
    for (const r of remote) {
      const parsed = parseICS(r.ics)[0];
      if (!parsed) continue;
      const mine = localByHref.get(r.href) ?? (parsed.uid ? localByUid.get(parsed.uid) : undefined);
      if (mine && (changedHere(mine) || mine.dav?.etag === r.etag)) {
        if (changedHere(mine)) { await db.events.put({ ...(await put({ ...mine, dav: { href: r.href, etag: r.etag } }, false)), updatedAt: mine.updatedAt }); pushed++; }
        continue;
      }
      // New on the server, or changed there (and not here): take the server's copy.
      const ev = parsedToEvent(parsed, mine?.id ?? `dav:${parsed.uid ?? r.href}`);
      await db.events.put({ ...ev, color: mine?.color, cal: mine?.cal, overrideOf: mine?.overrideOf, origDay: mine?.origDay, dav: { href: r.href, etag: r.etag }, updatedAt: start - 1 });
      pulled++;
    }

    // 3. Local events the server doesn't have.
    for (const e of local) {
      if (e.dav && remoteByHref.has(e.dav.href)) continue;
      if (e.dav && !changedHere(e)) {
        // Deleted on the server (e.g. from your phone) and untouched here: delete here too.
        await db.events.delete(e.id);
        removed++;
        continue;
      }
      const saved = await put({ ...e, dav: undefined }, true);
      await db.events.put({ ...saved, updatedAt: e.updatedAt });
      pushed++;
    }

    await kvSet(STATE_KEY, { lastSync: Date.now() });
    const parts = [pushed && `${pushed} ارسال`, pulled && `${pulled} دریافت`, removed && `${removed} حذف`].filter(Boolean);
    return parts.length ? `همگام شد: ${parts.join('، ')}` : 'همگام است؛ تغییری نبود.';
  } catch (e) {
    const msg = (e as Error).message;
    await kvSet(STATE_KEY, { ...state, lastError: msg });
    throw new Error(msg);
  }
}

export const caldavState = async () => (await kvGet<SyncState>(STATE_KEY)) ?? { lastSync: 0 };

let timer: number | undefined;
/** Debounced sync after a local change. */
export function scheduleCalDavSync(delay = 1500) {
  if (!cfg().enabled) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void syncCalDav().catch(() => {}), delay);
}
