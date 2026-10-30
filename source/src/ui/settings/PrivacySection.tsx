// «حریم خصوصی و داده‌ها» and «پروفایل من»: what reaches the Ora server, and the one switch that erases it.
import { useEffect, useState } from 'react';
import { useStore } from '../../core/state';
import { fa } from '../../core/dates';
import { kvGet } from '../../core/kv';
import {
  ALL_CONSENT, DEFAULT_PRIVACY, DEFAULT_PROFILE, INTEREST_THEMES, NO_CONSENT, POETRY_INTEREST,
  appVersion, eraseRemote, fetchPack, isNewer, sendFeedback, serverBase, setConsent, setPrivacy, setProfile, syncNow, termsOk, testServer,
  type Pack, type SentRecord,
} from '../../core/remote';
import { ask } from '../Dialog';
import { IS_WEB_BUILD } from '../../core/platform';
import { Row, Section, Segmented } from '../Panels';
import { Switch } from '../Legal';
import { prayerLine, TONE_LABEL, weatherLine, type Tone } from '../../core/voice';
import type { Weather } from '../../core/location';

const input = { height: 36, borderRadius: 10, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: '0 10px', fontSize: 13 } as const;
const when = (t: number) => new Date(t).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
type PackInfo = { latest?: Pack['latest']; at: number; count: number };

