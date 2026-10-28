import { dayKey } from '../core/dates';
import { useEffect, useRef, useState } from 'react';
import { defineWidget } from '../core/widgets';
import { useStore } from '../core/state';
import { useAssistant, type Msg } from '../core/assistant';
import { db, uid } from '../core/db';
import { remember } from '../core/memory';
import { IconCheckSquare, IconEdit, IconPause, IconPin, IconSpark, IconTrash } from '../ui/icons';
import { useMarkdown } from '../ui/useMarkdown';
import { fa } from '../core/dates';
import { MemoryPanel } from '../ui/assistant/MemoryPanel';
import { KnowledgePanel } from '../ui/assistant/KnowledgePanel';

/** Pull list items out of an answer ("1. …", "- …") to turn them into tasks. */
function listItems(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim().match(/^(?:[-*•]|\d+[.)]|[۰-۹]+[.)])\s+(.+)$/)?.[1]?.replace(/\*\*/g, '').trim())
    .filter((x): x is string => !!x);
}

const small = { height: 28, fontSize: 11, padding: '0 8px' } as const;

function Bubble({ m, streaming }: { m: Msg; streaming: boolean }) {
  const html = useMarkdown(m.content, m.role === 'assistant' && !m.error);
  const correct = useAssistant((s) => s.correct);
  const [added, setAdded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fix, setFix] = useState('');
  const items = m.role === 'assistant' && !streaming ? listItems(m.content) : [];

  if (m.role === 'user') {
    return (
      <div style={{ alignSelf: 'flex-start', maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ background: 'var(--fill-2)', padding: '8px 12px', borderRadius: '14px 14px 14px 4px', fontSize: 14, whiteSpace: 'pre-wrap', unicodeBidi: 'plaintext' }}>
          {m.display ?? m.content}
        </div>
        {!m.display && (
          <button className="faint" disabled={pinned} onClick={() => { void remember(m.content, 'fact'); setPinned(true); }}
            style={{ alignSelf: 'flex-start', border: 0, background: 'none', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
            <IconPin size={12} />{pinned ? 'به خاطر سپرد' : 'این را به خاطر بسپار'}
          </button>
        )}
      </div>
    );
  }
  return (
    <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {m.error ? (
        <div style={{ fontSize: 13, color: 'var(--danger)', lineHeight: 1.8 }}>{m.content}</div>
      ) : (
        <div className="md" style={{ fontSize: 14, lineHeight: 1.9, color: m.local ? 'var(--accent)' : undefined }}
          dangerouslySetInnerHTML={{ __html: html || (streaming ? '<span class="faint">…</span>' : '') }} />
      )}
      {!streaming && !m.error && !m.local && (m.sources?.length || m.memories) ? (
        <span className="faint" style={{ fontSize: 11, lineHeight: 1.7 }}>
          {m.memories ? `${fa(m.memories)} مورد از حافظه` : ''}{m.memories && m.sources?.length ? ' · ' : ''}
          {m.sources?.length ? `منابع: ${m.sources.map((s, i) => `[${fa(i + 1)}] ${s}`).join('، ')}` : ''}
        </span>
      ) : null}
      {!streaming && !m.error && !m.local && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {items.length > 1 && (
            <button className="btn" style={small} disabled={added}
              onClick={async () => {
                const base = Date.now();
                await db.tasks.bulkPut(items.map((title, i) => ({ id: uid(), title, done: false, priority: 0 as const, order: base + i, createdAt: base, when: dayKey(new Date()) })));
                setAdded(true);
              }}>
              <IconCheckSquare size={13} />{added ? 'به تسک‌ها اضافه شد' : `افزودن ${fa(items.length)} مورد به تسک‌ها`}
            </button>
          )}
          <button className="btn" style={small} onClick={() => setFixing((f) => !f)}><IconEdit size={13} />اصلاحش کن</button>
        </div>
      )}
      {fixing && (
        <form className="field" style={{ height: 38 }} onSubmit={(e) => { e.preventDefault(); if (fix.trim()) { setFixing(false); void correct(m.id, fix); setFix(''); } }}>
          <input autoFocus value={fix} onChange={(e) => setFix(e.target.value)} placeholder="چه چیزی غلط بود یا چطور باید جواب می‌داد؟" aria-label="اصلاح جواب" />
          <button className="btn btn-accent" style={{ height: 28, fontSize: 11 }}>یاد بگیر</button>
        </form>
      )}
    </div>
  );
}

type Tab = 'chat' | 'memory' | 'knowledge';

defineWidget<Record<string, never>>({
  type: 'assistant',
  name: 'دستیار هوش مصنوعی',
  description: 'دستیار محلی که یاد می‌گیرد: حافظه، اصلاح، و جستجو در یادداشت‌ها و فایل‌هایت',
  icon: <IconSpark />,
  defaultSize: { w: 8, h: 12 },
  minSize: { w: 5, h: 6 },
  defaultConfig: {},
  Component: function Assistant() {
    const { messages, busy, send, stop, clear, load } = useAssistant();
    const ai = useStore((s) => s.settings.ai);
    const setPanel = useStore((s) => s.setPanel);
    const [draft, setDraft] = useState('');
    const [tab, setTab] = useState<Tab>('chat');
    const list = useRef<HTMLDivElement>(null);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages, tab]);

    const submit = () => {
      const t = draft.trim();
      if (!t) return;
      setDraft('');
      void send(t);
    };

    const tabs: [Tab, string][] = [['chat', 'گفتگو'], ['memory', 'حافظه'], ['knowledge', 'دانش']];

    return (
      <div className="w">
        <div className="w-head">
          <span style={{ color: 'var(--accent)', display: 'flex' }}><IconSpark size={18} /></span>
          <div role="tablist" aria-label="بخش‌های دستیار" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--fill)' }}>
            {tabs.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                style={{ height: 28, padding: '0 12px', border: 0, borderRadius: 8, fontSize: 13, fontWeight: tab === k ? 600 : 400, background: tab === k ? 'var(--fill-2)' : 'transparent', color: tab === k ? 'var(--text)' : 'var(--text-2)' }}>
                {label}
              </button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <button onClick={() => setPanel('settings')} className="faint" title="تنظیمات هوش مصنوعی"
            style={{ border: 0, background: 'none', fontSize: 12, direction: 'ltr', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ai.model || 'مدلی انتخاب نشده'}
          </button>
          {tab === 'chat' && messages.length > 0 && (
            <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label="پاک کردن گفتگو" title="پاک کردن گفتگو" onClick={clear}><IconTrash size={15} /></button>
          )}
        </div>

        {tab === 'memory' && <MemoryPanel />}
        {tab === 'knowledge' && <KnowledgePanel />}
        {tab === 'chat' && (
          <>
            <div ref={list} className="scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, paddingInlineEnd: 4 }}>
              {messages.length === 0 && (
                <div className="faint" style={{ fontSize: 13, lineHeight: 1.9, margin: 'auto 0' }}>
                  {ai.model ? (
                    <>هر چیزی بپرس. با «یادت باشه …» چیزی یادش بده، و هر جوابی را با «اصلاحش کن» درست کن تا دفعه‌ی بعد تکرار نکند. در <kbd style={{ fontFamily: 'inherit' }}>Ctrl+K</kbd> هم <span dir="ltr">/break</span>، <span dir="ltr">/sum</span>، <span dir="ltr">/tex</span> و <span dir="ltr">/en</span> هست.</>
                  ) : (
                    <>برای شروع، در <button onClick={() => setPanel('settings')} style={{ border: 0, background: 'none', color: 'var(--accent)', padding: 0 }}>شخصی‌سازی ← هوش مصنوعی</button> مدل را انتخاب کن.</>
                  )}
                </div>
              )}
              {messages.map((m, i) => <Bubble key={m.id} m={m} streaming={busy && i === messages.length - 1} />)}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="field" style={{ height: 'auto', minHeight: 48, alignItems: 'flex-end', padding: 6 }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="از دستیار بپرس… یا «یادت باشه …»"
                aria-label="پیام به دستیار"
                rows={1}
                dir="auto"
                style={{ flex: 1, border: 0, outline: 0, background: 'transparent', resize: 'none', fontSize: 14, lineHeight: 1.7, maxHeight: 120, padding: '6px 8px' }}
              />
              {busy ? (
                <button type="button" className="btn" style={{ height: 36 }} onClick={stop} aria-label="توقف"><IconPause size={15} />توقف</button>
              ) : (
                <button className="btn btn-accent" style={{ height: 36 }} disabled={!draft.trim()}>ارسال</button>
              )}
            </form>
          </>
        )}
      </div>
    );
  },
});
