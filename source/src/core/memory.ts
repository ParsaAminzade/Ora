// What the assistant has been taught. Rules and pinned items always go into the prompt; other
// memories are picked by relevance to the question. Corrections are also kept as training pairs
// (exportable as JSONL) for fine-tuning a model later.
import { db, uid, type Memory } from './db';
import { useStore } from './state';
import { embed } from './providers/ai';
import { cosine, keywordScore, tokens } from './text';

const ai = () => useStore.getState().settings.ai;

async function vectorize(m: Memory): Promise<Memory> {
  const cfg = ai();
  if (!cfg.embedModel) return m;
  try {
    const [v] = await embed(cfg, [m.text]);
    return { ...m, vec: v, vecModel: cfg.embedModel };
  } catch {
    return m;
  }
}

export async function remember(text: string, kind: Memory['kind'] = 'fact', pinned = false): Promise<Memory> {
  const now = Date.now();
  const m = await vectorize({ id: uid(), text: text.trim(), kind, pinned, createdAt: now, updatedAt: now });
  await db.memories.put(m);
  return m;
}

export async function updateMemory(id: string, patch: Partial<Pick<Memory, 'text' | 'kind' | 'pinned'>>): Promise<void> {
  const m = await db.memories.get(id);
  if (!m) return;
  const next = { ...m, ...patch, updatedAt: Date.now() };
  await db.memories.put(patch.text && patch.text !== m.text ? await vectorize({ ...next, vec: undefined }) : next);
}

export const forget = (id: string) => db.memories.delete(id);

/** "یادت باشه …" / "به خاطر بسپار …" / "/remember …" → the text to remember, else null. */
export function parseRememberCommand(msg: string): string | null {
  const m = msg.trim().match(/^(?:\/remember|یادت\s*باشه|یادت\s*بمونه|به\s*خاطر\s*بسپار|به\s*یاد\s*داشته\s*باش)[\s:،,]*(.+)$/s);
  return m ? m[1].trim() : null;
}

/** Rules sound like instructions about how to answer. */
export const looksLikeRule = (t: string) => /(همیشه|هیچ\s*وقت|هرگز|جواب|پاسخ|بنویس|نگو|استفاده کن|always|never|answer|reply)/i.test(t);

/** Memories to include for this question. */
export async function relevantMemories(query: string, k = 8): Promise<Memory[]> {
  const all = await db.memories.toArray();
  const fixed = all.filter((m) => m.pinned || m.kind === 'rule').slice(0, 12);
  const rest = all.filter((m) => !fixed.includes(m));
  if (!rest.length) return fixed;
  const cfg = ai();
  let ranked: Memory[] = [];
  const withVec = rest.filter((m) => m.vec && m.vecModel === cfg.embedModel);
  if (cfg.embedModel && withVec.length) {
    try {
      const [qv] = await embed(cfg, [query]);
      ranked = withVec.map((m) => ({ m, s: cosine(qv, m.vec!) })).filter((x) => x.s > 0.3).sort((a, b) => b.s - a.s).map((x) => x.m);
    } catch { /* fall back below */ }
  }
  if (!ranked.length) {
    const q = tokens(query);
    ranked = rest.map((m) => ({ m, s: keywordScore(q, m.text, 20) })).filter((x) => x.s > 0.5).sort((a, b) => b.s - a.s).map((x) => x.m);
  }
  // Recent corrections stay relevant even without word overlap.
  const recentCorrections = rest.filter((m) => m.kind === 'correction').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  return [...new Set([...fixed, ...ranked.slice(0, k), ...recentCorrections])];
}

/** Save a correction: as training data, and as a memory the assistant will use from now on. */
export async function saveCorrection(prompt: string, answer: string, correction: string): Promise<void> {
  await db.feedback.put({ id: uid(), prompt, answer, correction, createdAt: Date.now() });
  const short = prompt.length > 120 ? `${prompt.slice(0, 117)}…` : prompt;
  await remember(`اصلاح در جواب به «${short}»: ${correction}`, 'correction');
}

/** Training pairs in the chat JSONL format most fine-tuning tools accept. */
export async function exportTrainingData(): Promise<number> {
  const rows = await db.feedback.orderBy('createdAt').toArray();
  const system = ai().system;
  const lines = rows.map((r) => JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: r.prompt }, { role: 'assistant', content: r.correction }] }));
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'application/jsonl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nova-training-${new Date().toISOString().slice(0, 10)}.jsonl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return rows.length;
}

const KIND_LABEL: Record<Memory['kind'], string> = { fact: 'درباره‌ی من', rule: 'قانون جواب دادن', correction: 'اصلاح' };
export const kindLabel = (k: Memory['kind']) => KIND_LABEL[k];
