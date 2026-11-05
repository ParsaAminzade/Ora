// «شیشه‌ی مایع»: Apple-style Liquid Glass. Either on the tool layer only (search bar, side rail) or on
// every panel, with its factors in your hands (Settings › Look).
//
// How it works — after Shu Ding's liquid-glass (MIT, github.com/shuding/liquid-glass) and kube.io's
// write-up on refraction with SVG filters:
//  1. For each element we draw a displacement map on a canvas: the glass is flat in the middle and
//     curves down near the edge (a squircle bezel). At every pixel the slope of that surface bends the
//     ray by Snell's law (glass n = 1.5), so the backdrop is pulled in from just outside the edge —
//     the edge works like a lens.
//  2. The map goes into an SVG <filter> (feDisplacementMap) used as the element's backdrop-filter. Red
//     and blue are displaced a little differently, so edges split into a faint rainbow.
//  3. The map is rebuilt only when the element's size or the factors change; nothing runs per frame or
//     per mouse move.
// SVG backdrop filters only work in Chromium. Elsewhere (Safari, Firefox: the iPhone app) the setting
// isn't offered and the normal frosted glass stays.
import { useEffect } from 'react';
import { useStore } from '../core/state';

const NS = 'http://www.w3.org/2000/svg';
const N = 1.5; // glass

export type LiquidWhere = 'off' | 'tools' | 'all';
export interface Liquid {
  where: LiquidWhere;
  /** how strongly the edge bends what's behind it, 0–100 */
  bend: number;
  /** how wide the curved edge is, px */
  edge: number;
  /** rainbow at the edge, 0–100 */
  rainbow: number;
  /** frost: blur of what shows through, 0–100 */
  frost: number;
  /** smoke: how dark the glass is, 0–100 */
  smoke: number;
  /** the lit rim, 0–100 */
  shine: number;
}
export const LIQUID_DEFAULT: Liquid = { where: 'off', bend: 50, edge: 22, rainbow: 25, frost: 30, smoke: 30, shine: 60 };
export const liquidOf = (s: { liquid?: Partial<Liquid>; liquidGlass?: boolean }): Liquid =>
  ({ ...LIQUID_DEFAULT, ...(s.liquidGlass && !s.liquid ? { where: 'tools' as const } : {}), ...s.liquid });

export const liquidSupported = (() => {
  try {
    // only Chromium renders an SVG filter as a backdrop (iOS Chrome is WebKit: "CriOS", no "Chrome/")
    return /Chrome\/\d/.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent) && CSS.supports('backdrop-filter', 'blur(1px)');
  } catch { return false; }
})();

// height of the glass at t (0 at the outer edge → 1 where the bezel meets the flat top): a squircle
const height = (t: number) => Math.pow(1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4), 0.25);

/** One radius worth of displacement magnitudes (px), indexed by distance from the edge. */
function profile(edge: number, bend: number): { mag: Float32Array; max: number } {
  const depth = 6 + bend * 0.5; // how far below the surface the backdrop sits: deeper bends more
  const mag = new Float32Array(edge + 1);
  let max = 0;
  for (let d = 0; d <= edge; d++) {
    const t = d / edge, e = 1 / edge / 4;
    const slope = ((height(t + e) - height(t - e)) / (2 * e)) * 0.5; // the bezel is about half as tall as it is wide
    const a1 = Math.atan(slope); // angle between the surface normal and the view ray
    const a2 = Math.asin(Math.sin(a1) / N); // refracted
    const m = depth * Math.tan(a1 - a2);
    mag[d] = m; if (m > max) max = m;
  }
  return { mag, max: max || 1 };
}

