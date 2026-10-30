// «اورآ درباره‌ی تو چه می‌داند»: everything Ora has learned or been told, in plain words, each with a
// way to change or erase it. Shown before Ora is ever allowed to speak up on its own, so nothing it
// says later comes as a surprise.
import { useEffect, useState } from 'react';
import { useStore } from '../../core/state';
import { fa } from '../../core/dates';
import { loadTaste } from '../../core/taste';
import { DEFAULT_PROFILE } from '../../core/remote';
import { eraseRhythm, LEARN_DAYS, normal, rhythm, setPaused, type Normal } from '../../core/rhythm';
import { loadStats, type Stats } from '../../core/schedule';
import { reasonSummary } from '../../core/coach';
import { reasonLabel } from '../../core/review';
import type { Reason } from '../../core/db';
import { ask } from '../Dialog';
import { decide, eraseMirror, mirrorLog, setSim, simOn, trustStep, type Trace } from '../../core/mirror';
import { eraseFeedback, KIND_LABEL, summary as fbSummary, type FbKind } from '../../core/feedback';
import { Row, Section, Segmented } from '../Panels';
import { IS_EXTENSION } from '../../core/platform';

const go = (section: string) => dispatchEvent(new CustomEvent('ora:settings', { detail: { section } }));
const hourRange = (hs: number[]) => hs.map((h) => fa(h)).join('، ');

/** The trust ladder of the «قلب اورآ» plan: how far Ora may go on its own. */
export const TRUST_STEPS: [number, string, string][] = [
  [0, 'آشنایی', 'فقط کارهایی که خودت خواستی؛ هیچ پیام سرخود.'],
  [1, 'مشاهده', 'ریتمت را یاد می‌گیرد؛ هنوز هیچ حرفی از خودش نمی‌زند.'],
  [2, 'آینه‌ی سبک', 'گاهی، حداکثر دو بار در هفته، یک جمله و یک سؤال روی تب تازه.'],
  [3, 'همراه', 'اگر جواب داده‌ای و کمک کرده: تا روزی یک بار، با یک قدم کوچک.'],
  [4, 'آینه‌ی عمیق', 'بعد از چند هفته‌ی خوب: هفته‌ای یک بار یک سؤال عمیق‌تر.'],
];

