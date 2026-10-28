// «گفتگو با اورآ»: talk to the coach. Quick questions as chips, free text understood by rules
// (and by your local model only if you set one up). Every answer can be rated, so Ora learns how
// to say things to you.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { respond, runAction, rateStyle, STYLE_LABEL, type Action, type Reply } from '../core/coach';
import { IconChat, IconX } from './icons';

interface Msg { id: string; who: 'me' | 'ora'; text: string; reply?: Reply; rated?: boolean }
const LS = 'ora:coach-chat';
const load = (): Msg[] => { try { return JSON.parse(localStorage.getItem(LS) ?? '[]').slice(-40); } catch { return []; } };
const store = (m: Msg[]) => { try { localStorage.setItem(LS, JSON.stringify(m.slice(-40))); } catch { /* private */ } };

const CHIPS = ['الان چی کار کنم؟', 'اولویت‌هام درسته؟', 'عقبم', 'هفته‌ام چطوره؟', 'پروژه‌هام چطورن؟', 'چرا کارهام عقب می‌افتن؟'];
export const openCoach = (text?: string) => dispatchEvent(new CustomEvent('ora:coach', { detail: { text } }));

function Coach({ first, onClose }: { first?: string; onClose(): void }) {
  const [msgs, setMsgs] = useState<Msg[]>(load);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { store(msgs); list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);
  useEffect(() => { input.current?.focus(); if (first) void send(first); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.dlg-backdrop:not(.coach-bd)')) { e.stopPropagation(); onClose(); } };
    addEventListener('keydown', esc, true);
    return () => removeEventListener('keydown', esc, true);
  }, [onClose]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft('');
    const mine: Msg = { id: `m${Date.now()}`, who: 'me', text: t };
    setMsgs((m) => [...m, mine]);
    setBusy(true);
    try {
      const r = await respond(t);
      setMsgs((m) => [...m, { id: `o${Date.now()}`, who: 'ora', text: r.text, reply: r }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: `o${Date.now()}`, who: 'ora', text: `چیزی خراب شد: ${(e as Error).message}` }]);
    } finally { setBusy(false); }
  };
  const act = async (a: Action) => {
    const out = await runAction(a);
    if (out) setMsgs((m) => [...m, { id: `o${Date.now()}`, who: 'ora', text: out }]);
    if (['review', 'wizard', 'projects', 'project-new', 'open-task'].includes(a.kind)) onClose();
  };
  const rate = (id: string, good: boolean) => {
    setMsgs((m) => m.map((x) => (x.id === id ? { ...x, rated: true } : x)));
    const r = msgs.find((x) => x.id === id)?.reply;
    if (r?.style && r.ctx) void rateStyle(r.ctx, r.style, good);
  };

  return (
    <div className="dlg-backdrop coach-bd" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="گفتگو با اورآ" className="glass coach">
        <div className="pl-head"><IconChat size={18} /><h2 style={{ flex: 1 }}>گفتگو با اورآ</h2>
          {msgs.length > 0 && <button className="link-btn" onClick={() => setMsgs([])}>پاک کردن</button>}
          <button className="icon-btn" aria-label="بستن" onClick={onClose}><IconX size={18} /></button>
        </div>
        <div className="coach-list scroll" ref={list} aria-live="polite">
          {!msgs.length && <div className="coach-hello"><b>هر چیزی درباره‌ی کارها و وقتت.</b><span>با عددهای برنامه‌ی خودت جواب می‌دهم، نه با جمله‌های کلی. مثلاً «نگرانم به ارائه‌ی پنجشنبه نرسم».</span></div>}
          {msgs.map((m) => (
            <div key={m.id} className={`coach-msg ${m.who}`}>
              {m.reply?.title && <b className="coach-title">{m.reply.title}</b>}
              <p>{m.text}</p>
              {m.reply?.actions?.length ? <div className="coach-acts">{m.reply.actions.map((a) => <button key={a.label} className="btn btn-sm" onClick={() => void act(a)}>{a.label}</button>)}</div> : null}
              {m.reply?.style && !m.rated && (
                <span className="coach-rate">کمک کرد؟ <button className="pill pill-xs" onClick={() => rate(m.id, true)}>آره</button><button className="pill pill-xs" onClick={() => rate(m.id, false)}>نه</button><small>{STYLE_LABEL[m.reply.style]}</small></span>
              )}
            </div>
          ))}
          {busy && <div className="coach-msg ora"><p className="faint">…</p></div>}
        </div>
        <div className="coach-chips">{CHIPS.map((c) => <button key={c} className="pill pill-xs" onClick={() => void send(c)} disabled={busy}>{c}</button>)}</div>
        <form className="field coach-in" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
          <input ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="بنویس… مثلاً «نگرانم به امتحان آمار نرسم» یا «تمرین فیزیک رو انجام دادم»" aria-label="پیام به اورآ" />
          <button className="btn btn-sm btn-accent" type="submit" disabled={busy || !draft.trim()}>بفرست</button>
        </form>
      </div>
    </div>
  );
}

export function CoachHost() {
  const [open, setOpen] = useState<{ text?: string } | null>(null);
  useEffect(() => {
    const go = (e: Event) => setOpen((e as CustomEvent<{ text?: string }>).detail ?? {});
    addEventListener('ora:coach', go);
    return () => removeEventListener('ora:coach', go);
  }, []);
  return open ? createPortal(<Coach first={open.text} onClose={() => setOpen(null)} />, document.body) : null;
}
