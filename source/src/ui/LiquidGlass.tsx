// «شیشه‌ی مایع» (آزمایشی): Apple-style Liquid Glass on the tool layer only (search bar, side rail).
//
// How it works — after Shu Ding's liquid-glass (MIT, github.com/shuding/liquid-glass) and kube.io's
// write-up on refraction with SVG filters:
//  1. For each element we draw a displacement map on a canvas: the glass is flat in the middle and
//     curves down near the edge (a squircle bezel). At every pixel the slope of that surface bends the
//     ray by Snell's law (glass n = 1.5), so the backdrop is pulled in from just outside the edge —
//     the edge works like a lens.
//  2. The map goes into an SVG <filter> (feDisplacementMap) used as the element's backdrop-filter. Red
//     and blue are displaced a little differently, so edges split into a faint rainbow.
//  3. The map is rebuilt only when the element's size changes; nothing runs per frame or per mouse move.
// SVG backdrop filters only work in Chromium. Elsewhere (Safari, Firefox: the iPhone app) nothing is
// applied and the normal frosted glass stays.
import { useEffect } from 'react';
import { useStore } from '../core/state';

const NS = 'http://www.w3.org/2000/svg';
const BEZEL = 22; // px of curved edge
const N = 1.5; // glass
const DEPTH = 26; // how far below the surface the backdrop sits (px): stronger lensing as it grows

export const liquidSupported = (() => {
  try {
    // only Chromium renders an SVG filter as a backdrop (iOS Chrome is WebKit: "CriOS", no "Chrome/")
    return /Chrome\/\d/.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent) && CSS.supports('backdrop-filter', 'blur(1px)');
  } catch { return false; }
})();

// height of the glass at t (0 at the outer edge → 1 where the bezel meets the flat top): a squircle
const height = (t: number) => Math.pow(1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4), 0.25);

/** One radius worth of displacement magnitudes (px), indexed by distance from the edge. */
function profile(): { mag: Float32Array; max: number } {
  const mag = new Float32Array(BEZEL + 1);
  let max = 0;
  for (let d = 0; d <= BEZEL; d++) {
    const t = d / BEZEL, e = 1 / BEZEL / 4;
    const slope = ((height(t + e) - height(t - e)) / (2 * e)) * (BEZEL * 0.5) / BEZEL; // dh/dx, height of the bezel ≈ half its width
    const a1 = Math.atan(slope); // angle between the surface normal and the view ray
    const a2 = Math.asin(Math.sin(a1) / N); // refracted
    const m = DEPTH * Math.tan(a1 - a2);
    mag[d] = m; if (m > max) max = m;
  }
  return { mag, max: max || 1 };
}
const PROFILE = profile();

// signed distance to a rounded rectangle centred at 0 (negative inside) and its gradient (outward)
function sdf(x: number, y: number, hw: number, hh: number, r: number): [number, number, number] {
  const qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), out = Math.hypot(ox, oy);
  const d = Math.min(Math.max(qx, qy), 0) + out - r;
  let gx: number, gy: number;
  if (out > 0) { gx = ox / out; gy = oy / out; } else if (qx > qy) { gx = 1; gy = 0; } else { gx = 0; gy = 1; }
  return [d, gx * Math.sign(x || 1), gy * Math.sign(y || 1)];
}

function buildMap(w: number, h: number, r: number): string {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const hw = w / 2, hh = h / 2, rr = Math.min(r, hw, hh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [d, gx, gy] = sdf(x + 0.5 - hw, y + 0.5 - hh, hw, hh, rr);
      const into = -d; // px inside from the edge
      let vx = 0, vy = 0;
      if (into >= 0 && into < BEZEL) {
        const m = PROFILE.mag[Math.floor(into)] / PROFILE.max;
        // sample from further out: the edge pulls the outside in, like a lens
        vx = gx * m; vy = gy * m;
      }
      const i = (y * w + x) * 4;
      img.data[i] = 128 + vx * 127; img.data[i + 1] = 128 + vy * 127; img.data[i + 2] = 128; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

let svg: SVGSVGElement | null = null;
const defs = () => {
  if (!svg) {
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

function makeFilter(id: string, w: number, h: number, r: number): SVGFilterElement {
  const f = el('filter', { id, x: 0, y: 0, width: w, height: h, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' }) as SVGFilterElement;
  const s = PROFILE.max * 2; // map stores ±1 → ±max px
  f.append(
    el('feImage', { href: buildMap(w, h, r), x: 0, y: 0, width: w, height: h, result: 'map', preserveAspectRatio: 'none' }),
    // three passes, a little apart: red bends least, blue most (dispersion)
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: s * 0.94, xChannelSelector: 'R', yChannelSelector: 'G', result: 'dr' }),
    el('feColorMatrix', { in: 'dr', type: 'matrix', values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'r' }),
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: s, xChannelSelector: 'R', yChannelSelector: 'G', result: 'dg' }),
    el('feColorMatrix', { in: 'dg', type: 'matrix', values: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'g' }),
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: s * 1.07, xChannelSelector: 'R', yChannelSelector: 'G', result: 'db' }),
    el('feColorMatrix', { in: 'db', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', result: 'b' }),
    el('feBlend', { in: 'r', in2: 'g', mode: 'screen', result: 'rg' }),
    el('feBlend', { in: 'rg', in2: 'b', mode: 'screen' }),
  );
  return f;
}

let seq = 0;
function attach(node: HTMLElement): () => void {
  const id = `ora-lg-${++seq}`;
  let f: SVGFilterElement | null = null, last = '';
  const apply = () => {
    const w = Math.round(node.offsetWidth), h = Math.round(node.offsetHeight);
    if (w < 8 || h < 8) return;
    const r = parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0;
    const key = `${w}x${h}x${r}`;
    if (key === last) return;
    last = key;
    f?.remove();
    f = makeFilter(id, w, h, r);
    defs().appendChild(f);
    node.style.setProperty('--lg-filter', `url(#${id})`);
    node.dataset.lgOn = '';
  };
  apply();
  const ro = new ResizeObserver(apply);
  ro.observe(node);
  return () => { ro.disconnect(); f?.remove(); node.style.removeProperty('--lg-filter'); delete node.dataset.lgOn; };
}

/** Mount once: while the setting is on, every element marked data-lg gets the liquid glass. */
export function LiquidGlassHost() {
  const on = useStore((s) => !!s.settings.liquidGlass) && liquidSupported;
  useEffect(() => {
    if (!on) return;
    const live = new Map<Element, () => void>();
    const scan = () => {
      const now = new Set(document.querySelectorAll('[data-lg]'));
      for (const [n, off] of live) if (!now.has(n) || !n.isConnected) { off(); live.delete(n); }
      for (const n of now) if (!live.has(n)) live.set(n, attach(n as HTMLElement));
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    document.documentElement.dataset.liquid = '';
    return () => { mo.disconnect(); for (const off of live.values()) off(); delete document.documentElement.dataset.liquid; };
  }, [on]);
  return null;
}
