// The «معنی» card under a line: its plain-words reading (ganjoor / Ora / a local model, always
// labelled), your own reading, and — when you came from «منظورش را نفهمیدم» — «حالا روشن شد؟».
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Sentence } from '../core/db';
import { askModel, hasModel, MEANING_LABEL, meaningOf, saveMyMeaning, type Meaning } from '../core/meanings';
import { IconBook, IconX } from './icons';

export function MeaningCard({ s, anchor, ask, onClose, onStillUnclear }: { s: Sentence; anchor: DOMRect; ask?: boolean; onClose(): void; onStillUnclear(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Meaning | null | undefined>(undefined);
  const [mine, setMine] = useState(s.myMeaning ?? '');
  const [writing, setWriting] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [err, setErr] = useState('');
  const [pos, setPos] = useState({ left: 0, top: -9999, width: 520 });
  useEffect(() => { let live = true; void meaningOf(s).then((x) => { if (live) setM(x); }); return () => { live = false; }; }, [s]);
  useLayoutEffect(() => {
    const w = Math.min(540, innerWidth - 24);
    const h = ref.current?.offsetHeight ?? 160;
    const left = Math.max(12, Math.min(innerWidth - w - 12, anchor.left + anchor.width / 2 - w / 2));
    const below = anchor.bottom + 10;
    const top = below + h < innerHeight - 12 ? below : Math.max(12, anchor.top - h - 10);
    setPos({ left, top, width: w });
  }, [anchor, m, writing, thinking]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('.sentence-actions')) onClose(); };
    addEventListener('keydown', esc, true);
    const t = window.setTimeout(() => addEventListener('pointerdown', off, true), 0);
    return () => { removeEventListener('keydown', esc, true); window.clearTimeout(t); removeEventListener('pointerdown', off, true); };
  }, [onClose]);

  const model = async () => {
    setThinking(true); setErr('');
    try { setM(await askModel(s)); } catch { setErr('الان به مدل دسترسی ندارم.'); } finally { setThinking(false); }
  };

  return createPortal(
    <div ref={ref} role="dialog" aria-label="معنی جمله" className="glass meaning" style={{ left: pos.left, top: pos.top, width: pos.width }}>
      <div className="meaning-head">
        <IconBook size={16} />
        <b>{ask ? 'شاید این کمک کند' : 'معنی'}</b>
        {m && <span className={`meaning-src src-${m.src}`}>{MEANING_LABEL[m.src]}</span>}
        <button className="icon-btn" aria-label="بستن" onClick={onClose} style={{ marginInlineStart: 'auto', width: 30, height: 30 }}><IconX size={14} /></button>
      </div>
      {m === undefined && <p className="faint meaning-text">…</p>}
      {m && <p className="meaning-text">{m.text}</p>}
      {m === null && (
        <p className="faint meaning-text">برای این جمله هنوز معنی‌ای ثبت نشده.{hasModel() ? ' می‌توانی از مدل محلی بپرسی، یا برداشت خودت را بنویسی.' : ' برداشت خودت را بنویس؛ دفعه‌ی بعد همین را می‌بینی.'}</p>
      )}
      {s.myMeaning && !writing && <p className="meaning-mine"><span>برداشت تو:</span> {s.myMeaning}</p>}
      {writing && (
        <div className="meaning-write">
          <textarea autoFocus value={mine} onChange={(e) => setMine(e.target.value)} rows={3} placeholder="به نظرت منظورش چیست؟ با کلمه‌های خودت." aria-label="برداشت من" className="ev-input ev-notes" />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-accent" onClick={async () => { await saveMyMeaning(s, mine); s.myMeaning = mine.trim() || undefined; setWriting(false); }}>ذخیره</button>
            <button className="btn btn-sm" style={{ border: 0 }} onClick={() => setWriting(false)}>انصراف</button>
          </div>
        </div>
      )}
      {err && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{err}</span>}
      {!writing && (
        <div className="meaning-acts">
          {ask ? (
            <>
              <button className="btn btn-sm btn-accent" onClick={onClose}>روشن شد</button>
              <button className="btn btn-sm" onClick={onStillUnclear}>هنوز گنگ است</button>
            </>
          ) : null}
          <button className="btn btn-sm" style={{ border: 0 }} onClick={() => setWriting(true)}>{s.myMeaning ? 'ویرایش برداشت من' : 'برداشت خودم'}</button>
          {hasModel() && m?.src !== 'ganjoor' && <button className="btn btn-sm" style={{ border: 0 }} disabled={thinking} onClick={() => void model()}>{thinking ? 'دارد فکر می‌کند…' : m?.src === 'ai' ? 'دوباره بپرس' : 'از مدل بپرس'}</button>}
          {!ask && <button className="link-btn" style={{ marginInlineStart: 'auto', alignSelf: 'center' }} onClick={onStillUnclear}>منظورش را نفهمیدم</button>}
        </div>
      )}
    </div>,
    document.body,
  );
}
