import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Memory } from '../../core/db';
import { exportTrainingData, forget, kindLabel, remember, updateMemory } from '../../core/memory';
import { fa } from '../../core/dates';
import { IconDownload, IconPlus, IconX } from '../icons';
import { NONE } from '../../core/none';

const KINDS: Memory['kind'][] = ['fact', 'rule', 'correction'];

function Row({ m }: { m: Memory }) {
  const [text, setText] = useState(m.text);
  const dirty = text.trim() !== m.text;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 12, background: 'var(--fill)', border: m.pinned ? '1px solid var(--accent)' : '1px solid transparent' }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(4, Math.ceil(text.length / 45) || 1)} aria-label="متن حافظه" dir="auto"
        onBlur={() => { if (dirty && text.trim()) void updateMemory(m.id, { text: text.trim() }); }}
        style={{ border: 0, outline: 0, background: 'transparent', resize: 'none', fontSize: 13, lineHeight: 1.7, fontFamily: 'inherit' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select value={m.kind} onChange={(e) => void updateMemory(m.id, { kind: e.target.value as Memory['kind'] })} aria-label="نوع حافظه"
          style={{ height: 26, borderRadius: 8, border: '1px solid var(--line-2)', background: '#12141B', fontSize: 11, padding: '0 4px' }}>
          {KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
        </select>
        <label className="faint" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          <input type="checkbox" checked={m.pinned} onChange={(e) => void updateMemory(m.id, { pinned: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
          همیشه در نظر بگیر
        </label>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="فراموش کن" onClick={() => void forget(m.id)}><IconX size={13} /></button>
      </div>
    </div>
  );
}

export function MemoryPanel() {
  const memories = useLiveQuery(() => db.memories.orderBy('updatedAt').reverse().toArray(), []) ?? NONE;
  const feedbackCount = useLiveQuery(() => db.feedback.count(), []) ?? 0;
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<'all' | Memory['kind']>('all');
  const shown = filter === 'all' ? memories : memories.filter((m) => m.kind === filter);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>
        هر چیزی اینجا باشد، دستیار هنگام جواب دادن در نظر می‌گیرد. در گفتگو هم می‌توانی بنویسی «یادت باشه …». قانون‌ها و موارد «همیشه» در همه‌ی جواب‌ها اعمال می‌شوند.
      </span>
      <form className="field" style={{ height: 40 }} onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { void remember(draft, 'fact'); setDraft(''); } }}>
        <IconPlus size={15} className="ico faint" />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="چیزی که باید بداند…" aria-label="حافظه‌ی جدید" />
      </form>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(['all', ...KINDS] as const).map((k) => (
          <button key={k} className="btn" aria-pressed={filter === k} onClick={() => setFilter(k)}
            style={{ height: 26, fontSize: 11, padding: '0 8px', background: filter === k ? 'var(--fill-2)' : undefined, borderColor: filter === k ? 'var(--accent)' : undefined }}>
            {k === 'all' ? `همه (${fa(memories.length)})` : kindLabel(k)}
          </button>
        ))}
      </div>
      <div className="scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shown.length === 0 && <span className="faint" style={{ fontSize: 13 }}>هنوز چیزی یادش نداده‌ای.</span>}
        {shown.map((m) => <Row key={m.id + m.updatedAt} m={m} />)}
      </div>
      {feedbackCount > 0 && (
        <button className="btn" style={{ height: 32, fontSize: 12 }} onClick={() => void exportTrainingData()}>
          <IconDownload size={14} />خروجی {fa(feedbackCount)} اصلاح برای آموزش مدل (JSONL)
        </button>
      )}
    </div>
  );
}
