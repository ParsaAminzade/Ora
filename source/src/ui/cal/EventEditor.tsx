// The full event editor: title, Jalali date, start–end or all-day (also several days), repeat
// (presets or custom), reminders, colour, place, notes and which calendar it belongs to.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CalEvent, Recurrence } from '../../core/db';
import { fa, JALALI_MONTHS, toJalali, WEEKDAYS_FULL } from '../../core/dates';
import { createEvent, defaultTarget, eventToTask, isRepeating, removeEvent, updateEvent } from '../../core/calendar-service';
import { db, uid } from '../../core/db';
import { withUndo } from '../../core/undo';
import { describe, REPEAT_PRESETS } from '../../core/recurrence';
import { daysBetween, EVENT_COLORS, isMultiDay, lastDay, REMIND_OPTIONS, shiftDay, toHM, toMin } from '../../core/events';
import { useStore } from '../../core/state';
import { TimeInput } from '../TimeInput';
import { IconBell, IconPin, IconRepeat, IconText, IconTrash, IconX } from '../icons';
import { MiniMonth } from './MiniMonth';
import { askScope } from './ScopeAsk';
import { dd, dayTitle } from './shared';
import { calPrefs, localCalendars } from '../../core/calendars';
import { today } from '../../core/planner';

export interface EditorInit { event?: CalEvent; day?: string; time?: string; end?: string; allDay?: boolean; title?: string; kind?: CalEvent['kind'] }
export const openEventEditor = (init: EditorInit) => dispatchEvent(new CustomEvent('ora:event-editor', { detail: init }));

export function DateField({ value, onChange, label, min }: { value: string; onChange(v: string): void; label: string; min?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('pointerdown', off, true);
    return () => removeEventListener('pointerdown', off, true);
  }, [open]);
  const j = toJalali(dd(value));
  return (
    <div className="datef" ref={ref}>
      <button type="button" className="datef-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        {WEEKDAYS_FULL[(dd(value).getDay() + 1) % 7]} {fa(j.jd)} {JALALI_MONTHS[j.jm - 1]} {fa(j.jy)}
      </button>
      {open && <div className="datef-pop glass"><MiniMonth value={value} onPick={(d) => { if (!min || d >= min) { onChange(d); setOpen(false); } }} /></div>}
    </div>
  );
}

