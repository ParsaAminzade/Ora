// The search box, built the way a phone search should work:
// · one tap opens a full-screen search with the keyboard up (on the phone); a dropdown on the computer
// · suggestions as you type: a web address to go to, your saved sites, recent searches, the engine's own
// · each suggestion has ↖ to put it in the box and keep typing; recent ones can be removed
// · a clear button, a cancel button, the keyboard's «جستجو» key, no auto-capital or auto-correct
// · ↑ ↓ Enter Esc on a keyboard; «/» focuses it from anywhere on the page
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { defineWidget } from '../core/widgets';
import { IconSearch, IconX, IconClock, IconChevronR } from '../ui/icons';
import { engineSuggest, forgetSearch, recentSearches, rememberSearch, webSearchUrl, ENGINE_NAMES } from '../core/search';
import { useStore } from '../core/state';
import { noteSearch } from '../core/remote';
import { usePhone } from '../core/platform';
import { cachedIcon, hostOf, type SiteIcon } from '../core/siteicon';

// Prefix commands: "a pinn" → arXiv, "s …" → Scholar, "y …" → YouTube, "t …" → Translate.
const ENGINES: Record<string, { name: string; label: string; url: (q: string) => string }> = {
  g: { name: 'web', label: 'وب', url: (q) => webSearchUrl(q) },
  a: { name: 'arXiv', label: 'arXiv', url: (q) => `https://arxiv.org/search/?query=${encodeURIComponent(q)}&searchtype=all` },
  s: { name: 'Scholar', label: 'Scholar', url: (q) => `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}` },
  y: { name: 'YouTube', label: 'یوتیوب', url: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  t: { name: 'Translate', label: 'ترجمه', url: (q) => `https://translate.google.com/?sl=auto&tl=fa&text=${encodeURIComponent(q)}` },
};
function parse(input: string) {
  const m = input.match(/^([a-z])\s+(.+)$/i);
  if (m && ENGINES[m[1].toLowerCase()]) return { key: m[1].toLowerCase(), engine: ENGINES[m[1].toLowerCase()], q: m[2] };
  return { key: 'g', engine: ENGINES.g, q: input };
}
const URL_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i;
const isUrl = (t: string) => URL_RE.test(t) && !/\s/.test(t);
const fullUrl = (t: string) => (/^https?:/i.test(t) ? t : `https://${t}`);

type Item =
  | { kind: 'url'; text: string; url: string }
  | { kind: 'site'; text: string; url: string }
  | { kind: 'recent'; text: string }
  | { kind: 'suggest'; text: string }
  | { kind: 'search'; text: string };

/** Your saved sites, from every shortcuts widget. */
function useSites(): { title: string; url: string }[] {
  const widgets = useStore((s) => s.widgets);
  return useMemo(() => widgets.filter((w) => w.type === 'shortcuts').flatMap((w) => ((w.config as { items?: { title: string; url: string }[] }).items ?? [])), [widgets]);
}
function SiteDot({ url }: { url: string }) {
  const [icon, setIcon] = useState<SiteIcon | null | undefined>(undefined);
  useEffect(() => { void cachedIcon(url).then(setIcon); }, [url]);
  return icon?.src ? <img src={icon.src} alt="" width={20} height={20} className="srch-ico-img" /> : <span className="srch-ico-mono">{hostOf(url).slice(0, 1).toUpperCase()}</span>;
}

/** Bold what the suggestion adds to what you typed, the way Chrome does. */
function Rest({ text, typed }: { text: string; typed: string }) {
  const t = typed.trim();
  if (t && text.toLowerCase().startsWith(t.toLowerCase())) return <><span>{text.slice(0, t.length)}</span><b>{text.slice(t.length)}</b></>;
  return <span>{text}</span>;
}

defineWidget<Record<string, never>>({
  type: 'search',
  name: 'جستجو',
  description: 'جستجوی وب با پیشنهاد، سایت‌های ذخیره‌شده و جستجوهای اخیر؛ و arXiv، Scholar و یوتیوب با پیشوند',
  icon: <IconSearch />,
  defaultSize: { w: 8, h: 2 },
  minSize: { w: 4, h: 2 },
  defaultConfig: {},
  card: false,
  Component: function Search() {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [sel, setSel] = useState(-1);
    const [remote, setRemote] = useState<string[]>([]);
    const [recent, setRecent] = useState<string[]>(recentSearches);
    const ref = useRef<HTMLInputElement>(null);
    const phone = usePhone();
    const sites = useSites();
    const engineKey = useStore((st) => st.settings.search.engine);
    const engineLabel = ENGINE_NAMES[engineKey].replace(/ \(.+\)$/, '');
    const { engine, key: prefix, q: query } = parse(q.trim());

    // «/» focuses the box from anywhere
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable]');
        if (e.key === '/' && !typing) { e.preventDefault(); ref.current?.focus(); }
      };
      addEventListener('keydown', onKey);
      return () => removeEventListener('keydown', onKey);
    }, []);

    // the engine's suggestions: a little after you stop typing, and only the latest answer counts
    useEffect(() => {
      if (!open || prefix !== 'g' || !query || isUrl(query)) { setRemote([]); return; }
      const ctl = new AbortController();
      const t = window.setTimeout(() => void engineSuggest(query, ctl.signal).then((r) => { if (!ctl.signal.aborted) setRemote(r); }), 120);
      return () => { window.clearTimeout(t); ctl.abort(); };
    }, [query, prefix, open]);

    // another part of Ora opening (the tour, settings, the calendar…) closes the suggestions
    useEffect(() => {
      const names = ['ora:tour', 'ora:settings', 'ora:schedule', 'ora:palette', 'ora:coach', 'ora:projects', 'ora:legal'];
      const shut = () => { setOpen(false); ref.current?.blur(); };
      for (const n of names) addEventListener(n, shut);
      return () => { for (const n of names) removeEventListener(n, shut); };
    }, []);

    // the phone's back button closes the full-screen search instead of leaving Ora
    useEffect(() => {
      if (!open || !phone) return;
      history.pushState({ oraSearch: true }, '');
      const back = () => close(false);
      addEventListener('popstate', back);
      return () => { removeEventListener('popstate', back); if (history.state?.oraSearch) history.back(); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, phone]);

    const items: Item[] = useMemo(() => {
      const t = q.trim(), low = t.toLowerCase();
      const list: Item[] = [];
      if (!t) return recent.slice(0, phone ? 8 : 6).map((text) => ({ kind: 'recent', text }));
      if (isUrl(t)) list.push({ kind: 'url', text: t, url: fullUrl(t) });
      if (prefix === 'g') {
        for (const s of sites) {
          if (list.length >= 3) break;
          if (s.title.toLowerCase().includes(low) || hostOf(s.url).includes(low)) list.push({ kind: 'site', text: s.title, url: s.url });
        }
      }
      if (!isUrl(t)) list.push({ kind: 'search', text: t });
      const seen = new Set([low]);
      for (const r of recent) { if (r.toLowerCase().startsWith(low) && !seen.has(r.toLowerCase())) { seen.add(r.toLowerCase()); list.push({ kind: 'recent', text: r }); } if (list.length > 5) break; }
      for (const r of remote) { if (!seen.has(r.toLowerCase())) { seen.add(r.toLowerCase()); list.push({ kind: 'suggest', text: r }); } if (list.length > (phone ? 9 : 8)) break; }
      return list;
    }, [q, recent, remote, sites, prefix, phone]);
    useEffect(() => setSel(-1), [q]);

    const close = (blur = true) => { setOpen(false); setSel(-1); if (blur) ref.current?.blur(); };
    const go = (text: string, url?: string) => {
      const t = text.trim();
      if (!t && !url) return;
      if (url || isUrl(t)) { location.href = url ?? fullUrl(t); return; }
      const p = parse(t);
      rememberSearch(t);
      // Only the category of the search is noted (if you allowed it), never the text.
      void Promise.race([noteSearch(p.q, p.engine.name), new Promise((r) => setTimeout(r, 150))]).finally(() => { location.href = p.engine.url(p.q); });
    };
    const pick = (it: Item) => (it.kind === 'url' || it.kind === 'site' ? go(it.text, it.url) : go(it.kind === 'search' ? q : prefix !== 'g' ? `${prefix} ${it.text}` : it.text));
    const fill = (text: string) => { setQ(`${text} `); ref.current?.focus(); };
    const onKey = (e: RKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setSel((x) => Math.min(items.length - 1, x + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(-1, x - 1)); }
      else if (e.key === 'Escape') { if (q) setQ(''); else close(); }
    };

    const show = open && (items.length > 0 || phone);
    // On the computer the list floats under the box (outside the widget, so nothing clips it).
    const boxRef = useRef<HTMLFormElement>(null);
    const [at, setAt] = useState<CSSProperties>({});
    useLayoutEffect(() => {
      if (!show || phone) return;
      const place = () => { const r = boxRef.current?.getBoundingClientRect(); if (r) setAt({ position: 'fixed', top: r.bottom + 6, left: r.left, width: r.width }); };
      place();
      addEventListener('resize', place); addEventListener('scroll', place, true);
      return () => { removeEventListener('resize', place); removeEventListener('scroll', place, true); };
    }, [show, phone]);
    const optId = (i: number) => `srch-opt-${i}`;
    const wrap = (el: ReactElement) => (phone ? el : createPortal(el, document.body));
    return (
      <div className={`srch${open ? ' open' : ''}${open && phone ? ' full' : ''}`}>
        {open && phone && <div className="srch-shade" />}
        <form ref={boxRef} className="srch-box glass" role="search" onSubmit={(e) => { e.preventDefault(); if (sel >= 0 && items[sel]) pick(items[sel]); else go(q); }}>
          {open && phone
            ? <button type="button" className="icon-btn srch-back" aria-label="بستن جستجو" onClick={() => close()}><IconChevronR size={20} /></button>
            : <IconSearch className="ico muted" />}
          <input
            ref={ref}
            type="search"
            enterKeyHint="search"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            dir={q ? 'auto' : 'rtl'}
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => { setOpen(true); setRecent(recentSearches()); }}
            onBlur={(e) => { if (!phone && !e.currentTarget.closest('.srch')?.contains(e.relatedTarget as Node)) window.setTimeout(() => setOpen(false), 120); }}
            onKeyDown={onKey}
            placeholder={`جستجو در ${engineLabel} یا نوشتن آدرس`}
            title="میانبر: a فاصله ← arXiv · s فاصله ← Scholar · y فاصله ← YouTube · t فاصله ← ترجمه"
            aria-label="جستجو"
            role="combobox"
            aria-expanded={show}
            aria-controls="srch-list"
            aria-autocomplete="list"
            aria-activedescendant={sel >= 0 ? optId(sel) : undefined}
          />
          {q.trim() && engine.name !== 'web' && <span className="srch-engine">{engine.label}</span>}
          {q && <button type="button" className="icon-btn srch-clear" aria-label="پاک کردن" onClick={() => { setQ(''); ref.current?.focus(); }}><IconX size={16} /></button>}
          {!q && !phone && <kbd className="srch-kbd">/</kbd>}
        </form>
        {show && wrap(
          <div className="srch-pop glass" style={phone ? undefined : at} onMouseDown={(e) => e.preventDefault()}>
            {!q.trim() && (
              <div className="srch-chips" aria-label="جستجو در">
                {(['y', 't', 's', 'a'] as const).map((k) => (
                  <button key={k} type="button" className="pill pill-xs" onClick={() => { setQ(`${k} `); ref.current?.focus(); }}>{ENGINES[k].label}</button>
                ))}
              </div>
            )}
            {!q.trim() && recent.length > 0 && <div className="srch-h"><span>جستجوهای اخیر</span><button type="button" className="btn-link" onClick={() => { forgetSearch(); setRecent([]); }}>پاک کردن همه</button></div>}
            <ul id="srch-list" role="listbox" aria-label="پیشنهادها">
              {items.map((it, i) => (
                <li key={`${it.kind}-${it.text}-${i}`} id={optId(i)} role="option" aria-selected={sel === i} className={`srch-item k-${it.kind}`} onClick={() => pick(it)} onMouseMove={() => !phone && setSel(i)}>
                  <span className="srch-ico">
                    {it.kind === 'recent' ? <IconClock size={16} /> : it.kind === 'site' || it.kind === 'url' ? <SiteDot url={it.url} /> : <IconSearch size={16} />}
                  </span>
                  <span className="srch-text" dir="auto">
                    {it.kind === 'url' ? <>رفتن به <bdi dir="ltr">{hostOf(it.url)}</bdi></>
                      : it.kind === 'site' ? <>{it.text} <small dir="ltr">{hostOf(it.url)}</small></>
                      : it.kind === 'search' ? <>{it.text} <small>— جستجو در {engine.name === 'web' ? engineLabel : engine.label}</small></>
                      : <Rest text={it.text} typed={query} />}
                  </span>
                  {it.kind === 'recent' && (
                    <button type="button" className="icon-btn srch-act" aria-label={`حذف «${it.text}» از اخیرها`} onClick={(e) => { e.stopPropagation(); forgetSearch(it.text); setRecent(recentSearches()); }}><IconX size={14} /></button>
                  )}
                  {(it.kind === 'recent' || it.kind === 'suggest') && (
                    <button type="button" className="icon-btn srch-act srch-fill" aria-label={`گذاشتن «${it.text}» در کادر`} onClick={(e) => { e.stopPropagation(); fill(it.text); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" className="ico" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" /></svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {phone && !items.length && <p className="srch-empty faint">هر چیزی بنویس؛ یا آدرس سایت.</p>}
          </div>,
        )}
      </div>
    );
  },
});

