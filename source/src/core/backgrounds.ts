// «پس‌زمینه‌های من»: a gallery of backgrounds you can return to with one click.
// Anything you run or upload (HTML, shader, image, video) is kept automatically; you can also save
// the current background by name. Files behind a saved background are never deleted while used.
import { db, uid, type SavedBackground } from './db';
import { useStore, type Background } from './state';
import { formatTime, formatJalaliLong } from './dates';

const KIND_NAMES: Record<Background['kind'], string> = {
  starfield: 'آسمان پرستاره', scene: 'صحنه‌ی سه‌بعدی', shader: 'شیدر', html: 'کد HTML', image: 'تصویر', video: 'ویدیو', color: 'رنگ',
};

/** Two backgrounds are "the same" when what you see is the same. */
export function sameLook(a: Partial<Background>, b: Partial<Background>): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'html': return a.htmlId === b.htmlId;
    case 'image': case 'video': return a.assetId === b.assetId;
    case 'shader': return a.shader === b.shader;
    case 'scene': return a.scene === b.scene && a.sceneColor === b.sceneColor;
    case 'color': return a.color === b.color;
    default: return true;
  }
}

async function makeThumb(bg: Background): Promise<string | undefined> {
  try {
    if (bg.kind !== 'image' && bg.kind !== 'video') return undefined;
    const a = bg.assetId ? await db.assets.get(bg.assetId) : undefined;
    if (!a) return undefined;
    const c = document.createElement('canvas');
    c.width = 240; c.height = 150;
    const g = c.getContext('2d')!;
    const url = URL.createObjectURL(a.blob);
    try {
      let src: CanvasImageSource;
      if (bg.kind === 'image') {
        src = await createImageBitmap(a.blob);
      } else {
        const v = document.createElement('video');
        v.muted = true; v.src = url; v.preload = 'auto';
        await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('video')); });
        v.currentTime = Math.min(1, (v.duration || 2) / 2);
        await new Promise<void>((res) => { v.onseeked = () => res(); });
        src = v;
      }
      const sw = (src as HTMLVideoElement).videoWidth || (src as ImageBitmap).width;
      const sh = (src as HTMLVideoElement).videoHeight || (src as ImageBitmap).height;
      const s = Math.max(c.width / sw, c.height / sh);
      g.drawImage(src, (c.width - sw * s) / 2, (c.height - sh * s) / 2, sw * s, sh * s);
      return c.toDataURL('image/jpeg', 0.7);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return undefined;
  }
}

/** Save a background (no duplicate of the same look). Returns its gallery entry. */
export async function saveBackground(bg: Background, name?: string): Promise<SavedBackground> {
  const all = await db.backgrounds.toArray();
  const existing = all.find((x) => sameLook(x.bg, bg));
  if (existing) {
    const upd = { ...existing, bg: { ...bg }, name: name?.trim() || existing.name };
    await db.backgrounds.put(upd);
    return upd;
  }
  const now = new Date();
  const item: SavedBackground = {
    id: uid(),
    name: name?.trim() || `${KIND_NAMES[bg.kind]} · ${(formatJalaliLong(now).split('،').pop() ?? '').trim().split(' ').slice(0, 2).join(' ')}، ${formatTime(now, false)}`,
    bg: { ...bg },
    thumb: await makeThumb(bg),
    createdAt: Date.now(),
  };
  await db.backgrounds.put(item);
  return item;
}

/** Is this asset (image, video, HTML) still needed by the page, a mode or the gallery? */
export async function assetInUse(id: string): Promise<boolean> {
  const st = useStore.getState().settings;
  const refs = (b?: Partial<Background>) => !!b && (b.assetId === id || b.htmlId === id);
  if (refs(st.background) || st.modes.some((m) => refs(m.background))) return true;
  return (await db.backgrounds.toArray()).some((x) => refs(x.bg));
}

/** Delete an asset only if nothing uses it any more. */
export async function releaseAsset(id?: string): Promise<void> {
  if (id && !(await assetInUse(id))) await db.assets.delete(id);
}

export async function deleteBackground(id: string): Promise<void> {
  const item = await db.backgrounds.get(id);
  await db.backgrounds.delete(id);
  if (item) { await releaseAsset(item.bg.assetId); await releaseAsset(item.bg.htmlId); }
}

export function applyBackground(item: SavedBackground) {
  const st = useStore.getState();
  st.setSettings({ background: { ...st.settings.background, ...item.bg } });
}

/** Live still of the current background, shared with the settings preview. */
export const bgStill = { url: null as string | null, listeners: new Set<() => void>() };
export function setBgStill(url: string | null) { bgStill.url = url; bgStill.listeners.forEach((f) => f()); }

/** Give gallery entries of this look a real preview image (code backgrounds have none at first). */
export async function noteStill(bg: Partial<Background>, url: string | null): Promise<void> {
  setBgStill(url);
  if (!url) return;
  const items = await db.backgrounds.toArray();
  for (const it of items) if (sameLook(it.bg, bg) && !it.thumb) await db.backgrounds.update(it.id, { thumb: url });
}
