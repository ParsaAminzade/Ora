import { parseTask } from '../core/taskparse';
import { addParsed } from '../core/planner';
import { useEffect, useMemo, useRef, useState } from 'react';
import { queryCommands, registerCommand, registerProvider } from '../core/commands';
import { useStore, type SceneId } from '../core/state';
import { allWidgets } from '../core/widgets';
import { dayKey } from '../core/dates';
import { addEvent } from '../core/calendar-service';
import { exportBackup } from '../core/backup';
import { engineName, webSearchUrl } from '../core/search';
import { fillPrompt, useAssistant } from '../core/assistant';
import { addSentence } from '../core/sentences';
import { IconSpark } from './icons';
import { IconCalendar, IconCheckSquare, IconCommand, IconDownload, IconImage, IconLayout, IconPlus, IconSearch, IconSliders } from './icons';

const ENGINES: Record<string, [string, (q: string) => string]> = {
  a: ['arXiv', (q) => `https://arxiv.org/search/?query=${encodeURIComponent(q)}&searchtype=all`],
  s: ['Scholar', (q) => `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`],
  y: ['YouTube', (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`],
  t: ['Translate', (q) => `https://translate.google.com/?sl=auto&tl=fa&text=${encodeURIComponent(q)}`],
};

let registered = false;
function registerBuiltins() {
  if (registered) return;
  registered = true;
  const st = () => useStore.getState();

  /** Send a prompt to the assistant, adding the widget to the page if it isn't there. */
  const ask = (prompt: string, display?: string) => {
    if (!st().widgets.some((w) => w.type === 'assistant')) st().addWidget('assistant');
    void useAssistant.getState().send(prompt, display);
    setTimeout(() => document.querySelector('section[aria-label="دستیار هوش مصنوعی"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  registerProvider((q) => {
    const t = q.trim();
    if (!t) return [];
    if (t.startsWith('/')) {
      const [, trigger = '', rest = ''] = t.match(/^\/(\S*)\s*([\s\S]*)$/) ?? [];
      return st().settings.ai.commands
        .filter((c) => c.trigger.startsWith(trigger))
        .map((c) => ({
          id: `ai-${c.trigger}`,
          title: rest ? `${c.title}: ${rest.slice(0, 60)}` : `/${c.trigger} · ${c.title}`,
          icon: <IconSpark />,
          run: () => { if (rest) ask(fillPrompt(c.prompt, rest), `/${c.trigger} ${rest}`); },
        }));
    }
    if (t.startsWith('?') || t.startsWith('؟')) {
      const question = t.slice(1).trim();
      return question ? [{ id: 'ai-ask', title: `بپرس از دستیار: ${question}`, icon: <IconSpark />, run: () => ask(question) }] : [];
    }
    if (t.startsWith('+')) {
      const title = t.slice(1).trim();
      if (!title) return [];
      const p = parseTask(title);
      return [{ id: 'dyn-task', title: `افزودن تسک: ${p.title}${p.chips.length ? ` · ${p.chips.map((c) => c.label).join(' · ')}` : ''}`, icon: <IconCheckSquare />, run: async () => { await addParsed(p); } }];
    }
    if (t.startsWith('@')) {
      const title = t.slice(1).trim();
      return title ? [{ id: 'dyn-event', title: `رویداد امروز: ${title}`, icon: <IconCalendar />, run: async () => { await addEvent(dayKey(new Date()), title); } }] : [];
    }
    const m = t.match(/^([a-z])\s+(.+)$/i);
    if (m && ENGINES[m[1].toLowerCase()]) {
      const [name, url] = ENGINES[m[1].toLowerCase()];
      return [{ id: 'dyn-engine', title: `جستجو در ${name}: ${m[2]}`, icon: <IconSearch />, run: () => { location.href = url(m[2]); } }];
    }
    return [{ id: 'dyn-web', fallback: true, title: `جستجو در ${engineName()}: ${t}`, icon: <IconSearch />, run: () => { location.href = webSearchUrl(t); } }];
  });

  registerProvider((q) => {
    const query = q.trim().replace(/^حالت\s*/, '');
    if (!q.trim() || (!q.includes('حالت') && query.length < 2)) return [];
    return st().settings.modes
      .filter((m) => m.id !== st().settings.mode.active && (q.trim() === 'حالت' || m.name.includes(query)))
      .map((m) => ({ id: `mode-${m.id}`, title: `حالت ${m.name}`, hint: 'تغییر حالت', icon: <span aria-hidden="true">{m.icon}</span>, run: () => st().switchMode(m.id) }));
  });
  registerProvider((q) => {
    const m = /^[«"](.+?)[»"]?$/.exec(q.trim());
    if (!m || m[1].trim().length < 3) return [];
    return [{ id: 'sentence-add', title: `افزودن به جمله‌های من: «${m[1].trim()}»`, icon: <IconSpark />, run: async () => { await addSentence(m[1].trim()); } }];
  });
  registerCommand({ id: 'sentence-next', title: 'جمله‌ی دیگر روی پس‌زمینه', keywords: 'sentence quote جمله شعر', icon: <IconSpark />, run: () => { dispatchEvent(new Event('nova:sentence-next')); } });
  registerCommand({ id: 'schedule', title: 'تقویم و برنامه‌ی زمانی', keywords: 'schedule calendar برنامه زمانی تقویم هفته روز', icon: <IconCalendar />, run: () => { dispatchEvent(new CustomEvent('ora:schedule', { detail: {} })); } });
  registerCommand({ id: 'coach', title: 'گفتگو با اورآ (اولویت‌ها، نگرانی‌ها، عقب‌ماندن)', keywords: 'coach chat گفتگو مربی نگران اولویت عقب', icon: <IconSpark />, run: () => { dispatchEvent(new CustomEvent('ora:coach', { detail: {} })); } });
  registerCommand({ id: 'projects', title: 'پروژه‌ها', keywords: 'projects پروژه فاز هدف بلندمدت', icon: <IconCalendar />, run: () => { dispatchEvent(new CustomEvent('ora:projects', { detail: {} })); } });
  registerCommand({ id: 'review', title: 'جمع‌بندی روز و نمره', keywords: 'review جمع بندی نمره روز شب', icon: <IconSpark />, run: () => { dispatchEvent(new CustomEvent('ora:review')); } });
  registerCommand({ id: 'calendar-month', title: 'تقویم · نمای ماه', keywords: 'month calendar ماه تقویم ماهانه', icon: <IconCalendar />, run: () => { dispatchEvent(new CustomEvent('ora:schedule', { detail: { view: 'month' } })); } });
  registerCommand({ id: 'calendar-new', title: 'رویداد تازه در تقویم', keywords: 'event new رویداد جدید تقویم جلسه', icon: <IconCalendar />, run: () => { dispatchEvent(new CustomEvent('ora:event-editor', { detail: {} })); } });
  registerCommand({ id: 'schedule-wizard', title: 'برنامه‌ریزی قدم‌به‌قدم (چیدن هوشمند)', keywords: 'plan wizard برنامه ریزی چیدن هوشمند', icon: <IconSpark />, run: () => { dispatchEvent(new CustomEvent('ora:schedule', { detail: { wizard: true } })); } });
  registerCommand({ id: 'edit', title: 'ویرایش چیدمان', keywords: 'layout edit چیدمان جابجا', icon: <IconLayout />, run: () => st().setEditing(true) });
  registerCommand({ id: 'tour', title: 'آشنایی با اورآ', keywords: 'tour help راهنما آموزش آشنایی چطور', icon: <IconSpark />, run: () => { dispatchEvent(new CustomEvent('ora:tour', { detail: {} })); } });
  registerCommand({ id: 'settings', title: 'باز کردن شخصی‌سازی', keywords: 'settings تنظیمات رنگ فونت', icon: <IconSliders />, run: () => st().setPanel('settings') });
  registerCommand({ id: 'backup', title: 'خروجی گرفتن از داده‌ها', keywords: 'backup export پشتیبان', icon: <IconDownload />, run: () => exportBackup() });
  const scenes: [SceneId, string][] = [['galaxy', 'کهکشان'], ['waves', 'موج'], ['aurora', 'شفق'], ['orbs', 'اجرام شناور']];
  for (const [id, name] of scenes) {
    registerCommand({ id: `bg-${id}`, title: `پس‌زمینه: ${name}`, keywords: 'background سه بعدی 3d', icon: <IconImage />, run: () => st().setSettings({ background: { ...st().settings.background, kind: 'scene', scene: id } }) });
  }
  registerCommand({ id: 'bg-stars', title: 'پس‌زمینه: آسمان پرستاره', keywords: 'background stars', icon: <IconImage />, run: () => st().setSettings({ background: { ...st().settings.background, kind: 'starfield' } }) });
  for (const w of allWidgets()) {
    registerCommand({ id: `add-${w.type}`, title: `افزودن ویجت ${w.name}`, keywords: 'widget ویجت add', icon: <IconPlus />, run: () => { st().addWidget(w.type); st().setEditing(true); } });
  }
}

export function Palette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  registerBuiltins();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQ('');
        setSel(0);
      }
    };
    addEventListener('keydown', onKey);
    // The phone has no keyboard: its search bar's ⌘ button asks for the palette.
    const onAsk = () => { setOpen(true); setQ(''); setSel(0); };
    addEventListener('ora:palette', onAsk);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('ora:palette', onAsk);
    };
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  const results = useMemo(() => (open ? queryCommands(q).slice(0, 9) : []), [q, open]);
  if (!open) return null;

  const run = async (i: number) => {
    const c = results[i];
    if (!c) return;
    setOpen(false);
    await c.run();
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.35)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '14vh' }}>
      <div role="dialog" aria-label="فرمان‌ها" className="glass" style={{ width: 'min(620px, calc(100vw - 32px))', '--glass-solid': 'rgba(14,16,22,.9)', borderRadius: 20, overflow: 'hidden' } as import('react').CSSProperties}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', height: 60, borderBottom: '1px solid var(--line)' }}>
          <IconCommand className="ico muted" />
          <input ref={input} value={q} aria-label="فرمان یا جستجو"
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); void run(sel); }
              else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
            }}
            placeholder="جستجو یا فرمان…"
            style={{ flex: 1, border: 0, outline: 0, background: 'transparent', fontSize: 16 }} />
        </div>
        {!q && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 14px 0' }} aria-label="راهنمای فرمان‌ها">
            {([['+', 'تسک تازه'], ['@', 'رویداد'], ['?', 'پرسش از دستیار'], ['«', 'جمله‌ی خودت']] as const).map(([k, label]) => (
              <button key={k} className="palette-hint" onClick={() => { setQ(k === '«' ? '«' : `${k} `); input.current?.focus(); }}>
                <kbd dir="ltr">{k}</kbd>{label}
              </button>
            ))}
          </div>
        )}
        <div role="listbox" aria-label="نتایج" style={{ padding: 8, maxHeight: 420, overflowY: 'auto' }}>
          {results.map((c, i) => (
            <button key={c.id} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => void run(i)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: 0, borderRadius: 12, background: i === sel ? 'var(--fill-2)' : 'transparent', textAlign: 'right', fontSize: 14 }}>
              <span style={{ color: i === sel ? 'var(--accent)' : 'var(--text-3)', display: 'flex' }}>{c.icon}</span>
              <span style={{ flex: 1 }}>{c.title}</span>
              {i === sel && <kbd className="faint" style={{ fontFamily: 'inherit', fontSize: 11 }}>Enter</kbd>}
            </button>
          ))}
          {results.length === 0 && <div className="faint" style={{ padding: 14, fontSize: 13 }}>چیزی پیدا نشد.</div>}
        </div>
      </div>
    </div>
  );
}
