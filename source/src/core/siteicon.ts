// A saved site's own icon and its colour (for the glow behind it).
// Where the icon comes from, in order: Chrome's local icon cache (extension only, no network), then
// the Ora server, which fetches it for us (the phone app can't read Chrome's cache, and a picture
// from another site can't be read for its colour). The result is kept on this device for a month,
// so it works offline and is asked for once.
import { kvGet, kvSet } from './kv';
import { privacyOf, serverBase } from './remote';
import { IS_EXTENSION } from './platform';

export type RGB = [number, number, number];
/** pal: the logo's colours, most present first (up to 4) */
export interface SiteIcon { src: string; rgb?: RGB; pal?: RGB[]; dark?: boolean }
type Stored = { src: string; rgb?: RGB; pal?: RGB[]; dark?: boolean; at: number };
const KEY = 'ora:site-icons';
const MONTH = 30 * 86_400_000;
const MISS_RETRY = 3 * 86_400_000;

export const hostOf = (full: string) => { try { return new URL(full).hostname.replace(/^www\./, ''); } catch { return full; } };

let memo: Promise<Record<string, Stored>> | null = null;
const store = () => (memo ??= kvGet<Record<string, Stored>>(KEY).then((v) => v ?? {}));
let saveT = 0;
async function remember(host: string, v: Stored) {
  const all = await store();
  all[host] = v;
  window.clearTimeout(saveT);
  saveT = window.setTimeout(() => void kvSet(KEY, all), 400);
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
function pixels(im: HTMLImageElement, n: number): ImageData {
  const c = document.createElement('canvas'); c.width = n; c.height = n;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(im, 0, 0, n, n);
  return g.getImageData(0, 0, n, n);
}
function toDataUrl(im: HTMLImageElement): string {
  const n = Math.min(128, Math.max(32, im.naturalWidth || 64));
  const c = document.createElement('canvas'); c.width = n; c.height = n;
  c.getContext('2d')!.drawImage(im, 0, 0, n, n);
  return c.toDataURL('image/png');
}

/** The icon's main colour: the most common saturated hue, ignoring see-through, grey, black and white. */
export function mainColour(d: ImageData): [number, number, number] | undefined {
  const bins = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let total = 0;
  for (let i = 0; i < d.data.length; i += 4) {
    const [r, g, b, a] = [d.data[i], d.data[i + 1], d.data[i + 2], d.data[i + 3]];
    if (a < 140) continue;
    total++;
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2, delta = mx - mn;
    if (l < 0.1 || l > 0.94 || delta < 0.12) continue;
    const s = delta / (1 - Math.abs(2 * l - 1));
    if (s < 0.2) continue;
    let h = mx === r / 255 ? ((g - b) / 255 / delta) % 6 : mx === g / 255 ? (b - r) / 255 / delta + 2 : (r - g) / 255 / delta + 4;
    h = (h * 60 + 360) % 360;
    const bin = bins[Math.floor(h / 15)], w = s * (0.6 + 0.4 * (1 - Math.abs(l - 0.5) * 2));
    bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
  }
  const best = bins.reduce((x, y) => (y.w > x.w ? y : x));
  // a few coloured pixels in a mostly black/white logo shouldn't paint it
  if (!total || best.w < Math.max(3, total * 0.04)) return undefined;
  return [Math.round(best.r / best.w), Math.round(best.g / best.w), Math.round(best.b / best.w)];
}

/** All of the logo's colours (most present first): each distinct hue that covers a fair part of it.
 *  A black-and-white logo gets none, and a soft neutral glow instead. */
export function palette(d: ImageData): RGB[] {
  const bins = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let total = 0;
  for (let i = 0; i < d.data.length; i += 4) {
    const [r, g, b, a] = [d.data[i], d.data[i + 1], d.data[i + 2], d.data[i + 3]];
    if (a < 140) continue;
    total++;
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2, delta = mx - mn;
    if (l < 0.1 || l > 0.94 || delta < 0.12) continue;
    const sat = delta / (1 - Math.abs(2 * l - 1));
    if (sat < 0.2) continue;
    let h = mx === r / 255 ? ((g - b) / 255 / delta) % 6 : mx === g / 255 ? (b - r) / 255 / delta + 2 : (r - g) / 255 / delta + 4;
    h = (h * 60 + 360) % 360;
    const bin = bins[Math.floor(h / 15)];
    bin.w += sat; bin.r += r * sat; bin.g += g * sat; bin.b += b * sat;
  }
  if (!total) return [];
  // merge each bin with its neighbours' peak so one colour isn't split in two
  const peaks = bins.map((x, i) => ({ ...x, i })).filter((x, i, all) => x.w > 0 && x.w >= all[(i + 23) % 24].w && x.w >= all[(i + 1) % 24].w)
    .map((x) => { const n = [bins[(x.i + 23) % 24], x, bins[(x.i + 1) % 24]]; const w = n.reduce((t, y) => t + y.w, 0); return { w, rgb: [n.reduce((t, y) => t + y.r, 0) / w, n.reduce((t, y) => t + y.g, 0) / w, n.reduce((t, y) => t + y.b, 0) / w].map(Math.round) as RGB }; })
    .sort((a, b) => b.w - a.w);
  const min = Math.max(2, total * 0.025, (peaks[0]?.w ?? 0) * 0.12);
  return peaks.filter((x) => x.w >= min).slice(0, 4).map((x) => x.rgb);
}
/** A mostly black logo (GitHub, X…) disappears on a dark tile: it gets a light plate. */
function isDark(d: ImageData): boolean {
  let n = 0, lum = 0;
  for (let i = 0; i < d.data.length; i += 4) if (d.data[i + 3] > 140) { n++; lum += (0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2]) / 255; }
  return n > 20 && lum / n < 0.22;
}
const coloursOf = (im: HTMLImageElement) => { const d = pixels(im, 32); const pal = palette(d); return { rgb: pal[0] ?? mainColour(d), pal, dark: isDark(d) }; };

