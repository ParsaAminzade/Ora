// App state: settings + widget layout. Kept in chrome.storage.local (small, synchronous-feeling),
// while bulky data (tasks, notes, events, files) lives in IndexedDB.
import { create } from 'zustand';
import { kvGet, kvSet } from './kv';
import { getWidget } from './widgets';
import { uid } from './db';
import { DEFAULT_PLACE, type Place } from './location';
import { DEFAULT_AI, type AISettings } from './providers/ai';
import { DEFAULT_AREAS, DEFAULT_SENTENCES, type SentenceSettings } from './sentence-settings';
import { DEFAULT_MODE_STATE, DEFAULT_NIGHT, DEFAULT_RULES, builtinModes, BUILTIN_LAYOUTS, type Mode, type ModeRule, type ModeState, type NightSettings } from './modes';

export const GRID = { cols: 24, rowH: 32, gap: 16 } as const;

export interface WidgetInstance {
  id: string;
  type: string;
  /** Column counted from the RIGHT edge (the page is RTL). */
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
}

export type BgKind = 'starfield' | 'scene' | 'shader' | 'image' | 'video' | 'color' | 'html';
export type SceneId = 'galaxy' | 'waves' | 'aurora' | 'orbs';

export interface Background {
  kind: BgKind;
  assetId?: string;
  color: string;
  dim: number;
  /** 3D scene gallery */
  scene: SceneId;
  sceneColor: string;
  speed: number;
  density: number;
  /** Shadertoy-style fragment shader: void mainImage(out vec4 fragColor, in vec2 fragCoord) */
  shader: string;
  fps: 24 | 30 | 60;
  /** HTML/JS background code, kept in IndexedDB (it can be large). */
  htmlId?: string;
}

export const DEFAULT_SHADER = `// iTime, iResolution, iMouse مثل Shadertoy
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float t = iTime * 0.15;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float bands = sin(8.0 * r - t * 4.0 + 3.0 * sin(a * 3.0 + t));
  vec3 col = mix(vec3(0.02, 0.03, 0.06), vec3(0.55, 0.45, 0.85), smoothstep(0.6, 1.0, bands) * (1.0 - r));
  fragColor = vec4(col, 1.0);
}
`;

export interface CalDavSettings {
  enabled: boolean;
  /** Full URL of the calendar collection, e.g. http://localhost:5232/ehsan/nova/ */
  url: string;
  username: string;
  password: string;
}

export const DEFAULT_CALDAV: CalDavSettings = { enabled: false, url: 'http://localhost:5232/me/nova/', username: '', password: '' };

export interface GoogleCal {
  id: string;
  summary: string;
  color: string;
  enabled: boolean;
  writable: boolean;
}

export interface GoogleSettings {
  /** OAuth client ID of type "Web application" from Google Cloud Console. */
  clientId: string;
  connected: boolean;
  calendars: GoogleCal[];
  /** Where new events go: 'local' or a Google calendar id. */
  target: string;
}

export type SearchEngine = 'google' | 'duckduckgo' | 'startpage' | 'bing' | 'searxng';

export interface Settings {
  accent: string;
  /** suggest: ask the engine for suggestions while typing (extension only) · history: remember recent searches on this device */
  search: { engine: SearchEngine; searxngUrl: string; suggest?: boolean; history?: boolean };
  backup: { autoDays: 0 | 1 | 7; includeAssets: boolean };
  panelBlur: number;
  /** The same on the phone (default 2px: a phone screen is small and heavy blur makes it look smeared). */
  panelBlurPhone?: number;
  /** The highest trust step Ora may reach on its own (0–4, «اورآ درباره‌ی تو چه می‌داند»). */
  trustCap?: number;
  /** «لحن اورآ»: how Ora puts data into words (weather, prayer, an empty day). */
  voice?: 'friendly' | 'formal' | 'numbers';
  panelOpacity: number;
  /** Panel material: the premium glass (same as the sentence plate) or the simple flat glass. */
  panelStyle?: 'premium' | 'plain';
  /** Scale the layout to fit the screen height (default on). */
  layoutFit?: boolean;
  /** Prayer reminders (system notification + the Ora eye). */
  prayerReminder?: import('./reminders').PrayerReminder;
  /** Planner: hours per day, estimate buffer, morning/evening rituals. */
  planner?: import('./planner').PlannerSettings;
  /** The big calendar: your own calendars, view, second clock, default reminders. */
  calendar?: import('./calendars').CalendarPrefs;
  /** The coach may bring things up by itself (default on). */
  coachPrompts?: boolean;
  /** Ora steps in when lines are flipped through too fast (default on). */
  bingeGuard?: boolean;
  /** The Ora eye may offer a tip now and then (default on). */
  eyeTips?: boolean;
  background: Background;
  place: Place;
  ai: AISettings;
  google: GoogleSettings;
  caldav: CalDavSettings;
  font: { assetId?: string; name?: string };
  /** Days added to the Umm al-Qura Hijri date to match Iran's official calendar. */
  hijriOffset: number;
  /** Modes, each with its own layout. The active mode's layout is `widgets` in the store. */
  modes: Mode[];
  modeRules: ModeRule[];
  mode: ModeState;
  night: NightSettings;
  sentences: SentenceSettings;
  /** Life areas for tasks (and sentences). */
  areas: string[];
  /** The Ora server: receiving lines and, only with consent, sharing (see core/remote). */
  privacy?: import('./remote').PrivacySettings;
  /** «پروفایل من» */
  profile?: import('./remote').Profile;
  /** The phone layout: card order and hidden cards. */
  phone?: { order?: string[]; hidden?: string[] };
}

