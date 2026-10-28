// Backups: one JSON file with settings, layout, tasks, notes, events, the assistant's memory and
// knowledge texts, and (optionally) your uploaded images and fonts. Videos are left out (size).
// API keys are never written to a backup file.
import { db, type Asset, type CalEvent, type DayReview, type Feedback, type Goal, type KDoc, type Memory, type Note, type Project, type SavedBackground, type Sentence, type Task } from './db';
import { useStore, type Snapshot } from './state';
import { kvGet, kvSet } from './kv';

interface SavedAsset extends Omit<Asset, 'blob'> {
  dataUrl: string;
}

interface Backup {
  app: 'nova';
  schema: 1 | 2;
  exportedAt: string;
  state: Snapshot;
  tasks: Task[];
  notes: Note[];
  events: CalEvent[];
  memories?: Memory[];
  feedback?: Feedback[];
  docs?: KDoc[];
  sentences?: Sentence[];
  backgrounds?: SavedBackground[];
  assets?: SavedAsset[];
  goals?: Goal[];
  projects?: Project[];
  reviews?: DayReview[];
  /** What Ora learned about you: how long work really takes, why things slip, what helps. */
  learned?: Record<string, unknown>;
}

/** kv keys holding what the planner and the coach learned (kept in backups). */
const LEARNED = ['ora:block-log', 'ora:coach'];

const BUILTIN_SENTENCE = (s: Sentence) => s.source === 'classic' || s.source === 'pack:Nova';

const ASSET_LIMIT = 15 * 1024 * 1024;

const toDataUrl = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

export async function buildBackup(includeAssets: boolean): Promise<Blob> {
  const { settings, widgets } = useStore.getState();
  const safeSettings = { ...settings, ai: { ...settings.ai, apiKey: '' }, caldav: { ...settings.caldav, password: '' } };
  const assets: SavedAsset[] = [];
  if (includeAssets) {
    for (const a of await db.assets.toArray()) {
      if (a.kind === 'video' || a.blob.size > ASSET_LIMIT) continue;
      const { blob, ...meta } = a;
      assets.push({ ...meta, dataUrl: await toDataUrl(blob) });
    }
  }
  const data: Backup = {
    app: 'nova',
    schema: 2,
    exportedAt: new Date().toISOString(),
    state: { schema: 1, settings: safeSettings, widgets },
    tasks: await db.tasks.toArray(),
    notes: await db.notes.toArray(),
    events: (await db.events.toArray()).filter((e) => !e.source.startsWith('google:')),
    memories: (await db.memories.toArray()).map(({ vec: _v, vecModel: _m, ...m }) => m),
    feedback: await db.feedback.toArray(),
    docs: await db.docs.toArray(),
    backgrounds: await db.backgrounds.toArray(),
    sentences: (await db.sentences.toArray()).filter((s) => !BUILTIN_SENTENCE(s)),
    assets,
    goals: await db.goals.toArray(),
    projects: await db.projects.toArray(),
    reviews: await db.reviews.toArray(),
    learned: Object.fromEntries(await Promise.all(LEARNED.map(async (k) => [k, await kvGet(k)] as const))),
  };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

const fileName = () => `ora-backup-${new Date().toISOString().slice(0, 10)}.json`;

/** Manual export: the browser's normal download. */
export async function exportBackup(includeAssets = true): Promise<void> {
  const blob = await buildBackup(includeAssets);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const AUTO_KEY = 'nova:auto-backup';
interface AutoState { last: number; ids: number[] }

/** Automatic backup into Downloads/Ora-backups, keeping the newest 8 files. */
export async function runAutoBackup(force = false): Promise<string | null> {
  const cfg = useStore.getState().settings.backup;
  if (!force && cfg.autoDays === 0) return null;
  if (typeof chrome === 'undefined' || !chrome.downloads) return null;
  const st = (await kvGet<AutoState>(AUTO_KEY)) ?? { last: 0, ids: [] };
  if (!force && Date.now() - st.last < cfg.autoDays * 864e5) return null;
  const blob = await buildBackup(cfg.includeAssets);
  const url = URL.createObjectURL(blob);
  try {
    const id = await chrome.downloads.download({ url, filename: `Ora-backups/${fileName()}`, conflictAction: 'overwrite', saveAs: false });
    const ids = [...st.ids.filter((x) => x !== id), id];
    while (ids.length > 8) {
      const old = ids.shift()!;
      await chrome.downloads.removeFile(old).catch(() => {});
      await chrome.downloads.erase({ id: old }).catch(() => {});
    }
    await kvSet(AUTO_KEY, { last: Date.now(), ids });
    return fileName();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export const lastAutoBackup = async () => (await kvGet<AutoState>(AUTO_KEY))?.last ?? 0;

export async function importBackup(file: File): Promise<string> {
  let data: Backup;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return 'فایل JSON معتبر نیست.';
  }
  if (data?.app !== 'nova' || ![1, 2].includes(data.schema) || data.state?.schema !== 1) return 'این فایل پشتیبان اورآ نیست.';
  const assets: Asset[] = [];
  for (const a of data.assets ?? []) {
    const { dataUrl, ...meta } = a;
    assets.push({ ...meta, blob: await (await fetch(dataUrl)).blob() });
  }
  await db.transaction('rw', [db.goals, db.projects, db.reviews], async () => {
    if (data.goals) { await db.goals.clear(); await db.goals.bulkPut(data.goals); }
    if (data.projects) { await db.projects.clear(); await db.projects.bulkPut(data.projects); }
    if (data.reviews) { await db.reviews.clear(); await db.reviews.bulkPut(data.reviews); }
  });
  for (const [k, v] of Object.entries(data.learned ?? {})) if (LEARNED.includes(k) && v !== undefined && v !== null) await kvSet(k, v);
  await db.transaction('rw', [db.tasks, db.notes, db.events, db.memories, db.feedback, db.docs, db.chunks, db.assets, db.sentences, db.backgrounds], async () => {
    if (data.backgrounds) { await db.backgrounds.clear(); await db.backgrounds.bulkPut(data.backgrounds); }
    if (data.sentences) {
      await db.sentences.filter((s) => !BUILTIN_SENTENCE(s)).delete();
      await db.sentences.bulkPut(data.sentences);
    }
    await Promise.all([db.tasks.clear(), db.notes.clear(), db.events.where('source').equals('local').delete(), db.memories.clear(), db.feedback.clear(), db.docs.clear(), db.chunks.clear()]);
    await db.tasks.bulkPut(data.tasks ?? []);
    await db.notes.bulkPut(data.notes ?? []);
    await db.events.bulkPut((data.events ?? []).map((e) => ({ ...e, recurring: e.rrule ? 1 : 0 })));
    await db.memories.bulkPut(data.memories ?? []);
    await db.feedback.bulkPut(data.feedback ?? []);
    await db.docs.bulkPut((data.docs ?? []).map((d) => ({ ...d, chunkCount: 0 })));
    await db.assets.bulkPut(assets);
  });
  const cur = useStore.getState().settings;
  const st = data.state.settings;
  useStore.getState().replaceAll({ ...data.state, settings: { ...st, ai: { ...st.ai, apiKey: cur.ai.apiKey }, caldav: { ...cur.caldav, ...st.caldav, password: cur.caldav.password } } });
  return data.docs?.length ? 'بازگردانی انجام شد. پایگاه دانش دوباره نمایه می‌شود.' : 'بازگردانی انجام شد.';
}
