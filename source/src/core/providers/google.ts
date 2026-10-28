// Google Calendar adapter. Sign-in uses chrome.identity.launchWebAuthFlow with your own OAuth
// client (type "Web application", redirect URI https://<extension-id>.chromiumapp.org/), so it
// works whichever Google account Chrome itself is signed into. Tokens live only in this browser.
// Events are copied into the extension's own calendar (IndexedDB); the calendar widgets read
// from there, so Google is just one more source.
import { db, type CalEvent } from '../db';
import { kvGet, kvSet } from '../kv';
import { useStore, type GoogleCal } from '../state';
import { addDays, dayKey, pad2 } from '../dates';
import { toRRULE } from '../ics';
import type { Recurrence } from '../db';

const API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];
const TOKEN_KEY = 'nova:google-token';

interface Token {
  accessToken: string;
  expiresAt: number;
}

export class NeedsSignIn extends Error {}

export const redirectUri = () =>
  typeof chrome !== 'undefined' && chrome.identity ? chrome.identity.getRedirectURL() : 'https://<extension-id>.chromiumapp.org/';

const settings = () => useStore.getState().settings.google;

async function authorize(interactive: boolean): Promise<string> {
  const { clientId } = settings();
  if (!clientId) throw new NeedsSignIn('no client id');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId.trim());
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', interactive ? 'select_account' : 'none');
  let resp: string | undefined;
  try {
    resp = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive });
  } catch (e) {
    throw new NeedsSignIn(String((e as Error).message ?? e));
  }
  const hash = new URLSearchParams(new URL(resp!).hash.slice(1));
  const accessToken = hash.get('access_token');
  if (!accessToken) throw new NeedsSignIn(hash.get('error') ?? 'no token');
  const token: Token = { accessToken, expiresAt: Date.now() + (Number(hash.get('expires_in')) || 3600) * 1000 };
  await kvSet(TOKEN_KEY, token);
  return accessToken;
}

async function getToken(interactive = false): Promise<string> {
  const t = await kvGet<Token>(TOKEN_KEY);
  if (t && t.expiresAt - Date.now() > 60_000) return t.accessToken;
  try {
    return await authorize(false); // silent refresh while the Google session cookie is valid
  } catch (e) {
    if (interactive) return authorize(true);
    throw e;
  }
}

async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401 && !retried) {
    await kvSet(TOKEN_KEY, null);
    return api<T>(path, init, true);
  }
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Interactive sign-in, then load the calendar list. */
export async function connectGoogle(): Promise<void> {
  await getToken(true);
  await refreshCalendars();
  const s = useStore.getState();
  s.setSettings({ google: { ...s.settings.google, connected: true } });
}

export async function disconnectGoogle(): Promise<void> {
  await kvSet(TOKEN_KEY, null);
  await db.events.where('source').startsWith('google:').delete();
  const s = useStore.getState();
  s.setSettings({ google: { ...s.settings.google, connected: false, calendars: [], target: 'local' } });
}

interface GCalListEntry { id: string; summary: string; summaryOverride?: string; backgroundColor?: string; accessRole: string; primary?: boolean; selected?: boolean }

export async function refreshCalendars(): Promise<GoogleCal[]> {
  const data = await api<{ items: GCalListEntry[] }>('/users/me/calendarList?minAccessRole=reader');
  const prev = new Map(settings().calendars.map((c) => [c.id, c]));
  const cals: GoogleCal[] = data.items.map((c) => ({
    id: c.id,
    summary: c.summaryOverride ?? c.summary,
    color: c.backgroundColor ?? '#9FC7E8',
    enabled: prev.get(c.id)?.enabled ?? (c.primary || c.selected !== false),
    writable: c.accessRole === 'owner' || c.accessRole === 'writer',
  }));
  const s = useStore.getState();
  s.setSettings({ google: { ...s.settings.google, calendars: cals } });
  return cals;
}

interface GEvent {
  id: string;
  summary?: string;
  status?: string;
  location?: string;
  description?: string;
  recurringEventId?: string;
  colorId?: string;
  start: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
}

const hm = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

function toCalEvent(ev: GEvent, cal: GoogleCal): CalEvent | null {
  if (ev.status === 'cancelled') return null;
  let day: string;
  let time: string | undefined;
  let end: string | undefined;
  let endDay: string | undefined;
  if (ev.start.date) {
    day = ev.start.date;
    // Google's all-day end is exclusive
    if (ev.end?.date) { const last = dayKey(addDays(new Date(`${ev.end.date}T12:00:00`), -1)); if (last > day) endDay = last; }
  } else if (ev.start.dateTime) {
    const d = new Date(ev.start.dateTime);
    day = dayKey(d);
    time = hm(d);
    if (ev.end?.dateTime) {
      const e = new Date(ev.end.dateTime);
      const ek = dayKey(e);
      if (ek > day && e.getHours() === 0 && e.getMinutes() === 0) { const prev = dayKey(addDays(e, -1)); end = '24:00'; if (prev > day) endDay = prev; }
      else { end = hm(e); if (ek > day) endDay = ek; }
    }
  } else return null;
  return {
    id: `g:${cal.id}:${ev.id}`,
    title: ev.summary ?? '(بدون عنوان)',
    day, time, end, endDay,
    location: ev.location || undefined,
    notes: ev.description || undefined,
    remind: ev.reminders && !ev.reminders.useDefault ? (ev.reminders.overrides ?? []).map((r) => r.minutes) : undefined,
    recurringEventId: ev.recurringEventId,
    source: `google:${cal.id}`,
    externalId: ev.id,
    color: cal.color,
    updatedAt: Date.now(),
  };
}