export const DEFAULT_SETTINGS: Settings = {
  accent: '#D9B77E',
  search: { engine: 'google', searxngUrl: 'http://localhost:8080' },
  backup: { autoDays: 7, includeAssets: true },
  panelBlur: 24,
  panelOpacity: 4,
  background: {
    kind: 'starfield', color: '#0B0D14', dim: 0,
    scene: 'galaxy', sceneColor: '#B9A4F0', speed: 30, density: 60, shader: DEFAULT_SHADER, fps: 30,
  },
  place: DEFAULT_PLACE,
  ai: DEFAULT_AI,
  google: { clientId: '', connected: false, calendars: [], target: 'local' },
  caldav: DEFAULT_CALDAV,
  font: {},
  hijriOffset: -1,
  modes: [],
  modeRules: DEFAULT_RULES,
  mode: DEFAULT_MODE_STATE,
  night: DEFAULT_NIGHT,
  sentences: DEFAULT_SENTENCES,
  areas: DEFAULT_AREAS,
};

const w = (type: string, x: number, y: number, ww: number, h: number): WidgetInstance => ({
  id: `${type}-default`,
  type,
  x,
  y,
  w: ww,
  h,
  config: { ...(getWidget(type)?.defaultConfig ?? {}) },
});

export const defaultLayout = (): WidgetInstance[] => [
  w('tasks', 0, 0, 6, 14),
  w('notes', 0, 14, 6, 12),
  w('search', 8, 1, 8, 2),
  w('shortcuts', 8, 4, 8, 7),
  w('pomodoro', 7, 19, 5, 7),
  w('weather', 12, 19, 5, 7),
  w('clock', 18, 0, 6, 6),
  w('prayer', 18, 6, 6, 3),
  w('calendar', 18, 9, 6, 16),
  w('sentence', 7, 12, 11, 6),
];

export interface Snapshot {
  schema: 1;
  settings: Settings;
  widgets: WidgetInstance[];
  /** Which open tab wrote it (so tabs can follow each other without echo). */
  by?: string;
}

interface Store {
  loaded: boolean;
  settings: Settings;
  widgets: WidgetInstance[];
  editing: boolean;
  panel: 'none' | 'settings' | 'drawer';
  /** Compile error from the custom background shader (not saved). */
  shaderError: string | null;
  setShaderError(e: string | null): void;
  /** Temporary night-light level shown while adjusting the sliders (not saved). */
  nightPreview: number | null;
  setNightPreview(v: number | null): void;
  load(): Promise<void>;
  setSettings(patch: Partial<Settings>): void;
  updateWidget(id: string, patch: Partial<Omit<WidgetInstance, 'id' | 'type'>>): void;
  setWidgetConfig(id: string, patch: Record<string, unknown>): void;
  addWidget(type: string): void;
  removeWidget(id: string): void;
  bringToFront(id: string): void;
  resetLayout(): void;
  setEditing(v: boolean): void;
  setPanel(p: Store['panel']): void;
  replaceAll(s: Snapshot): void;
  /** Switch mode. `auto` = chosen by a rule (kept so it can switch back later). */
  switchMode(id: string, how?: 'manual' | 'auto'): void;
  /** Save the current page (layout + look) as a new mode. */
  saveAsMode(name: string, icon: string): string;
  updateMode(id: string, patch: Partial<Mode>): void;
  deleteMode(id: string): void;
  resetModeLayout(id: string): void;
}

