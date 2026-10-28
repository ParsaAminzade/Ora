import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SavedBackground } from '../../core/db';
import { useStore } from '../../core/state';
import { applyBackground, deleteBackground, sameLook, saveBackground } from '../../core/backgrounds';
import { IconEdit, IconX } from '../icons';
import { ask } from '../Dialog';
import { NONE } from '../../core/none';

function Thumb({ item }: { item: SavedBackground }) {
  const b = item.bg;
  const base = { display: 'block', width: '100%', aspectRatio: '16 / 10', borderRadius: 12 } as const;
  if (item.thumb) return <span style={{ ...base, backgroundImage: `url("${item.thumb}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />;
  if (b.kind === 'scene') return <span className={`pv-${b.scene}`} style={base} />;
  if (b.kind === 'starfield') return <span className="pv-galaxy" style={{ ...base, filter: 'saturate(.3)' }} />;
  if (b.kind === 'color') return <span style={{ ...base, background: b.color }} />;
  // code backgrounds: a quiet tile with the kind
  return (
    <span style={{ ...base, display: 'grid', placeItems: 'center', fontFamily: 'ui-monospace, monospace', fontSize: 15, color: 'var(--accent)',
      background: 'radial-gradient(ellipse at 30% 20%, color-mix(in srgb, var(--accent) 25%, transparent), transparent 60%), #0B0D14' }}>
      {b.kind === 'html' ? '</>' : 'GLSL'}
    </span>
  );
}

/** «پس‌زمینه‌های من»: one click to go back to any background you used. */
export function BackgroundGallery() {
  const items = useLiveQuery(() => db.backgrounds.orderBy('createdAt').reverse().toArray(), []) ?? NONE;
  const current = useStore((s) => s.settings.background);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="پس‌زمینه‌های من">
      <span className="muted" style={{ fontSize: 13 }}>پس‌زمینه‌های من</span>
      {items.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {items.map((it) => {
            const active = sameLook(it.bg, current);
            return (
              <div key={it.id} className="bg-tile" data-active={active}>
                <button aria-label={`پس‌زمینه: ${it.name}`} aria-pressed={active} onClick={() => applyBackground(it)}
                  style={{ border: 0, padding: 0, background: 'none', display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'right', width: '100%', cursor: 'pointer' }}>
                  <span style={{ display: 'block', borderRadius: 12, outline: active ? '2px solid var(--accent)' : '1px solid var(--line)', outlineOffset: active ? 2 : 0 }}><Thumb item={it} /></span>
                  {renaming !== it.id && <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: active ? 700 : 400 }}>{it.name}</span>}
                </button>
                {renaming === it.id && (
                  <input autoFocus defaultValue={it.name} aria-label={`نام تازه برای ${it.name}`} className="bg-rename"
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }}
                    onBlur={(e) => { const n = e.currentTarget.value.trim(); if (renaming && n) void db.backgrounds.update(it.id, { name: n }); setRenaming(null); }} />
                )}
                <span className="bg-tile-tools">
                  <button aria-label={`تغییر نام ${it.name}`} title="تغییر نام" onClick={() => setRenaming(it.id)}><IconEdit size={12} /></button>
                  <button aria-label={`حذف ${it.name}`} title="حذف" onClick={async () => { if (await ask(`«${it.name}» از پس‌زمینه‌های من حذف شود؟`, { danger: true })) void deleteBackground(it.id); }}><IconX size={12} /></button>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>هر کد HTML، شیدر، تصویر یا ویدیویی که اجرا یا بارگذاری کنی، خودکار اینجا نگه داشته می‌شود.</span>
      )}
      <form style={{ display: 'flex', gap: 6 }} onSubmit={async (e) => {
        e.preventDefault();
        const it = await saveBackground(useStore.getState().settings.background, name);
        setName(''); setMsg(`«${it.name}» ذخیره شد.`);
      }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم (اختیاری)" aria-label="اسم پس‌زمینه"
          style={{ flex: 1, height: 36, borderRadius: 10, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: '0 10px', fontSize: 13 }} />
        <button className="btn" type="submit" style={{ height: 36 }}>ذخیره‌ی پس‌زمینه‌ی فعلی</button>
      </form>
      {msg && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{msg}</span>}
    </div>
  );
}
