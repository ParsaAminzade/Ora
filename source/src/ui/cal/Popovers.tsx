// Small cards that open next to what you clicked: a quick «new event / task» form, and the details
// of an event or a time-blocked task with its actions.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { db, type CalEvent, type Task } from '../../core/db';
import { fa } from '../../core/dates';
import { createEvent, eventToTask, isRepeating, removeEvent, taskToEvent } from '../../core/calendar-service';
import { describe } from '../../core/recurrence';
import { lastDay, remindLabel, timeLabel, toHM } from '../../core/events';
import { addParsed, setFocusTask, toggleDone } from '../../core/planner';
import { dayLabel, estLabel, parseTask } from '../../core/taskparse';
import { useStore } from '../../core/state';
import { calOf, calPrefs } from '../../core/calendars';
import { withUndo } from '../../core/undo';
import { openTaskEditor } from '../TaskEditor';
import { IconBell, IconCheck, IconCopy, IconEdit, IconPin, IconRepeat, IconTarget, IconText, IconTrash, IconX } from '../icons';
import { askScope } from './ScopeAsk';
import { openEventEditor } from './EventEditor';
import { dayTitle, evColor, areaColor } from './shared';

function Pop({ rect, onClose, children, label, width = 340 }: { rect: DOMRect; onClose(): void; children: ReactNode; label: string; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 240;
    const gap = 10;
    let left = rect.left - width - gap; // RTL: open to the left of the block first
    if (left < 12) left = rect.right + gap;
    if (left + width > innerWidth - 12) left = Math.max(12, Math.min(innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
    const top = Math.max(12, Math.min(innerHeight - h - 12, rect.top));
    setPos({ left, top });
  }, [rect, width]);
  useLayoutEffect(() => {
    const off = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest('[role="alertdialog"], .dlg-backdrop[style*="z-index: 95"]')) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) { e.stopPropagation(); onClose(); } };
    const t = window.setTimeout(() => addEventListener('pointerdown', off, true), 0);
    addEventListener('keydown', esc, true);
    return () => { window.clearTimeout(t); removeEventListener('pointerdown', off, true); removeEventListener('keydown', esc, true); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} role="dialog" aria-label={label} className="glass cal-pop" style={{ left: pos.left, top: pos.top, width }}>{children}</div>,
    document.body,
  );
}

