// «اورآ رو بیار روی صفحه‌ی اصلی گوشیت»: on a phone, in the browser, until Ora is installed.
//
// Always there, never in the way:
// · a small «نصب» button stays in the phone header until Ora is on the home screen
// · the card itself comes 15 s after the first visit, then again after 1, 2, 4 and 7 days, then once
//   a week — never while something else is open or Ora has just said something
// · «بعداً» asks «چرا؟» (one tap, skippable): «بلد نیستم» shows the steps, «تو مرورگر راحت‌ترم» waits
//   two weeks, «زیاد می‌پرسی» doubles the wait
// · Android Chrome/Edge/Samsung with an install offer: one tap («نصب»). Elsewhere: the exact steps for
//   that browser. iPhone: Share → Add to Home Screen. Inside Telegram/Instagram/Eitaa…: open it in a
//   real browser first.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { note, shouldAsk } from '../core/feedback';
import { isQuiet } from '../core/safety';
import { useStore } from '../core/state';
import { IS_WEB_BUILD } from '../core/platform';
import { IconDownload, IconX } from './icons';
import { WhyNot } from './WhyNot';

type Bip = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const ua = () => navigator.userAgent;
export const installed = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || !!(navigator as { standalone?: boolean }).standalone || (() => { try { return !!localStorage.getItem('ora:installed'); } catch { return false; } })();
export const onPhone = () => /Android|iPhone|iPad|iPod|Mobile/i.test(ua()) || (matchMedia('(pointer: coarse)').matches && innerWidth < 900);
type Where = 'prompt' | 'ios-safari' | 'ios-other' | 'inapp' | 'samsung' | 'firefox' | 'android';
export function where(): Where {
  const u = ua();
  if (/Instagram|FBAN|FBAV|Telegram|Eitaa|Bale|Rubika|Soroush|Line\/|Twitter|WhatsApp|; wv\)/i.test(u)) return 'inapp';
  const ios = /iPhone|iPad|iPod/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(u) ? 'ios-other' : 'ios-safari';
  if ((globalThis as { oraInstall?: Bip }).oraInstall) return 'prompt';
  if (/SamsungBrowser/.test(u)) return 'samsung';
  if (/Firefox/.test(u)) return 'firefox';
  return 'android';
}
const STEPS: Record<Exclude<Where, 'prompt'>, string[]> = {
  'ios-safari': ['پایین صفحه دکمه‌ی اشتراک‌گذاری را بزن (مربع با فلش رو به بالا).', 'کمی پایین برو و «Add to Home Screen» یا «افزودن به صفحه‌ی اصلی» را بزن.', 'بالا سمت راست «Add» را بزن.'],
  'ios-other': ['دکمه‌ی اشتراک‌گذاری را بزن (کنار نوار آدرس یا در منو).', '«Add to Home Screen» یا «افزودن به صفحه‌ی اصلی» را بزن. اگر نبود، همین صفحه را در Safari باز کن.', '«Add» را بزن.'],
  inapp: ['این صفحه داخل یک برنامه‌ی دیگر (مثل تلگرام یا اینستاگرام) باز شده و از این‌جا نصب نمی‌شود.', 'از منوی ⋮ یا ... گزینه‌ی «باز کردن در مرورگر» (Open in browser / Chrome / Safari) را بزن.', 'در مرورگر، دوباره همین پیشنهاد را می‌بینی.'],
  samsung: ['پایین صفحه منوی ≡ را بزن.', '«افزودن صفحه به» (Add page to) را بزن.', '«صفحه‌ی اصلی» (Home screen) را انتخاب کن.'],
  firefox: ['بالا یا پایین صفحه منوی ⋮ را بزن.', '«نصب» (Install) یا «افزودن به صفحه‌ی اصلی» را بزن.', 'تأیید کن.'],
  android: ['بالای صفحه منوی ⋮ مرورگر را بزن.', '«نصب برنامه» (Install app) یا «افزودن به صفحه‌ی اصلی» را بزن.', '«نصب» یا «افزودن» را تأیید کن.'],
};

const KEY = 'ora:install-ask';
type Ask = { n: number; next: number };
const DAYS = [1, 2, 4, 7]; // then weekly
const read = (): Ask => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? { n: 0, next: 0 }; } catch { return { n: 0, next: 0 }; } };
const write = (a: Ask) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* */ } };
const later = (days?: number) => { const a = read(); const d = days ?? DAYS[Math.min(a.n, DAYS.length - 1)]; write({ n: a.n + 1, next: Date.now() + d * 86_400_000 }); };

