import { useStore, type SearchEngine } from '../../core/state';
import { ENGINE_NAMES, forgetSearch } from '../../core/search';
import { IS_EXTENSION } from '../../core/platform';
import { Row, Section, Segmented } from '../Panels';

export function SearchSection() {
  const s = useStore((st) => st.settings.search);
  const setSettings = useStore((st) => st.setSettings);
  const set = (patch: Partial<typeof s>) => setSettings({ search: { ...useStore.getState().settings.search, ...patch } });
  return (
    <Section title="موتور جستجو">
      <select value={s.engine} onChange={(e) => set({ engine: e.target.value as SearchEngine })} aria-label="موتور جستجو"
        style={{ height: 38, borderRadius: 10, border: '1px solid var(--line-2)', background: '#12141B', padding: '0 8px', fontSize: 13 }}>
        {(Object.keys(ENGINE_NAMES) as SearchEngine[]).map((k) => <option key={k} value={k}>{ENGINE_NAMES[k]}</option>)}
      </select>
      {s.engine === 'searxng' && (
        <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          آدرس SearXNG
          <input value={s.searxngUrl} onChange={(e) => set({ searxngUrl: e.target.value.trim() })} dir="ltr" aria-label="آدرس SearXNG"
            style={{ height: 38, borderRadius: 10, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: '0 10px', fontSize: 12 }} />
        </label>
      )}
      {IS_EXTENSION && (
        <Row label="پیشنهاد هنگام تایپ" hint="مثل نوار آدرس کروم، از همان موتوری که انتخاب کرده‌ای (برای Google، DuckDuckGo و Bing).">
          <Segmented label="پیشنهاد هنگام تایپ" value={s.suggest === false ? 'off' : 'on'} options={[['on', 'روشن'], ['off', 'خاموش']] as const} onChange={(v) => set({ suggest: v === 'on' })} />
        </Row>
      )}
      <Row label="جستجوهای اخیر" hint="فقط روی همین دستگاه می‌ماند.">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Segmented label="جستجوهای اخیر" value={s.history === false ? 'off' : 'on'} options={[['on', 'نگه دار'], ['off', 'نه']] as const} onChange={(v) => { set({ history: v === 'on' }); if (v === 'off') forgetSearch(); }} />
          <button className="btn" onClick={() => forgetSearch()}>پاک کردن</button>
        </div>
      </Row>
      <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>پیشوندهای a (arXiv)، s (Scholar)، y (YouTube) و t (ترجمه) همچنان کار می‌کنند.</span>
    </Section>
  );
}
