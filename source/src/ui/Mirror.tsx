// «لحظه‌ی اورآ» on a new tab: a mirror of what Ora knows (one short line), one one-tap question,
// «الان نه», «مزاحم نشو» and «چرا الان؟». The decision is in core/mirror.ts.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { answer, ANSWERS, decide, REPLY, settleOutcomes, type Answer, type Moment } from '../core/mirror';
import { useStore } from '../core/state';
import { IconX } from './icons';

export function MirrorCard({ m, onClose }: { m: Moment; onClose(): void }) {
  const [why, setWhy] = useState(false);
  const [more, setMore] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const order = [...m.guess, ...ANSWERS.map(([a]) => a).filter((a) => !m.guess.includes(a))];
  const label = (a: Answer) => ANSWERS.find(([x]) => x === a)?.[1] ?? a;
  const pick = (a: Answer) => { void answer(a); setReply(REPLY[a] ?? 'باشه.'); if (a === 'working') window.setTimeout(onClose, 3500); };
  const step = () => { void answer('step'); dispatchEvent(new Event('ora:focus-start')); onClose(); };
  return createPortal(
    <div className="cause mirror glass" role="dialog" aria-label="اورآ">
      <button className="icon-btn cause-x" aria-label="الان نه" title="الان نه" onClick={() => { if (!reply) void answer('not-now'); onClose(); }}><IconX size={16} /></button>
      {m.sim && <span className="mirror-sim">حالت آزمایشی</span>}
      {reply ? (
        <>
          <p className="cause-done">{reply}</p>
          <div className="cause-acts">
            <button className="btn btn-accent" onClick={step}>شروع تمرکز</button>
            <button className="btn" onClick={onClose}>بستن</button>
          </div>
        </>
      ) : (
        <>
          <p className="cause-q">{m.signal.mirror} الان ذهنت کجاست؟</p>
          <div className="cause-chips">
            {(more ? order : order.slice(0, 4)).map((a) => <button key={a} className="pill" onClick={() => pick(a)}>{label(a)}</button>)}
            {!more && <button className="btn-link" onClick={() => setMore(true)}>بیشتر…</button>}
          </div>
          <div className="cause-foot">
            <button className="btn-link" onClick={() => { void answer('not-now'); onClose(); }}>الان نه</button>
            <button className="btn-link" onClick={() => { void answer('stop'); onClose(); }}>مزاحم نشو</button>
            <button className="btn-link" aria-expanded={why} onClick={() => setWhy((x) => !x)}>چرا الان؟</button>
          </div>
          {why && <p className="cause-why">{m.signal.why} {m.sim ? 'این مقایسه با ۱۴ روز شبیه‌سازی‌شده است، چون حالت آزمایشی روشن است.' : 'این را با حالت عادی خودت مقایسه می‌کنم، نه با یک عدد ثابت.'} هیچ آدرس و صفحه‌ای را نمی‌بینم؛ فقط می‌شمارم. «مزاحم نشو» یک پله کمترم می‌کند.</p>}
        </>
      )}
    </div>,
    document.body,
  );
}

export function MirrorHost() {
  const loaded = useStore((s) => s.loaded);
  const [m, setM] = useState<Moment | null>(null);
  useEffect(() => {
    const on = (e: Event) => setM((e as CustomEvent<Moment>).detail);
    addEventListener('ora:mirror', on);
    return () => removeEventListener('ora:mirror', on);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    void settleOutcomes();
    // Only if this tab stays and you don't touch Ora: not a purposeful tab, not using Ora.
    let touched = false;
    const touch = () => { touched = true; };
    for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, touch, { capture: true, passive: true });
    const t = window.setTimeout(async () => {
      if (touched || document.visibilityState !== 'visible') return;
      const r = await decide();
      if (r.moment) { try { localStorage.setItem('ora:tip-at', String(Date.now())); } catch { /* */ } setM(r.moment); }
    }, 10_000);
    return () => { window.clearTimeout(t); for (const ev of ['pointerdown', 'keydown']) removeEventListener(ev, touch, { capture: true }); };
  }, [loaded]);
  return m ? <MirrorCard m={m} onClose={() => setM(null)} /> : null;
}
