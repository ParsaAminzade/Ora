// iCalendar (.ics) read/write, shared by file import/export and CalDAV sync.
// Gregorian repeats use the standard RRULE. Jalali repeats ("every 1st of Mehr") can't be written
// as an RRULE, so they travel as X-NOVA-JALALI-RRULE (read back exactly by Nova) plus an RDATE list
// of the next ten years, so phones and other calendars still show every occurrence.
import { db, uid, type CalEvent, type Freq, type Recurrence } from './db';
import { addDays, dayKey, pad2 } from './dates';
import { seriesDays } from './recurrence';

/* ---------------- low-level helpers ---------------- */

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}
const unescape = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const escape = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
/** Lines longer than 75 octets are folded, as RFC 5545 asks. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = ' '; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Offset (ms) of a time zone at a given instant. */
function tzOffset(tz: string, t: number): number {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
  } catch {
    return 0;
  }
}

/** Wall-clock time in `tz` → real instant. */
function zoned(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - tzOffset(tz, guess);
  t = guess - tzOffset(tz, t);
  return new Date(t);
}

/** DTSTART / EXDATE value → local day key + optional HH:mm. */
function parseDateValue(value: string, params: string): { day: string; time?: string } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, , z] = m;
  if (!hh || /VALUE=DATE(?!-)/.test(params)) return { day: `${y}-${mo}-${d}` };
  const tzid = params.match(/TZID=([^;:]+)/)?.[1]?.replace(/^"|"$/g, '');
  let dt: Date;
  if (z) dt = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm));
  else if (tzid && tzid !== localTz()) dt = zoned(+y, +mo, +d, +hh, +mm, tzid);
  else return { day: `${y}-${mo}-${d}`, time: `${hh}:${mm}` }; // floating or already local
  return { day: dayKey(dt), time: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}` };
}

const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const FREQS: Record<string, Freq> = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' };

function parseRule(v: string, calendar: 'jalali' | 'gregorian'): Recurrence | undefined {
  const p = Object.fromEntries(v.split(';').map((kv) => kv.split('=') as [string, string]));
  const freq = FREQS[p.FREQ];
  if (!freq) return undefined;
  const r: Recurrence = { freq, interval: Number(p.INTERVAL) || 1, calendar };
  if (p.COUNT) r.count = Number(p.COUNT);
  if (p.UNTIL) r.until = parseDateValue(p.UNTIL, '')?.day;
  if (freq === 'weekly' && p.BYDAY) {
    const days = p.BYDAY.split(',').map((d) => WD.indexOf(d.slice(-2))).filter((d) => d >= 0);
    if (days.length) r.byWeekday = days;
  }
  return r;
}

export function toRRULE(r: Recurrence, startDay: string): string {
  const parts = [`FREQ=${r.freq.toUpperCase()}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'weekly') parts.push(`BYDAY=${(r.byWeekday?.length ? r.byWeekday : [new Date(`${startDay}T12:00:00`).getDay()]).map((d) => WD[d]).join(',')}`);
  if (r.count) parts.push(`COUNT=${r.count}`);
  if (r.until) parts.push(`UNTIL=${r.until.replace(/-/g, '')}`);
  return parts.join(';');
}

/* ---------------- parse ---------------- */

export interface ParsedEvent {
  uid?: string;
  title: string;
  day: string;
  time?: string;
  end?: string;
  endDay?: string;
  location?: string;
  notes?: string;
  remind?: number[];
  kind?: 'focus' | 'off';
  rrule?: Recurrence;
  exdates?: string[];
}

/** -PT10M / -PT1H30M / -P1D / PT0S → minutes before the start. */
function triggerMinutes(v: string): number | null {
  const m = v.match(/^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const mins = (Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0)) * 1440 + Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0);
  return m[1] || mins === 0 ? mins : null; // reminders after the start are not supported
}
const minusDay = (k: string) => dayKey(addDays(new Date(`${k}T12:00:00`), -1));

export function parseICS(text: string): ParsedEvent[] {
  const out: ParsedEvent[] = [];
  let cur: (Partial<ParsedEvent> & { std?: string; jal?: string; dtend?: { day: string; time?: string } }) | null = null;
  let alarm = false;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'BEGIN:VALARM') { alarm = true; continue; }
    if (line === 'END:VALARM') { alarm = false; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.day) {
        const rrule = cur.jal ? parseRule(cur.jal, 'jalali') : cur.std ? parseRule(cur.std, 'gregorian') : undefined;
        let end: string | undefined, endDay: string | undefined;
        const de = cur.dtend;
        if (de && !cur.time) { const last = minusDay(de.day); if (last > cur.day) endDay = last; }
        else if (de && cur.time && de.time) {
          if (de.day > cur.day && de.time === '00:00') { end = '24:00'; const last = minusDay(de.day); if (last > cur.day) endDay = last; }
          else { end = de.time; if (de.day > cur.day) endDay = de.day; }
        }
        out.push({ uid: cur.uid, title: cur.title ?? '(بدون عنوان)', day: cur.day, time: cur.time, end, endDay, location: cur.location, notes: cur.notes, remind: cur.remind, kind: cur.kind, rrule, exdates: cur.exdates });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    if (alarm) {
      if (line.startsWith('TRIGGER')) { const v = triggerMinutes(line.slice(line.indexOf(':') + 1)); if (v !== null) cur.remind = [...new Set([...(cur.remind ?? []), v])]; }
      continue;
    }
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const [name, ...paramParts] = line.slice(0, idx).split(';');
    const value = line.slice(idx + 1);
    const params = paramParts.join(';');
    if (name === 'SUMMARY') cur.title = unescape(value);
    else if (name === 'UID') cur.uid = value;
    else if (name === 'DTSTART') Object.assign(cur, parseDateValue(value, params) ?? {});
    else if (name === 'DTEND') cur.dtend = parseDateValue(value, params) ?? undefined;
    else if (name === 'LOCATION') cur.location = unescape(value) || undefined;
    else if (name === 'DESCRIPTION') cur.notes = unescape(value) || undefined;
    else if (name === 'X-ORA-KIND' && (value === 'focus' || value === 'off')) cur.kind = value;
    else if (name === 'RRULE') cur.std = value;
    else if (name === 'X-NOVA-JALALI-RRULE') cur.jal = value;
    else if (name === 'EXDATE') {
      const days = value.split(',').map((v) => parseDateValue(v, params)?.day).filter((d): d is string => !!d);
      cur.exdates = [...(cur.exdates ?? []), ...days];
    }
  }
  return out;
}

