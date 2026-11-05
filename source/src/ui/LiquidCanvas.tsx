// «شیشه‌ی مایع» on the GPU: one WebGL canvas, just above the background, draws the glass of every panel
// in a single pass — the way the iPhone does it, instead of one SVG filter per panel that Chrome redoes
// on every change.
//
// It reads the background directly (we drew it, so there's no screenshot to take): an image or a video
// is uploaded as a texture (a video every frame), the stars / 3D scene / shader canvas likewise, a plain
// colour is a 1×1 texture. For each pixel inside a panel the shader finds that panel's rounded rectangle,
// and near its edge bends the ray by Snell's law through a squircle bezel (n = 1.5): it samples the
// background from a little further out, so the edge works like a lens. Then frost (a 12-tap disc blur),
// a slight split of red and blue (rainbow), smoke (tint) and a lit rim from the top-left.
//
// When nothing moves (an image or a colour and no panel changed) nothing is drawn at all.
import { useEffect, useRef } from 'react';
import { glFailed, glPanels, liquidOf } from './LiquidGlass';
import { useStore } from '../core/state';

const MAX = 24;

const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
const FS = `
precision highp float;
uniform vec2 uRes;            // canvas size, device px
uniform vec4 uRect[${MAX}];   // x, y, w, h (device px, top-left origin)
uniform float uRad[${MAX}];
uniform int uN;
uniform sampler2D uTex;
uniform vec4 uMap;            // screen uv → texture uv: scale.xy, offset.zw
uniform float uEdge, uDepth, uRainbow, uFrost, uSmoke, uShine, uDim, uLight, uDpr;

float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.) + length(max(q, 0.)) - r; }
float hgt(float t) { t = clamp(t, 0., 1.); return pow(1. - pow(1. - t, 4.), .25); }
vec3 tap(vec2 px) {
  vec2 uv = clamp(px / uRes, vec2(0.), vec2(1.));
  uv = uv * uMap.xy + uMap.zw;
  return texture2D(uTex, uv).rgb; // textures keep the image's top row first, like the screen
}
// frost: a disc of 12 taps around px (golden angle), radius uFrost
vec3 frosted(vec2 px) {
  if (uFrost < .5) return tap(px);
  vec3 c = vec3(0.);
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float r = sqrt((fi + .5) / 12.) * uFrost;
    float a = fi * 2.39996;
    c += tap(px + vec2(cos(a), sin(a)) * r);
  }
  return c / 12.;
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float d = 1e9; vec2 c = vec2(0.), b = vec2(0.); float rad = 0.;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uN) break;
    vec4 R = uRect[i];
    vec2 ci = R.xy + R.zw * .5, bi = R.zw * .5;
    float di = sdRR(px - ci, bi, uRad[i]);
    if (di < d) { d = di; c = ci; b = bi; rad = uRad[i]; }
  }
  if (d > .5) { gl_FragColor = vec4(0.); return; }
  float alpha = clamp(.5 - d, 0., 1.);
  // outward direction of the edge
  vec2 p = px - c;
  vec2 g = vec2(sdRR(p + vec2(1., 0.), b, rad) - sdRR(p - vec2(1., 0.), b, rad), sdRR(p + vec2(0., 1.), b, rad) - sdRR(p - vec2(0., 1.), b, rad));
  g = length(g) > 0. ? normalize(g) : vec2(0.);
  float inside = -d;
  float t = inside / uEdge;
  float mag = 0.;
  if (t < 1.) {
    float e = .02;
    float slope = (hgt(t + e) - hgt(t - e)) / (2. * e) * .5;
    float a1 = atan(slope);
    float a2 = asin(sin(a1) / 1.5);
    mag = uDepth * tan(a1 - a2);
  }
  vec3 col;
  if (uRainbow > .005 && mag > .05) {
    float k = uRainbow * .16;
    col = vec3(frosted(px + g * mag * (1. - k * .6)).r, frosted(px + g * mag).g, frosted(px + g * mag * (1. + k)).b);
  } else {
    col = frosted(px + g * mag);
  }
  col *= 1. - uDim;
  // a little richer, like looking through real glass
  float l = dot(col, vec3(.2126, .7152, .0722));
  col = clamp(mix(vec3(l), col, 1.45) * 1.04, 0., 1.);
  // smoke
  col = mix(col, vec3(.047, .051, .07), clamp(uSmoke + uLight * .35, 0., .92));
  // the rim: light from the top-left catches the curved edge; a fainter catch bottom-right
  float rim = (1. - clamp(t, 0., 1.));
  float lit = max(dot(g, normalize(vec2(-.7, -.7))), 0.);
  float back = max(dot(g, normalize(vec2(.7, .7))), 0.);
  float edgeLine = exp(-inside / (1.2 * uDpr));
  col += uShine * (pow(rim, 3.) * lit * .45 + edgeLine * (.35 * lit + .12 * back + .06));
  // a soft sheen at the top
  col += uShine * .05 * smoothstep(b.y * 2., 0., p.y + b.y);
  gl_FragColor = vec4(clamp(col, 0., 1.) * alpha, alpha);
}`;