export function KnowsSection() {
  const profile = useStore((s) => s.settings.profile) ?? DEFAULT_PROFILE;
  const place = useStore((s) => s.settings.place);
  const night = useStore((s) => s.settings.night);
  const areas = useStore((s) => s.settings.areas);
  const cap = useStore((s) => s.settings.trustCap ?? 4);
  const setSettings = useStore((s) => s.setSettings);
  const [n, setN] = useState<Normal | null>(null);
  const [paused, setP] = useState(false);
  const [since, setSince] = useState(Date.now());
  const [stats, setStats] = useState<Stats | null>(null);
  const [reason, setReason] = useState<{ reason: Reason; count: number; total: number } | null>(null);
  const [likes, setLikes] = useState(0);
  const [trust, setTrust] = useState<Awaited<ReturnType<typeof trustStep>> | null>(null);
  const [sim, setSimS] = useState(simOn());
  const [trace, setTrace] = useState<Trace | null>(null);
  const [mlog, setMlog] = useState<{ shown: number; held: number; braked: number }>({ shown: 0, held: 0, braked: 0 });
  const [said, setSaid] = useState<{ k: FbKind; label: string; n: number }[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    void normal().then(setN);
    void rhythm().then((r) => { setP(!!r.paused); setSince(r.since); });
    void loadStats().then(setStats);
    void reasonSummary(60).then(setReason);
    void loadTaste().then((t) => setLikes(t.events));
    void fbSummary().then(setSaid);
    void trustStep().then(setTrust);
    void mirrorLog().then((l) => setMlog({ shown: l.filter((e) => e.act === 'shown').length, held: l.filter((e) => e.act === 'held').length, braked: l.filter((e) => e.act === 'braked').length }));
  }, [tick]);
  const day = Math.min(LEARN_DAYS, n?.days ?? 0);
  const step = trust?.step ?? Math.min(cap, (Date.now() - since) / 86_400_000 < 3 ? 0 : (n?.days ?? 0) < LEARN_DAYS ? 1 : 2);
  const tryNow = async () => {
    const r = await decide(true);
    setTrace(r);
    if (r.moment) { useStore.getState().setPanel('none'); window.setTimeout(() => dispatchEvent(new CustomEvent('ora:mirror', { detail: r.moment })), 250); }
    setTick((x) => x + 1);
  };

  return (
    <Section title="اورآ درباره‌ی تو چه می‌داند" hint="همه‌ی این‌ها فقط روی همین دستگاه است و هر کدام را می‌توانی عوض یا پاک کنی. اورآ قبل از اینکه از خودش حرفی بزند، اول همین‌ها را یاد می‌گیرد.">
      <div className="knows">
        <div className="knows-card">
          <b>ریتم تو</b>
          <div className="knows-bar" role="progressbar" aria-valuemin={0} aria-valuemax={LEARN_DAYS} aria-valuenow={day}><i style={{ width: `${(day / LEARN_DAYS) * 100}%` }} /></div>
          <span>{paused ? 'یادگیری ریتم متوقف است.' : n?.learning ? `روز ${fa(day)} از ${fa(LEARN_DAYS)} آشنایی. تا آن موقع اورآ فقط یاد می‌گیرد و حرفی از خودش نمی‌زند.` : 'حالت عادی‌ات را یاد گرفته.'}</span>
          {n && n.days > 0 && (
            <>
              <div className="knows-hours" aria-label="ساعت‌هایی که معمولاً پشت سیستمی">
                {n.hours.map((h, i) => <i key={i} title={`ساعت ${fa(i)}`} style={{ height: `${Math.min(100, 12 + h.active * (88 / Math.max(1, n.days)))}%`, opacity: h.active ? 1 : 0.15 }} />)}
              </div>
              <span className="faint">{n.busiest.length ? `معمولاً ساعت ${hourRange(n.busiest)} سراغ اورآ می‌آیی.` : ''} {n.purposeful ? `${fa(Math.round(n.purposeful * 100))}٪ تب‌هایی که باز می‌کنی هدفمندند (سریع به جایی می‌روی).` : ''}</span>
            </>
          )}
          <span className="knows-not">چیزی که هرگز نمی‌بیند: آدرس سایت‌ها، متن صفحه‌ها و جست‌وجوهایت. {IS_EXTENSION ? 'فقط می‌شمارد چند بار تب عوض کردی یا تب تازه باز کردی.' : 'فقط می‌شمارد چند بار اورآ را باز کردی.'}</span>
          <div className="knows-acts">
            <button className="btn btn-sm" onClick={async () => { await setPaused(!paused); setTick((x) => x + 1); }}>{paused ? 'ادامه‌ی یادگیری' : 'مکث یادگیری'}</button>
            <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={async () => { if (await ask('ریتمی که اورآ یاد گرفته پاک شود؟ از نو شروع می‌کند.', { danger: true, ok: 'پاک کن' })) { await eraseRhythm(); setTick((x) => x + 1); } }}>پاک کردن ریتم</button>
          </div>
        </div>

        <div className="knows-card">
          <b>چیزهایی که خودت گفتی</b>
          <ul>
            <li>نام: {profile.name || <i className="faint">نگفته‌ای</i>}</li>
            <li>علایق: {profile.interests?.length ? profile.interests.join('، ') : <i className="faint">نگفته‌ای</i>}</li>
            <li>شهر: {place?.name ?? '—'}</li>
            <li>ساعت خواب: {night.enabled ? fa(night.bedtime) : <i className="faint">نور شب خاموش است</i>}</li>
            <li>حوزه‌های زندگی: {areas.length ? areas.join('، ') : '—'}</li>
          </ul>
          <div className="knows-acts"><button className="btn btn-sm" onClick={() => go('پروفایل من')}>ویرایش پروفایل</button><button className="btn btn-sm" onClick={() => go('حالت‌ها')}>ساعت خواب</button></div>
        </div>

        <div className="knows-card">
          <b>چیزهایی که از کارهایت یاد گرفته</b>
          <ul>
            <li>کار برایت معمولاً {stats ? `${fa(stats.overall.r.toFixed(1)).replace('.', '٫')} برابر برآورد` : '…'} طول می‌کشد.</li>
            <li>ساعت‌های پربازده: {stats && stats.peakN >= 10 ? { morning: 'صبح', afternoon: 'بعدازظهر', evening: 'عصر و شب' }[stats.peak] : 'هنوز داده‌ی کافی نیست'}</li>
            <li>بیشترین دلیل عقب افتادن: {reason ? `${reasonLabel(reason.reason)} (${fa(reason.count)} از ${fa(reason.total)})` : 'هنوز الگویی نیست'}</li>
            <li>سلیقه‌ی جمله‌ها: {likes ? `${fa(likes)} بار گفته‌ای چه دوست داری یا نه` : 'هنوز چیزی نگفته‌ای'}</li>
          </ul>
          <div className="knows-acts"><button className="btn btn-sm" onClick={() => go('مربی')}>جزئیات و پاک کردن</button><button className="btn btn-sm" onClick={() => go('جمله‌ها')}>سلیقه‌ی جمله‌ها</button></div>
        </div>

        <div className="knows-card">
          <b>وقتی پیشنهادی را رد کردی، گفتی…</b>
          {said.length ? (
            <ul>{said.map((x) => <li key={`${x.k}${x.label}`}>{KIND_LABEL[x.k]}: «{x.label}» <span className="faint">({fa(x.n)} بار)</span></li>)}</ul>
          ) : <span className="faint">هنوز چیزی نگفته‌ای. هر بار که «الان نه» یا ✕ بزنی، اورآ با یک کلیک می‌پرسد چرا — جواب دادن اختیاری است.</span>}
          <span className="knows-not">از همین‌ها کارش را عوض می‌کند: «الان وقتش نیست» یعنی یک ساعت و نیم بعد، «ساعتش خوب نیست» ساعت را عوض می‌کند، «هر روز زیاده» یک روز در میان، «اینو بلدم» دیگر تکرار نمی‌شود. اگر بی‌جواب ببندی‌اش، فقط «جواب نداد» ثبت می‌شود، نه «نه».</span>
          <div className="knows-acts">
            <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={async () => { if (await ask('جواب‌هایی که داده‌ای و تغییرهایی که اورآ از رویشان داده (فاصله‌ی نکته‌ها، یک روز در میان…) پاک شوند؟', { danger: true, ok: 'پاک کن' })) { await eraseFeedback(); setTick((x) => x + 1); } }}>پاک کردن و برگشت به حالت اول</button>
          </div>
        </div>

        <div className="knows-card">
          <b>اورآ تا کجا اجازه دارد از خودش حرف بزند</b>
          <span>الان: پله‌ی {fa(step)}، «{TRUST_STEPS[step][1]}» — {TRUST_STEPS[step][2]}</span>
          <Row label="حداکثر پله" hint="اورآ خودش کم‌کم بالا می‌رود (با جواب‌های خوب) و با هر «مزاحم نشو» پایین می‌آید؛ ولی هیچ‌وقت از این حد بالاتر نمی‌رود.">
            <Segmented label="حداکثر پله" value={cap} options={TRUST_STEPS.map(([k, name]) => [k, name] as const)} onChange={(v) => setSettings({ trustCap: v })} />
          </Row>
          {trust && <span className="faint">{trust.up ? `${fa(trust.up)} پله بالاتر به خاطر جواب‌هایی که کمک کرده. ` : ''}{trust.down ? `${fa(trust.down)} پله پایین‌تر به خاطر «مزاحم نشو». ` : ''}تا حالا: {fa(mlog.shown)} بار حرف زده، {fa(mlog.held)} بار عمداً ساکت مانده، {fa(mlog.braked)} بار ترمزها نگهش داشته‌اند.</span>}
          <div className="knows-acts">
            <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={async () => { if (await ask('سابقه‌ی لحظه‌های آینه و پله‌هایی که پایین آمده پاک شود؟', { danger: true, ok: 'پاک کن' })) { await eraseMirror(); setTick((x) => x + 1); } }}>پاک کردن سابقه‌ی آینه</button>
          </div>
        </div>

        <div className="knows-card">
          <b>آزمایش آینه روی خودم</b>
          <span>آینه معمولاً بعد از ۱۴ روز آشنایی روشن می‌شود. در حالت آزمایشی، اورآ «حالت عادی» تو را با ۱۴ روز ساختگی و معمولی پر می‌کند (حدود ۴ بار عوض کردن تب در ده دقیقه) و لحظه‌ی الانِ واقعی‌ات را با آن می‌سنجد. سقف هفتگی برداشته می‌شود (حداکثر هر ۱۰ دقیقه یک بار)، ولی ترمزهای ایمنی سر جایشان‌اند. روی هر لحظه برچسب «حالت آزمایشی» می‌خورد.</span>
          <Row label="حالت آزمایشی">
            <Segmented label="حالت آزمایشی" value={sim ? 1 : 0} options={[[0, 'خاموش'], [1, 'روشن']] as const} onChange={async (v) => { await setSim(!!v); setSimS(!!v); setTrace(null); setTick((x) => x + 1); }} />
          </Row>
          {sim && <div className="knows-acts"><button className="btn btn-sm btn-accent" onClick={() => void tryNow()}>همین الان یک بار امتحان کن</button></div>}
          {trace && (
            <ul className="mirror-trace">
              <li>الان در ده دقیقه‌ی اخیر: {fa(trace.normal.nowS)} بار عوض کردن تب، {fa(trace.normal.nowO)} تب تازه (عادی این ساعت: {fa(Math.round(trace.normal.s.med))} و {fa(Math.round(trace.normal.o.med))}).</li>
              <li>نشانه‌ها: {trace.signals.length ? trace.signals.map((x) => `${x.kind === 'late' ? 'دیروقت' : x.kind === 'burst' ? 'رگبار تب تازه' : 'عوض کردن زیاد تب'} (اطمینان ${fa(Math.round(x.p * 100))}٪)`).join('، ') : 'هیچ؛ لحظه‌ی عادی است'} — آستانه {fa(Math.round(trace.threshold * 100))}٪</li>
              <li>{trace.brake ? `ترمز: ${trace.brake}` : trace.moment ? 'تصمیم: حرف بزند (روی صفحه‌ی اصلی ببین).' : trace.held ? 'تصمیم: سکوت عمدی.' : 'تصمیم: سکوت.'}</li>
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}
