// "Your own widget": any HTML/CSS/JS you write, run in a sandboxed page (manifest "sandbox").
// The sandbox can't touch the extension; it talks to Nova only through window.nova:
//   nova.tasks() · nova.addTask(title) · nova.events(fromDay, toDay) · nova.today()
//   nova.ai(prompt) · nova.storage.get(key) / nova.storage.set(key, value)
import { useEffect, useRef, useState } from 'react';
import { defineWidget } from '../core/widgets';
import { useStore } from '../core/state';
import { db, uid } from '../core/db';
import { localCalendar } from '../core/providers/calendar';
import { streamChat } from '../core/providers/ai';
import { dayKey, formatJalaliLong } from '../core/dates';
import { IconCode, IconPlay, IconX } from '../ui/icons';

interface Config {
  code: string;
  store: Record<string, unknown>;
}

const TEMPLATES: Record<string, { label: string; code: string }> = {
  countdown: {
    label: 'شمارش معکوس',
    code: `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
  <div style="font-size:13px;opacity:.7" id="t">تا دفاع</div>
  <div style="font-size:44px;font-weight:200" id="d">…</div>
</div>
<script>
  // تاریخ هدف را عوض کن (میلادی، YYYY-MM-DD)
  const target = new Date('2027-05-15T09:00:00');
  const days = Math.ceil((target - new Date()) / 864e5);
  document.getElementById('d').textContent = days.toLocaleString('fa-IR') + ' روز';
</script>`,
  },
  important: {
    label: 'تسک‌های مهم',
    code: `<div style="padding:16px">
  <div style="font-weight:600;margin-bottom:8px">مهم‌ها</div>
  <ul id="l" style="margin:0;padding-inline-start:18px;line-height:2"></ul>
</div>
<script>
  nova.tasks().then(ts => {
    const l = document.getElementById('l');
    ts.filter(t => !t.done && t.priority).forEach(t => { const li = document.createElement('li'); li.textContent = t.title; l.appendChild(li); });
    if (!l.children.length) l.outerHTML = '<div style="opacity:.6">کار مهمی باقی نمانده</div>';
  });
</script>`,
  },
  counter: {
    label: 'شمارنده‌ی ماندگار',
    code: `<div style="height:100%;display:flex;align-items:center;justify-content:center;gap:12px">
  <button id="b" style="font:inherit;padding:8px 16px;border-radius:12px;border:0;background:var(--accent);color:#14110C">+۱</button>
  <span id="n" style="font-size:32px">۰</span>
</div>
<script>
  let n = 0;
  const show = () => document.getElementById('n').textContent = n.toLocaleString('fa-IR');
  nova.storage.get('n').then(v => { n = v || 0; show(); });
  document.getElementById('b').onclick = () => { n++; show(); nova.storage.set('n', n); };
</script>`,
  },
  ai: {
    label: 'جمله‌ی انگیزشی با هوش مصنوعی',
    code: `<div style="padding:16px;line-height:1.9" id="q">…</div>
<script>
  nova.ai('یک جمله‌ی کوتاه و واقعی (نه کلیشه‌ای) برای شروع یک روز کاری پژوهشی بنویس.').then(t => document.getElementById('q').textContent = t)
    .catch(e => document.getElementById('q').textContent = 'هوش مصنوعی در دسترس نیست: ' + e.message);
</script>`,
  },
};

const sandboxUrl = () => (typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.getURL('sandbox.html') : 'sandbox.html');

function themeVars(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(['--accent', '--on-accent', '--text', '--text-2', '--text-3', '--fill', '--fill-2', '--line', '--font'].map((k) => [k, cs.getPropertyValue(k).trim()]));
}