const WD = [6, 0, 1, 2, 3, 4, 5];
function RepeatField({ value, day, onChange }: { value?: Recurrence; day: string; onChange(r?: Recurrence): void }) {
  const sig = (x: Recurrence) => JSON.stringify([x.freq, x.interval, x.freq === 'weekly' || x.freq === 'daily' ? '' : x.calendar, [...(x.byWeekday ?? [])].sort()]);
  const preset = !value ? 'none' : (!value.until && !value.count && REPEAT_PRESETS.find((p) => p.rule && sig(p.rule) === sig(value))?.key) || 'custom';
  const [custom, setCustom] = useState(preset === 'custom');
  const r: Recurrence = value ?? { freq: 'weekly', interval: 1, calendar: 'jalali' };
  const set = (x: Partial<Recurrence>) => onChange({ ...r, ...x });
  const ends = r.until ? 'until' : r.count ? 'count' : 'never';
  return (
    <div className="ev-rep">
      <select className="mini-select ev-sel" aria-label="تکرار" value={custom ? 'custom' : preset} onChange={(e) => {
        const k = e.target.value;
        if (k === 'custom') { setCustom(true); onChange(r); return; }
        setCustom(false);
        onChange(REPEAT_PRESETS.find((p) => p.key === k)?.rule ?? undefined);
      }}>
        {REPEAT_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        <option value="custom">سفارشی…</option>
      </select>
      {custom && value && (
        <div className="ev-rep-box">
          <div className="ev-line">
            <span>هر</span>
            <input className="ev-num" type="number" min={1} max={99} value={r.interval} aria-label="فاصله‌ی تکرار" onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })} />
            <select className="mini-select ev-sel" aria-label="واحد تکرار" value={r.freq} onChange={(e) => set({ freq: e.target.value as Recurrence['freq'], byWeekday: undefined })}>
              <option value="daily">روز</option><option value="weekly">هفته</option><option value="monthly">ماه</option><option value="yearly">سال</option>
            </select>
            {(r.freq === 'monthly' || r.freq === 'yearly') && (
              <div className="seg seg-sm">{(['jalali', 'gregorian'] as const).map((c) => <button key={c} type="button" aria-checked={r.calendar === c} onClick={() => set({ calendar: c })}>{c === 'jalali' ? 'شمسی' : 'میلادی'}</button>)}</div>
            )}
          </div>
          {(r.freq === 'weekly' || r.freq === 'daily') && (
            <div className="te-field">
              <span className="te-label">کدام روزها؟</span>
              <div className="day-pills">{WD.map((g) => {
                const cur = r.freq === 'daily' ? WD : r.byWeekday?.length ? r.byWeekday : [dd(day).getDay()];
                const on = cur.includes(g);
                return <button key={g} type="button" className="pill pill-xs" aria-pressed={on} onClick={() => {
                  const nx = on ? cur.filter((x) => x !== g) : [...cur, g];
                  if (!nx.length) return;
                  // every day of the week = daily; any other set = weekly on those days
                  onChange(nx.length === 7 && r.interval === 1 ? { ...r, freq: 'daily', byWeekday: undefined } : { ...r, freq: 'weekly', interval: r.freq === 'daily' ? 1 : r.interval, byWeekday: nx });
                }}>{WEEKDAYS_FULL[(g + 1) % 7]}</button>;
              })}</div>
            </div>
          )}
          <div className="ev-line">
            <span>پایان:</span>
            <div className="seg seg-sm">
              {([['never', 'هرگز'], ['until', 'تا تاریخ'], ['count', 'بعد از چند بار']] as const).map(([k, n]) => (
                <button key={k} type="button" aria-checked={ends === k} onClick={() => set(k === 'never' ? { until: undefined, count: undefined } : k === 'until' ? { until: shiftDay(day, 30), count: undefined } : { count: 10, until: undefined })}>{n}</button>
              ))}
            </div>
            {ends === 'until' && <DateField value={r.until!} min={day} onChange={(v) => set({ until: v })} label="تاریخ پایان تکرار" />}
            {ends === 'count' && <><input className="ev-num" type="number" min={1} max={999} value={r.count} aria-label="تعداد تکرار" onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })} /><span>بار</span></>}
          </div>
          <span className="faint" style={{ fontSize: 12 }}>{describe(r)}</span>
        </div>
      )}
    </div>
  );
}

