// Event reminders. Like prayer reminders: the page schedules chrome.alarms for the next two days
// (whenever events change, and every half hour); the background worker turns each alarm into a
// system notification even with no tab open. While a tab is open, the Ora eye says it too.
import type { CalEvent } from './db';
import { addDays, dayKey, fa } from './dates';
import { localCalendar } from './providers/calendar';
import { timeLabel } from './events';

const PREFIX = 'event|';
const DAYS = 2;
/** All-day events are reminded relative to 09:00 of their day. */
const ALLDAY_AT = 9 * 60;

export interface Upcoming { at: number; e: CalEvent; text: string; key: string }

export function reminderLine(e: CalEvent, m: number): string {
  const when = e.time ? fa(e.time) : 'امروز';
  const lead = !e.time ? (m >= 1440 ? `فردا: «${e.title}»` : `امروز: «${e.title}»`)
    : m === 0 ? `الان: «${e.title}»` : m >= 1440 ? `فردا ${when}: «${e.title}»` : m >= 60 ? `${fa(m / 60)} ساعت دیگر: «${e.title}» (${when})` : `${fa(m)} دقیقه دیگر: «${e.title}» (${when})`;
  return e.location ? `${lead} · ${e.location}` : lead;
}

export async function upcomingEventReminders(now = new Date()): Promise<Upcoming[]> {
  const from = dayKey(now), to = dayKey(addDays(now, DAYS + 1));
  const list = await localCalendar.list(from, to);
  const out: Upcoming[] = [];
  for (const e of list) {
    if (!e.remind?.length) continue;
    const [y, mo, d] = e.day.split('-').map(Number);
    const startMin = e.time ? Number(e.time.slice(0, 2)) * 60 + Number(e.time.slice(3)) : ALLDAY_AT;
    const start = new Date(y, mo - 1, d, 0, startMin).getTime();
    for (const m of e.remind) {
      const at = start - m * 60_000;
      if (at > now.getTime() - 90_000 && at < now.getTime() + DAYS * 864e5) out.push({ at, e, text: reminderLine(e, m), key: `${e.id}@${at}` });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Re-create the alarms. Safe to call often. */
export async function scheduleEventAlarms(): Promise<void> {
  const al = typeof chrome !== 'undefined' ? chrome.alarms : undefined;
  if (!al) return;
  const existing = await al.getAll();
  await Promise.all(existing.filter((a) => a.name.startsWith(PREFIX)).map((a) => al.clear(a.name)));
  const now = Date.now();
  for (const x of await upcomingEventReminders()) {
    if (x.at <= now + 5_000) continue;
    // the name carries everything the worker needs to write the notification
    await al.create(`${PREFIX}${x.e.id}|${x.at}|${x.text.slice(0, 300)}`, { when: x.at });
  }
}

/** While a tab is open, the Ora eye says the reminder. Returns a cleanup function. */
export function watchEventReminders(): () => void {
  const said = new Set<string>();
  let list: Upcoming[] = [];
  const refresh = async () => { list = await upcomingEventReminders(); };
  const tick = () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    for (const x of list) {
      if (x.at > now) break;
      if (now - x.at > 90_000 || said.has(x.key)) continue;
      said.add(x.key);
      dispatchEvent(new CustomEvent('ora:say', { detail: { title: timeLabel(x.e), text: x.text, sticky: true } }));
    }
  };
  void refresh().then(tick);
  const iv = window.setInterval(tick, 20_000);
  const iv2 = window.setInterval(() => void refresh(), 5 * 60_000);
  const vis = () => { void refresh().then(tick); };
  document.addEventListener('visibilitychange', vis);
  addEventListener('ora:events-changed', vis);
  return () => { window.clearInterval(iv); window.clearInterval(iv2); document.removeEventListener('visibilitychange', vis); removeEventListener('ora:events-changed', vis); };
}
