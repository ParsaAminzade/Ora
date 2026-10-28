import { useEffect, useRef, useState } from 'react';
import { effectiveLook, useStore } from '../core/state';
import { useAssetUrl } from './hooks';
import type { SceneParams } from '../bg/three';
import { safeMode } from '../core/health';
import { db } from '../core/db';
import { noteStill } from '../core/backgrounds';

/** Twinkling, slowly drifting starfield with gentle mouse parallax. 30fps cap, stops when the tab is hidden. */
function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0, last = 0;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    type Star = { x: number; y: number; z: number; r: number; p: number; s: number };
    let stars: Star[] = [];

    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = innerWidth; h = innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round((w * h) / 1800);
      stars = Array.from({ length: count }, () => {
        const z = Math.random() ** 2 * 0.9 + 0.1;
        return { x: Math.random() * w, y: Math.random() * h, z, r: 0.4 + z * 1.1, p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() * 1.6 };
      });
    };

    const draw = (t: number) => {
      ctx.fillStyle = '#05060A';
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w * 0.52, h * 0.58, 0, w * 0.52, h * 0.58, Math.max(w, h) * 0.55);
      g.addColorStop(0, 'rgba(150,140,200,0.10)');
      g.addColorStop(1, 'rgba(150,140,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      for (const s of stars) {
        if (!reduced) {
          s.x += 0.03 * s.z;
          if (s.x > w + 2) s.x = -2;
        }
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.001 * s.s + s.p)) * s.z;
        const px = s.x + mouse.x * s.z * 14;
        const py = s.y + mouse.y * s.z * 14;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 33) return;
      last = t;
      draw(t);
    };
    const start = () => { if (!raf && !reduced) raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const onVis = () => (document.hidden ? stop() : start());
    const onMove = (e: PointerEvent) => { mouse.tx = e.clientX / w - 0.5; mouse.ty = e.clientY / h - 0.5; };
    const onResize = () => { resize(); draw(performance.now()); };

    resize();
    draw(0);
    start();
    addEventListener('resize', onResize);
    addEventListener('pointermove', onMove);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      removeEventListener('resize', onResize);
      removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

/** Three.js scene or custom shader, loaded on demand. */
function ThreeBg() {
  const ref = useRef<HTMLCanvasElement>(null);
  const settings = useStore((s) => s.settings);
  const bg = effectiveLook(settings).background;
  const setShaderError = useStore((s) => s.setShaderError);
  const handle = useRef<{ update(p: SceneParams): void; dispose(): void; snapshot(): string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const params: SceneParams = {
    kind: bg.kind === 'shader' ? 'shader' : 'scene',
    scene: bg.scene, color: bg.sceneColor, speed: bg.speed, density: bg.density, fps: bg.fps, shader: bg.shader,
  };
  const latest = useRef(params);
  latest.current = params;

  useEffect(() => {
    let alive = true;
    void import('../bg/three').then(({ mountBackground }) => {
      if (!alive || !ref.current) return;
      try {
        handle.current = mountBackground(ref.current, latest.current, setShaderError);
      } catch {
        setShaderError('WebGL در دسترس نیست؛ آسمان پرستاره جایگزین شد.');
        setFailed(true);
      }
    }).catch(() => setFailed(true));
    return () => { alive = false; handle.current?.dispose(); handle.current = null; };
  }, [setShaderError]);

  useEffect(() => { handle.current?.update(params); });

  // A still for the gallery / settings preview, a moment after the look changes.
  const lookKey = `${bg.kind}|${bg.scene}|${bg.sceneColor}|${bg.shader.length}|${bg.shader.slice(0, 64)}`;
  useEffect(() => {
    const t = window.setTimeout(() => { const url = handle.current?.snapshot() ?? null; void noteStill(bg, url); }, 1600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey]);

  if (failed) return <Starfield />;
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

/** Your own HTML/JS page as the background, in an isolated frame; the mouse is forwarded to it. */
function HtmlBg({ id }: { id: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let html = '';
    let alive = true;
    const frame = ref.current!;
    let snapTimer = 0;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return;
      if (e.data?.novaBg === 'ready') {
        frame.contentWindow?.postMessage({ novaBg: 'load', html }, '*');
        snapTimer = window.setTimeout(() => frame.contentWindow?.postMessage({ novaBg: 'snap' }, '*'), 1800);
      } else if (e.data?.novaBg === 'still') {
        void noteStill({ kind: 'html', htmlId: id }, typeof e.data.url === 'string' ? e.data.url : null);
      }
    };
    const onMove = (e: PointerEvent) => frame.contentWindow?.postMessage({ novaBg: 'pointer', x: e.clientX, y: e.clientY }, '*');
    void db.assets.get(id).then(async (a) => {
      if (!alive || !a) return;
      html = await a.blob.text();
      addEventListener('message', onMsg);
      frame.src = 'bgframe.html';
    });
    addEventListener('pointermove', onMove);
    return () => { alive = false; window.clearTimeout(snapTimer); removeEventListener('message', onMsg); removeEventListener('pointermove', onMove); };
  }, [id]);
  return <iframe ref={ref} title="پس‌زمینه‌ی HTML" tabIndex={-1} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, pointerEvents: 'none', background: '#05060A' }} />;
}

function VideoBg({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current!;
    const onVis = () => (document.hidden ? v.pause() : void v.play().catch(() => {}));
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return <video ref={ref} src={src} autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />;
}

export function Background() {
  const settings = useStore((s) => s.settings);
  const saved = effectiveLook(settings).background;
  const bg = safeMode ? { ...saved, kind: 'color' as const, color: '#0B0D14', dim: 0 } : saved;
  const url = useAssetUrl(bg.kind === 'image' || bg.kind === 'video' ? bg.assetId : undefined);

  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, background: bg.kind === 'color' ? bg.color : '#05060A' }}>
      {bg.kind === 'starfield' && <Starfield />}
      {(bg.kind === 'scene' || bg.kind === 'shader') && <ThreeBg />}
      {bg.kind === 'image' && url && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      )}
      {bg.kind === 'video' && url && <VideoBg src={url} />}
      {bg.kind === 'html' && bg.htmlId && <HtmlBg key={bg.htmlId} id={bg.htmlId} />}
      {bg.dim > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${bg.dim / 100})` }} />}
    </div>
  );
}
