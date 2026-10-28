// «برنامه‌ی الان»: where you are in today's time plan: the current block with its time left,
// what comes next, and the free time in between.
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { defineWidget } from '../core/widgets';
import { db } from '../core/db';
import { fa } from '../core/dates';
import { localCalendar } from '../core/providers/calendar';
import { today, toggleDone } from '../core/planner';
import { blocksFor, breaksOf, faHM, loadStats, nowMin, type Block, type Stats } from '../core/schedule';
import { estLabel } from '../core/taskparse';
import { useNow } from '../ui/hooks';
import { openSchedule } from '../ui/Schedule';
import { IconClock, IconSpark } from '../ui/icons';
import { NONE } from '../core/none';

defineWidget<Record<string, never>>({
  type: 'dayplan',
  name: 'برنامه‌ی الان',
  description: 'کجای برنامه‌ی امروزی: کار الان، زمان باقی‌مانده و بعدی‌ها',
  icon: <IconClock />,
  defaultSize: { w: 6, h: 8 },
  minSize: { w: 4, h: 5 },
  defaultConfig: {},
  Component: function DayPlan() {
    useNow(30_000);
    const d = today();
    const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? NONE;
    const events = useLiveQuery(() => localCalendar.list(d, d), [d]) ?? NONE;
    const [stats, setStats] = useState<Stats | null>(null);
    const [brk, setBrk] = useState<[number, number][]>([]);
    useEffect(() => { void loadStats().then(setStats); void breaksOf(d).then(setBrk); }, [d, tasks.length]);
    if (!stats) return null;
    const n = nowMin();
    const blocks = blocksFor(d, tasks, events, brk, stats).filter((b) => !b.done);
    const real = (b: Block) => b.kind === 'task' || b.kind === 'event';
    const cur = blocks.find((b) => b.start <= n && b.end > n && b.kind === 'task') ?? blocks.find((b) => b.start <= n && b.end > n && real(b));
    const inBreak = blocks.find((b) => b.kind === 'break' && b.start <= n && b.end > n);
    const inFocus = blocks.find((b) => b.kind === 'focus' && b.start <= n && b.end > n);
    const next = blocks.filter((b) => b.start > n && real(b)).slice(0, 3);
    const freeUntil = next[0] && !cur ? next[0].start - n : 0;

    return (
      <div className="w">
        <div className="w-head">
          <h2 className="w-title">برنامه‌ی الان</h2>
          <span className="w-meta">{faHM(n)}</span>
          <div className="w-actions"><button className="btn btn-sm" style={{ border: 0 }} onClick={() => openSchedule({ view: 'day' })}>کامل</button></div>
        </div>
        {!blocks.length ? (
          <div className="w-empty">
            <IconClock />
            <b>برای امروز برنامه‌ی زمانی نداری</b>
            <span>کارها را بنویس، بعد بگذار اورآ با ساعت‌هایت بچیندشان.</span>
            <button className="btn btn-sm btn-accent" onClick={() => openSchedule({ wizard: true })}><IconSpark size={13} />چیدن هوشمند</button>
          </div>
        ) : (
          <div className="dp scroll">
            {cur ? (
              <div className="dp-now" style={{ '--c': cur.kind === 'event' ? (cur.color ?? '#7FA7C9') : 'var(--accent)' } as React.CSSProperties}>
                <span className="dp-label">الان</span>
                <b>{cur.title}</b>
                <span className="faint">{faHM(cur.start)}–{faHM(cur.end)} · {estLabel(cur.end - n)} مانده</span>
                <div className="w-progress" style={{ marginTop: 4 }}><span style={{ width: `${((n - cur.start) / (cur.end - cur.start)) * 100}%` }} /></div>
                {cur.taskId && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button className="btn btn-sm btn-accent" onClick={() => { const t = tasks.find((x) => x.id === cur.taskId); if (t) void toggleDone(t); }}>تمام شد</button>
                    <button className="btn btn-sm" onClick={() => { const t = tasks.find((x) => x.id === cur.taskId); if (t) void db.tasks.update(t.id, { est: (t.est ?? 30) + 15, ...(t.len ? { len: t.len + 15 } : {}) }); }}>+۱۵ دقیقه</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="dp-free">{inBreak ? `استراحت تا ${faHM(inBreak.end)}` : inFocus ? `زمان تمرکز تا ${faHM(inFocus.end)}؛ مهم‌ترین کارت را شروع کن.` : next.length ? `وقت آزاد · ${estLabel(freeUntil)} تا کار بعدی` : 'برنامه‌ی امروز تمام شد.'}</div>
            )}
            {next.map((b) => (
              <div key={b.id} className="dp-next">
                <span className="dp-time">{faHM(b.start)}</span>
                <span className="dp-dot" style={{ background: b.kind === 'event' ? (b.color ?? '#7FA7C9') : 'var(--accent)' }} />
                <span className="dp-title">{b.title}</span>
                <span className="faint">{estLabel(b.end - b.start)}</span>
              </div>
            ))}
            {blocks.filter((b) => b.start > n && real(b)).length > 3 && <span className="faint" style={{ fontSize: 12 }}>و {fa(blocks.filter((b) => b.start > n && real(b)).length - 3)} کار دیگر</span>}
          </div>
        )}
      </div>
    );
  },
});