const KEY = 'nova:state';

/** Fill in defaults for settings saved by an older version. */
const mergeSettings = (saved: Partial<Settings>): Settings => ({
  ...DEFAULT_SETTINGS,
  ...saved,
  background: { ...DEFAULT_SETTINGS.background, ...saved.background },
  place: saved.place ?? DEFAULT_SETTINGS.place,
  ai: { ...DEFAULT_AI, ...saved.ai },
  google: { ...DEFAULT_SETTINGS.google, ...saved.google },
  search: { ...DEFAULT_SETTINGS.search, ...saved.search },
  caldav: { ...DEFAULT_SETTINGS.caldav, ...saved.caldav },
  backup: { ...DEFAULT_SETTINGS.backup, ...saved.backup },
  modes: saved.modes ?? [],
  modeRules: saved.modeRules ?? DEFAULT_RULES,
  mode: { ...DEFAULT_MODE_STATE, ...saved.mode },
  night: { ...DEFAULT_NIGHT, ...saved.night },
  sentences: { ...DEFAULT_SENTENCES, ...saved.sentences, weights: { ...DEFAULT_SENTENCES.weights, ...saved.sentences?.weights }, ganjoor: { ...DEFAULT_SENTENCES.ganjoor, ...saved.sentences?.ganjoor } },
  areas: saved.areas ?? DEFAULT_AREAS,
});

/** Make sure every built-in mode exists (older saves, fresh installs) and the active one is valid. */
function withModes(settings: Settings, widgets: WidgetInstance[]): Settings {
  const have = new Set(settings.modes.map((m) => m.id));
  const missing = builtinModes(widgets).filter((m) => !have.has(m.id));
  let modes = settings.modes.length ? [...settings.modes, ...missing] : builtinModes(widgets);
  modes = modes.map((m) => ({ ...m, block: m.block ?? [], widgets: (m.widgets ?? []).filter((x) => getWidget(x.type)) }));
  const active = modes.some((m) => m.id === settings.mode.active) ? settings.mode.active : 'home';
  return { ...settings, modes, mode: { ...settings.mode, active } };
}

/** Store the live layout back into the active mode. */
const syncActive = (settings: Settings, widgets: WidgetInstance[]): Mode[] =>
  settings.modes.map((m) => (m.id === settings.mode.active ? { ...m, widgets } : m));

