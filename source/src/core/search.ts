// The default web search engine is a setting, so Google is one choice among several,
// including a SearXNG instance you run yourself.
import { useStore, type SearchEngine } from './state';

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
