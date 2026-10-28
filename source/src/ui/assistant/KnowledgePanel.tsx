import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../core/db';
import { useStore } from '../../core/state';
import { addDoc, readFileText, reindexAll, removeDoc, syncNotes } from '../../core/knowledge';
import { fa } from '../../core/dates';
import { IconNote, IconPlus, IconReset, IconUpload, IconX } from '../icons';
import { NONE } from '../../core/none';

const SOURCE_LABEL = { note: 'یادداشت', file: 'فایل', text: 'متن' } as const;

export function KnowledgePanel() {
  const docs = useLiveQuery(() => db.docs.orderBy('updatedAt').reverse().toArray(), []) ?? NONE;
  const ai = useStore((s) => s.settings.ai);
  const setSettings = useStore((s) => s.setSettings);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [paste, setPaste] = useState<{ title: string; text: string } | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try { await fn(); } finally { setBusy(''); }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>
        دستیار برای هر سؤال در این‌ها می‌گردد و منبع را ذکر می‌کند. {ai.embedModel ? `جستجو با معنا (${ai.embedModel}).` : 'فعلاً جستجو با کلمه؛ برای جستجو با معنا یک مدل embedding در تنظیمات هوش مصنوعی انتخاب کن.'}
      </span>
      <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <input type="checkbox" checked={ai.useKnowledge} onChange={(e) => setSettings({ ai: { ...useStore.getState().settings.ai, useKnowledge: e.target.checked } })} style={{ accentColor: 'var(--accent)' }} />
        در جواب‌ها از دانش من استفاده کن
      </label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn" style={{ height: 32, fontSize: 12 }} onClick={() => file.current?.click()}><IconUpload size={14} />فایل (PDF، TXT، MD)</button>
        <button className="btn" style={{ height: 32, fontSize: 12 }} onClick={() => setPaste({ title: '', text: '' })}><IconPlus size={14} />چسباندن متن</button>
        <button className="btn" style={{ height: 32, fontSize: 12 }} onClick={() => void run('notes', syncNotes)}><IconNote size={14} />یادداشت‌ها</button>
        <button className="btn" style={{ height: 32, fontSize: 12 }} title="بعد از عوض کردن مدل embedding" onClick={() => void run('all', reindexAll)}><IconReset size={14} />نمایه‌ی دوباره</button>
      </div>
      <input ref={file} type="file" multiple accept=".pdf,.txt,.md,.markdown,.tex,.csv,application/pdf,text/*" hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void run('files', async () => {
            for (const f of files) await addDoc(f.name.replace(/\.[^.]+$/, ''), await readFileText(f), 'file');
          });
        }} />
      {paste && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 12, background: 'var(--fill)' }}>
          <input value={paste.title} onChange={(e) => setPaste({ ...paste, title: e.target.value })} placeholder="عنوان" aria-label="عنوان متن"
            style={{ height: 32, borderRadius: 8, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: '0 8px', fontSize: 12 }} />
          <textarea value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} rows={5} placeholder="متن…" aria-label="متن دانش" dir="auto"
            style={{ borderRadius: 8, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: 8, fontSize: 12, lineHeight: 1.7, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-accent" style={{ height: 30, fontSize: 12 }} disabled={!paste.text.trim()}
              onClick={() => { const p = paste; setPaste(null); void run('text', () => addDoc(p.title.trim() || p.text.slice(0, 40), p.text, 'text')); }}>افزودن</button>
            <button className="btn" style={{ height: 30, fontSize: 12 }} onClick={() => setPaste(null)}>انصراف</button>
          </div>
        </div>
      )}
      {busy && <span style={{ fontSize: 12, color: 'var(--accent)' }}>در حال نمایه‌سازی…</span>}
      <div className="scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {docs.length === 0 && <span className="faint" style={{ fontSize: 13 }}>هنوز چیزی اضافه نشده.</span>}
        {docs.map((d) => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--fill)' }}>
            <span className="faint" style={{ fontSize: 11, width: 46 }}>{SOURCE_LABEL[d.source]}</span>
            <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="auto">{d.title}</span>
            <span className="faint" style={{ fontSize: 11 }}>{fa(d.chunkCount)} بخش</span>
            <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label={`حذف ${d.title}`} onClick={() => void removeDoc(d.id)}><IconX size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