defineWidget<Config>({
  type: 'custom',
  name: 'ویجت خودت',
  description: 'HTML و JavaScript خودت، در محیط ایزوله، با دسترسی کنترل‌شده به تسک‌ها، تقویم و هوش مصنوعی',
  icon: <IconCode />,
  defaultSize: { w: 6, h: 5 },
  minSize: { w: 3, h: 3 },
  defaultConfig: { code: TEMPLATES.countdown.code, store: {} },
  multiple: true,
  Component: function Custom({ config, setConfig }) {
    const frame = useRef<HTMLIFrameElement>(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(config.code);
    const [error, setError] = useState<string | null>(null);
    const [rev, setRev] = useState(0);
    const cfgRef = useRef(config);
    cfgRef.current = config;
    const accent = useStore((s) => s.settings.accent);

    useEffect(() => {
      const onMsg = async (e: MessageEvent) => {
        if (e.source !== frame.current?.contentWindow) return;
        const m = e.data ?? {};
        const win = frame.current!.contentWindow!;
        if (m.nova === 'ready') { setError(null); win.postMessage({ nova: 'render', code: cfgRef.current.code, vars: themeVars() }, '*'); return; }
        if (m.nova === 'error') { setError(String(m.message)); return; }
        if (m.nova !== 'req') return;
        const reply = (result: unknown, error?: string) => win.postMessage({ nova: 'res', id: m.id, result, error }, '*');
        try {
          const a = m.args ?? [];
          switch (m.method) {
            case 'tasks': return reply(await db.tasks.orderBy('order').toArray());
            case 'addTask': {
              const title = String(a[0] ?? '').trim().slice(0, 300);
              if (!title) return reply(null, 'empty title');
              await db.tasks.put({ id: uid(), title, done: false, priority: 0, order: Date.now(), createdAt: Date.now(), when: dayKey(new Date()) });
              return reply(true);
            }
            case 'events': return reply(await localCalendar.list(String(a[0]), String(a[1])));
            case 'today': { const d = new Date(); return reply({ day: dayKey(d), jalali: formatJalaliLong(d) }); }
            case 'storageGet': return reply(cfgRef.current.store?.[String(a[0])] ?? null);
            case 'storageSet': {
              const store = { ...(cfgRef.current.store ?? {}), [String(a[0])]: a[1] };
              if (JSON.stringify(store).length > 100_000) return reply(null, 'storage full (100KB)');
              setConfig({ store });
              return reply(true);
            }
            case 'ai': {
              let out = '';
              await streamChat(useStore.getState().settings.ai, [{ role: 'user', content: String(a[0] ?? '').slice(0, 4000) }], (d) => { out += d; });
              return reply(out);
            }
            default: return reply(null, `unknown method ${m.method}`);
          }
        } catch (err) {
          reply(null, (err as Error).message);
        }
      };
      addEventListener('message', onMsg);
      return () => removeEventListener('message', onMsg);
    }, [setConfig]);

    // Re-theme the widget when the accent colour changes.
    useEffect(() => { frame.current?.contentWindow?.postMessage({ nova: 'theme', vars: themeVars() }, '*'); }, [accent]);

    return (
      <div style={{ height: '100%', position: 'relative' }}>
        {!editing && (
          <iframe key={rev} ref={frame} src={sandboxUrl()} title="ویجت خودت" sandbox="allow-scripts"
            style={{ border: 0, width: '100%', height: '100%', background: 'transparent', colorScheme: 'dark' }} />
        )}
        {editing && (
          <div style={{ position: 'absolute', inset: 0, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(12,14,20,.92)', zIndex: 2 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>کد ویجت</span>
              <select aria-label="نمونه‌ها" defaultValue="" onChange={(e) => { const t = TEMPLATES[e.target.value]; if (t) setDraft(t.code); e.target.value = ''; }}
                style={{ height: 28, borderRadius: 8, border: '1px solid var(--line-2)', background: '#12141B', fontSize: 11 }}>
                <option value="" disabled>نمونه‌ها…</option>
                {Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
              </select>
            </div>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} dir="ltr" aria-label="کد HTML و JavaScript"
              style={{ flex: 1, resize: 'none', borderRadius: 10, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.4)', padding: 10, fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.6, textAlign: 'left' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-accent" style={{ height: 32 }} onClick={() => { setConfig({ code: draft }); setEditing(false); setRev((r) => r + 1); }}><IconPlay size={14} />اجرا</button>
              <button className="btn" style={{ height: 32 }} onClick={() => { setDraft(config.code); setEditing(false); }}>انصراف</button>
            </div>
          </div>
        )}
        {error && !editing && (
          <div role="alert" style={{ position: 'absolute', bottom: 6, insetInline: 6, fontSize: 11, color: 'var(--danger)', background: 'rgba(0,0,0,.6)', borderRadius: 8, padding: '4px 8px', direction: 'ltr', textAlign: 'left', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error}</span>
            <button aria-label="بستن خطا" onClick={() => setError(null)} style={{ border: 0, background: 'none', color: 'inherit', padding: 0 }}><IconX size={12} /></button>
          </div>
        )}
        {!editing && (
          <button className="icon-btn" aria-label="ویرایش کد ویجت" onClick={() => { setDraft(config.code); setEditing(true); }}
            style={{ position: 'absolute', top: 6, left: 6, width: 28, height: 28, opacity: 0.55, zIndex: 1 }}>
            <IconCode size={14} />
          </button>
        )}
      </div>
    );
  },
});
