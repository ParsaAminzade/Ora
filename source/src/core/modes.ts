// Modes ("حالت‌ها"): one click (or Alt+number, or an automatic rule) swaps the whole page —
// its own widget layout, accent, background, assistant tone and blocked sites.
// Also: the evening light curve that slowly dims and warms the page from sunset to bedtime.
import type { Background, WidgetInstance } from './state';
import { getWidget } from './widgets';
import { prayerTimes } from './prayer';
import type { Place } from './location';

export interface Mode {
  id: string;
  name: string;
  /** A short glyph (emoji or a letter). */
  icon: string;
  builtin?: boolean;
  accent?: string;
  background?: Partial<Background>;
  /** Extra darkening on top of the background, 0–80. */
  extraDim?: number;
  /** Added to the assistant's system prompt while this mode is on. */
  tone?: string;
  /** Uploaded font (asset id) for the whole page in this mode. */
  font?: string;
  /** Font for the background sentence: an asset id, 'naskh' or 'vazir'. */
  sentenceFont?: string;
  /** Domains closed while this mode is on, e.g. instagram.com */
  block: string[];
  widgets: WidgetInstance[];
}

export type RuleKind = 'time' | 'offline' | 'event';

export interface ModeRule {
  id: string;
  enabled: boolean;
  kind: RuleKind;
  mode: string;
  /** time rules: HH:mm, may wrap past midnight */
  from?: string;
  to?: string;
  /** time rules: JS weekdays (0 = Sunday). Empty = every day. */
  days?: number[];
  /** event rules: part of the event title */
  match?: string;
}

export interface ModeState {
  active: string;
  /** Mode the rules asked for last time we looked (so a rule fires once, not on every tab). */
  lastTarget: string | null;
  /** Mode that a rule switched to (null after a manual switch). */
  auto: string | null;
  /** Where to go back when the rule stops. */
  returnTo: string | null;
}

export interface NightSettings {
  enabled: boolean;
  /** Full darkness is reached at this time (HH:mm). Starts at sunset. */
  bedtime: string;
  /** 0–70: how dark at full night. */
  maxDim: number;
  /** 0–100: how warm (less blue) at full night. */
  warmth: number;
  /** Minutes after sunrise to fade back to normal. */
  wake: number;
}

export const DEFAULT_NIGHT: NightSettings = { enabled: true, bedtime: '23:30', maxDim: 35, warmth: 45, wake: 45 };
export const DEFAULT_MODE_STATE: ModeState = { active: 'home', lastTarget: null, auto: null, returnTo: null };

const wi = (id: string, type: string, x: number, y: number, w: number, h: number, config: Record<string, unknown> = {}): WidgetInstance => ({
  id, type, x, y, w, h, config: { ...(getWidget(type)?.defaultConfig ?? {}), ...config },
});

/** Shared ids (tasks-default, notes-default) keep the same note/list across modes. */
export const BUILTIN_LAYOUTS: Record<string, () => WidgetInstance[]> = {
  work: () => [
    wi('tasks-default', 'tasks', 0, 0, 7, 16),
    wi('notes-default', 'notes', 0, 16, 7, 10),
    wi('search-default', 'search', 8, 1, 8, 2),
    wi('pomodoro-work', 'pomodoro', 9, 5, 6, 6),
    wi('sentence-work', 'sentence', 8, 12, 9, 5),
    wi('clock-default', 'clock', 18, 0, 6, 5),
    wi('calendar-default', 'calendar', 18, 5, 6, 16),
  ],
  tired: () => [
    wi('clock-tired', 'clock', 9, 1, 6, 6),
    wi('onetask-default', 'onetask', 7, 8, 10, 8),
    wi('pomodoro-tired', 'pomodoro', 9, 17, 6, 6, { focusMin: 10, breakMin: 5 }),
    wi('sentence-tired', 'sentence', 18, 8, 6, 8),
  ],
  sad: () => [
    wi('calm-default', 'calm', 6, 1, 12, 17),
    wi('clock-sad', 'clock', 19, 0, 5, 6),
  ],
  night: () => [
    wi('clock-default', 'clock', 18, 0, 6, 6),
    wi('prayer-default', 'prayer', 18, 6, 6, 3),
    wi('agenda-night', 'agenda', 0, 0, 7, 12, { days: 2 }),
    wi('notes-default', 'notes', 8, 4, 8, 12),
    wi('sentence-night', 'sentence', 8, 17, 9, 6),
  ],
  offline: () => [
    wi('offline-default', 'offline', 18, 0, 6, 11),
    wi('calendar-default', 'calendar', 18, 11, 6, 16),
    wi('tasks-default', 'tasks', 0, 0, 7, 14),
    wi('notes-default', 'notes', 0, 14, 7, 12),
    wi('assistant-default', 'assistant', 8, 0, 9, 18),
  ],
  present: () => [
    wi('clock-present', 'clock', 9, 2, 6, 6),
    wi('search-default', 'search', 8, 9, 8, 2),
    wi('shortcuts-default', 'shortcuts', 8, 12, 8, 7),
  ],
};