const overlaps = (a: WidgetInstance, b: Pick<WidgetInstance, 'x' | 'y' | 'w' | 'h'>) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function findSpot(widgets: WidgetInstance[], ww: number, h: number) {
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x + ww <= GRID.cols; x++) {
      const box = { x, y, w: ww, h };
      if (!widgets.some((o) => overlaps(o, box))) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

export const useStore = create<Store>((set, get) => ({
  loaded: false,
  settings: DEFAULT_SETTINGS,
  widgets: [],
  editing: false,
  panel: 'none',
  shaderError: null,
  setShaderError: (e) => set({ shaderError: e }),
  nightPreview: null,
  setNightPreview: (v) => set({ nightPreview: v }),

  async load() {
    const saved = await kvGet<Snapshot>(KEY);
    if (saved?.schema === 1) {
      const widgets = saved.widgets.filter((x) => getWidget(x.type));
      set({ settings: withModes(mergeSettings(saved.settings), widgets), widgets, loaded: true });
    } else {
      const widgets = defaultLayout();
      set({ settings: withModes(DEFAULT_SETTINGS, widgets), widgets, loaded: true });
    }
  },

  switchMode(id, how = 'manual') {
    const { settings, widgets } = get();
    const target = settings.modes.find((m) => m.id === id);
    if (!target) return;
    const modes = syncActive(settings, widgets);
    const next = modes.find((m) => m.id === id)!;
    const layout = next.widgets.length ? next.widgets : (BUILTIN_LAYOUTS[id]?.() ?? []);
    const mode: ModeState = how === 'auto'
      ? { ...settings.mode, active: id, auto: id }
      : { ...settings.mode, active: id, auto: null, returnTo: null };
    set({ settings: { ...settings, modes, mode }, widgets: layout, editing: false });
  },

  saveAsMode(name, icon) {
    const { settings, widgets } = get();
    const id = `m-${uid().slice(0, 8)}`;
    const cur = settings.modes.find((m) => m.id === settings.mode.active);
    const mode: Mode = { id, name, icon, block: [], widgets: widgets.map((x) => ({ ...x, config: { ...x.config } })), accent: cur?.accent, background: cur?.background, extraDim: cur?.extraDim, tone: cur?.tone };
    set({ settings: { ...settings, modes: [...syncActive(settings, widgets), mode], mode: { ...settings.mode, active: id, auto: null, returnTo: null } } });
    return id;
  },

  updateMode(id, patch) {
    const s = get().settings;
    set({ settings: { ...s, modes: s.modes.map((m) => (m.id === id ? { ...m, ...patch } : m)) } });
  },

  deleteMode(id) {
    const s = get().settings;
    const m = s.modes.find((x) => x.id === id);
    if (!m || m.builtin) return;
    if (s.mode.active === id) get().switchMode('home');
    const s2 = get().settings;
    set({ settings: { ...s2, modes: s2.modes.filter((x) => x.id !== id), modeRules: s2.modeRules.filter((r) => r.mode !== id) } });
  },

  resetModeLayout(id) {
    const s = get().settings;
    const layout = id === 'home' ? defaultLayout() : (BUILTIN_LAYOUTS[id]?.() ?? []);
    set({ settings: { ...s, modes: s.modes.map((m) => (m.id === id ? { ...m, widgets: layout } : m)) } });
    if (s.mode.active === id) set({ widgets: layout });
  },

  setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),

  updateWidget: (id, patch) => set({ widgets: get().widgets.map((x) => (x.id === id ? { ...x, ...patch } : x)) }),

  setWidgetConfig: (id, patch) =>
    set({ widgets: get().widgets.map((x) => (x.id === id ? { ...x, config: { ...x.config, ...patch } } : x)) }),

  addWidget(type) {
    const def = getWidget(type);
    if (!def) return;
    const { w: ww, h } = def.defaultSize;
    const spot = findSpot(get().widgets, ww, h);
    const inst: WidgetInstance = { id: `${type}-${uid().slice(0, 8)}`, type, ...spot, w: ww, h, config: { ...def.defaultConfig } };
    set({ widgets: [...get().widgets, inst] });
  },

  removeWidget: (id) => set({ widgets: get().widgets.filter((x) => x.id !== id) }),

  bringToFront(id) {
    const ws = get().widgets;
    const target = ws.find((x) => x.id === id);
    if (!target || ws[ws.length - 1] === target) return;
    set({ widgets: [...ws.filter((x) => x.id !== id), target] });
  },

  resetLayout: () => {
    const id = get().settings.mode.active;
    set({ widgets: id === 'home' ? defaultLayout() : (BUILTIN_LAYOUTS[id]?.() ?? defaultLayout()) });
  },
  setEditing: (v) => set({ editing: v, panel: v ? get().panel : 'none' }),
  setPanel: (p) => set({ panel: p }),
  replaceAll: (s) => {
    const widgets = s.widgets.filter((x) => getWidget(x.type));
    set({ settings: withModes(mergeSettings(s.settings), widgets), widgets });
  },
}));

/** The look in effect: global settings with the active mode's overrides. */
export function effectiveLook(s: Settings): { accent: string; background: Background } {
  const m = s.modes.find((x) => x.id === s.mode.active);
  const bg = { ...s.background, ...(m?.background ?? {}) };
  return { accent: m?.accent || s.accent, background: { ...bg, dim: Math.min(90, bg.dim + (m?.extraDim ?? 0)) } };
}

export const activeMode = (s: Settings): Mode | undefined => s.modes.find((m) => m.id === s.mode.active);

// Persist settings + layout, debounced. The active mode's stored layout is refreshed on save.
const TAB = Math.random().toString(36).slice(2);
let timer: number | undefined;
let applyingRemote = false;
useStore.subscribe((s, prev) => {
  if (applyingRemote || !s.loaded || (s.settings === prev.settings && s.widgets === prev.widgets)) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const st = useStore.getState();
    const settings = { ...st.settings, modes: syncActive(st.settings, st.widgets) };
    const snap: Snapshot = { schema: 1, settings, widgets: st.widgets, by: TAB };
    void kvSet(KEY, snap);
  }, 250);
});

// Follow changes made in another open Nova tab (mode switches, edits).
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    const snap = changes[KEY]?.newValue as Snapshot | undefined;
    if (area !== 'local' || !snap || snap.by === TAB || !useStore.getState().loaded) return;
    applyingRemote = true;
    try { useStore.getState().replaceAll(snap); } finally { applyingRemote = false; }
  });
}
