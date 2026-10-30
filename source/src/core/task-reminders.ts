// Reminders for tasks that have a day and a time: «وقت «تمرین فیزیک» است». On the computer they are
// Chrome alarms turned into notifications by the extension's worker (public/sw.js); on the phone
// they go sealed through the Ora server (web/push.ts). Both use this list.
import { db, type Task } from './db';
import { IS_EXTENSION } from './platform';
import { fa } from './dates';

const at = (t: Task) => { const [h, m] = (t.time ?? '').split(':').map(Number); const d = new Date(`${t.when}T00:00:00`); d.setHours(h, m, 0, 0); return d.getTime(); };

export async function upcomingTaskReminders(hours = 48): Promise<{ id: string; at: number; title: string; body: string }[]> {
  const now = Date.now(), end = now + hours * 3600_000;
  const tasks = await db.tasks.filter((t) => !t.done && !t.someday && !!t.when && !!t.time && /^\d\d:\d\d$/.test(t.time)).toArray();
  return tasks.map((t) => ({ t, ms: at(t) })).filter(({ ms }) => ms > now + 30_000 && ms < end).sort((a, b) => a.ms - b.ms).slice(0, 60)
    .map(({ t, ms }) => ({
      id: `t-${t.id}-${t.when}-${t.time}`.replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 80),
      at: ms,
      title: `وقت «${t.title.slice(0, 60)}» است`,
      body: t.est ? `${fa(t.est)} دقیقه. همین الان شروعش کنی؟` : 'همین الان شروعش کنی؟',
    }));
}

/** The extension: one Chrome alarm per timed task in the next two days. Safe to call often. */
const PREFIX = 'task|';
export async function scheduleTaskAlarms(): Promise<void> {
  if (!IS_EXTENSION || !chrome.alarms) return;
  const existing = await chrome.alarms.getAll();
  await Promise.all(existing.filter((a) => a.name.startsWith(PREFIX)).map((a) => chrome.alarms.clear(a.name)));
  for (const r of await upcomingTaskReminders()) {
    // the name carries what the worker needs to write the notification
    await chrome.alarms.create(`${PREFIX}${r.id}|${r.at}|${r.title}|${r.body}`, { when: r.at });
  }
}