function Editor({ init, onClose }: { init: EditorInit; onClose(): void }) {
  const e = init.event;
  const google = useStore((s) => s.settings.google);
  const cals = localCalendars();
  const [title, setTitle] = useState(e?.title ?? init.title ?? '');
  const [day, setDay] = useState(e?.day ?? init.day ?? today());
  const [allDay, setAllDay] = useState(e ? !e.time : !!init.allDay);
  const [time, setTime] = useState(e?.time ?? init.time ?? '09:00');
  const [end, setEnd] = useState(() => {
    if (e?.time) return e.end ?? toHM(toMin(e.time) + 60);
    return init.end ?? toHM(Math.min(1440, toMin(init.time ?? '09:00') + 60));
  });
  const [endDay, setEndDay] = useState(e ? lastDay(e) : init.day ?? day);
  const [rrule, setRrule] = useState<Recurrence | undefined>(e?.rrule);
  const [remind, setRemind] = useState<number[]>(e?.remind ?? (e ? [] : init.allDay ? [] : calPrefs().defaultRemind));
  const [color, setColor] = useState<string | undefined>(e?.source === 'local' ? e.color : undefined);
  const [location, setLocation] = useState(e?.location ?? '');
  const [notes, setNotes] = useState(e?.notes ?? '');
  const [target, setTarget] = useState(e ? (e.source === 'local' ? `local:${e.cal ?? 'personal'}` : e.source.slice(7)) : (() => { const d = defaultTarget(); return d === 'local' ? `local:${cals.find((c) => c.default)?.id ?? 'personal'}` : d; })());
  const [kind, setKind] = useState<CalEvent['kind']>(e?.kind ?? init.kind);
  const [asTask, setAsTask] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { window.setTimeout(() => titleRef.current?.focus(), 30); }, []);
  useEffect(() => { if (endDay < day) setEndDay(day); }, [day]); // eslint-disable-line react-hooks/exhaustive-deps
  const isGoogleEv = !!e && e.source.startsWith('google:');
  const writableG = google.connected ? google.calendars.filter((c) => c.writable && c.enabled) : [];

  const save = async () => {
    if (!title.trim()) { setErr('یک عنوان بنویس.'); titleRef.current?.focus(); return; }
    const multi = endDay > day;
    let endT = allDay ? undefined : end;
    if (!allDay && !multi && toMin(end) <= toMin(time) && end !== '24:00') { setErr('پایان باید بعد از شروع باشد.'); return; }
    if (!allDay && endT === '00:00' && multi) endT = '24:00';
    const isLocalTarget = target.startsWith('local:');
    const draft = {
      title: title.trim(), day, time: allDay ? undefined : time, end: endT, endDay: multi ? (allDay || endT !== '24:00' ? endDay : shiftDay(endDay, -1) > day ? shiftDay(endDay, -1) : undefined) : undefined,
      rrule, remind: remind.length ? remind : (e ? [] : undefined), color: isLocalTarget ? color ?? cals.find((c) => `local:${c.id}` === target)?.color : undefined,
      location: location.trim() || undefined, notes: notes.trim() || undefined, cal: isLocalTarget ? target.slice(6) : undefined,
      kind: isLocalTarget ? kind : undefined,
    };
    setBusy(true);
    try {
      if (asTask) {
        // switch format: it becomes a (time-blocked) task
        if (!e) {
          const len = draft.time && draft.end ? Math.max(5, toMin(draft.end) - toMin(draft.time)) : undefined;
          await withUndo('کار ساخته شد', () => db.tasks.put({ id: uid(), title: draft.title, done: false, priority: 0, order: Date.now(), createdAt: Date.now(), when: day, ...(draft.time ? { time: draft.time, est: len, len } : {}), ...(draft.notes || draft.location ? { notes: [draft.location, draft.notes].filter(Boolean).join('\n') } : {}), ...(rrule ? { repeat: rrule } : {}) }));
        } else {
          let scope: 'one' | 'following' | 'all' = 'all';
          if (isRepeating(e)) { const s = await askScope('edit', isGoogleEv); if (!s) { setBusy(false); return; } scope = s; }
          await eventToTask({ ...e, ...draft, id: e.id, source: e.source, seriesId: e.seriesId, externalId: e.externalId, recurringEventId: e.recurringEventId, day: e.seriesId ? e.day : draft.day } as CalEvent, scope);
        }
        onClose();
        return;
      }
      if (!e) {
        const r = await createEvent({ ...draft, target: isLocalTarget ? 'local' : target });
        if (r.note) dispatchEvent(new CustomEvent('ora:say', { detail: { text: r.note } }));
      } else {
        let scope: 'one' | 'following' | 'all' = 'all';
        if (isRepeating(e)) { const s = await askScope('edit', isGoogleEv); if (!s) { setBusy(false); return; } scope = s; }
        const patch: Partial<CalEvent> = { ...draft };
        // keep what didn't change out of the patch (so «فقط این» copies the rest from the series)
        if (scope !== 'all' && e.seriesId && JSON.stringify(rrule) === JSON.stringify(e.rrule)) delete patch.rrule;
        if (scope === 'one') delete patch.rrule;
        await updateEvent(e, patch, scope);
      }
      onClose();
    } catch (x) {
      setErr(`ذخیره نشد: ${(x as Error).message}`);
    } finally { setBusy(false); }
  };

  const del = async () => {
    if (!e) return;
    let scope: 'one' | 'following' | 'all' = 'all';
    if (isRepeating(e)) { const s = await askScope('delete', isGoogleEv); if (!s) return; scope = s; }
    await removeEvent(e, scope);
    onClose();
  };

  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !document.querySelector('.datef-pop, [role="alertdialog"]')) { ev.stopPropagation(); onClose(); }
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); void save(); }
    };
    addEventListener('keydown', k, true);
    return () => removeEventListener('keydown', k, true);
  });

  return (
    <div className="dlg-backdrop" style={{ zIndex: 95 }} onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={e ? 'ویرایش رویداد' : 'رویداد تازه'} className="glass ev-ed">
        <div className="ev-ed-head">
          <input ref={titleRef} className="ev-title" value={title} onChange={(x) => { setTitle(x.target.value); setErr(''); }} placeholder="عنوان رویداد" aria-label="عنوان رویداد"
            onKeyDown={(x) => { if (x.key === 'Enter') void save(); }} />
          <button className="icon-btn" aria-label="بستن" onClick={onClose}><IconX size={18} /></button>
        </div>
        <div className="ev-ed-body scroll">
          <div className="seg seg-sm ev-kind" role="radiogroup" aria-label="نوع">
            <button type="button" role="radio" aria-checked={asTask} onClick={() => setAsTask(true)}>کار</button>
            {(target.startsWith('local:') ? ([[undefined, 'رویداد'], ['focus', 'زمان تمرکز'], ['off', 'بیرون از دسترس']] as const) : ([[undefined, 'رویداد']] as const)).map(([k, n]) => (
              <button key={n} type="button" role="radio" aria-checked={!asTask && kind === k} onClick={() => { setAsTask(false); setKind(k); if (k === 'focus' && !title.trim()) setTitle('زمان تمرکز'); if (k === 'off' && !title.trim()) setTitle('بیرون از دسترس'); }}>{n}</button>
            ))}
          </div>
          {asTask && <span className="faint ev-hint">{e ? 'با ذخیره، این رویداد به یک کار در برنامه‌ات تبدیل می‌شود (با همین زمان)؛ تیک خوردنش در جمع‌بندی روز حساب می‌شود.' : 'به‌جای رویداد، یک کار با همین زمان ساخته می‌شود.'}{isGoogleEv ? ' از گوگل‌کلندر هم برداشته می‌شود.' : ''}</span>}
          {!asTask && kind === 'focus' && <span className="faint ev-hint">اورآ کارهای مهمت را اول در زمان تمرکز می‌چیند، و این بازه جلسه حساب نمی‌شود.</span>}
          {!asTask && kind === 'off' && <span className="faint ev-hint">در این بازه چیزی برایت چیده نمی‌شود و از وقت آزاد آن روز کم می‌شود.</span>}
          <div className="ev-line ev-when">
            <DateField value={day} onChange={setDay} label="تاریخ" />
            {!allDay && <><TimeInput value={time} label="ساعت شروع" onChange={(v) => { const len = toMin(end) - toMin(time); setTime(v); if (endDay === day && len > 0) setEnd(toHM(Math.min(1440, toMin(v) + len))); }} style={{ width: 78 }} /><span className="faint">تا</span><TimeInput value={end === '24:00' ? '00:00' : end} label="ساعت پایان" onChange={setEnd} style={{ width: 78 }} /></>}
            {(allDay || endDay > day) && <><span className="faint">تا</span><DateField value={endDay} min={day} onChange={setEndDay} label="تاریخ پایان" /></>}
          </div>
          <div className="ev-line">
            <label className="ev-check"><input type="checkbox" className="chk" checked={allDay} onChange={(x) => setAllDay(x.target.checked)} />تمام‌روز</label>
            {!allDay && endDay === day && <button type="button" className="link-btn" onClick={() => setEndDay(shiftDay(day, 1))}>چندروزه</button>}
            {endDay > day && <span className="faint" style={{ fontSize: 12 }}>{fa(daysBetween(day, endDay) + 1)} روز</span>}
            {!allDay && endDay === day && toMin(end) > toMin(time) && <span className="faint" style={{ fontSize: 12 }}>{fa(toMin(end) - toMin(time))} دقیقه</span>}
          </div>

          <div className="ev-field"><IconRepeat size={16} className="faint" /><RepeatField value={rrule} day={day} onChange={setRrule} /></div>

          <div className="ev-field"><IconBell size={16} className="faint" />
            <div className="day-pills">
              {REMIND_OPTIONS.filter(([m]) => !allDay || m >= 1440 || m === 0).map(([m, n]) => (
                <button key={m} type="button" className="pill pill-xs" aria-pressed={remind.includes(m)} onClick={() => setRemind(remind.includes(m) ? remind.filter((x) => x !== m) : [...remind, m].sort((a, b) => a - b))}>{n}</button>
              ))}
            </div>
          </div>

          <div className="ev-field"><IconPin size={16} className="faint" /><input className="ev-input" value={location} onChange={(x) => setLocation(x.target.value)} placeholder="مکان یا لینک جلسه" aria-label="مکان" /></div>
          <div className="ev-field ev-top"><IconText size={16} className="faint" /><textarea className="ev-input ev-notes" value={notes} onChange={(x) => setNotes(x.target.value)} placeholder="توضیح" aria-label="توضیح" rows={3} /></div>

          <div className="ev-field">
            <span className="ev-lbl">تقویم</span>
            <select className="mini-select ev-sel" aria-label="تقویم" value={target} disabled={!!e && (isGoogleEv || !!e.seriesId)} onChange={(x) => setTarget(x.target.value)}>
              {cals.filter((c) => !c.hidden || target === `local:${c.id}`).map((c) => <option key={c.id} value={`local:${c.id}`}>{c.name}</option>)}
              {(e && isGoogleEv ? google.calendars.filter((c) => `google:${c.id}` === e.source) : writableG).map((c) => <option key={c.id} value={c.id}>گوگل · {c.summary}</option>)}
            </select>
          </div>
          {target.startsWith('local:') && (
            <div className="ev-field">
              <span className="ev-lbl">رنگ</span>
              <div className="ev-colors" role="radiogroup" aria-label="رنگ">
                <button type="button" className="ev-col none" role="radio" aria-checked={!color} title="رنگ تقویم" onClick={() => setColor(undefined)} />
                {EVENT_COLORS.map(([c, n]) => <button key={c} type="button" className="ev-col" role="radio" aria-checked={color === c} title={n} aria-label={n} style={{ background: c }} onClick={() => setColor(c)} />)}
              </div>
            </div>
          )}
          {e && isMultiDay(e) && <span className="faint" style={{ fontSize: 12 }}>از {dayTitle(e.day)} تا {dayTitle(lastDay(e))}</span>}
          {err && <span role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</span>}
        </div>
        <div className="pl-foot">
          <button className="btn btn-accent" onClick={() => void save()} disabled={busy}>ذخیره</button>
          <button className="btn" style={{ border: 0 }} onClick={onClose}>انصراف</button>
          {e && <button className="btn" style={{ border: 0, color: 'var(--danger)', marginInlineStart: 'auto' }} onClick={() => void del()}><IconTrash size={15} />حذف</button>}
        </div>
      </div>
    </div>
  );
}

export function EventEditorHost() {
  const [init, setInit] = useState<EditorInit | null>(null);
  useEffect(() => {
    const go = (ev: Event) => setInit((ev as CustomEvent<EditorInit>).detail);
    addEventListener('ora:event-editor', go);
    return () => removeEventListener('ora:event-editor', go);
  }, []);
  return init ? createPortal(<Editor init={init} onClose={() => setInit(null)} />, document.body) : null;
}
