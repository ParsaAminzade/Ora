// «سر وقت یادت بیاورم؟» — asking for notification permission the honest way:
// · only at the moment it is wanted: right after you give a task a time (first time, then once more
//   at the third timed task), never on the first screen
// · Ora's own screen first, with a real example of the reminder; Chrome's prompt only after «بله»,
//   so «بلاک» in Chrome is rarely ever pressed and the door stays open
// · «الان نه» is plain but visible; turning it off later is one tap in settings
// Also keeps reminders in step: the phone's sealed list on the server, the extension's alarms.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../core/db';
import { kvGet, kvSet } from '../core/kv';
import { IS_EXTENSION, IS_WEB_BUILD } from '../core/platform';
import { scheduleTaskAlarms, upcomingTaskReminders } from '../core/task-reminders';
import { useStore } from '../core/state';
import { fa } from '../core/dates';
import { disablePush, enablePush, needsHomeScreen, permission, pushState, pushSupported, syncPush } from '../web/push';
import { Row, Section } from './Panels';

const say = (detail: object) => dispatchEvent(new CustomEvent('ora:say', { detail }));
const ASK = 'ora:notify-ask';
type Ask = { n: number; at: number };

/** Keeps reminders in step whenever timed tasks change (and every 30 minutes). */
function useReminderSync() {
  const loaded = useStore((s) => s.loaded);
  const sig = useLiveQuery(async () => (await db.tasks.filter((t) => !!t.when && !!t.time).toArray()).map((t) => `${t.id}${t.when}${t.time}${t.done ? 1 : 0}${t.title}`).join('|'), []);
  useEffect(() => {
    if (!loaded || sig === undefined) return;
    const run = () => { if (IS_EXTENSION) void scheduleTaskAlarms().catch(() => {}); if (IS_WEB_BUILD) void syncPush(true).catch(() => {}); };
    const t = window.setTimeout(run, 1500);
    return () => window.clearTimeout(t);
  }, [loaded, sig]);
  useEffect(() => {
    if (!loaded) return;
    const iv = window.setInterval(() => { if (IS_EXTENSION) void scheduleTaskAlarms().catch(() => {}); if (IS_WEB_BUILD) void syncPush(true).catch(() => {}); }, 30 * 60_000);
    return () => window.clearInterval(iv);
  }, [loaded]);
}