function Card({ steps: startSteps, onClose }: { steps: boolean; onClose(): void }) {
  const w = where();
  const [steps, setSteps] = useState(startSteps || (w !== 'prompt'));
  const [why, setWhy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const install = async () => {
    const e = (globalThis as { oraInstall?: Bip }).oraInstall;
    if (!e) { setSteps(true); return; }
    await e.prompt();
    const { outcome } = await e.userChoice;
    (globalThis as { oraInstall?: Bip }).oraInstall = undefined;
    if (outcome === 'accepted') { void note('install', 'yes'); setDone('اورآ داره روی صفحه‌ی اصلی‌ت می‌شینه. از این به بعد با یه لمس بازش کن.'); window.setTimeout(onClose, 4000); }
    else void no();
  };
  const no = async () => { later(); if (await shouldAsk('install')) setWhy(true); else { void note('install', 'skip'); onClose(); } };
  return createPortal(
    <div className="cause install glass" role="dialog" aria-label="نصب اورآ روی گوشی">
      <button className="icon-btn cause-x" aria-label="بعداً" title="بعداً" onClick={() => (why || done ? onClose() : void no())}><IconX size={16} /></button>
      {done ? <p className="cause-done">{done}</p> : why ? <WhyNot kind="install" onDone={onClose} /> : (
        <>
          <p className="cause-q">اورآ رو بیار روی صفحه‌ی اصلی گوشیت</p>
          {!steps && (
            <ul className="install-why">
              <li>با یه لمس باز می‌شه، تمام‌صفحه، مثل یه برنامه</li>
              <li>بدون اینترنت هم کار می‌کنه</li>
              <li>یادآوری کارهات به‌موقع می‌رسه</li>
            </ul>
          )}
          {steps && w !== 'prompt' && <ol className="install-steps">{STEPS[w].map((s) => <li key={s}>{s}</li>)}</ol>}
          <div className="cause-acts">
            {w === 'prompt' && <button className="btn btn-accent" onClick={() => void install()}><IconDownload size={15} /> نصب</button>}
            {w !== 'prompt' && steps && <button className="btn btn-accent" onClick={() => { void note('install', 'yes'); setDone('عالی! بعد از نصب، اورآ رو از صفحه‌ی اصلی باز کن.'); window.setTimeout(onClose, 3500); }}>انجام دادم</button>}
            <button className="btn" onClick={() => void no()}>بعداً</button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

/** The install card is due on this visit: other unasked things (the eye's tips) step aside for it. */
export const installDue = () => IS_WEB_BUILD && onPhone() && !installed() && Date.now() >= read().next;

/** The card, on its schedule; plus «ora:install-open» from the header button or a «why not» answer. */
export function InstallHost() {
  const loaded = useStore((s) => s.loaded);
  const [open, setOpen] = useState<{ steps: boolean } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setOpen({ steps: !!(e as CustomEvent<{ steps?: boolean }>).detail?.steps });
    const fb = (e: Event) => {
      const d = (e as CustomEvent<{ kind: string; reason: string }>).detail;
      if (d.kind !== 'install') return;
      if (d.reason === 'browser') later(14);
      if (d.reason === 'too-often') { const a = read(); write({ n: a.n, next: Date.now() + 2 * Math.max(86_400_000, a.next - Date.now()) }); }
    };
    const gone = () => setOpen(null);
    addEventListener('ora:install-open', on); addEventListener('ora:fb', fb); addEventListener('ora:installed', gone);
    return () => { removeEventListener('ora:install-open', on); removeEventListener('ora:fb', fb); removeEventListener('ora:installed', gone); };
  }, []);
  useEffect(() => {
    if (!loaded || installed() || !onPhone()) return;
    let t = 0;
    const tryShow = () => {
      if (installed() || Date.now() < read().next || isQuiet()) return;
      const st = useStore.getState();
      if (st.panel !== 'none' || st.editing || document.querySelector('[role="dialog"]')) return;
      try { if (Date.now() - Number(localStorage.getItem('ora:tip-at') ?? 0) < 60_000) return; localStorage.setItem('ora:tip-at', String(Date.now())); } catch { /* */ }
      const a = read(); write({ ...a, next: Date.now() + (a.n === 0 ? 3600_000 : 86_400_000) }); // not again this visit, whatever happens
      setOpen({ steps: false });
    };
    t = window.setTimeout(tryShow, 15_000);
    const iv = window.setInterval(tryShow, 120_000); // something else was speaking: try again a bit later
    return () => { window.clearTimeout(t); window.clearInterval(iv); };
  }, [loaded]);
  const close = useCallback(() => setOpen(null), []);
  return open && !installed() ? <Card steps={open.steps} onClose={close} /> : null;
}

/** The small button in the phone header, there until Ora is installed. */
export function InstallButton() {
  const [show, setShow] = useState(() => !installed());
  useEffect(() => { const f = () => setShow(false); addEventListener('ora:installed', f); return () => removeEventListener('ora:installed', f); }, []);
  if (!show) return null;
  return <button className="install-btn" aria-label="نصب اورآ روی گوشی" onClick={() => dispatchEvent(new CustomEvent('ora:install-open', { detail: {} }))}><IconDownload size={14} /> نصب</button>;
}