/* ---------- quick create ---------- */
export function QuickCreate({ at, onClose, onMore }: { at: { day: string; start?: number; end?: number; rect: DOMRect }; onClose(): void; onMore(init: { title: string; kind: 'event' | 'task' }): void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'event' | 'task'>('task');
  const allDay = at.start === undefined;
  const save = async () => {
    const tt = title.trim();
    if (!tt) return;
    if (kind === 'event') {
      await createEvent({ title: tt, day: at.day, time: allDay ? undefined : toHM(at.start!), end: allDay ? undefined : toHM(at.end!), remind: allDay ? undefined : calPrefs().defaultRemind, cal: calOf().id });
    } else {
      const p = parseTask(tt);
      await withUndo('کار ساخته شد', () => addParsed({ ...p, when: at.day, time: allDay ? p.time : toHM(at.start!), est: allDay ? p.est : at.end! - at.start! }));
    }
    onClose();
  };
  return (
    <Pop rect={at.rect} onClose={onClose} label="ساختن سریع">
      <div className="cal-pop-top"><button className="icon-btn" aria-label="بستن" onClick={onClose}><IconX size={16} /></button></div>
      <input className="ev-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'event' ? 'عنوان رویداد' : 'چه کاری؟ (مثلاً «تمرین آمار #درس»)'} aria-label="عنوان"
        onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
      <div className="seg seg-sm" role="tablist" aria-label="نوع">
        {([['task', 'کار'], ['event', 'رویداد']] as const).map(([k, n]) => <button key={k} role="tab" aria-selected={kind === k} aria-checked={kind === k} onClick={() => setKind(k)}>{n}</button>)}
      </div>
      <span className="cal-pop-when">{dayTitle(at.day)}{allDay ? ' · تمام‌روز' : ` · ${fa(toHM(at.start!))}–${fa(toHM(at.end!))}`}</span>
      {kind === 'task' && <span className="faint" style={{ fontSize: 12 }}>یک بلوک کاری در برنامه‌ات؛ تیک خوردنش در جمع‌بندی روز حساب می‌شود.</span>}
      <div className="cal-pop-acts">
        <button className="btn btn-accent btn-sm" onClick={() => void save()} disabled={!title.trim()}>ذخیره</button>
        <button className="btn btn-sm" style={{ border: 0 }} onClick={() => onMore({ title, kind })}>گزینه‌های بیشتر</button>
      </div>
    </Pop>
  );
}

const urlRe = /(https?:\/\/[^\s]+)/g;
function Linked({ text }: { text: string }) {
  return <>{text.split(urlRe).map((x, i) => (/^https?:\/\//.test(x) ? <a key={i} href={x} target="_blank" rel="noreferrer">{x}</a> : <span key={i}>{x}</span>))}</>;
}

/* ---------- an event ---------- */
export function EventCard({ e, rect, onClose }: { e: CalEvent; rect: DOMRect; onClose(): void }) {
  const gcals = useStore((s) => s.settings.google.calendars);
  useStore((s) => s.settings.calendar);
  const google = e.source.startsWith('google:');
  const calName = google ? `گوگل · ${gcals.find((c) => `google:${c.id}` === e.source)?.summary ?? ''}` : calOf(e.cal).name;
  const del = async () => {
    let scope: 'one' | 'following' | 'all' = 'all';
    if (isRepeating(e)) { const s = await askScope('delete', google); if (!s) return; scope = s; }
    onClose();
    await removeEvent(e, scope);
  };
  const dup = async () => {
    onClose();
    await createEvent({ title: e.title, day: e.day, time: e.time, end: e.end, endDay: e.endDay, location: e.location, notes: e.notes, remind: e.remind, color: google ? undefined : e.color, cal: google ? undefined : e.cal, target: google ? e.source.slice(7) : 'local' });
  };
  return (
    <Pop rect={rect} onClose={onClose} label={`رویداد ${e.title}`}>
      <div className="cal-pop-top">
        <button className="icon-btn" aria-label="ویرایش" title="ویرایش" onClick={() => { onClose(); openEventEditor({ event: e }); }}><IconEdit size={16} /></button>
        <button className="icon-btn" aria-label="حذف" title="حذف" onClick={() => void del()}><IconTrash size={16} /></button>
        <button className="icon-btn" aria-label="کپی" title="یک کپی بساز" onClick={() => void dup()}><IconCopy size={16} /></button>
        <button className="btn btn-sm" style={{ border: 0 }} title="این رویداد را به یک کار در برنامه تبدیل کن" onClick={async () => {
          let scope: 'one' | 'following' | 'all' = 'all';
          if (isRepeating(e)) { const s = await askScope('edit', google); if (!s) return; scope = s; }
          onClose(); await eventToTask(e, scope);
        }}>تبدیل به کار</button>
        <button className="icon-btn" aria-label="بستن" onClick={onClose} style={{ marginInlineStart: 'auto' }}><IconX size={16} /></button>
      </div>
      <div className="cal-pop-title"><i style={{ background: evColor(e) }} /><b>{e.title}</b></div>
      <span className="cal-pop-when">{dayTitle(e.day)}{lastDay(e) > e.day ? ` تا ${dayTitle(lastDay(e))}` : ''} · {timeLabel(e)}</span>
      {e.rrule && <span className="cal-pop-row"><IconRepeat size={14} />{describe(e.rrule)}</span>}
      {e.recurringEventId && !e.rrule && <span className="cal-pop-row"><IconRepeat size={14} />تکراری (از گوگل)</span>}
      {e.location && <span className="cal-pop-row"><IconPin size={14} /><span><Linked text={e.location} /></span></span>}
      {e.notes && <span className="cal-pop-row cal-pop-notes"><IconText size={14} /><span><Linked text={e.notes} /></span></span>}
      {!!e.remind?.length && <span className="cal-pop-row"><IconBell size={14} />{e.remind.map(remindLabel).join('، ')}</span>}
      <span className="cal-pop-cal">{calName}</span>
    </Pop>
  );
}

/* ---------- a task block ---------- */
export function TaskCard({ t, rect, onClose }: { t: Task; rect: DOMRect; onClose(): void }) {
  return (
    <Pop rect={rect} onClose={onClose} label={`کار ${t.title}`}>
      <div className="cal-pop-top">
        <button className="icon-btn" aria-label="ویرایش" title="ویرایش کار" onClick={() => { onClose(); openTaskEditor(t.id); }}><IconEdit size={16} /></button>
        <button className="icon-btn" aria-label="حذف" title="حذف" onClick={() => { onClose(); void withUndo('کار حذف شد', () => db.tasks.delete(t.id)); }}><IconTrash size={16} /></button>
        <button className="icon-btn" aria-label="بستن" onClick={onClose} style={{ marginInlineStart: 'auto' }}><IconX size={16} /></button>
      </div>
      <div className="cal-pop-title"><i style={{ background: t.area ? areaColor(t.area) : 'var(--accent)', borderRadius: 4 }} /><b style={t.done ? { textDecoration: 'line-through', opacity: .6 } : undefined}>{t.title}</b></div>
      <span className="cal-pop-when">{t.when ? dayTitle(t.when) : 'بدون روز'}{t.time ? ` · ${fa(t.time)}` : ''}{t.est ? ` · ${estLabel(t.est)}` : ''}</span>
      {(t.area || t.due || t.top || t.priority) ? (
        <span className="cal-pop-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {t.top && <span className="chip">از سه کار مهم</span>}{t.priority ? <span className="chip">مهم</span> : null}
          {t.area && <span className="chip">#{t.area}</span>}{t.due && <span className="chip">مهلت {dayLabel(t.due)}</span>}
        </span>
      ) : null}
      {t.notes && <span className="cal-pop-row cal-pop-notes"><IconText size={14} /><span>{t.notes}</span></span>}
      <div className="cal-pop-acts">
        <button className="btn btn-sm btn-accent" onClick={() => { void toggleDone(t); onClose(); }}><IconCheck size={14} />{t.done ? 'برگردان به انجام‌نشده' : 'انجام شد'}</button>
        {!t.done && <button className="btn btn-sm" onClick={() => { setFocusTask(t.id); dispatchEvent(new Event('ora:focus-start')); onClose(); }}><IconTarget size={14} />تمرکز</button>}
        {t.time && <button className="btn btn-sm" style={{ border: 0 }} onClick={() => { onClose(); void withUndo('از جدول برداشته شد', () => db.tasks.update(t.id, { time: undefined, fixed: false })); }}>بی‌ساعت کن</button>}
        <button className="btn btn-sm" style={{ border: 0 }} title="یک قرار ثابت در تقویم، نه یک کار" onClick={() => { onClose(); void taskToEvent(t); }}>تبدیل به رویداد</button>
      </div>
    </Pop>
  );
}
