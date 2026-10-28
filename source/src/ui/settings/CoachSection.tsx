// «مربی»: what Ora has learned about how you work — in plain view, and erasable.
import { useEffect, useState } from 'react';
import { useStore } from '../../core/state';
import { fa } from '../../core/dates';
import { kvSet } from '../../core/kv';
import { loadStats, type Stats } from '../../core/schedule';
import { reasonSummary, remedy, STYLE_LABEL, styleStats, worryStats, type Style } from '../../core/coach';
import { reasonLabel, recentReviews } from '../../core/review';
import type { Reason } from '../../core/db';
import { ask } from '../Dialog';
import { Row, Section, Segmented } from '../Panels';

export function CoachSection() {
  const coachOn = useStore((s) => s.settings.coachPrompts !== false);
  const setSettings = useStore((s) => s.setSettings);
  const [stats, setStats] = useState<Stats | null>(null);
  const [reasons, setReasons] = useState<{ reason: Reason; count: number; total: number } | null>(null);
  const [styles, setStyles] = useState<{ style: Style; rate: number; n: number }[]>([]);
  const [worry, setWorry] = useState<{ total: number; fine: number; partly: number; bad: number } | null>(null);
  const [rev, setRev] = useState<{ avg: number | null; streak: number; n: number } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    void loadStats().then(setStats); void reasonSummary(60).then(setReasons); void styleStats().then(setStyles); void worryStats().then(setWorry);
    void recentReviews(14).then((r) => setRev({ avg: r.avg, streak: r.streak, n: r.list.length }));
  }, [tick]);
  const areas = stats ? Object.entries(stats.ratio).filter(([, v]) => v.n >= 3) : [];
  return (
    <Section title="مربی" hint="مربیِ اورآ مدل هوش مصنوعی نیست؛ قاعده‌هایی است از پژوهش‌های برنامه‌ریزی و اهمال‌کاری، به‌علاوه‌ی آمار خودِ تو که فقط روی همین مرورگر می‌ماند. این‌جا می‌بینی چه یاد گرفته.">
      <Row label="پیشنهادهای خودجوش" hint="مثلاً «این چند وقت زیاد روی X کار می‌کنی؛ پروژه‌اش کنیم؟» یا پرسیدنِ «آن نگرانی چی شد؟». هر نوعش حداکثر هر دو روز یک‌بار.">
        <Segmented label="پیشنهادهای خودجوش" value={coachOn ? 'on' : 'off'} options={[['on', 'روشن'], ['off', 'خاموش']] as const} onChange={(v) => setSettings({ coachPrompts: v === 'on' })} />
      </Row>
      <div className="coach-learned">
        <div><span>نمره‌ی روزها</span><b>{rev?.n ? `میانگین ${fa(rev.avg ?? 0)} در ${fa(rev.n)} روز` : 'هنوز جمع‌بندی‌ای نیست'}</b>{rev?.streak ? <small>{fa(rev.streak)} روز مفید پشت سر هم</small> : null}</div>
        <div><span>کار برایت چقدر طول می‌کشد</span>{areas.length ? areas.map(([a, v]) => <b key={a}>{a === '—' ? 'بدون حوزه' : `#${a}`}: {fa(v.r.toFixed(1)).replace('.', '٫')} برابر برآورد</b>) : <b>{stats ? `${fa(stats.overall.r.toFixed(2)).replace('.', '٫')} برابر برآورد (پیش‌فرض، تا وقتی داده جمع شود)` : '…'}</b>}</div>
        <div><span>ساعت‌های پربازده</span><b>{stats && stats.peakN >= 10 ? { morning: 'صبح', afternoon: 'بعدازظهر', evening: 'عصر و شب' }[stats.peak] : 'هنوز داده‌ی کافی نیست'}</b></div>
        <div><span>بیشترین دلیل عقب‌افتادن</span><b>{reasons ? `${reasonLabel(reasons.reason)} (${fa(reasons.count)} از ${fa(reasons.total)})` : 'هنوز الگویی نیست'}</b>{reasons && <small>{remedy(reasons.reason)}</small>}</div>
        <div><span>نگرانی‌ها</span><b>{worry?.total ? `${fa(worry.fine)} از ${fa(worry.total)} بی‌مورد درآمد` : 'هنوز نتیجه‌ی نگرانی‌ای ثبت نشده'}</b></div>
        <div><span>لحنی که بیشتر کمکت می‌کند</span><b>{styles.length ? styles.slice(0, 2).map((s) => `${STYLE_LABEL[s.style]} (${fa(Math.round(s.rate * 100))}٪ مفید)`).join('، ') : 'هنوز یاد نگرفته؛ زیر پیام‌ها بگو «کمک کرد؟»'}</b></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => dispatchEvent(new CustomEvent('ora:coach', { detail: {} }))}>گفتگو با اورآ</button>
        <button className="btn" onClick={() => dispatchEvent(new CustomEvent('ora:review'))}>جمع‌بندی امروز</button>
        <button className="btn" style={{ color: 'var(--danger)', border: 0 }} onClick={async () => {
          if (!(await ask('همه‌ی چیزهایی که مربی یاد گرفته پاک شود؟ (دلیل‌ها، نگرانی‌ها، لحن و زمان‌بندی‌های آموخته. کارها و جمع‌بندی‌ها می‌مانند.)', { danger: true, ok: 'پاک کن' }))) return;
          await kvSet('ora:coach', null); await kvSet('ora:block-log', []); setTick((x) => x + 1);
        }}>پاک کردن آموخته‌ها</button>
      </div>
    </Section>
  );
}