/* ---------------- serialize ---------------- */

const compact = (day: string) => day.replace(/-/g, '');
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

export function icalUid(e: CalEvent): string {
  return e.icalUid ?? `${e.id}@nova`;
}

/** One VEVENT, wrapped in a VCALENDAR (the shape CalDAV stores per event). */
export function eventToICS(e: CalEvent): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ora//Personal New Tab//FA', ...veventLines(e), 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}

function veventLines(e: CalEvent): string[] {
  const tz = localTz();
  const lines = ['BEGIN:VEVENT', `UID:${icalUid(e)}`, `DTSTAMP:${stamp()}`, `LAST-MODIFIED:${new Date(e.updatedAt).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`, `SUMMARY:${escape(e.title)}`];
  const dateOf = (day: string) => (e.time ? `;TZID=${tz}:${compact(day)}T${e.time.replace(':', '')}00` : `;VALUE=DATE:${compact(day)}`);
  lines.push(`DTSTART${dateOf(e.day)}`);
  const last = e.endDay && e.endDay > e.day ? e.endDay : e.day;
  if (e.time) {
    const start = new Date(`${e.day}T${e.time}:00`);
    let end = e.end ? (e.end === '24:00' ? addDays(new Date(`${last}T00:00:00`), 1) : new Date(`${last}T${e.end}:00`)) : new Date(start.getTime() + 3600e3);
    if (end <= start) end = new Date(start.getTime() + 3600e3);
    lines.push(`DTEND;TZID=${tz}:${compact(dayKey(end))}T${pad2(end.getHours())}${pad2(end.getMinutes())}00`);
  } else {
    lines.push(`DTEND;VALUE=DATE:${compact(dayKey(addDays(new Date(`${last}T12:00:00`), 1)))}`);
  }
  if (e.location) lines.push(`LOCATION:${escape(e.location)}`);
  if (e.notes) lines.push(`DESCRIPTION:${escape(e.notes)}`);
  if (e.kind) lines.push(`X-ORA-KIND:${e.kind}`, `TRANSP:${e.kind === 'focus' ? 'TRANSPARENT' : 'OPAQUE'}`);
  if (e.rrule) {
    const jalaliRepeat = e.rrule.calendar === 'jalali' && (e.rrule.freq === 'monthly' || e.rrule.freq === 'yearly');
    if (jalaliRepeat) {
      lines.push(`X-NOVA-JALALI-RRULE:${toRRULE(e.rrule, e.day)}`);
      const horizon = dayKey(addDays(new Date(`${e.day}T12:00:00`), 3650));
      const days = seriesDays(e.day, e.rrule, horizon, e.exdates).filter((d) => d !== e.day);
      if (days.length) lines.push(`RDATE${e.time ? `;TZID=${tz}:` : ';VALUE=DATE:'}${days.map((d) => (e.time ? `${compact(d)}T${e.time.replace(':', '')}00` : compact(d))).join(',')}`);
    } else {
      lines.push(`RRULE:${toRRULE(e.rrule, e.day)}`);
      if (e.exdates?.length) lines.push(`EXDATE${e.time ? `;TZID=${tz}:` : ';VALUE=DATE:'}${e.exdates.map((d) => (e.time ? `${compact(d)}T${e.time.replace(':', '')}00` : compact(d))).join(',')}`);
    }
  }
  for (const m of e.remind ?? []) {
    const trig = m === 0 ? 'PT0S' : m % 1440 === 0 ? `-P${m / 1440}D` : m % 60 === 0 ? `-PT${m / 60}H` : `-PT${m}M`;
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(e.title)}`, `TRIGGER:${trig}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

/* ---------------- file import / export ---------------- */

export function parsedToEvent(p: ParsedEvent, existingId?: string): CalEvent {
  return {
    id: existingId ?? (p.uid ? `ics:${p.uid}` : uid()),
    icalUid: p.uid,
    title: p.title,
    day: p.day,
    time: p.time,
    end: p.end,
    endDay: p.endDay,
    location: p.location,
    notes: p.notes,
    remind: p.remind,
    kind: p.kind,
    source: 'local',
    rrule: p.rrule,
    exdates: p.exdates,
    recurring: p.rrule ? 1 : 0,
    updatedAt: Date.now(),
  };
}

export async function importICS(file: File): Promise<number> {
  const events = parseICS(await file.text()).map((p) => parsedToEvent(p));
  await db.events.bulkPut(events);
  return events.length;
}

export async function exportICS(): Promise<number> {
  const events = (await db.events.toArray()).filter((e) => e.source === 'local');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ora//Personal New Tab//FA', 'CALSCALE:GREGORIAN', ...events.flatMap(veventLines), 'END:VCALENDAR'];
  const blob = new Blob([lines.map(fold).join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nova-calendar-${new Date().toISOString().slice(0, 10)}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return events.length;
}