export function builtinModes(homeWidgets: WidgetInstance[]): Mode[] {
  return [
    { id: 'home', name: 'عادی', icon: '◐', builtin: true, block: [], widgets: homeWidgets },
    { id: 'work', name: 'کار', icon: '◆', builtin: true, block: [], widgets: BUILTIN_LAYOUTS.work(),
      tone: 'کاربر در حالت کار است: کوتاه، دقیق و عملی جواب بده.' },
    { id: 'tired', name: 'خستگی', icon: '☕', builtin: true, block: [], widgets: BUILTIN_LAYOUTS.tired(),
      accent: '#E9B48F', extraDim: 30,
      tone: 'کاربر خسته است: کوتاه و مهربان جواب بده، فشار نیاور، کارهای خیلی کوچک و استراحت کوتاه پیشنهاد بده.' },
    { id: 'sad', name: 'دل‌گرفته', icon: '☂', builtin: true, block: [], widgets: BUILTIN_LAYOUTS.sad(),
      accent: '#9FC7E8', background: { kind: 'scene', scene: 'waves', sceneColor: '#7FA7C9', speed: 12, density: 40 },
      tone: 'کاربر دل‌گرفته است: همدل و آرام باش، اول گوش بده، نصیحت و برنامه تحمیل نکن. اگر حرفی از آسیب زدن به خود شد، با مهربانی پیشنهاد کن با یک آدم مورد اعتماد یا خط کمک تماس بگیرد.' },
    { id: 'night', name: 'شب', icon: '☾', builtin: true, block: [], widgets: BUILTIN_LAYOUTS.night(),
      accent: '#9FC7E8', background: { kind: 'starfield' },
      tone: 'شب است: آرام و کوتاه جواب بده و کار سنگین تازه پیشنهاد نکن.' },
    { id: 'offline', name: 'آفلاین', icon: '⊘', builtin: true, block: [], widgets: BUILTIN_LAYOUTS.offline() },
    { id: 'present', name: 'ارائه', icon: '▣', builtin: true, block: [], widgets: BUILTIN_LAYOUTS.present() },
  ];
}

export const DEFAULT_RULES: ModeRule[] = [
  { id: 'r-offline', enabled: true, kind: 'offline', mode: 'offline' },
  { id: 'r-night', enabled: true, kind: 'time', mode: 'night', from: '22:30', to: '05:00', days: [] },
];

/* ---------- clock (overridable for testing with ?now=2026-10-05T21:00) ---------- */
const nowParam = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('now') : null;
const nowBase = nowParam ? Date.parse(nowParam) : NaN;
const realStart = Date.now();
export const nowDate = (): Date => (Number.isFinite(nowBase) ? new Date(nowBase + (Date.now() - realStart)) : new Date());

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return ((h || 0) * 60 + (m || 0)) % 1440;
};
const minOf = (d: Date) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
/** Forward distance in minutes from a to b on a 24h circle. */
const fwd = (a: number, b: number) => (((b - a) % 1440) + 1440) % 1440;

export function inTimeWindow(now: Date, from: string, to: string, days: number[] = []): boolean {
  const f = toMin(from), t = toMin(to), m = minOf(now);
  const span = fwd(f, t) || 1440;
  const into = fwd(f, m);
  if (into >= span) return false;
  if (!days.length) return true;
  // The weekday is the one on which the window started.
  const started = new Date(now.getTime() - into * 60_000);
  return days.includes(started.getDay());
}