// signed distance to a rounded rectangle centred at 0 (negative inside) and its outward gradient
function sdf(x: number, y: number, hw: number, hh: number, r: number): [number, number, number] {
  const qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), out = Math.hypot(ox, oy);
  const d = Math.min(Math.max(qx, qy), 0) + out - r;
  let gx: number, gy: number;
  if (out > 0) { gx = ox / out; gy = oy / out; } else if (qx > qy) { gx = 1; gy = 0; } else { gx = 0; gy = 1; }
  return [d, gx * Math.sign(x || 1), gy * Math.sign(y || 1)];
}

function buildMap(w: number, h: number, r: number, p: { mag: Float32Array; max: number }, edge: number): string {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const hw = w / 2, hh = h / 2, rr = Math.min(r, hw, hh);
  const d8 = img.data;
  for (let i = 0; i < d8.length; i += 4) { d8[i] = 128; d8[i + 1] = 128; d8[i + 2] = 128; d8[i + 3] = 255; }
  // only the band near the edge bends; skip the flat middle
  const band = (x: number, y: number) => x < edge || y < edge || x >= w - edge || y >= h - edge || (x < rr + edge && y < rr + edge) || (x >= w - rr - edge && y < rr + edge) || (x < rr + edge && y >= h - rr - edge) || (x >= w - rr - edge && y >= h - rr - edge);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!band(x, y)) continue;
      const [d, gx, gy] = sdf(x + 0.5 - hw, y + 0.5 - hh, hw, hh, rr);
      const into = -d;
      if (into < 0 || into >= edge) continue;
      const m = p.mag[Math.floor(into)] / p.max;
      const i = (y * w + x) * 4;
      // sample from further out: the edge pulls the outside in, like a lens
      d8[i] = 128 + gx * m * 127; d8[i + 1] = 128 + gy * m * 127;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

let svg: SVGSVGElement | null = null;
const defs = () => {
  if (!svg || !svg.isConnected) {
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    svg.appendChild(document.createElementNS(NS, 'defs'));
    document.body.appendChild(svg);
  }
  return svg.firstChild as SVGDefsElement;
};
const el = (tag: string, a: Record<string, string | number>) => {
  const e = document.createElementNS(NS, tag);
  for (const k in a) e.setAttribute(k, String(a[k]));
  return e;
};

function makeFilter(id: string, w: number, h: number, r: number, L: Liquid): SVGFilterElement {
  const p = profile(L.edge, L.bend);
  const f = el('filter', { id, x: 0, y: 0, width: w, height: h, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' }) as SVGFilterElement;
  const s = p.max * 2; // the map stores ±1 → ±max px
  const k = (L.rainbow / 100) * 0.16; // dispersion: red bends a little less, blue a little more
  const img = el('feImage', { href: buildMap(w, h, r, p, L.edge), x: 0, y: 0, width: w, height: h, result: 'img', preserveAspectRatio: 'none' });
  // anything the map doesn't cover means «don't move» (mid-grey), never «move far» (transparent)
  const flood = el('feFlood', { 'flood-color': 'rgb(128,128,128)', result: 'mid' });
  const map = el('feComposite', { in: 'img', in2: 'mid', operator: 'over', result: 'map' });
  if (k < 0.005) {
    f.append(img, flood, map, el('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: s, xChannelSelector: 'R', yChannelSelector: 'G' }));
    return f;
  }
  f.append(
    img, flood, map,
    // two passes instead of three (each pass re-reads the whole backdrop): red bends a little less,
    // green and blue together a little more
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: s * (1 - k * 0.6), xChannelSelector: 'R', yChannelSelector: 'G', result: 'dr' }),
    el('feColorMatrix', { in: 'dr', type: 'matrix', values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'r' }),
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: s * (1 + k * 0.5), xChannelSelector: 'R', yChannelSelector: 'G', result: 'dgb' }),
    el('feColorMatrix', { in: 'dgb', type: 'matrix', values: '0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0', result: 'gb' }),
    el('feBlend', { in: 'r', in2: 'gb', mode: 'screen' }),
  );
  return f;
}

