// The assistant's knowledge base: your notes, pasted texts and files (txt, md, pdf), split into
// chunks and searched for every question. With an embedding model on Ollama the search is by
// meaning; without one it falls back to keyword search. Everything stays in IndexedDB.
import { db, uid, type Chunk, type KDoc } from './db';
import { useStore } from './state';
import { embed } from './providers/ai';
import { chunkText, cosine, keywordScore, tokens } from './text';

const ai = () => useStore.getState().settings.ai;

async function embedChunks(chunks: Chunk[]): Promise<void> {
  const cfg = ai();
  if (!cfg.embedModel || !chunks.length) return;
  try {
    for (let i = 0; i < chunks.length; i += 16) {
      const batch = chunks.slice(i, i + 16);
      const vecs = await embed(cfg, batch.map((c) => c.text));
      batch.forEach((c, j) => { c.vec = vecs[j]; c.vecModel = cfg.embedModel; });
    }
  } catch (e) {
    console.warn('[Nova] embedding failed, keyword search only', e);
  }
}

export async function addDoc(title: string, text: string, source: KDoc['source'], id = uid()): Promise<KDoc> {
  const parts = chunkText(text);
  const chunks: Chunk[] = parts.map((t, idx) => ({ id: `${id}#${idx}`, docId: id, idx, text: t }));
  await embedChunks(chunks);
  const doc: KDoc = { id, title, source, text, updatedAt: Date.now(), chunkCount: chunks.length };
  await db.transaction('rw', db.docs, db.chunks, async () => {
    await db.chunks.where('docId').equals(id).delete();
    await db.chunks.bulkPut(chunks);
    await db.docs.put(doc);
  });
  return doc;
}

export async function removeDoc(id: string): Promise<void> {
  await db.transaction('rw', db.docs, db.chunks, async () => {
    await db.chunks.where('docId').equals(id).delete();
    await db.docs.delete(id);
  });
}

/** Bring Nova's own notes into the knowledge base (only those that changed). */
export async function syncNotes(): Promise<number> {
  let n = 0;
  for (const note of await db.notes.toArray()) {
    const id = `note:${note.id}`;
    const existing = await db.docs.get(id);
    if (!note.body.trim()) { if (existing) await removeDoc(id); continue; }
    if (existing && existing.updatedAt >= note.updatedAt && existing.chunkCount) continue;
    const title = note.body.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '').slice(0, 60) ?? 'یادداشت';
    await addDoc(title, note.body, 'note', id);
    n++;
  }
  return n;
}

/** Re-chunk and re-embed everything (after a restore or a change of embedding model). */
export async function reindexAll(): Promise<number> {
  const docs = await db.docs.toArray();
  for (const d of docs) await addDoc(d.title, d.text, d.source, d.id);
  return docs.length;
}

export async function readFileText(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' '));
    }
    return pages.join('\n\n');
  }
  return file.text();
}

export interface Hit {
  docId: string;
  title: string;
  text: string;
  score: number;
}

/** Best-matching chunks for a question. */
export async function searchKnowledge(query: string, k = 4): Promise<Hit[]> {
  const chunks = await db.chunks.toArray();
  if (!chunks.length) return [];
  const docs = new Map((await db.docs.toArray()).map((d) => [d.id, d]));
  const cfg = ai();
  let scored: { c: Chunk; score: number }[] = [];
  const withVec = chunks.filter((c) => c.vec && c.vecModel === cfg.embedModel);
  if (cfg.embedModel && withVec.length) {
    try {
      const [qv] = await embed(cfg, [query]);
      scored = withVec.map((c) => ({ c, score: cosine(qv, c.vec!) })).filter((x) => x.score > 0.35);
    } catch {
      scored = [];
    }
  }
  if (!scored.length) {
    const q = tokens(query);
    if (!q.length) return [];
    scored = chunks.map((c) => ({ c, score: keywordScore(q, c.text) })).filter((x) => x.score > 0.8);
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ c, score }) => ({ docId: c.docId, title: docs.get(c.docId)?.title ?? '', text: c.text, score }));
}
