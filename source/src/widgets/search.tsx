import { useEffect, useRef, useState } from 'react';
import { defineWidget } from '../core/widgets';
import { IconSearch } from '../ui/icons';
import { webSearchUrl } from '../core/search';
import { useStore } from '../core/state';
import { ENGINE_NAMES } from '../core/search';
import { noteSearch } from '../core/remote';

// Prefix commands: "a pinn" → arXiv, "s …" → Scholar, "y …" → YouTube, "t …" → Translate.
const ENGINES: Record<string, { name: string; url: (q: string) => string }> = {
  g: { name: 'web', url: (q) => webSearchUrl(q) },
  a: { name: 'arXiv', url: (q) => `https://arxiv.org/search/?query=${encodeURIComponent(q)}&searchtype=all` },
  s: { name: 'Scholar', url: (q) => `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}` },
  y: { name: 'YouTube', url: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  t: { name: 'Translate', url: (q) => `https://translate.google.com/?sl=auto&tl=fa&text=${encodeURIComponent(q)}` },
};

function parse(input: string) {
  const m = input.match(/^([a-z])\s+(.+)$/i);
  if (m && ENGINES[m[1].toLowerCase()]) return { engine: ENGINES[m[1].toLowerCase()], q: m[2] };
  return { engine: ENGINES.g, q: input };
}

defineWidget<Record<string, never>>({
  type: 'search',
  name: 'جستجو',
  description: 'جستجوی وب با موتور دلخواه، و arXiv، Scholar و یوتیوب با پیشوند',
  icon: <IconSearch />,
  defaultSize: { w: 8, h: 2 },
  minSize: { w: 4, h: 2 },
  defaultConfig: {},
  card: false,
  Component: function Search() {
    const [q, setQ] = useState('');
    const ref = useRef<HTMLInputElement>(null);
    const { engine, q: query } = parse(q.trim());
    const engineKey = useStore((st) => st.settings.search.engine);

    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        const typing = target.closest('input, textarea, [contenteditable]');
        if (e.key === '/' && !typing) {
          e.preventDefault();
          ref.current?.focus();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    const go = () => {
      const trimmed = q.trim();
      if (!trimmed) return;
      if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(trimmed) && !/\s/.test(trimmed)) {
        location.href = /^https?:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
        return;
      }
      // Only the category of the search is noted (if you allowed it), never the text.
      void Promise.race([noteSearch(query, engine.name), new Promise((r) => setTimeout(r, 150))]).finally(() => { location.href = engine.url(query); });
    };

    return (
      <form className="glass" onSubmit={(e) => { e.preventDefault(); go(); }}
        style={{ height: '100%', maxHeight: 60, borderRadius: 18, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px' }}>
        <IconSearch className="ico muted" />
        <input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`جستجو در ${ENGINE_NAMES[engineKey].replace(/ \(.+\)$/, '')}…`}
          title="میانبر: a فاصله ← arXiv · s فاصله ← Scholar · y فاصله ← YouTube · t فاصله ← ترجمه"
          aria-label="جستجو"
          style={{ flex: 1, border: 0, outline: 0, background: 'transparent', fontSize: 15, minWidth: 0 }}
        />
        {q.trim() && engine.name !== 'web' && (
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600 }}>{engine.name}</span>
        )}
        <kbd className="faint" style={{ fontFamily: 'inherit', fontSize: 12, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--line-2)', direction: 'ltr' }}>/</kbd>
      </form>
    );
  },
});
