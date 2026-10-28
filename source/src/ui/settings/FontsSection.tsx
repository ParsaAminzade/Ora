import { ask } from '../Dialog';
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useStore } from '../../core/state';
import { db, uid, type Asset } from '../../core/db';
import { fontName, loadFont } from '../../core/fonts';
import { fa } from '../../core/dates';
import { Section } from '../Panels';
import { IconUpload, IconX } from '../icons';
import { NONE } from '../../core/none';

export const useFontAssets = (): Asset[] => useLiveQuery(() => db.assets.where('kind').equals('font').sortBy('createdAt'), []) ?? NONE;

function Sample({ id, text }: { id: string; text: string }) {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => { void loadFont(id).then(setFamily); }, [id]);
  return <span style={{ fontFamily: family ? `'${family}'` : undefined, fontSize: 18, lineHeight: 1.6 }}>{family === null ? '…' : text}</span>;
}

export function FontsSection() {
  const font = useStore((s) => s.settings.font);
  const modes = useStore((s) => s.settings.modes);
  const setSettings = useStore((s) => s.setSettings);
  const updateMode = useStore((s) => s.updateMode);
  const fonts = useFontAssets();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const upload = async (files: FileList) => {
    let first: Asset | undefined;
    for (const f of Array.from(files)) {
      if (!/\.(ttf|otf|woff2?)$/i.test(f.name)) continue;
      const a: Asset = { id: uid(), kind: 'font', name: f.name, mime: f.type, blob: f, createdAt: Date.now() };
      await db.assets.put(a);
      if (!(await loadFont(a.id))) { await db.assets.delete(a.id); setMsg(`«${f.name}» فونت سالمی نیست.`); continue; }
      first ??= a;
    }
    if (first && !useStore.getState().settings.font.assetId) setSettings({ font: { assetId: first.id, name: fontName(first.name) } });
    if (first) setMsg('به کتابخانه اضافه شد.');
  };

  const remove = async (a: Asset) => {
    if (!(await ask(`فونت «${fontName(a.name)}» حذف شود؟`, { danger: true }))) return;
    await db.assets.delete(a.id);
    if (font.assetId === a.id) setSettings({ font: {} });
    for (const m of useStore.getState().settings.modes) {
      if (m.font === a.id || m.sentenceFont === a.id) updateMode(m.id, { font: m.font === a.id ? undefined : m.font, sentenceFont: m.sentenceFont === a.id ? undefined : m.sentenceFont });
    }
  };

  return (
    <Section title="فونت‌ها">
      <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>هر چند فونت که بخواهی بارگذاری کن. یکی پیش‌فرض صفحه است و هر حالت می‌تواند فونت خودش را برای صفحه و برای جمله‌ی پس‌زمینه داشته باشد (در بخش حالت‌ها).</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input type="radio" name="default-font" checked={!font.assetId} onChange={() => setSettings({ font: {} })} style={{ accentColor: 'var(--accent)' }} />
        <span style={{ flex: 1 }}>وزیرمتن (همراه افزونه)</span>
      </label>
      {fonts.map((a) => {
        const usedBy = modes.filter((m) => m.font === a.id || m.sentenceFont === a.id).map((m) => m.name);
        return (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, background: 'var(--fill)' }}>
            <input type="radio" name="default-font" aria-label={`پیش‌فرض: ${fontName(a.name)}`} checked={font.assetId === a.id} onChange={() => setSettings({ font: { assetId: a.id, name: fontName(a.name) } })} style={{ accentColor: 'var(--accent)' }} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <Sample id={a.id} text="امروز یک قدم کوچک · اورآ ۱۲۳" />
              <span className="faint" style={{ fontSize: 11 }} dir="auto">{fontName(a.name)}{usedBy.length ? ` · در حالت ${usedBy.join('، ')}` : ''}</span>
            </span>
            <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label={`حذف فونت ${fontName(a.name)}`} onClick={() => void remove(a)}><IconX size={14} /></button>
          </div>
        );
      })}
      <button className="btn" onClick={() => file.current?.click()}><IconUpload size={16} />افزودن فونت (TTF، OTF، WOFF2 · چندتایی)</button>
      <input ref={file} type="file" multiple accept=".ttf,.otf,.woff,.woff2" hidden aria-label="فایل فونت"
        onChange={(e) => { const f = e.target.files; if (f?.length) void upload(f).then(() => { e.target.value = ''; }); }} />
      {msg && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{msg} {fonts.length ? `(${fa(fonts.length)} فونت)` : ''}</span>}
    </Section>
  );
}
