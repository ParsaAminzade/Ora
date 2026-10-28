// Prayer reminders. The page schedules chrome.alarms for the next few days whenever a tab opens
// (and when the city or the choice changes); the small background worker (public/sw.js) turns
// each alarm into a system notification, even when no tab is open. While a tab is open, the Ora
// eye says it too.
import { prayerTimes, type PrayerTime } from './prayer';
import { useStore } from './state';
import { fa } from './dates';

export type PrayerKey = PrayerTime['key'];
export interface PrayerReminder { enabled: boolean; keys: PrayerKey[]; before: number; notify: boolean }
export const DEFAULT_REMINDER: PrayerReminder = { enabled: true, keys: ['fajr', 'dhuhr', 'maghrib'], before: 10, notify: true };
export const reminderOf = (): PrayerReminder => ({ ...DEFAULT_REMINDER, ...useStore.getState().settings.prayerReminder });

const PREFIX = 'prayer|';
const DAYS = 3;

/** «۱۰ دقیقه تا اذان ظهر» / «وقت اذان ظهر است» */
export function reminderText(label: string, before: number): string {
  return before > 0 ? `${fa(before)} دقیقه تا ${label}` : `وقت ${label} است`;
}

/** Upcoming reminder moments for the next few days. */
export function upcomingReminders(now = new Date(), r = reminderOf()): { at: number; label: string; key: PrayerKey; time: Date }[] {
  if (!r.enabled || !r.keys.length) return [];
  const place = useStore.getState().settings.place;
  const out: { at: number; label: string; key: PrayerKey; time: Date }[] = [];
  for (let d = 0; d < DAYS; d++) {
    const day = new Date(now); day.setDate(day.getDate() + d);
    for (const t of prayerTimes(place, day)) {
      if (!r.keys.includes(t.key)) continue;
      const at = t.time.getTime() - r.before * 60_000;
      if (at > now.getTime() + 5_000) out.push({ at, label: t.label, key: t.key, time: t.time });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Re-create the alarms (system notifications). Safe to call often. */
export async function schedulePrayerAlarms(): Promise<void> {
  const al = typeof chrome !== 'undefined' ? chrome.alarms : undefined;
  if (!al) return;
  const existing = await al.getAll();
  await Promise.all(existing.filter((a) => a.name.startsWith(PREFIX)).map((a) => al.clear(a.name)));
  const r = reminderOf();
  if (!r.enabled || !r.notify) return;
  for (const x of upcomingReminders(new Date(), r)) {
    // The name carries everything the worker needs to write the notification.
    await al.create(`${PREFIX}${x.key}|${x.at}|${reminderText(x.label, r.before)}`, { when: x.at });
  }
}

/** While a tab is open, the Ora eye says the reminder. Returns a cleanup function. */
export function watchInPage(): () => void {
  const said = new Set<string>();
  const tick = () => {
    const r = reminderOf();
    if (!r.enabled) return;
    const now = Date.now();
    // look a little into the past so a reminder isn't missed between two ticks
    for (const x of upcomingReminders(new Date(now - 90_000), r)) {
      if (x.at > now) break;
      const id = `${x.key}@${x.at}`;
      if (said.has(id) || document.visibilityState !== 'visible') continue;
      said.add(id);
      dispatchEvent(new CustomEvent('ora:say', { detail: { text: reminderText(x.label, r.before), sticky: true } }));
    }
  };
  const iv = window.setInterval(tick, 20_000);
  document.addEventListener('visibilitychange', tick);
  return () => { window.clearInterval(iv); document.removeEventListener('visibilitychange', tick); };
}
