// D1 storage. The schema is created on first use (CREATE … IF NOT EXISTS), so a fresh database
// needs no migration step: deploy and it works.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS installs (
    id TEXT PRIMARY KEY, created INTEGER NOT NULL, last_seen INTEGER NOT NULL, version TEXT,
    terms_version TEXT, terms_at INTEGER, c_likes INTEGER NOT NULL DEFAULT 0, c_search INTEGER NOT NULL DEFAULT 0,
    c_profile INTEGER NOT NULL DEFAULT 0, c_email INTEGER NOT NULL DEFAULT 0, name TEXT, interests TEXT, email TEXT,
    extra TEXT, syncs INTEGER NOT NULL DEFAULT 0, country TEXT, platform TEXT, last_sync INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS signals (
    install TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (install, kind, ref, day))`,
  `CREATE INDEX IF NOT EXISTS signals_kind ON signals(kind, ref)`,
  `CREATE TABLE IF NOT EXISTS ext_lines (id TEXT PRIMARY KEY, text TEXT NOT NULL, by TEXT)`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT, install TEXT, text TEXT NOT NULL, version TEXT, country TEXT,
    created INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS sentences (
    id TEXT PRIMARY KEY, text TEXT NOT NULL, by TEXT, theme TEXT, tags TEXT, meaning TEXT,
    builtin INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL, updated INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS hidden (id TEXT PRIMARY KEY, at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS login_fail (at INTEGER NOT NULL)`,
  // task reminders for phones (push.ts): only the delivery address, the time and the sealed text
  `CREATE TABLE IF NOT EXISTS push_jobs (
    endpoint TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, body TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (endpoint, id))`,
  `CREATE INDEX IF NOT EXISTS push_due ON push_jobs(sent, at)`,
];

let ready: Promise<void> | null = null;
export function ensureSchema(db: D1Database): Promise<void> {
  ready ??= db.batch(SCHEMA.map((s) => db.prepare(s))).then(() => undefined).catch((e) => { ready = null; throw e; });
  return ready;
}

export async function kvGet<T>(db: D1Database, key: string, fallback: T): Promise<T> {
  const r = await db.prepare('SELECT value FROM kv WHERE key = ?').bind(key).first<{ value: string }>();
  if (!r) return fallback;
  try { return JSON.parse(r.value) as T; } catch { return fallback; }
}
export async function kvSet(db: D1Database, key: string, value: unknown): Promise<void> {
  await db.prepare('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value)).run();
}
/** Any change to what /api/pack returns gets a new revision, so clients know to apply it. */
export const bumpPackRev = (db: D1Database) => kvSet(db, 'pack_rev', Date.now());

export const all = async <T = Record<string, unknown>>(db: D1Database, sql: string, ...args: unknown[]) =>
  (await db.prepare(sql).bind(...args).all<T>()).results;
export const one = async <T = Record<string, unknown>>(db: D1Database, sql: string, ...args: unknown[]) =>
  db.prepare(sql).bind(...args).first<T>();
export const run = (db: D1Database, sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).run();

/** Erase everything stored for an install (switch off, «delete my data», or the admin). */
export async function eraseInstall(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM signals WHERE install = ?').bind(id),
    db.prepare('DELETE FROM installs WHERE id = ?').bind(id),
    db.prepare('UPDATE feedback SET install = NULL WHERE install = ?').bind(id),
  ]);
}
