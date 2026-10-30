// The «چرا؟» row that follows a «نه» to something Ora offered. Three one-tap reasons (a different
// three each time), «رد شو» always there, and then Ora says in one line what it will do differently —
// and does it.
import { useEffect, useState } from 'react';
import { count, fbStore, note, reasonsFor, type FbKind, type FbReason } from '../core/feedback';
import { fa } from '../core/dates';
import { openPlanner, plannerOf, ritualUndo } from '../core/planner';
import { understood, type TourId } from '../core/tour';
import { useStore } from '../core/state';

const HOURS: Record<'ritual-morning' | 'ritual-evening', number[]> = { 'ritual-morning': [6, 7, 8, 9, 10, 11], 'ritual-evening': [18, 19, 20, 21, 22] };
const WHAT: Partial<Record<FbKind, string>> = {
  'ritual-morning': 'صبح‌ها اورآ می‌پرسد «برنامه‌ی امروز را بچینیم؟». دو دقیقه: سه کار مهم امروز را انتخاب می‌کنی و می‌بینی به وقتت جا می‌شوند یا نه — قبل از اینکه روز شلوغ شود.',
  'ritual-evening': 'شب‌ها اورآ می‌پرسد «روز رو ببندیم؟». دو دقیقه: هر کار مهم تا کجا رفت، یک نمره به امروز، و مانده‌ها می‌روند برای فردا — که ذهنت شب آزاد باشد.',
};
const KIND_NAME: Partial<Record<FbKind, string>> = { 'ritual-morning': 'برنامه‌ریزی صبح', 'ritual-evening': 'جمع‌بندی شب', tip: 'نکته‌ها', install: 'این پیشنهاد' };