/* ---------- evening light ---------- */
const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

/** 0 = normal day light … 1 = full night. Ramps from sunset to bedtime, holds, fades out after sunrise. */
export function nightLevel(now: Date, sunsetMin: number, sunriseMin: number, n: NightSettings): number {
  if (!n.enabled) return 0;
  const m = minOf(now);
  const toBed = fwd(sunsetMin, toMin(n.bedtime)) || 1;
  const toRise = fwd(sunsetMin, sunriseMin);
  const since = fwd(sunsetMin, m);
  if (since <= Math.min(toBed, toRise)) return smooth(since / toBed);
  if (since <= toRise) return 1;
  const afterRise = fwd(sunriseMin, m);
  if (afterRise < n.wake) return 1 - smooth(afterRise / n.wake);
  return 0;
}

export function sunTimes(place: Place, day: Date): { sunset: number; sunrise: number; maghrib: number } {
  try {
    const list = prayerTimes(place, day);
    const get = (k: string) => list.find((t) => t.key === k)!.time;
    const sunset = minOf(get('sunset'));
    return { sunset, sunrise: minOf(get('sunrise')), maghrib: Math.max(sunset + 5, minOf(get('maghrib'))) };
  } catch {
    return { sunset: 18 * 60, sunrise: 6 * 60, maghrib: 18 * 60 + 18 };
  }
}

/** 0…1: the warm golden light, only between sunset and the maghrib call — eases in, holds, eases out. */
export function sunsetGlow(now: Date, sunsetMin: number, maghribMin: number, n: NightSettings): number {
  if (!n.enabled) return 0;
  const len = fwd(sunsetMin, maghribMin) || 1;
  const since = fwd(sunsetMin, minOf(now));
  if (since > len) return 0;
  const t = since / len, edge = 0.3;
  return t < edge ? smooth(t / edge) : t > 1 - edge ? smooth((1 - t) / edge) : 1;
}

export const fmtMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

/* ---------- blocking sites while a mode is on ---------- */
const BLOCK_BASE = 7000;

export const cleanDomain = (s: string) =>
  s.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];

export const domainOrigins = (domains: string[]) => domains.flatMap((d) => [`*://${d}/*`, `*://*.${d}/*`]);

/** Ask for access to the sites (needs a click). Returns true when granted. */
export async function requestBlockPermission(domains: string[]): Promise<boolean> {
  if (!domains.length || typeof chrome === 'undefined' || !chrome.permissions) return true;
  try {
    return await chrome.permissions.request({ origins: domainOrigins(domains) });
  } catch {
    return false;
  }
}

export async function hasBlockPermission(domains: string[]): Promise<boolean> {
  if (!domains.length || typeof chrome === 'undefined' || !chrome.permissions) return true;
  try { return await chrome.permissions.contains({ origins: domainOrigins(domains) }); } catch { return false; }
}

/** Replace the mode block rules with the active mode's list. Rules persist until the next switch. */
export async function applyBlockRules(mode: Mode | undefined): Promise<void> {
  const dnr = typeof chrome !== 'undefined' ? chrome.declarativeNetRequest : undefined;
  if (!dnr?.updateDynamicRules) return;
  const existing = await dnr.getDynamicRules();
  const removeRuleIds = existing.filter((r) => r.id >= BLOCK_BASE && r.id < BLOCK_BASE + 1000).map((r) => r.id);
  const domains = (mode?.block ?? []).map(cleanDomain).filter(Boolean);
  const addRules: chrome.declarativeNetRequest.Rule[] = domains.slice(0, 900).map((d, i) => ({
    id: BLOCK_BASE + i,
    priority: 1,
    action: {
      type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
      redirect: { extensionPath: `/blocked.html?mode=${encodeURIComponent(mode!.name)}&site=${encodeURIComponent(d)}` },
    },
    condition: { requestDomains: [d], resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType] },
  }));
  await dnr.updateDynamicRules({ removeRuleIds, addRules });
}