function AskSheet({ title, est, onClose }: { title: string; est?: number; onClose(): void }) {
  const [busy, setBusy] = useState(false);
  const home = needsHomeScreen();
  const yes = async () => {
    setBusy(true);
    const r = await enablePush();
    setBusy(false);
    onClose();
    if (r === 'on') say({ text: 'باشه، سر وقت یادت می‌آورم؛ حتی وقتی اورآ بسته است.' });
    else if (r === 'denied') say({ text: 'مرورگر اجازه نداد. هر وقت خواستی: تنظیمات › یادآوری کارها.', sticky: true });
    else say({ text: 'الان نشد (اینترنت یا سرور). بعداً از تنظیمات › یادآوری کارها دوباره امتحان کن.' });
  };
  return createPortal(
    <div className="dlg-backdrop nask-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="یادآوری سر وقت" className="nask glass">
        <h2>«{title}» — سر وقت یادت بیاورم؟</h2>
        <div className="nask-demo" aria-hidden="true">
          <span className="nask-app"><i />اورآ · الان</span>
          <b>وقت «{title}» است</b>
          <span>{est ? `${fa(est)} دقیقه. ` : ''}همین الان شروعش کنی؟</span>
          <span className="nask-btns"><em>شروع</em><em>۱۵ دقیقه بعد</em></span>
        </div>
        {home ? (
          <>
            <p>قولی که به خودت دادی، سر وقت جلوی چشمت می‌آید؛ حتی وقتی اورآ باز نیست. روی آیفون برای این کار، اول اورآ را به صفحه‌ی اصلی اضافه کن:</p>
            <ol className="nask-steps"><li>دکمه‌ی اشتراک‌گذاری ⬆︎ پایین سافاری</li><li>Add to Home Screen</li><li>اورآ را از همان آیکون باز کن و دوباره یک کار با ساعت بگذار</li></ol>
            <div className="nask-actions"><button className="btn btn-accent" onClick={onClose}>باشه</button></div>
          </>
        ) : (
          <>
            <p>قولی که به خودت دادی، سر وقت جلوی چشمت می‌آید؛ حتی وقتی اورآ باز نیست.</p>
            <ul className="nask-promise">
              <li>فقط برای کارهایی که خودت ساعت گذاشته‌ای. نه تبلیغ، نه «برگرد توی اورآ».</li>
              <li>متن یادآوری روی همین گوشی قفل می‌شود؛ حتی سرور اورآ نمی‌تواند بخواندش.</li>
              <li>هر وقت خواستی، با یک لمس خاموش می‌شود.</li>
            </ul>
            <div className="nask-actions">
              <button className="btn btn-accent nask-yes" disabled={busy} onClick={() => void yes()}>بله، یادم بیاور</button>
              <button className="btn-link nask-no" onClick={onClose}>الان نه</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function NotifyHost() {
  useReminderSync();
  const loaded = useStore((s) => s.loaded);
  const [ask, setAsk] = useState<{ title: string; est?: number } | null>(null);
  // the moment: a task just got a time
  const timed = useLiveQuery(async () => (await upcomingTaskReminders(24 * 14)).length, []);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (!loaded || timed === undefined) return;
    const before = prev.current;
    prev.current = timed;
    if (before === null || timed <= before || !IS_WEB_BUILD || !pushSupported() || permission() !== 'default') return;
    void (async () => {
      if ((await pushState()).on) return;
      const a = (await kvGet<Ask>(ASK)) ?? { n: 0, at: 0 };
      // first timed task, then once more at the third, never twice in two days, never more than twice on its own
      const due = a.n === 0 || (a.n === 1 && timed >= 3 && Date.now() - a.at > 2 * 86_400_000);
      if (!due) return;
      const latest = (await db.tasks.filter((t) => !t.done && !!t.when && !!t.time).toArray()).sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0))[0];
      if (!latest) return;
      await kvSet(ASK, { n: a.n + 1, at: Date.now() });
      window.setTimeout(() => setAsk({ title: latest.title.slice(0, 40), est: latest.est }), 600);
    })();
  }, [loaded, timed]);
  return ask ? <AskSheet title={ask.title} est={ask.est} onClose={() => setAsk(null)} /> : null;
}

/** Settings › «یادآوری کارها» (the phone app). */
export function NotifySection() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const perm = permission();
  useEffect(() => { void pushState().then((s) => setOn(s.on && perm === 'granted')); }, [perm]);
  if (!IS_WEB_BUILD) return null;
  const home = pushSupported() && needsHomeScreen();
  return (
    <Section title="یادآوری کارها" hint="کارهایی که ساعت دارند، سر وقت روی گوشی یادآوری می‌شوند؛ حتی وقتی اورآ بسته است. متن یادآوری روی همین گوشی قفل می‌شود و سرور اورآ نمی‌تواند بخواندش؛ سرور فقط زمان فرستادن را می‌داند و بعد از رسیدن پاکش می‌کند.">
      <Row label="یادآوری سر وقت" hint={perm === 'unsupported' ? 'این مرورگر نوتیف وب را پشتیبانی نمی‌کند.' : home ? 'روی آیفون اول اورآ را به صفحه‌ی اصلی اضافه کن (اشتراک‌گذاری ⬆︎ › Add to Home Screen) و از همان آیکون باز کن.' : perm === 'denied' ? 'مرورگر اجازه‌ی اعلان را بسته. از تنظیمات مرورگر، بخش اجازه‌های این سایت، اعلان را روشن کن.' : on ? 'روشن است.' : 'خاموش است.'}>
        {perm !== 'unsupported' && !home && perm !== 'denied' && (
          <button className={`btn${on ? '' : ' btn-accent'}`} disabled={busy || on === null} onClick={async () => {
            setBusy(true);
            if (on) { await disablePush(); setOn(false); }
            else { const r = await enablePush(); setOn(r === 'on'); }
            setBusy(false);
          }}>{on ? 'خاموش کن' : 'روشن کن'}</button>
        )}
      </Row>
    </Section>
  );
}