type Btn = { label: string; run(): void; main?: boolean };
export function WhyNot({ kind, tour, tipId, onDone }: { kind: FbKind; tour?: TourId; tipId?: number; onDone(): void }) {
  const setSettings = useStore((s) => s.setSettings);
  const [chips, setChips] = useState<[FbReason, string][] | null>(null);
  const [reply, setReply] = useState<{ text: string; btns?: Btn[] } | null>(null);
  useEffect(() => { void reasonsFor(kind).then(setChips); }, [kind]);
  // a reply with nothing to choose closes by itself
  useEffect(() => {
    if (!reply || reply.btns?.length) return;
    const t = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(t);
  }, [reply, onDone]);

  const ritual = kind === 'ritual-morning' || kind === 'ritual-evening';
  const turnOff = () => {
    if (kind === 'ritual-morning') setSettings({ planner: { ...plannerOf(), morning: false } });
    if (kind === 'ritual-evening') setSettings({ planner: { ...plannerOf(), evening: false } });
    if (kind === 'tip') setSettings({ eyeTips: false });
    setReply({ text: 'خاموش شد. از تنظیمات هر وقت خواستی برمی‌گردد.' });
  };
  const pick = async (r: FbReason) => {
    await note(kind, r);
    dispatchEvent(new CustomEvent('ora:fb', { detail: { kind, reason: r } })); // the part of Ora that asked can adapt too
    const s = await fbStore();
    const n = count(s, kind, r);
    switch (r) {
      case 'later':
        if (ritual) { ritualUndo(kind === 'ritual-morning' ? 'morning' : 'evening'); setReply({ text: 'باشه؛ حدود یک ساعت و نیم دیگه، اگه این‌جا بودی، یه بار دیگه می‌پرسم.' }); }
        else setReply({ text: 'باشه، بعداً.' });
        break;
      case 'bad-time': {
        const hs = HOURS[kind as 'ritual-morning'];
        setReply({ text: 'چه ساعتی برات بهتره؟', btns: hs.map((h) => ({ label: fa(h), run: () => {
          const p = plannerOf();
          setSettings({ planner: kind === 'ritual-morning' ? { ...p, morningAt: h } : { ...p, eveningAt: h } });
          setReply({ text: `از فردا ساعت ${fa(h)} به بعد می‌پرسم.` });
        } })) });
        break;
      }
      case 'too-often':
        setReply({ text: ritual ? 'باشه؛ از این به بعد یک روز در میان.' : kind === 'tip' ? 'باشه؛ نکته‌ها کم‌تر می‌شن.' : 'باشه؛ کم‌تر یادت می‌اندازم.' });
        break;
      case 'not-useful':
        if (n >= 2) setReply({ text: `این ${fa(n)}مین باره که گفتی به کارت نمیاد. ${KIND_NAME[kind] ?? 'این'} رو خاموش کنم؟`, btns: [{ label: 'خاموش کن', main: true, run: turnOff }, { label: 'نه، بمونه', run: onDone }] });
        else setReply({ text: 'فهمیدم. اگه باز هم به کارت نیومد، می‌پرسم خاموشش کنم یا نه.' });
        break;
      case 'already':
        if (n >= 3) setReply({ text: 'انگار خودت روزت رو خوب جمع می‌کنی. خاموشش کنم؟', btns: [{ label: 'خاموش کن', main: true, run: turnOff }, { label: 'نه، بمونه', run: onDone }] });
        else setReply({ text: 'عالیه؛ پس کارت رو بلدی.' });
        break;
      case 'tired':
        setReply({ text: kind === 'ritual-evening' ? 'باشه. فردا هم روزه؛ استراحت کن.' : 'باشه. یه روز بدون برنامه هم اشکالی نداره.' });
        break;
      case 'unclear':
        setReply({ text: WHAT[kind] ?? '', btns: [{ label: 'امتحانش کنم', main: true, run: () => { void note(kind, 'yes'); onDone(); kind === 'ritual-morning' ? openPlanner('plan') : dispatchEvent(new CustomEvent('ora:review')); } }, { label: 'نه، الان نه', run: onDone }] });
        break;
      case 'know':
        if (tour) void understood(tour);
        if (tipId !== undefined) knowTip(tipId);
        setReply({ text: 'باشه؛ این یکی رو دیگه نمی‌گم.' });
        break;
      case 'how':
        setReply({ text: 'سخت نیست؛ دو لمس. نشونت بدم؟', btns: [{ label: 'نشونم بده', main: true, run: () => { onDone(); dispatchEvent(new CustomEvent('ora:install-open', { detail: { steps: true } })); } }, { label: 'بعداً', run: onDone }] });
        break;
      case 'space':
        setReply({ text: 'اورآ حدود ۵ مگابایته؛ از چند تا عکس هم کمتر. هر وقت هم نخواستی، مثل هر برنامه‌ای پاکش می‌کنی.' });
        break;
      case 'browser':
        setReply({ text: 'باشه؛ تا دو هفته نمی‌پرسم. دکمه‌ی «نصب» بالای صفحه هست، هر وقت خواستی.' });
        break;
      case 'why':
        setReply({ text: 'با یه لمس از صفحه‌ی اصلی باز می‌شه، تمام‌صفحه و بدون نوار مرورگر؛ بدون اینترنت هم کار می‌کنه؛ و یادآوری کارهات به‌موقع می‌رسه.', btns: [{ label: 'نصب کن', main: true, run: () => { void note(kind, 'yes'); onDone(); dispatchEvent(new CustomEvent('ora:install-open', { detail: {} })); } }, { label: 'نه، الان نه', run: onDone }] });
        break;
      case 'no-tour':
        setReply({ text: 'باشه؛ دیگه کارت آموزشی نشون نمی‌دم. اگه خواستی، از تنظیمات › «آشنایی با اورآ» همه‌شون هست.' });
        break;
    }
  };

  if (reply) {
    return (
      <span className="why-not" aria-live="polite">
        <span className="why-reply">{reply.text}</span>
        {reply.btns && <span className="why-chips">{reply.btns.map((b) => <button key={b.label} className={b.main ? 'btn btn-sm btn-accent' : 'pill pill-xs'} onClick={b.run}>{b.label}</button>)}</span>}
      </span>
    );
  }
  return (
    <span className="why-not" role="group" aria-label="چرا نه؟">
      <span className="why-q">چرا نه؟ <i>(کمکم می‌کنه بهتر بشناسمت)</i></span>
      <span className="why-chips">
        {chips?.map(([r, l]) => <button key={r} className="pill pill-xs" onClick={() => void pick(r)}>{l}</button>)}
        <button className="btn-link why-skip" onClick={() => { void note(kind, 'skip'); onDone(); }}>رد شو</button>
      </span>
    </span>
  );
}

/* tips you already know are not repeated */
const KNOWN = 'ora:tips-known';
export const knownTips = (): number[] => { try { return JSON.parse(localStorage.getItem(KNOWN) ?? '[]'); } catch { return []; } };
const knowTip = (i: number) => { try { localStorage.setItem(KNOWN, JSON.stringify([...new Set([...knownTips(), i])])); } catch { /* */ } };
