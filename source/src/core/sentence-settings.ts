// Kept apart from sentences.ts so state.ts can import the defaults without an import cycle.
export type SourceGroup = 'nova' | 'classic' | 'mine' | 'insight' | 'packs' | 'api' | 'ai';

export interface SentenceSettings {
  weights: Record<SourceGroup, number>;
  rotate: 'tab' | 'hour' | 'day';
  font: 'naskh' | 'vazir' | 'custom';
  apiUrl: string;
  apiName: string;
  /** Last successful API fetch / model line (ms). */
  apiLast: number;
  aiLast: number;
  /** Add the sentence widget to the page once. */
  placed: boolean;
  /** Look: size step, font weight and what sits behind the words. */
  size: 'm' | 'l' | 'xl';
  weight: 400 | 500 | 600 | 700;
  /** glass = frosted plate with a fine lit edge · bevel = raised plate · halo = soft shade only · none */
  frame: 'glass' | 'bevel' | 'halo' | 'none';
  /** Taste learning: how fast old feedback fades (days) and how often to try something new (0–0.3). */
  halfLife: number;
  explore: number;
  /** Shown the one-minute taste test offer. */
  tasteTestDone: boolean;
  /** Real classical poetry from ganjoor.net, cached for offline use. */
  ganjoor: { enabled: boolean; poets: number[]; perDay: number; last: number };
}

export const DEFAULT_SENTENCES: SentenceSettings = {
  weights: { nova: 7, classic: 5, mine: 8, insight: 7, packs: 5, api: 4, ai: 0 },
  rotate: 'hour',
  font: 'naskh',
  apiUrl: '',
  apiName: 'API',
  apiLast: 0,
  aiLast: 0,
  placed: false,
  size: 'l',
  weight: 600,
  frame: 'glass',
  halfLife: 30,
  explore: 0.12,
  tasteTestDone: false,
  // حافظ، خیام، فردوسی، سعدی، مولوی، عطار، سنایی، صائب (ids on ganjoor.net)
  ganjoor: { enabled: true, poets: [2, 3, 4, 7, 5, 9, 10, 22], perDay: 12, last: 0 },
};


export const DEFAULT_AREAS = ['پژوهش', 'زبان', 'سلامت', 'روابط', 'معنوی', 'کار و درآمد'];
