// Day one: two one-tap questions, so Ora is useful today — not after days of silent watching.
// Asked at most twice (today, and once more another day if you said «بعداً»), then never again.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BANDS, bandLabel, loadSelf, saveSelf, type Band, type When } from '../core/selfreport';
import { isQuiet } from '../core/safety';
import { useStore } from '../core/state';
import { IconX } from './icons';

const ASKED = 'ora:self-asked';
type Asked = { n: number; at: number; shown?: number };
const readAsked = (): Asked => { try { return JSON.parse(localStorage.getItem(ASKED) ?? 'null') ?? { n: 0, at: 0 }; } catch { return { n: 0, at: 0 }; } };
const writeAsked = (a: Asked) => { try { localStorage.setItem(ASKED, JSON.stringify(a)); } catch { /* */ } };

/** What the method is called, in Ora's own words — used wherever Ora explains why it asks. */
export const WHY_ASK = 'اورآ با روش «آینه» کار می‌کنه: به‌جای اینکه درباره‌ت حدس بزنه، از خودت می‌پرسه، و با هر جوابت همون لحظه کارش رو عوض می‌کنه. جواب‌ها فقط روی همین دستگاه می‌مونن و توی «اورآ درباره‌ی تو چه می‌داند» می‌بینیشون، با دکمه‌ی پاک کردن.';

function Card({ onClose }: { onClose(): void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [bands, setBands] = useState<Band[]>([]);
  const [dontKnow, setDontKnow] = useState(false);
  const [done, setDone] = useState('');
  const [why, setWhy] = useState(false);
  const toggle = (b: Band) => { setDontKnow(false); setBands((x) => (x.includes(b) ? x.filter((y) => y !== b) : [...x, b])); };
  const finish = async (when: When) => {
    await saveSelf({ bands, dontKnow, when, at: Date.now() });
    const said = bands.length ? `معمولاً ${bandLabel(bands)}` : 'هنوز نمی‌دونی کِی';
    setDone(when === 'asked'
      ? 'باشه؛ تا خودت نخوای، از خودم چیزی نمی‌گم.'
      : `فهمیدم: ${said}. از امروز ${when === 'my-hours' && bands.length ? 'فقط همین ساعت‌ها' : ''} حواسم هست، و اگه دیدم داری وقت هدر می‌دی، فقط یه سؤال می‌پرسم.`.replace('  ', ' '));
    setStep(3);
    window.setTimeout(onClose, 6000);
  };
  const later = () => { const a = readAsked(); writeAsked({ ...a, n: a.n + 1, at: Date.now() }); onClose(); };
  return createPortal(
    <div className="cause quick glass" role="dialog" aria-label="دو تا سؤال از اورآ">
      <button className="icon-btn cause-x" aria-label="بعداً" title="بعداً" onClick={step === 3 ? onClose : later}><IconX size={16} /></button>
      {step === 3 ? <p className="cause-done">{done}</p> : (
        <>
          <span className="quick-h">دو تا سؤال یه‌لمسی، تا اورآ از همین امروز به کارت بیاد؛ نه دو هفته‌ی دیگه.</span>
          {step === 1 ? (
            <>
              <p className="cause-q">معمولاً کِی بیشتر وقتت هدر می‌ره؟</p>
              <div className="cause-chips">
                {BANDS.map(([k, l]) => <button key={k} className="pill" aria-pressed={bands.includes(k)} onClick={() => toggle(k)}>{l}</button>)}
                <button className="pill" aria-pressed={dontKnow} onClick={() => { setBands([]); setDontKnow(true); }}>نمی‌دونم</button>
              </div>
              <div className="cause-acts"><button className="btn btn-accent" disabled={!bands.length && !dontKnow} onClick={() => setStep(2)}>بعدی</button></div>
            </>
          ) : (
            <>
              <p className="cause-q">دوست داری کِی یه تلنگر بزنم؟</p>
              <div className="cause-chips quick-col">
                <button className="pill" onClick={() => void finish('needed')}>هر وقت دیدی لازمه</button>
                {bands.length > 0 && <button className="pill" onClick={() => void finish('my-hours')}>فقط همون ساعت‌هایی که گفتم</button>}
                <button className="pill" onClick={() => void finish('asked')}>فقط وقتی خودم خواستم</button>
              </div>
            </>
          )}
          <div className="cause-foot">
            <button className="btn-link" onClick={later}>بعداً</button>
            <button className="btn-link" aria-expanded={why} onClick={() => setWhy((x) => !x)}>چرا می‌پرسی؟</button>
          </div>
          {why && <p className="cause-why">{WHY_ASK}</p>}
        </>
      )}
    </div>,
    document.body,
  );
}

export function QuickStartHost() {
  const loaded = useStore((s) => s.loaded);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true); // from «اورآ درباره‌ی تو چه می‌داند»: answer again
    addEventListener('ora:quick-start', on);
    return () => removeEventListener('ora:quick-start', on);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const t = window.setTimeout(async () => {
      if ((await loadSelf())?.at) return;
      const a = readAsked();
      if (a.n >= 2 || (a.shown ?? 0) >= 3 || Date.now() - a.at < 20 * 3600_000) return; // «بعداً» twice, or left unanswered three times = no
      const st = useStore.getState();
      if (isQuiet() || st.panel !== 'none' || st.editing || document.querySelector('[role="dialog"]')) return;
      try { if (Date.now() - Number(localStorage.getItem('ora:tip-at') ?? 0) < 60_000) return; localStorage.setItem('ora:tip-at', String(Date.now())); } catch { /* */ }
      writeAsked({ ...a, at: Date.now(), shown: (a.shown ?? 0) + 1 });
      setOpen(true);
    }, 20_000);
    return () => window.clearTimeout(t);
  }, [loaded]);
  return open ? <Card onClose={() => setOpen(false)} /> : null;
}
