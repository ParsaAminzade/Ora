// The one-screen terms dialog: «قبول دارم» turns sharing on, «ادامه بدون ارسال» keeps Ora fully working with nothing sent.
import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../core/state';
import { fa } from '../core/dates';
import { ALL_CONSENT, NO_CONSENT, currentLegal, privacyOf, serverBase, setConsent, setPrivacy, termsOk, type Legal } from '../core/remote';
import { IconX } from './icons';

const say = (text: string) => dispatchEvent(new CustomEvent('ora:say', { detail: { text } }));

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange(v: boolean): void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className="ora-switch" onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function LegalHost() {
  const loaded = useStore((s) => s.loaded);
  const [open, setOpen] = useState(false);
  const [legal, setLegal] = useState<Legal | null>(null);
  const show = useCallback(async () => { setLegal(await currentLegal()); setOpen(true); }, []);
  useEffect(() => {
    const on = () => void show();
    addEventListener('ora:legal', on);
    return () => removeEventListener('ora:legal', on);
  }, [show]);
  useEffect(() => {
    if (!loaded) return;
    const t = window.setTimeout(async () => {
      const p = privacyOf();
      if (!serverBase(p)) return;
      // Ask once; again only when the terms change after being accepted.
      if (p.terms ? !(await termsOk(p)) : !p.declinedAt) void show();
    }, 2500);
    return () => window.clearTimeout(t);
  }, [loaded, show]);
  return !open || !legal ? null : <LegalDialog legal={legal} onClose={() => setOpen(false)} />;
}

function LegalDialog({ legal, onClose }: { legal: Legal; onClose(): void }) {
  const p = privacyOf();
  const changed = !!p.terms && p.terms.v !== legal.version;
  const [busy, setBusy] = useState(false);
  const skip = () => {
    if (!p.terms || changed) {
      if (p.terms) void setConsent(NO_CONSENT); else setPrivacy({ declinedAt: Date.now() });
      say('باشد. اورآ کامل کار می‌کند و چیزی از تو فرستاده نمی‌شود. اگر نظرت عوض شد: تنظیمات › حریم خصوصی و داده‌ها.');
    }
    onClose();
  };
  const accept = async () => {
    setBusy(true);
    setPrivacy({ terms: { v: legal.version, at: Date.now() }, declinedAt: undefined });
    await setConsent(ALL_CONSENT);
    say('ممنون! از این به بعد اورآ جمله‌ها را کم‌کم با سلیقه‌ات جور می‌کند.');
    onClose();
  };
  return (
    <div className="dlg-backdrop legal-backdrop" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div role="dialog" aria-modal="true" aria-label={legal.title} className="legal legal-one glass">
        <header className="legal-head">
          <div>
            <h2>{changed ? 'قوانین اورآ کمی به‌روز شد' : 'قبل از شروع، یک نکته‌ی کوتاه'}</h2>
            <span className="faint">{legal.title} · نسخه‌ی {fa(legal.version)}</span>
          </div>
          <button className="icon-btn" aria-label="بستن" onClick={onClose}><IconX size={18} /></button>
        </header>
        <div className="legal-body scroll" tabIndex={0} aria-label="خلاصه‌ی قوانین">
          <ul className="legal-points">{legal.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
          <details className="legal-full">
            <summary>متن کامل قوانین</summary>
            {legal.sections.map((s) => (
              <section key={s.title}><h3>{s.title}</h3><p style={{ whiteSpace: 'pre-line' }}>{s.body}</p></section>
            ))}
            <p className="faint legal-end">به‌روزرسانی {fa(legal.updated)}</p>
          </details>
        </div>
        <footer className="legal-foot">
          <div className="legal-btns">
            <button className="btn btn-accent legal-accept" disabled={busy} onClick={() => void accept()} autoFocus>قبول دارم</button>
            <button className="btn-link legal-skip" onClick={skip}>ادامه بدون ارسال</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