export function PrivacySection() {
  const saved = useStore((s) => s.settings.privacy);
  const p = { ...DEFAULT_PRIVACY, ...saved, consent: { ...NO_CONSENT, ...saved?.consent } };
  const [server, setServer] = useState(p.server);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [last, setLast] = useState<SentRecord | null>(null);
  const [queued, setQueued] = useState(0);
  const [info, setInfo] = useState<PackInfo | null>(null);
  const [fb, setFb] = useState('');
  const [tick, setTick] = useState(0);
  const hasServer = !!serverBase(p);
  useEffect(() => {
    void termsOk(p).then(setAccepted);
    void kvGet<SentRecord>('ora:last-sent').then((v) => setLast(v ?? null));
    void kvGet<Record<string, unknown>>('ora:outbox').then((v) => setQueued(Object.keys(v ?? {}).length));
    void kvGet<PackInfo>('ora:pack-info').then((v) => setInfo(v ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, p.terms?.v, p.consent.likes, p.consent.search, p.consent.profile, p.consent.email, p.lastSync]);

  const run = async (f: () => Promise<string>) => {
    setBusy(true); setMsg(null);
    try { setMsg({ ok: true, text: await f() }); }
    catch (e) { setMsg({ ok: false, text: String((e as Error).message ?? e) }); }
    finally { setBusy(false); setTick((x) => x + 1); }
  };
  const saveServer = () => { if (server.trim() !== p.server) setPrivacy({ server: server.trim(), lastPack: 0 }); };
  const v = appVersion();
  const update = !IS_WEB_BUILD && info?.latest && v !== 'dev' && isNewer(info.latest.version, v) ? info.latest : null;
  const noServer = hasServer ? '' : 'اول آدرس سرور را بنویس.';
  const sharing = accepted && (p.consent.likes || p.consent.search || p.consent.profile);

  return (
    <Section title="حریم خصوصی و داده‌ها" hint="اورآ روی همین دستگاه کار می‌کند. سرور برای گرفتن جمله‌های تازه و خبر نسخه‌هاست، و اگر قبول کرده باشی، برای اینکه اورآ با سلیقه‌ات جور شود.">
      <Row label="آدرس سرور اورآ" hint="مثلاً https://ora.p128parsa.workers.dev. خالی یعنی هیچ ارتباطی با سرور نیست.">
        <div style={{ display: 'flex', gap: 6 }}>
          <input dir="ltr" value={server} onChange={(e) => setServer(e.target.value)} onBlur={saveServer} placeholder="https://…" aria-label="آدرس سرور اورآ" style={{ ...input, width: 240 }} />
          <button className="btn" disabled={busy || !server.trim()} onClick={() => { saveServer(); void run(testServer); }}>آزمایش</button>
        </div>
      </Row>
      {update && (
        <div className="privacy-update">
          <b>نسخه‌ی {fa(update.version)} اورآ آمده</b>
          {update.notes && <span>{update.notes}</span>}
          {update.url && <a className="btn btn-accent" href={update.url} target="_blank" rel="noopener noreferrer">دریافت</a>}
        </div>
      )}
      <Row label="دریافت جمله‌های تازه و خبر نسخه‌ها" hint={`روزی یک بار؛ در این درخواست چیزی از تو فرستاده نمی‌شود. آیکون سایت‌های میانبرت هم از همین سرور گرفته می‌شود؛ اسم سایت جایی ذخیره نمی‌شود.${info ? ` آخرین دریافت: ${when(info.at)}، ${fa(info.count)} جمله‌ی سرور.` : ''}`}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Segmented label="دریافت از سرور" value={p.receive ? 'on' : 'off'} options={[['on', 'روشن'], ['off', 'خاموش']] as const} onChange={(x) => setPrivacy({ receive: x === 'on' })} />
          <button className="btn" disabled={busy || !hasServer || !p.receive} onClick={() => void run(async () => {
            const k = await fetchPack(true);
            return k ? `گرفته شد: ${fa(k.items?.length ?? 0)} جمله‌ی سرور.` : 'چیز تازه‌ای نبود یا سرور در دسترس نیست.';
          })}>الان بگیر</button>
        </div>
      </Row>
      <Row label="قوانین و حریم خصوصی" hint={p.terms
        ? `نسخه‌ی ${fa(p.terms.v)} را ${when(p.terms.at)} پذیرفتی.${accepted ? '' : ' متن تازه‌ای آمده و هنوز نپذیرفته‌ای؛ تا آن موقع چیزی فرستاده نمی‌شود.'}`
        : 'هنوز قبول نکرده‌ای؛ چیزی فرستاده نمی‌شود.'}>
        <button className="btn" onClick={() => dispatchEvent(new Event('ora:legal'))}>خواندن قوانین</button>
      </Row>
      <div className={`privacy-master${noServer ? ' off' : ''}`}>
        <div>
          <b>اشتراک داده برای بهتر کردن اورآ</b>
          <p>جمله‌هایی که دوست داشتی یا نفهمیدی، دسته‌ی کلی جست‌وجوها (نه متنشان)، پروفایلت و کشور. کارها و یادداشت‌ها هرگز. خاموش کردنش همه را همان لحظه از سرور پاک می‌کند.</p>
          {noServer && <p>{noServer}</p>}
        </div>
        <Switch label="اشتراک داده" on={sharing} disabled={!hasServer || busy} onChange={(on) => {
          if (on && !accepted) { dispatchEvent(new Event('ora:legal')); return; }
          void run(async () => on
            ? (await setConsent(ALL_CONSENT), await syncNow(true).catch(() => null), 'روشن شد. ممنون!')
            : (await eraseRemote(), 'خاموش شد و همه‌ی داده‌هایت از سرور پاک شد.'));
        }} />
      </div>
      <div className="privacy-last">
        <div>
          <b>آخرین ارسال</b>
          <span className="faint">
            {last ? `${when(last.at)} · ${last.ok ? 'موفق' : 'ناموفق'}${last.note ? ` · ${last.note}` : ''}` : 'هنوز چیزی فرستاده نشده.'}
            {queued ? ` · ${fa(queued)} مورد در صف` : ''}
          </span>
        </div>
        {last && (
          <details>
            <summary>دقیقاً چه فرستاده شد</summary>
            <pre dir="ltr">{JSON.stringify(last.payload, null, 2)}</pre>
          </details>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy || !hasServer || !accepted || !(p.consent.likes || p.consent.search || p.consent.profile)} onClick={() => void run(async () => {
            const r = await syncNow(true);
            return r ? (r.ok ? 'فرستاده شد.' : r.note ?? 'نشد.') : 'الان نشد (اینترنت، سرور، یا کمتر از یک دقیقه از ارسال قبلی گذشته).';
          })}>الان بفرست</button>
          <button className="btn btn-danger" disabled={busy || !hasServer} onClick={() => void (async () => {
            if (await ask('همه‌ی داده‌هایی که از این مرورگر روی سرور است پاک شود و کلیدها خاموش شوند؟', { danger: true, ok: 'پاک کن' })) await run(eraseRemote);
          })()}>پاک کردن همه‌ی داده‌هایم از سرور</button>
        </div>
      </div>
      <div className="privacy-fb">
        <b>به سازنده بگو</b>
        <span className="faint">پیشنهاد، ایراد یا هر چیزی. همان‌طور که می‌نویسی فرستاده می‌شود؛ اطلاعات حساس یا اطلاعات دیگران را ننویس.</span>
        <textarea value={fb} onChange={(e) => setFb(e.target.value.slice(0, 2000))} rows={3} aria-label="پیام برای سازنده" placeholder="مثلاً: کاش می‌شد…" />
        <button className="btn" disabled={busy || !hasServer || fb.trim().length < 2} onClick={() => void run(async () => { await sendFeedback(fb); setFb(''); return 'پیامت رسید. ممنون!'; })}>بفرست</button>
      </div>
      {msg && <div role="status" style={{ fontSize: 13, color: msg.ok ? 'var(--text-2)' : 'var(--danger)' }}>{msg.text}</div>}
    </Section>
  );
}

export function ProfileSection() {
  const saved = useStore((s) => s.settings.profile);
  const prof = { ...DEFAULT_PROFILE, ...saved };
  const shared = useStore((s) => !!s.settings.privacy?.consent?.profile);
  const [name, setName] = useState(prof.name);
  const [email, setEmail] = useState(prof.email);
  const [extra, setExtra] = useState('');
  const resync = () => { if (shared) { setPrivacy({ lastSync: 0 }); void syncNow(true).catch(() => null); } };
  const toggle = (x: string) => {
    setProfile({ interests: prof.interests.includes(x) ? prof.interests.filter((i) => i !== x) : [...prof.interests, x].slice(0, 15) });
    resync();
  };
  const preset = [...INTEREST_THEMES.map(([k]) => k), POETRY_INTEREST];
  const custom = prof.interests.filter((i) => !preset.includes(i));
  const voice = useStore((s) => s.settings.voice ?? 'friendly');
  const setSettings = useStore((s) => s.setSettings);
  const sampleW: Weather = { fetchedAt: 0, key: '', current: { temp: 13, feels: 12, code: 2, isDay: true, humidity: 50, wind: 10 }, daily: [{ date: '', code: 2, max: 16, min: 8 }, { date: '', code: 2, max: 17, min: 9 }] };
  const sample = (t: Tone) => t === 'numbers' ? '۱۳° · نیمه‌ابری · احساس ۱۲°' : `${weatherLine(sampleW, new Date(new Date().setHours(10)), t)} ${prayerLine('maghrib', new Date(Date.now() + 25 * 60_000), new Date(), t)}`;
  const emailOk = !email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim());
  return (
    <Section title="پروفایل من" hint={`روی همین مرورگر می‌ماند. علایقت باعث می‌شود جمله‌های مرتبط کمی بیشتر بیایند. ${shared ? 'اشتراک پروفایل روشن است؛ تغییرها فرستاده می‌شوند.' : 'فقط اگر «پروفایل من» را در حریم خصوصی روشن کنی فرستاده می‌شود.'}`}>
      <Row label="نام یا لقب" hint="اختیاری.">
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} onBlur={() => { if (name !== prof.name) { setProfile({ name: name.trim() }); resync(); } }} aria-label="نام یا لقب" style={{ ...input, width: 200 }} />
      </Row>
      <Row label="لحن اورآ" hint={TONE_LABEL.find(([k]) => k === voice)?.[2]}>
        <Segmented label="لحن اورآ" value={voice} options={TONE_LABEL.map(([k, l]) => [k, l] as const)} onChange={(v) => setSettings({ voice: v })} />
      </Row>
      <p className="voice-sample" aria-live="polite">«{sample(voice)}»</p>
      <div className="profile-interests">
        <span className="set-row-label">علایق</span>
        <div className="day-pills">
          {preset.map((x) => <button key={x} className="pill" aria-pressed={prof.interests.includes(x)} onClick={() => toggle(x)}>{x}</button>)}
          {custom.map((x) => <button key={x} className="pill" aria-pressed onClick={() => toggle(x)} title="برداشتن">{x} ×</button>)}
        </div>
        <input value={extra} onChange={(e) => setExtra(e.target.value.slice(0, 30))} placeholder="علاقه‌ی دیگر، مثلاً عکاسی، و Enter" aria-label="علاقه‌ی دیگر"
          onKeyDown={(e) => { if (e.key === 'Enter' && extra.trim() && !prof.interests.includes(extra.trim())) { toggle(extra.trim()); setExtra(''); } }} style={{ ...input, width: 260 }} />
      </div>
      <Row label="ایمیل" hint="اختیاری. فقط با «اجازه‌ی ایمیل» در حریم خصوصی فرستاده می‌شود.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value.slice(0, 120))} onBlur={() => { if (emailOk && email.trim() !== prof.email) { setProfile({ email: email.trim() }); resync(); } }} aria-label="ایمیل" style={{ ...input, width: 240 }} />
          {!emailOk && <span style={{ fontSize: 12, color: 'var(--danger)' }}>این ایمیل درست به نظر نمی‌رسد.</span>}
        </div>
      </Row>
    </Section>
  );
}
