// Which Ora version is newest: whichever is higher of
//  · the one registered by hand in the admin panel (/admin/release), and
//  · downloads/latest.json in the GitHub repo, written with every release.
// So pushing a release to GitHub is enough for every Ora to hear about it; the admin panel can still
// set (or override with a newer number) the notes and link.
import { kvGet } from './db';
import type { Env } from './util';

const GH = 'https://raw.githubusercontent.com/ParsaAminzade/Ora/main/downloads/latest.json';
export type Release = { version: string; notes?: string; url?: string; at?: number };
const VER = /^\d{1,4}(\.\d{1,4}){0,3}$/;
const cmp = (a: string, b: string) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; }
  return 0;
};
export async function newestRelease(env: Env): Promise<Release | null> {
  const reg = await kvGet<Release | null>(env.DB, 'latest', null);
  let gh: Release | null = null;
  try {
    const r = await fetch(GH, { cf: { cacheTtl: 300, cacheEverything: true } } as RequestInit);
    if (r.ok) {
      const j = (await r.json()) as Release;
      if (j && typeof j.version === 'string' && VER.test(j.version) && (!j.url || /^https:\/\/\S+$/.test(j.url))) {
        gh = { version: j.version, notes: String(j.notes ?? '').slice(0, 1500), url: j.url, at: Number(j.at) || undefined };
      }
    }
  } catch { /* GitHub unreachable: the registered one stands */ }
  if (!reg?.version) return gh;
  if (!gh) return reg;
  return cmp(gh.version, reg.version) > 0 ? gh : reg;
}