let seq = 0;
function attach(node: HTMLElement, L: Liquid): () => void {
  const id = `ora-lg-${++seq}`;
  const factors = `${L.bend}/${L.edge}/${L.rainbow}`;
  let f: SVGFilterElement | null = null, last = '', raf = 0;
  const apply = () => {
    raf = 0;
    // When the layout scales a widget down («جا شدن چیدمان»), Chrome applies the scale to the backdrop
    // filter's units once more; draw the map that much larger so it lands on the element's real edges.
    const box = node.getBoundingClientRect();
    const k = node.offsetWidth ? box.width / node.offsetWidth : 1;
    const w = Math.round(node.offsetWidth / k), h = Math.round(node.offsetHeight / k);
    if (w < 8 || h < 8) return;
    const r = (parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0) / k;
    const key = `${w}x${h}x${r}/${factors}`;
    if (key === last) return;
    last = key;
    const nf = makeFilter(id, w, h, r, L);
    f?.remove(); f = nf;
    defs().appendChild(f);
    node.style.setProperty('--lg-filter', `url(#${id})`);
    node.dataset.lgOn = '';
  };
  apply();
  // resizing (dragging a widget's corner) fires many times: rebuild at most once a frame
  const later = () => { if (!raf) raf = requestAnimationFrame(apply); };
  const ro = new ResizeObserver(later);
  ro.observe(node);
  addEventListener('resize', later); // the layout's scale changes with the window, not the element
  return () => { ro.disconnect(); removeEventListener('resize', later); cancelAnimationFrame(raf); f?.remove(); node.style.removeProperty('--lg-filter'); delete node.dataset.lgOn; };
}

const TOOLS = '[data-lg]';
// every panel on the page — the widget cards, the rail, the search bar, the sentence plate — but
// never what opens over them (settings, dialogs, menus): glass on glass can't be read
const ALL = '[data-lg], section[data-widget].glass, [data-widget] .frame-glass .sentence-plate, [data-widget] .frame-bevel .sentence-plate';

/** Mount once: applies the liquid glass to the chosen elements while the setting is on. */
export function LiquidGlassHost() {
  const raw = useStore((s) => s.settings.liquid);
  const legacy = useStore((s) => s.settings.liquidGlass);
  const L = liquidOf({ liquid: raw, liquidGlass: legacy });
  const on = L.where !== 'off' && liquidSupported;
  const key = `${L.where}/${L.bend}/${L.edge}/${L.rainbow}`;
  // the cheap factors are CSS variables: no rebuild
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty('--lg-frost', `${(L.frost / 100) * 14}px`);
    r.setProperty('--lg-smoke', String(0.04 + (L.smoke / 100) * 0.78));
    r.setProperty('--lg-shine', String(L.shine / 100));
  }, [L.frost, L.smoke, L.shine]);
  useEffect(() => {
    if (!on) return;
    const sel = L.where === 'all' ? ALL : TOOLS;
    const live = new Map<Element, () => void>();
    let pending = 0;
    const scan = () => {
      pending = 0;
      // not on dialogs, sheets and menus that open over the panels: glass on glass can't be read
      const now = new Set([...document.querySelectorAll(sel)].filter((n) => n.matches('[data-lg]') || !n.closest('[role="dialog"], [role="menu"], .dlg-backdrop, .settings-panel, .upd-bar')));
      for (const [n, off] of live) if (!now.has(n) || !n.isConnected) { off(); live.delete(n); }
      for (const n of now) if (!live.has(n)) live.set(n, attach(n as HTMLElement, L));
    };
    scan();
    const mo = new MutationObserver(() => { if (!pending) pending = requestAnimationFrame(scan); });
    mo.observe(document.body, { childList: true, subtree: true });
    document.documentElement.dataset.liquid = L.where;
    return () => { mo.disconnect(); cancelAnimationFrame(pending); for (const off of live.values()) off(); delete document.documentElement.dataset.liquid; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key]);
  return null;
}
