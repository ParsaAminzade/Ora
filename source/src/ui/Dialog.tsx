// In-app confirm / text dialogs (instead of the browser's plain alert boxes).
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

interface Req { kind: 'confirm' | 'text'; message: string; value?: string; ok?: string; danger?: boolean; resolve(v: unknown): void }
const useDialog = create<{ req: Req | null; set(r: Req | null): void }>((set) => ({ req: null, set: (req) => set({ req }) }));

export const ask = (message: string, opts: { ok?: string; danger?: boolean } = {}) =>
  new Promise<boolean>((resolve) => useDialog.getState().set({ kind: 'confirm', message, ...opts, resolve: resolve as (v: unknown) => void }));

export const askText = (message: string, value = '', ok = 'ذخیره') =>
  new Promise<string | null>((resolve) => useDialog.getState().set({ kind: 'text', message, value, ok, resolve: resolve as (v: unknown) => void }));

export function DialogHost() {
  const req = useDialog((s) => s.req);
  const set = useDialog((s) => s.set);
  const [text, setText] = useState('');
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!req) return;
    setText(req.value ?? '');
    window.setTimeout(() => (req.kind === 'text' ? inputRef.current?.select() : okRef.current?.focus()), 30);
  }, [req]);

  if (!req) return null;
  const done = (v: unknown) => { set(null); req.resolve(v); };
  const ok = () => done(req.kind === 'text' ? (text.trim() || null) : true);
  const cancel = () => done(req.kind === 'text' ? null : false);

  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } }}>
      <div role="alertdialog" aria-modal="true" aria-label={req.message} className="dlg glass">
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.9 }}>{req.message}</p>
        {req.kind === 'text' && (
          <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} aria-label={req.message}
            onKeyDown={(e) => { if (e.key === 'Enter') ok(); }}
            style={{ height: 40, borderRadius: 12, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.3)', padding: '0 12px', fontSize: 14 }} />
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
          <button ref={okRef} className="btn btn-accent" style={req.danger ? { background: 'var(--danger)', color: '#1a0f0c' } : undefined} onClick={ok}>{req.ok ?? (req.danger ? 'حذف' : 'بله')}</button>
          <button className="btn" onClick={cancel}>انصراف</button>
        </div>
      </div>
    </div>
  );
}