type Kind = string;
export function LiquidCanvas({ kind, url, color, dim }: { kind: Kind; url?: string | null; color: string; dim: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raw = useStore((s) => s.settings.liquid);
  const legacy = useStore((s) => s.settings.liquidGlass);
  const L = liquidOf({ liquid: raw, liquidGlass: legacy });
  const live = useRef({ L, dim });
  live.current = { L, dim };

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) { glFailed(); return; }
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
    } catch { glFailed(); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const u = { res: U('uRes'), rect: U('uRect'), rad: U('uRad'), n: U('uN'), map: U('uMap'), edge: U('uEdge'), depth: U('uDepth'), rainbow: U('uRainbow'), frost: U('uFrost'), smoke: U('uSmoke'), shine: U('uShine'), dim: U('uDim'), light: U('uLight'), dpr: U('uDpr') };
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // ---- the source ----
    let source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null = null;
    let srcW = 1, srcH = 1, dynamic = false, uploaded = false, cover = true;
    const host = canvas.parentElement!;
    const solid = () => {
      const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
      const n = m ? parseInt(m[1], 16) : 0x05060a;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([n >> 16, (n >> 8) & 255, n & 255, 255]));
      uploaded = true;
    };
    const find = () => {
      if (kind === 'video') { const v = host.querySelector('video'); if (v) { source = v; dynamic = true; cover = true; } }
      else if (kind === 'starfield' || kind === 'scene' || kind === 'shader') {
        const c = [...host.querySelectorAll('canvas')].find((x) => x !== canvas) ?? null;
        if (c) { source = c; dynamic = true; cover = false; }
      }
    };
    if (kind === 'image' && url) {
      const im = new Image();
      im.onload = () => { source = im; srcW = im.naturalWidth; srcH = im.naturalHeight; uploaded = false; dirty = true; };
      im.src = url;
    } else if (kind === 'color' || !url && (kind === 'image' || kind === 'video')) solid();
    else find();

    let raf = 0, dirty = true, lastKey = '', lastFrame = 0;
    const rects = new Float32Array(MAX * 4), rads = new Float32Array(MAX);
    const radiusOf = new WeakMap<HTMLElement, number>();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; dirty = true; }
      if (!source && !uploaded) find();
      // the panels, where they are right now
      let n = 0, key = `${W}x${H}`;
      for (const el of glPanels) {
        if (n >= MAX || !el.isConnected) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) continue;
        let rad = radiusOf.get(el);
        if (rad === undefined) { rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0; radiusOf.set(el, rad); }
        const k = el.offsetWidth ? r.width / el.offsetWidth : 1;
        rects[n * 4] = r.left * dpr; rects[n * 4 + 1] = r.top * dpr; rects[n * 4 + 2] = r.width * dpr; rects[n * 4 + 3] = r.height * dpr;
        rads[n] = Math.min(rad * k * dpr, r.width * dpr / 2, r.height * dpr / 2);
        key += `|${r.left | 0},${r.top | 0},${r.width | 0},${r.height | 0}`;
        n++;
      }
      const { L: f, dim: dm } = live.current;
      const light = getComputedStyle(document.documentElement).getPropertyValue('--bg-light').trim() === '1' ? 1 : 0;
      key += `|${f.bend},${f.edge},${f.rainbow},${f.frost},${f.smoke},${f.shine},${dm},${light}`;
      // video and canvases change by themselves; cap them at ~30 fps, the rest only when something moved
      if (dynamic) { if (now - lastFrame < 32 && key === lastKey) return; }
      else if (!dirty && key === lastKey) return;
      lastKey = key; dirty = false; lastFrame = now;

      if (source) {
        try {
          if (source instanceof HTMLVideoElement) { if (source.readyState < 2) return; srcW = source.videoWidth; srcH = source.videoHeight; }
          else if (source instanceof HTMLCanvasElement) { srcW = source.width; srcH = source.height; }
          if (dynamic || !uploaded) { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); uploaded = true; }
        } catch { /* a frame not ready yet */ }
      }
      // object-fit: cover, centred (how images and videos are shown); canvases already fill the screen
      let mx = 1, my = 1, ox = 0, oy = 0;
      if (cover && source) {
        const s = Math.max(innerWidth / srcW, innerHeight / srcH);
        const dw = srcW * s, dh = srcH * s;
        mx = innerWidth / dw; my = innerHeight / dh; ox = (dw - innerWidth) / 2 / dw; oy = (dh - innerHeight) / 2 / dh;
      }
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (!n) return;
      gl.uniform2f(u.res, W, H);
      gl.uniform4fv(u.rect, rects); gl.uniform1fv(u.rad, rads); gl.uniform1i(u.n, n);
      gl.uniform4f(u.map, mx, my, ox, oy);
      gl.uniform1f(u.edge, f.edge * dpr);
      gl.uniform1f(u.depth, (6 + f.bend * 0.5) * dpr);
      gl.uniform1f(u.rainbow, f.rainbow / 100);
      gl.uniform1f(u.frost, (f.frost / 100) * 14 * dpr);
      gl.uniform1f(u.smoke, 0.04 + (f.smoke / 100) * 0.78);
      gl.uniform1f(u.shine, f.shine / 100);
      gl.uniform1f(u.dim, dm / 100);
      gl.uniform1f(u.light, light);
      gl.uniform1f(u.dpr, dpr);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(draw);
    const lost = (e: Event) => { e.preventDefault(); glFailed(); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener('webglcontextlost', lost); gl.deleteTexture(tex); gl.deleteBuffer(buf); gl.deleteProgram(prog); };
  }, [kind, url, color]);

  return <canvas ref={ref} aria-hidden="true" className="lg-canvas" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
