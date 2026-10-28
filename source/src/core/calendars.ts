// Your own calendars on this browser (شخصی، کار، دانشگاه…), each with a colour that can be shown or
// hidden, plus the calendar view preferences.
import { useStore } from './state';

export interface LocalCal { id: string; name: string; color: string; hidden?: boolean; default?: boolean }
export interface CalendarPrefs {
  cals: LocalCal[];
  /** Last view used in the big calendar. */
  view: 'day' | '3day' | 'week' | 'month' | 'agenda' | 'insights';
  /** A second clock beside the hours (IANA zone), e.g. Asia/Tehran. */
  secondTz?: string;
  /** Default reminders for new timed events (minutes before). */
  defaultRemind: number[];
  /** Hide tasks that are done from the grid. */
  hideDone?: boolean;
  /** Show the side panel. */
  side?: boolean;
  /** Zoom of the time grid: pixels per hour. */
  zoom?: number;
}
export const DEFAULT_CALS: LocalCal[] = [{ id: 'personal', name: 'شخصی', color: '#D9B77E', default: true }];
export const DEFAULT_CAL_PREFS: CalendarPrefs = { cals: DEFAULT_CALS, view: 'week', defaultRemind: [10], side: true };

export const calPrefs = (): CalendarPrefs => ({ ...DEFAULT_CAL_PREFS, ...useStore.getState().settings.calendar });
export const localCalendars = (): LocalCal[] => { const c = calPrefs().cals; return c.length ? c : DEFAULT_CALS; };
export function setCalPrefs(p: Partial<CalendarPrefs>): void {
  const st = useStore.getState();
  st.setSettings({ calendar: { ...calPrefs(), ...p } });
}
export const calOf = (id?: string) => localCalendars().find((c) => c.id === id) ?? localCalendars().find((c) => c.default) ?? localCalendars()[0];

/** Common zones for the second clock. */
export const TZ_PRESETS: [string, string][] = [
  ['Asia/Tehran', 'تهران'], ['America/Chicago', 'تگزاس (مرکزی آمریکا)'], ['America/New_York', 'نیویورک'], ['America/Los_Angeles', 'کالیفرنیا'],
  ['Europe/London', 'لندن'], ['Europe/Berlin', 'برلین'], ['Europe/Istanbul', 'استانبول'], ['Asia/Dubai', 'دبی'], ['Asia/Tokyo', 'توکیو'], ['Australia/Sydney', 'سیدنی'], ['UTC', 'UTC'],
];
export const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const tzLabel = (tz: string) => TZ_PRESETS.find(([z]) => z === tz)?.[1].replace(/ \(.*\)$/, '') ?? tz.split('/').pop()!.replace(/_/g, ' ');
/** Wall-clock HH:mm in `tz` at a local day + minute. */
export function clockIn(tz: string, day: string, min: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1, d, 0, min);
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t); } catch { return ''; }
}
