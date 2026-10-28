import { useEffect, useState } from 'react';

type Renderer = (src: string) => string;
let renderer: Promise<Renderer> | null = null;
/** The Markdown/KaTeX renderer is ~300 KB, so it is loaded only when something needs it. */
export const loadRenderer = () => (renderer ??= import('../core/markdown').then((m) => m.renderMarkdown));

export function useMarkdown(src: string, enabled = true): string {
  const [html, setHtml] = useState('');
  useEffect(() => {
    if (!enabled || !src.trim()) { setHtml(''); return; }
    let alive = true;
    void loadRenderer().then((r) => alive && setHtml(r(src)));
    return () => { alive = false; };
  }, [src, enabled]);
  return html;
}
