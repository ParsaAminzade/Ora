import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../core/db';
import { focusTaskId, logFocus, setFocusTask } from '../core/planner';
import { defineWidget } from '../core/widgets';
import { fa, pad2 } from '../core/dates';
import { useNow } from '../ui/hooks';
import { IconPause, IconPlay, IconReset, IconTimer } from '../ui/icons';

interface Config {
  focusMin: number;
  breakMin: number;
  /** Running timer survives new tabs: we store when it ends, not how much is left. */
  endsAt: number | null;
  pausedLeft: number | null;
  phase: 'focus' | 'break';
  round: number;
}

defineWidget<Config>({
  type: 'pomodoro',
  name: 'پومودورو',
  description: 'تایمر تمرکز ۲۵/۵',
  icon: <IconTimer />,
  defaultSize: { w: 6, h: 5 },
  minSize: { w: 4, h: 4 },
  defaultConfig: { focusMin: 25, breakMin: 5, endsAt: null, pausedLeft: null, phase: 'focus', round: 1 },
  Component: function Pomodoro({ config, setConfig }) {
    const now = useNow(1000).getTime();
    const total = (config.phase === 'focus' ? config.focusMin : config.breakMin) * 60_000;
    const left = config.endsAt ? Math.max(0, config.endsAt - now) : config.pausedLeft ?? total;
    const running = !!config.endsAt;
    const [flash, setFlash] = useState(false);

    // The task you chose to focus on (from the task list) shows here and collects the minutes.
    const [focusId, setFocusId] = useState(focusTaskId());
    useEffect(() => {
      const ch = () => setFocusId(focusTaskId());
      const start = () => { setFocusId(focusTaskId()); setConfig({ phase: 'focus', endsAt: Date.now() + config.focusMin * 60_000, pausedLeft: null }); };
      addEventListener('ora:focus-changed', ch);
      addEventListener('ora:focus-start', start);
      return () => { removeEventListener('ora:focus-changed', ch); removeEventListener('ora:focus-start', start); };
    }, [config.focusMin, setConfig]);
    const focusTask = useLiveQuery(() => (focusId ? db.tasks.get(focusId) : undefined), [focusId]);

    useEffect(() => {
      if (running && left === 0) {
        if (config.phase === 'focus') void logFocus(config.focusMin);
        const nextPhase = config.phase === 'focus' ? 'break' : 'focus';
        setConfig({ phase: nextPhase, endsAt: null, pausedLeft: null, round: nextPhase === 'focus' ? config.round + 1 : config.round });
        setFlash(true);
        window.setTimeout(() => setFlash(false), 4000);
      }
    }, [running, left, config.phase, config.round, setConfig]);

    const mm = Math.floor(left / 60_000);
    const ss = Math.floor((left % 60_000) / 1000);
    const progress = 1 - left / total;

    return (
      <div className="w">
        <div className="w-head">
          <h2 className="w-title">{config.phase === 'focus' ? 'تمرکز' : 'استراحت'}</h2>
          <span className="w-meta" style={flash ? { color: 'var(--accent)' } : undefined} aria-live="polite">{flash ? 'زمان تمام شد' : `دور ${fa(config.round)} · ${fa(config.focusMin)} دقیقه`}</span>
        </div>
        {focusTask && !focusTask.done && (
          <div className="pomo-task">
            <span title={focusTask.title}>روی: {focusTask.title}</span>
            <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label="برداشتن کار از تمرکز" onClick={() => setFocusTask(null)}>×</button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 44, fontWeight: 200, lineHeight: 1, flex: 1, letterSpacing: '-1px' }} role="timer" aria-label="زمان باقی‌مانده">{fa(`${pad2(mm)}:${pad2(ss)}`)}</div>
          <button
            className="btn btn-accent"
            style={{ width: 44, height: 44, padding: 0, borderRadius: 14, flexShrink: 0 }}
            aria-label={running ? 'مکث' : 'شروع'}
            onClick={() =>
              running ? setConfig({ endsAt: null, pausedLeft: left }) : setConfig({ endsAt: Date.now() + left, pausedLeft: null })
            }
          >
            {running ? <IconPause size={18} /> : <IconPlay size={18} />}
          </button>
          <button className="icon-btn" aria-label="از نو" title="از نو" onClick={() => setConfig({ endsAt: null, pausedLeft: null, phase: 'focus', round: 1 })}>
            <IconReset size={18} />
          </button>
        </div>
        <div className="w-progress" style={{ marginTop: 0 }}><span style={{ width: `${progress * 100}%`, transition: 'width 1s linear' }} /></div>
      </div>
    );
  },
});
