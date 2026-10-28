import { useEffect, useRef, useState } from 'react';
import { defineWidget } from '../core/widgets';
import { db } from '../core/db';
import { IconCheck, IconEdit, IconNote } from '../ui/icons';
import { useMarkdown } from '../ui/useMarkdown';

interface Config {
  title: string;
}


defineWidget<Config>({
  type: 'notes',
  name: 'یادداشت',
  description: 'Markdown و فرمول LaTeX با ذخیره‌ی خودکار',
  icon: <IconNote />,
  defaultSize: { w: 6, h: 8 },
  minSize: { w: 4, h: 4 },
  defaultConfig: { title: 'یادداشت' },
  multiple: true,
  Component: function Notes({ id, config, setConfig }) {
    const [body, setBody] = useState('');
    const [saved, setSaved] = useState(true);
    const [justSaved, setJustSaved] = useState(false);
    const [editing, setEditing] = useState(false);
    const loaded = useRef(false);
    const area = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      void db.notes.get(id).then((n) => {
        setBody(n?.body ?? '');
        loaded.current = true;
      });
    }, [id]);

    useEffect(() => {
      if (!loaded.current) return;
      setSaved(false);
      const t = window.setTimeout(() => {
        void db.notes.put({ id, body, updatedAt: Date.now() }).then(() => { setSaved(true); setJustSaved(true); window.setTimeout(() => setJustSaved(false), 1800); });
      }, 400);
      return () => window.clearTimeout(t);
    }, [body, id]);

    const html = useMarkdown(body, !editing);

    useEffect(() => { if (editing) area.current?.focus(); }, [editing]);

    return (
      <div className="w">
        <div className="w-head">
          <input
            className="w-title w-title-input"
            value={config.title}
            onChange={(e) => setConfig({ title: e.target.value })}
            aria-label="عنوان یادداشت"
          />
          <span className="w-meta" aria-live="polite">{!saved ? 'در حال ذخیره…' : justSaved ? 'ذخیره شد' : ''}</span>
          <div className="w-actions">
            {editing
              ? <button className="icon-btn" aria-label="پایان ویرایش" title="پایان ویرایش" onClick={() => area.current?.blur()}><IconCheck size={16} /></button>
              : <button className="icon-btn" aria-label="ویرایش یادداشت" title="ویرایش" onClick={() => setEditing(true)}><IconEdit size={16} /></button>}
          </div>
        </div>
        {editing ? (
          <textarea
            ref={area}
            className="scroll"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); area.current?.blur(); } }}
            placeholder="هر چیزی که باید یادت بماند…"
            aria-label="متن یادداشت"
            dir="auto"
            style={{ flex: 1, resize: 'none', border: 0, outline: 0, background: 'transparent', fontSize: 14, lineHeight: 1.9, fontFamily: 'inherit' }}
          />
        ) : !body.trim() ? (
          <button className="w-empty" style={{ border: 0, background: 'none', cursor: 'text' }} onClick={() => setEditing(true)}>
            <IconNote /><b>یادداشتی نیست</b><span>برای نوشتن کلیک کن</span>
          </button>
        ) : (
          <div
            className="scroll md"
            onDoubleClick={() => setEditing(true)}
            dangerouslySetInnerHTML={{ __html: html }}
            style={{ flex: 1, minHeight: 0, fontSize: 14, lineHeight: 1.9 }}
          />
        )}
        {editing && <div className="note-hint">پررنگ با **…** · فهرست با - · فرمول با <bdi dir="ltr">$…$</bdi></div>}
      </div>
    );
  },
});