export interface GInput { title: string; day: string; time?: string; end?: string; endDay?: string; rrule?: Recurrence; location?: string; notes?: string; remind?: number[] }

/** Our event fields → Google's event body. */
function gBody(i: Partial<GInput>, base?: CalEvent): Record<string, unknown> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = (d: Date) => `${dayKey(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
  const v = { ...base, ...i };
  const body: Record<string, unknown> = {};
  if (i.title !== undefined) body.summary = i.title;
  if ('location' in i) body.location = i.location ?? '';
  if ('notes' in i) body.description = i.notes ?? '';
  if ('remind' in i) body.reminders = i.remind ? { useDefault: false, overrides: i.remind.map((m) => ({ method: 'popup', minutes: m })) } : { useDefault: true };
  if ('day' in i || 'time' in i || 'end' in i || 'endDay' in i) {
    if (v.time) {
      const start = new Date(`${v.day}T${v.time}:00`);
      const lastK = v.endDay && v.endDay > v.day! ? v.endDay : v.day!;
      let endD = v.end ? (v.end === '24:00' ? addDays(new Date(`${lastK}T00:00:00`), 1) : new Date(`${lastK}T${v.end}:00`)) : new Date(start.getTime() + 3600e3);
      if (endD <= start) endD = new Date(start.getTime() + 3600e3);
      body.start = { dateTime: fmt(start), timeZone: tz };
      body.end = { dateTime: fmt(endD), timeZone: tz };
    } else {
      body.start = { date: v.day };
      body.end = { date: dayKey(addDays(new Date(`${v.endDay && v.endDay > v.day! ? v.endDay : v.day}T12:00:00`), 1)) };
    }
  }
  return body;
}

const lastSync = new Map<string, number>();

/** Copy Google events for [fromDay, toDay] into the local database. Throttled per range. */
export async function syncGoogle(fromDay: string, toDay: string, force = false): Promise<void> {
  const g = settings();
  if (!g.connected) return;
  const key = `${fromDay}|${toDay}`;
  if (!force && Date.now() - (lastSync.get(key) ?? 0) < 5 * 60_000) return;
  lastSync.set(key, Date.now());

  const timeMin = new Date(`${fromDay}T00:00:00`).toISOString();
  const timeMax = addDays(new Date(`${toDay}T00:00:00`), 1).toISOString();
  const fetched: CalEvent[] = [];
  for (const cal of g.calendars.filter((c) => c.enabled)) {
    let pageToken = '';
    do {
      const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
      if (pageToken) q.set('pageToken', pageToken);
      const data = await api<{ items: GEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(cal.id)}/events?${q}`);
      for (const ev of data.items) {
        const c = toCalEvent(ev, cal);
        if (c) fetched.push(c);
      }
      pageToken = data.nextPageToken ?? '';
    } while (pageToken);
  }
  await db.transaction('rw', db.events, async () => {
    const stale = await db.events.where('day').between(fromDay, toDay, true, true).filter((e) => e.source.startsWith('google:')).primaryKeys();
    await db.events.bulkDelete(stale);
    await db.events.bulkPut(fetched);
  });
}

export async function createGoogleEvent(calId: string, input: GInput): Promise<CalEvent | null> {
  const cal = settings().calendars.find((c) => c.id === calId);
  if (!cal) throw new Error('calendar not found');
  const body = gBody({ title: input.title, day: input.day, time: input.time, end: input.end, endDay: input.endDay, location: input.location, notes: input.notes, ...(input.remind ? { remind: input.remind } : {}) });
  const full = input.rrule ? { ...body, recurrence: [`RRULE:${toRRULE(input.rrule, input.day)}`] } : body;
  const ev = await api<GEvent>(`/calendars/${encodeURIComponent(calId)}/events`, { method: 'POST', body: JSON.stringify(full) });
  const c = toCalEvent(ev, cal);
  if (c) await db.events.put(c);
  if (input.rrule) lastSync.clear(); // the series is expanded by Google on the next sync
  return c;
}

/** Change a Google event. `series` edits the whole repeating series (Google keeps the instances in step). */
export async function patchGoogleEvent(e: CalEvent, patch: Partial<GInput>, series = false): Promise<void> {
  const calId = e.source.slice('google:'.length);
  const cal = settings().calendars.find((c) => c.id === calId);
  if (!cal) throw new Error('calendar not found');
  const target = series && e.recurringEventId ? e.recurringEventId : e.externalId!;
  let p = patch;
  if (series && e.recurringEventId && ('day' in patch || 'time' in patch || 'end' in patch)) {
    // a series keeps its own first day; only the clock time changes for all of them
    const master = await api<GEvent>(`/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(target)}`);
    const m = toCalEvent(master, cal);
    if (m) p = { ...patch, day: m.day, endDay: m.endDay };
  }
  const ev = await api<GEvent>(`/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(target)}`, { method: 'PATCH', body: JSON.stringify(gBody(p, e)) });
  if (series && e.recurringEventId) { lastSync.clear(); return; }
  const c = toCalEvent(ev, cal);
  if (c) { if (c.id !== e.id) await db.events.delete(e.id); await db.events.put(c); }
}

export async function deleteGoogleEvent(e: CalEvent, series = false): Promise<void> {
  const calId = e.source.slice('google:'.length);
  const target = series && e.recurringEventId ? e.recurringEventId : e.externalId!;
  await api<void>(`/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(target)}`, { method: 'DELETE' });
  if (series && e.recurringEventId) { await db.events.filter((x) => x.recurringEventId === e.recurringEventId).delete(); lastSync.clear(); }
  else await db.events.delete(e.id);
}
