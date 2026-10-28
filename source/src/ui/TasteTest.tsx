// One-minute taste test: ten pairs of lines that differ in style; pick the one you like more.
import { useEffect, useState } from 'react';
import { db, type Sentence } from '../core/db';
import { useStore } from '../core/state';
import { features, record, tasteSummary } from '../core/taste';
import { fa } from '../core/dates';
import { IconX } from './icons';

const ROUNDS = 10;
const niche = (s: Sentence) => features(s).find((k) => k.startsWith('n:'));

async function makePair(seen: Set<string>): Promise<[Sentence, Sentence] | null> {
  const pool = (await db.sentences.where('source').anyOf(['nova', 'classic']).toArray()).filter((s) => !seen.has(s.id));
  if (pool.length < 2) return null;
  const a = pool[Math.floor(Math.random() * pool.length)];
  const others = pool.filter((b) => b.id !== a.id && niche(b) !== niche(a) && b.theme !== a.theme);
  const b = others[Math.floor(Math.random() * others.length)] ?? pool.find((x) => x.id !== a.id)!;
  return Math.random() < 0.5 ? [a, b] : [b, a];
}

export function TasteTest() {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [pair, setPair] = useState<[Sentence, Sentence] | null>(null);
  const [seen] = useState(() => new Set<string>());
  const [summary, setSummary] = useState<Sentence[] | null>(null);
  const [chosen] = useState<Sentence[]>(() => []);
  const mode = useStore((s) => s.settings.mode.active);
  const halfLife = useStore((s) => s.settings.sentences.halfLife);

  useEffect(() => {
    const show = () => { setOpen(true); setRound(0); setSummary(null); seen.clear(); chosen.length = 0; };
    addEventListener('nova:taste-test', show);
    return () => removeEventListener('nova:taste-test', show);
  }, [seen, chosen]);

  useEffect(() => {
    if (!open || summary) return;
    void makePair(seen).then(setPair);
  }, [open, round, summary, seen]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [open]);

  const finish = async () => {
    // Show it with your own picks: the two that best match what was learned, no jargon.
    const liked = new Map((await tasteSummary('all', halfLife)).map((x) => [x.k, x.mean]));
    const fit = (s: Sentence) => features(s).reduce((a, k) => a + (liked.get(k) ?? 0.5) - 0.5, 0);
    setSummary([...chosen].sort((a, b) => fit(b) - fit(a)).slice(0, 2));
    const st = useStore.getState();
    st.setSettings({ sentences: { ...st.settings.sentences, tasteTestDone: true } });
  };

  const choose = async (win: Sentence | null) => {
    if (!pair) return;
    if (win) chosen.push(win);
    for (const s of pair) {
      seen.add(s.id);
      await record(s, win && s.id === win.id ? 'test-win' : 'test-lose', mode, halfLife);
    }
    if (round + 1 >= ROUNDS) await finish();
    else setRound(round + 1);
  };

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="آزمون سلیقه" style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(3,4,8,.72)', backdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: 'min(980px, 100%)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, flex: 1 }}>{summary ? 'سلیقه‌ات را شناختم' : 'کدام را بیشتر دوست داری؟'}</h2>
          {!summary && <span className="faint" style={{ fontSize: 13 }}>{fa(round + 1)} از {fa(ROUNDS)}</span>}
          <button className="icon-btn" aria-label="بستن" onClick={() => setOpen(false)}><IconX size={18} /></button>
        </div>
        {!summary && pair && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {pair.map((s) => (
                <button key={s.id} className="taste-card" onClick={() => void choose(s)}>
                  <span style={{ whiteSpace: 'pre-line' }}>{s.text}</span>
                  <span className="faint" style={{ fontSize: 12 }}>{s.source === 'classic' ? s.by : 'اورآ'}</span>
                </button>
              ))}
            </div>
            <button className="btn" style={{ alignSelf: 'center', border: 0 }} onClick={() => void choose(null)}>هیچ‌کدام</button>
          </>
        )}
        {summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
            <p className="muted" style={{ margin: 0, lineHeight: 2 }}>{summary.length ? 'از این جنس بیشتر خواهی دید:' : 'هنوز الگوی روشنی پیدا نشد؛ با ♥ کم‌کم یاد می‌گیرم.'}</p>
            {summary.map((s) => <blockquote key={s.id} className="taste-quote">{s.text}</blockquote>)}
            <button className="btn btn-accent" onClick={() => { setOpen(false); dispatchEvent(new Event('nova:sentence-next')); }}>تمام</button>
          </div>
        )}
      </div>
    </div>
  );
}
