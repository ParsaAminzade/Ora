// «از همین امروز»: two one-tap questions on the first day, so Ora is useful today instead of after
// days of silent watching. What you say here stands in for the rhythm Ora hasn't learned yet; as your
// own rhythm fills in, it takes over. Everything stays on this device and shows in «اورآ درباره‌ی تو چه می‌داند».
import { kvGet, kvSet } from './kv';

export type Band = 'morning' | 'noon' | 'evening' | 'night' | 'late';
export const BANDS: [Band, string, number, number][] = [
  ['morning', 'صبح', 6, 12], ['noon', 'ظهر', 12, 16], ['evening', 'عصر', 16, 20], ['night', 'شب', 20, 24], ['late', 'نصف‌شب', 0, 4],
];
/** «کِی بهت تلنگر بزنم؟» */
export type When = 'needed' | 'my-hours' | 'asked';
export interface SelfReport { bands: Band[]; dontKnow?: boolean; when?: When; at: number }
const KEY = 'ora:self-report';
export const loadSelf = () => kvGet<SelfReport>(KEY);
export const saveSelf = (s: SelfReport) => kvSet(KEY, s);
export const eraseSelf = () => kvSet(KEY, null);
export const inBands = (bands: Band[], h: number) => bands.some((b) => { const r = BANDS.find(([k]) => k === b)!; return h >= r[2] && h < r[3]; });
export const bandLabel = (bands: Band[]) => bands.map((b) => BANDS.find(([k]) => k === b)![1]).join('، ');
