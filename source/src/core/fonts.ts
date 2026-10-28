// Your font library: every uploaded font lives in IndexedDB and is loaded on demand under its own
// family name, so each mode can use a different font for the page and for the background sentence.
import { db } from './db';

const loaded = new Map<string, Promise<string | null>>();

export const fontName = (fileName: string) => fileName.replace(/\.(ttf|otf|woff2?)$/i, '');

/** Load an uploaded font once; resolves to its CSS family name (or null if it is gone/broken). */
export function loadFont(assetId: string): Promise<string | null> {
  let p = loaded.get(assetId);
  if (!p) {
    p = (async () => {
      const a = await db.assets.get(assetId);
      if (!a || a.kind !== 'font') { console.warn('[Nova] font missing', assetId, a?.kind); return null; }
      const family = `NovaF-${assetId.slice(0, 8)}`;
      // Same line metrics as Vazirmatn, so a taller or shorter font never overflows a card.
      const face = new FontFace(family, await a.blob.arrayBuffer(), { ascentOverride: '102%', descentOverride: '54%', lineGapOverride: '0%' });
      await face.load();
      document.fonts.add(face);
      return family;
    })().catch((e) => { console.warn('[Nova] font', assetId, e); return null; });
    loaded.set(assetId, p);
  }
  return p;
}

export const stack = (family: string) => `'${family}', 'Vazirmatn', system-ui, sans-serif`;

/** Built-in choices for the sentence (besides uploaded fonts). */
export const SENTENCE_BUILTIN: Record<string, string> = {
  naskh: "'Noto Naskh Arabic', 'Vazirmatn', serif",
  vazir: "'Vazirmatn', system-ui, sans-serif",
};
