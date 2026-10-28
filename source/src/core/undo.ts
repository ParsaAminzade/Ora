// One-step undo for calendar and plan changes («برگردان»). Local changes are undone by restoring a
// snapshot of the rows they touched; changes on Google are undone by sending the old values back.
import { db, type CalEvent, type Task } from './db';

interface Entry { label: string; undo: () => Promise<void>; at: number }
let last: Entry | null = null;

export function pushUndo(label: string, undo: () => Promise<void>): void {
  last = { label, undo, at: Date.now() };
  dispatchEvent(new CustomEvent('ora:undo-offer', { detail: label }));
}

export async function undoLast(): Promise<boolean> {
  const e = last;
  if (!e || Date.now() - e.at > 5 * 60_000) return false;
  last = null;
  await e.undo();
  dispatchEvent(new CustomEvent('ora:undo-offer', { detail: null }));
  return true;
}
export const canUndo = () => !!last && Date.now() - last.at < 5 * 60_000;

/** Run `fn`; afterwards the touched local events and tasks can be put back exactly as they were. */
export async function withUndo<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const [ev0, tk0] = await Promise.all([db.events.filter((e) => !e.source.startsWith('google:')).toArray(), db.tasks.toArray()]);
  const out = await fn();
  const [ev1, tk1] = await Promise.all([db.events.filter((e) => !e.source.startsWith('google:')).toArray(), db.tasks.toArray()]);
  const diff = <X extends { id: string }>(a: X[], b: X[]) => {
    const A = new Map(a.map((x) => [x.id, JSON.stringify(x)]));
    const B = new Map(b.map((x) => [x.id, JSON.stringify(x)]));
    return { created: b.filter((x) => !A.has(x.id)).map((x) => x.id), restore: a.filter((x) => B.get(x.id) !== A.get(x.id)) };
  };
  const e = diff<CalEvent>(ev0, ev1), t = diff<Task>(tk0, tk1);
  if (e.created.length || e.restore.length || t.created.length || t.restore.length) {
    pushUndo(label, async () => {
      await db.transaction('rw', db.events, db.tasks, db.tombstones, async () => {
        await db.events.bulkDelete(e.created);
        await db.events.bulkPut(e.restore);
        await db.tombstones.bulkDelete(e.restore.map((x) => x.id));
        await db.tasks.bulkDelete(t.created);
        await db.tasks.bulkPut(t.restore);
      });
      const { scheduleCalDavSync } = await import('./providers/caldav');
      scheduleCalDavSync();
    });
  }
  return out;
}
