// Live 3D backgrounds (Three.js). Loaded on demand, only when a 3D scene or custom shader is chosen.
// One renderer, one loop: frame-rate cap, pauses when the tab is hidden, gentle mouse parallax.
import * as THREE from 'three';
import type { SceneId } from '../core/state';

export interface SceneParams {
  kind: 'scene' | 'shader';
  scene: SceneId;
  color: string;
  /** 0–100 */
  speed: number;
  /** 0–100 */
  density: number;
  fps: number;
  shader: string;
}

interface Built {
  scene: THREE.Scene;
  camera: THREE.Camera;
  tick(t: number, dt: number, mouse: THREE.Vector2): void;
  resize?(w: number, h: number): void;
  /** The scene's own animation clock (exposed on the canvas for tests). */
  clock?(): number;
  dispose(): void;
}

const disposeScene = (scene: THREE.Scene) =>
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
  });

const softDot = /* glsl */ `
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
`;

/* ---------------- Galaxy: spiral arms of additive particles ---------------- */
function galaxy(p: SceneParams, aspect: number): Built {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 200);
  camera.position.set(0, 3.2, 7.5);
  camera.lookAt(0, 0, 0);

  const count = Math.round(20000 + p.density * 1000);
  const arms = 3;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const inner = new THREE.Color('#FFE9C9');
  const outer = new THREE.Color(p.color);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = Math.pow(Math.random(), 1.6) * 6;
    const arm = ((i % arms) / arms) * Math.PI * 2;
    const spin = r * 1.05;
    const spread = (0.35 + r * 0.08);
    const rx = (Math.random() - 0.5) * spread * Math.pow(Math.random(), 2) * 3;
    const ry = (Math.random() - 0.5) * spread * Math.pow(Math.random(), 3) * 1.2;
    const rz = (Math.random() - 0.5) * spread * Math.pow(Math.random(), 2) * 3;
    pos[i * 3] = Math.cos(arm + spin) * r + rx;
    pos[i * 3 + 1] = ry;
    pos[i * 3 + 2] = Math.sin(arm + spin) * r + rz;
    c.copy(inner).lerp(outer, Math.min(1, r / 4.5));
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = Math.random() * 1.5 + 0.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: Math.min(devicePixelRatio, 1.5) } },
    vertexShader: /* glsl */ `
      attribute float size; varying vec3 vColor; uniform float uPx;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPx * (9.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() { ${softDot} gl_FragColor = vec4(vColor, a * 0.9); }`,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.rotation.x = 0.25;
  scene.add(points);
  scene.add(starShell(1800));

  return {
    scene,
    camera,
    tick(_t, dt, mouse) {
      points.rotation.y += dt * 0.00004 * (5 + p.speed);
      camera.position.x += (mouse.x * 1.6 - camera.position.x) * 0.03;
      camera.position.y += (3.2 - mouse.y * 1.2 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, 0);
    },
    resize: (w, h) => { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    dispose: () => disposeScene(scene),
  };
}

/** A sphere of faint background stars. */
function starShell(n: number) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 40);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false }));
}