/* Chrome hands back a grey globe for sites it has never cached: compare with the one it returns
   for a made-up address. */
let globe: Promise<string> | null = null;
const sig = (im: HTMLImageElement) => Array.from(pixels(im, 16).data).join(',');
function chromeIcon(pageUrl: string): string | undefined {
  if (!IS_EXTENSION) return undefined;
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', '64');
  return u.toString();
}
const globeSig = () => (globe ??= load(chromeIcon('https://ora-no-such-site.invalid/')!).then(sig).catch(() => ''));

async function fromChrome(pageUrl: string): Promise<Stored | null> {
  const src = chromeIcon(pageUrl);
  if (!src) return null;
  try {
    const im = await load(src);
    if (sig(im) === (await globeSig())) return null;
    return { src: toDataUrl(im), ...coloursOf(im), at: Date.now() };
  } catch { return null; }
}
async function fromServer(host: string): Promise<Stored | null> {
  const base = serverBase();
  if (!base || !privacyOf().receive || !navigator.onLine) return null;
  try {
    const res = await fetch(`${base}/api/icon?d=${encodeURIComponent(host)}`);
    if (!res.ok) return res.status === 404 ? { src: '', at: Date.now() } : null;
    const url = URL.createObjectURL(await res.blob());
    try {
      const im = await load(url);
      if ((im.naturalWidth || 0) < 8) return { src: '', at: Date.now() };
      return { src: toDataUrl(im), ...coloursOf(im), at: Date.now() };
    } finally { URL.revokeObjectURL(url); }
  } catch { return null; }
}

const pending = new Map<string, Promise<SiteIcon | null>>();
/** The icon to show, or null for a monogram. Cached on the device. */
export function siteIcon(pageUrl: string): Promise<SiteIcon | null> {
  const host = hostOf(pageUrl);
  let p = pending.get(host);
  if (p) return p;
  p = (async () => {
    const all = await store();
    const old = all[host];
    const fresh = old && Date.now() - old.at < (old.src ? MONTH : MISS_RETRY);
    if (fresh && old.src && (!old.pal || old.dark === undefined)) {
      try { const c = coloursOf(await load(old.src)); await remember(host, { ...old, ...c }); return { src: old.src, ...c }; } catch { /* keep the old one */ }
    }
    if (fresh) return old.src ? { src: old.src, rgb: old.rgb, pal: old.pal, dark: old.dark } : null;
    const got = (await fromChrome(pageUrl)) ?? (await fromServer(host));
    if (!got) return old?.src ? { src: old.src, rgb: old.rgb, pal: old.pal, dark: old.dark } : null; // offline: keep what we had
    await remember(host, got);
    return got.src ? { src: got.src, rgb: got.rgb, pal: got.pal, dark: got.dark } : null;
  })();
  pending.set(host, p);
  void p.finally(() => window.setTimeout(() => pending.delete(host), 5000));
  return p;
}
/** Cached answer right away (no flash of the monogram on every new tab). */
export async function cachedIcon(pageUrl: string): Promise<SiteIcon | null | undefined> {
  const v = (await store())[hostOf(pageUrl)];
  return v ? (v.src ? { src: v.src, rgb: v.rgb, pal: v.pal, dark: v.dark } : null) : undefined;
}
