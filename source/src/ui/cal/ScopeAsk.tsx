// «فقط این / این و بعدی‌ها / همه» for changes to a repeating event.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Scope } from '../../core/calendar-service';

interface Req { kind: 'edit' | 'delete'; google: boolean; resolve(s: Scope | null): void }
let push: ((r: Req) => void) | null = null;

export const askScope = (kind: 'edit' | 'delete', google = false) =>
  new Promise<Scope | null>((resolve) => { if (push) push({ kind, google, resolve }); else resolve('all'); });

export function ScopeHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [pick, setPick] = useState<Scope>('one');
  useEffect(() => { push = (r) => { setPick('one'); setReq(r); }; return () => { push = null; }; }, []);
  if (!req) return null;
  const done = (s: Scope | null) => { setReq(null); req.resolve(s); };
  const opts: [Scope, string][] = req.google ? [['one', 'فقط همین'], ['all', 'همه‌ی تکرارها']] : [['one', 'فقط همین'], ['following', 'همین و بعدی‌ها'], ['all', 'همه‌ی تکرارها']];
  return createPortal(
    <div className="dlg-backdrop" style={{ zIndex: 120 }} onMouseDown={(e) => { if (e.target === e.currentTarget) done(null); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } }}>
      <div role="alertdialog" aria-modal="true" aria-label={req.kind === 'edit' ? 'تغییر رویداد تکراری' : 'حذف رویداد تکراری'} className="dlg glass">
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{req.kind === 'edit' ? 'این رویداد تکرار می‌شود. تغییر برای کدام؟' : 'این رویداد تکرار می‌شود. کدام حذف شود؟'}</p>
        <div className="scope-opts" role="radiogroup">
          {opts.map(([k, n]) => (
            <label key={k} className="scope-opt"><input type="radio" name="scope" className="chk chk-r" checked={pick === k} onChange={() => setPick(k)} />{n}</label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-accent" autoFocus style={req.kind === 'delete' ? { background: 'var(--danger)', color: '#1a0f0c' } : undefined} onClick={() => done(pick)}>{req.kind === 'edit' ? 'تأیید' : 'حذف'}</button>
          <button className="btn" onClick={() => done(null)}>انصراف</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