/* ---------------- Waves: a field of dots riding slow sine swells ---------------- */
function waves(p: SceneParams, aspect: number): Built {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
  camera.position.set(0, 2.2, 6);
  camera.lookAt(0, 0, -4);
  const seg = Math.round(90 + p.density * 1.4);
  const geo = new THREE.PlaneGeometry(36, 36, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(p.color) }, uPx: { value: Math.min(devicePixelRatio, 1.5) } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uPx; varying float vFade; varying float vH;
      void main() {
        vec3 p = position;
        float h = sin(p.x * 0.45 + uTime * 0.6) * 0.35 + sin(p.z * 0.6 + uTime * 0.45) * 0.3 + sin((p.x + p.z) * 0.25 + uTime * 0.3) * 0.4;
        p.y += h; vH = h;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vFade = smoothstep(26.0, 4.0, -mv.z);
        gl_PointSize = uPx * 2.2 * (6.0 / -mv.z) + 0.6;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying float vFade; varying float vH;
      void main() { ${softDot} vec3 c = mix(uColor * 0.55, vec3(1.0), smoothstep(0.4, 1.1, vH) * 0.5); gl_FragColor = vec4(c, a * vFade); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  scene.add(starShell(900));
  return {
    scene,
    camera,
    clock: () => mat.uniforms.uTime.value,
    tick(_t, dt, mouse) {
      mat.uniforms.uTime.value += dt * 0.001 * (0.2 + p.speed / 50);
      camera.position.x += (mouse.x * 1.2 - camera.position.x) * 0.03;
      camera.lookAt(0, 0, -4);
    },
    resize: (w, h) => { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    dispose: () => disposeScene(scene),
  };
}

/* ---------------- Full-screen fragment shaders (aurora + your own) ---------------- */
function fullscreen(fragment: string, extraUniforms: Record<string, THREE.IUniform> = {}): Built & { mat: THREE.ShaderMaterial } {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector3(1, 1, 1) },
      iMouse: { value: new THREE.Vector4() },
      ...extraUniforms,
    },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  return {
    scene,
    camera,
    mat,
    tick() {},
    dispose: () => disposeScene(scene),
  };
}

const SHADERTOY_HEADER = /* glsl */ `
uniform float iTime; uniform vec3 iResolution; uniform vec4 iMouse;
`;

function aurora(p: SceneParams): Built {
  const frag = SHADERTOY_HEADER + /* glsl */ `
uniform vec3 uColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }
void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 m = iMouse.xy * 0.05;
  float t = iTime;
  vec3 col = mix(vec3(0.01, 0.015, 0.035), vec3(0.02, 0.04, 0.08), uv.y);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float y = 0.55 + 0.12 * fk + 0.08 * sin(uv.x * 3.0 + t * 0.3 + fk * 2.0) + 0.1 * (fbm(vec2(uv.x * 2.5 + t * 0.05 + fk + m.x, t * 0.04)) - 0.5);
    float band = exp(-pow((uv.y - y) * (9.0 - fk * 1.5), 2.0));
    float curtain = fbm(vec2(uv.x * 14.0 + fk * 7.0 + m.x * 3.0, uv.y * 2.0 - t * 0.2));
    vec3 hue = mix(uColor, vec3(0.35, 0.95, 0.75), 0.35 + 0.3 * sin(fk + uv.x * 2.0));
    col += hue * band * (0.3 + 0.8 * curtain) * (0.42 - fk * 0.1);
  }
  float s = step(0.9975, hash(floor(gl_FragCoord.xy * 0.5))) * (0.5 + 0.5 * sin(t * 2.0 + hash(floor(gl_FragCoord.xy)) * 6.28));
  col += vec3(s) * (1.0 - uv.y * 0.3) * 0.7;
  gl_FragColor = vec4(col, 1.0);
}`;
  const b = fullscreen(frag, { uColor: { value: new THREE.Color(p.color) } });
  return { ...b, tick(_t, dt, mouse) { b.mat.uniforms.iTime.value += dt * 0.001 * (0.25 + p.speed / 40); b.mat.uniforms.iMouse.value.set(mouse.x * 10, mouse.y * 10, 0, 0); }, resize: (w, h) => b.mat.uniforms.iResolution.value.set(w * pr(), h * pr(), 1) };
}

function custom(p: SceneParams): Built {
  const frag = SHADERTOY_HEADER + p.shader + '\nvoid main() { mainImage(gl_FragColor, gl_FragCoord.xy); }\n';
  const b = fullscreen(frag);
  return {
    ...b,
    tick(t, _dt, mouse) {
      b.mat.uniforms.iTime.value = t * 0.001;
      const r = b.mat.uniforms.iResolution.value as THREE.Vector3;
      b.mat.uniforms.iMouse.value.set((mouse.x + 0.5) * r.x, (0.5 - mouse.y) * r.y, 0, 0);
    },
    resize: (w, h) => b.mat.uniforms.iResolution.value.set(w * pr(), h * pr(), 1),
  };
}

/* ---------------- Orbs: glossy spheres drifting in fog ---------------- */
function orbs(p: SceneParams, aspect: number): Built {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05060a, 6, 22);
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
  camera.position.set(0, 0, 10);
  const accent = new THREE.Color(p.color);
  scene.add(new THREE.HemisphereLight(0x9aa4c0, 0x05060a, 0.5));
  const key = new THREE.PointLight(accent, 2.4, 0, 0);
  key.position.set(4, 4, 6);
  const rim = new THREE.PointLight(0x9fc7e8, 1.4, 0, 0);
  rim.position.set(-6, -3, 2);
  scene.add(key, rim);
  const n = Math.round(8 + p.density * 0.3);
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3e4a, metalness: 0.35, roughness: 0.3 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const seeds = Array.from({ length: n }, () => ({
    x: (Math.random() - 0.5) * 16, y: (Math.random() - 0.5) * 9, z: -Math.random() * 12,
    s: 0.25 + Math.random() * 0.9, ph: Math.random() * Math.PI * 2, sp: 0.3 + Math.random() * 0.7,
  }));
  scene.add(mesh);
  scene.add(starShell(700));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let phase = 0;
  return {
    scene,
    camera,
    tick(_t, dt, mouse) {
      phase += dt * 0.0003 * (0.3 + p.speed / 40);
      const k = phase;
      seeds.forEach((s, i) => {
        v.set(s.x + Math.sin(k * s.sp + s.ph) * 0.8, s.y + Math.cos(k * s.sp * 1.3 + s.ph) * 0.6, s.z);
        sc.setScalar(s.s);
        m4.compose(v, q, sc);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      camera.position.x += (mouse.x * 1.5 - camera.position.x) * 0.03;
      camera.position.y += (-mouse.y * 1 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, -4);
    },
    resize: (w, h) => { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    dispose: () => disposeScene(scene),
  };
}

const pr = () => Math.min(devicePixelRatio || 1, 1.5);

/* ---------------- Mount ---------------- */
/** Draw any canvas into a 320×200 JPEG data URL (cover-fit). */
export function shrink(src: HTMLCanvasElement): string | null {
  try {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 200;
    const g = c.getContext('2d')!;
    const sw = src.width, sh = src.height;
    if (!sw || !sh) return null;
    const k = Math.max(c.width / sw, c.height / sh);
    g.drawImage(src, (c.width - sw * k) / 2, (c.height - sh * k) / 2, sw * k, sh * k);
    return c.toDataURL('image/jpeg', 0.78);
  } catch { return null; }
}

export function mountBackground(canvas: HTMLCanvasElement, initial: SceneParams, onError: (msg: string | null) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(pr());
  renderer.setClearColor(0x05060a, 1);
  let shaderError: string | null = null;
  renderer.debug.onShaderError = (gl, _program, vs, fs) => {
    const log = (gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || 'خطای ناشناخته').trim();
    shaderError = log;
  };

  // Scenes keep a reference to this object, so speed/fps changes apply live without a rebuild.
  let params: SceneParams = { ...initial };
  let built: Built | null = null;
  const mouse = new THREE.Vector2();
  const target = new THREE.Vector2();
  let raf = 0, last = 0, prev = 0, w = 0, h = 0;

  const build = () => {
    built?.dispose();
    shaderError = null;
    const aspect = w / h || 1;
    built = params.kind === 'shader' ? custom(params)
      : params.scene === 'waves' ? waves(params, aspect)
      : params.scene === 'aurora' ? aurora(params)
      : params.scene === 'orbs' ? orbs(params, aspect)
      : galaxy(params, aspect);
    built.resize?.(w, h);
    renderer.compile(built.scene, built.camera);
    renderer.render(built.scene, built.camera);
    onError(shaderError);
  };
  const resize = () => {
    w = innerWidth; h = innerHeight;
    renderer.setSize(w, h, false);
    built?.resize?.(w, h);
  };
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    if (t - last < 1000 / params.fps - 2) return;
    const dt = prev ? Math.min(t - prev, 100) : 16;
    prev = t; last = t;
    mouse.lerp(target, 0.06);
    built!.tick(t, dt, mouse);
    renderer.render(built!.scene, built!.camera);
    if (built!.clock) canvas.dataset.clock = built!.clock().toFixed(3);
  };
  const start = () => { if (!raf) { prev = 0; raf = requestAnimationFrame(loop); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  const onVis = () => (document.hidden ? stop() : start());
  const onMove = (e: PointerEvent) => target.set(e.clientX / w - 0.5, e.clientY / h - 0.5);

  resize();
  build();
  start();
  addEventListener('resize', resize);
  addEventListener('pointermove', onMove);
  document.addEventListener('visibilitychange', onVis);

  /** A small still of the current frame (for the gallery and the settings preview). */
  const snapshot = (): string | null => {
    if (!built) return null;
    renderer.render(built.scene, built.camera);
    return shrink(renderer.domElement);
  };

  return {
    snapshot,
    update(next: SceneParams) {
      const rebuild = next.kind !== params.kind || next.scene !== params.scene || next.color !== params.color || next.density !== params.density || next.shader !== params.shader;
      if (rebuild) { params = { ...next }; build(); } else Object.assign(params, next);
    },
    dispose() {
      stop();
      removeEventListener('resize', resize);
      removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
      built?.dispose();
      renderer.dispose();
    },
  };
}
