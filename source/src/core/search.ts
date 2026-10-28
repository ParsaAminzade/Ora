// The default web search engine is a setting, so Google is one choice among several,
// including a SearXNG instance you run yourself.
import { useStore, type SearchEngine } from './state';
import { IS_EXTENSION } from './platform';

export const ENGINE_NAMES: Record<SearchEngine, string> = {
  google: 'Google',
  duckduckgo: 'DuckDuckGo',
  startpage: 'Startpage',
  bing: 'Bing',
  searxng: 'SearXNG (سرور خودت)',
};

export function webSearchUrl(q: string): string {
  const { engine, searxngUrl } = useStore.getState().settings.search;
  const e = encodeURIComponent(q);
  switch (engine) {
    case 'duckduckgo': return `https://duckduckgo.com/?q=${e}`;
    case 'startpage': return `https://www.startpage.com/do/search?q=${e}`;
    case 'bing': return `https://www.bing.com/search?q=${e}`;
    case 'searxng': return `${searxngUrl.replace(/\/+$/, '')}/search?q=${e}`;
    default: return `https://www.google.com/search?q=${e}`;
  }
}

export const engineName = () => ENGINE_NAMES[useStore.getState().settings.search.engine].replace(/ \(.+\)$/, '');

/* ---------- suggestions while typing ---------- */

/** The engine's own suggestions (like Chrome's address bar). Only in the extension, which may call
 *  these addresses; your typing goes to the same engine you are about to search with anyway. */
export async function engineSuggest(q: string, signal: AbortSignal): Promise<string[]> {
  const st = useStore.getState().settings.search;
  if (!IS_EXTENSION || st.suggest === false || !q.trim() || !navigator.onLine) return [];
  const e = encodeURIComponent(q);
  const url = st.engine === 'google' ? `https://suggestqueries.google.com/complete/search?client=firefox&hl=fa&q=${e}`
    : st.engine === 'duckduckgo' ? `https://duckduckgo.com/ac/?type=list&q=${e}`
    : st.engine === 'bing' ? `https://api.bing.com/osjson.aspx?query=${e}`
    : '';
  if (!url) return [];
  try {
    const res = await fetch(url, { signal, credentials: 'omit' });
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[]];
    return Array.isArray(data?.[1]) ? data[1].filter((x) => typeof x === 'string').slice(0, 6) : [];
  } catch { return []; }
}

/** Recent searches: on this device only, newest first. */
const RECENT = 'ora:recent-searches';
export const recentSearches = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT) ?? '[]'); } catch { return []; } };
export function rememberSearch(q: string) {
  if (useStore.getState().settings.search.history === false) return;
  const t = q.trim();
  if (!t || t.length > 200) return;
  try { localStorage.setItem(RECENT, JSON.stringify([t, ...recentSearches().filter((x) => x !== t)].slice(0, 12))); } catch { /* private */ }
}
export function forgetSearch(q?: string) {
  try { localStorage.setItem(RECENT, JSON.stringify(q === undefined ? [] : recentSearches().filter((x) => x !== q))); } catch { /* private */ }
}
