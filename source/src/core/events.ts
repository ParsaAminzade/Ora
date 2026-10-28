// Small, pure helpers for calendar events: where an event sits on a given day, how long it is,
// and how to describe its time in Persian. Shared by the grid, the planner and the editors.
import type { CalEvent } from './db';
import { addDays, dayKey, fa } from './dates';

export const DEFAULT_LEN = 60;
export const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + (m || 0); };
export const toHM = (n: number) => { const x = Math.max(0, Math.min(24 * 60, Math.round(n))); return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
const day = (k: string) => new Date(`${k}T12:00:00`);
export const daysBetween = (a: string, b: string) => Math.round((day(b).getTime() - day(a).getTime()) / 864e5);
export const shiftDay = (k: string, n: number) => dayKey(addDays(day(k), n));

export const isAllDay = (e: CalEvent) => !e.time;
export const lastDay = (e: CalEvent) => (e.endDay && e.endDay > e.day ? e.endDay : e.day);
export const occursOn = (e: CalEvent, d: string) => e.day <= d && lastDay(e) >= d;
export const isMultiDay = (e: CalEvent) => lastDay(e) > e.day;

/** End of a timed event, in minutes from the start of its *first* day (may exceed 1440). */
export function endAbs(e: CalEvent): number {
  if (!e.time) return 0;
  const s = toMin(e.time);
  if (!e.end) return s + DEFAULT_LEN;
  const span = daysBetween(e.day, lastDay(e));
  let end = toMin(e.end) + span * 1440;
  if (end <= s) end = span ? s + DEFAULT_LEN : (toMin(e.end) === 0 ? 1440 : s + DEFAULT_LEN);
  return end;
}
export const durationMin = (e: CalEvent) => (e.time ? endAbs(e) - toMin(e.time) : (daysBetween(e.day, lastDay(e)) + 1) * 1440);

/** [start, end] minutes of a timed event on day `d` (clipped to that day), or null. */
export function rangeOn(e: CalEvent, d: string): [number, number] | null {
  if (!e.time || !occursOn(e, d)) return null;
  const off = daysBetween(e.day, d) * 1440;
  const s = toMin(e.time) - off, z = endAbs(e) - off;
  const a = Math.max(0, s), b = Math.min(1440, z);
  return b > a ? [a, b] : null;
}

/** Move an event so it starts at `newDay` `newTime` (keeping its length). */
export function moved(e: CalEvent, newDay: string, newTime?: string): Partial<CalEvent> {
  const delta = daysBetween(e.day, newDay);
  if (!e.time || !newTime) return { day: newDay, endDay: e.endDay ? shiftDay(e.endDay, delta) : undefined };
  const len = durationMin(e);
  const startAbs = toMin(newTime);
  const endA = startAbs + len;
  return { day: newDay, time: newTime, end: toHM(endA % 1440 === 0 && endA > 0 ? 1440 : endA % 1440), endDay: endA > 1440 ? shiftDay(newDay, Math.floor((endA - 1) / 1440)) : undefined };
}

/** Change only the end, keeping the start. */
export function resized(e: CalEvent, endMinOnDay: number, onDay: string): Partial<CalEvent> {
  const off = daysBetween(e.day, onDay);
  const abs = Math.max(toMin(e.time ?? '00:00') + 15, endMinOnDay + off * 1440);
  return { end: toHM(abs % 1440 === 0 ? 1440 : abs % 1440), endDay: abs > 1440 ? shiftDay(e.day, Math.floor((abs - 1) / 1440)) : undefined };
}

export const faT = (hm: string) => fa(hm === '24:00' ? '۲۴:۰۰' : hm);
export function timeLabel(e: CalEvent): string {
  if (!e.time) return isMultiDay(e) ? `تمام‌روز · ${fa(daysBetween(e.day, lastDay(e)) + 1)} روز` : 'تمام‌روز';
  const end = toHM(endAbs(e) % 1440 || (endAbs(e) ? 1440 : 0));
  return `${faT(e.time)}–${faT(end)}`;
}

export const REMIND_OPTIONS: [number, string][] = [[0, 'سر وقت'], [5, '۵ دقیقه قبل'], [10, '۱۰ دقیقه قبل'], [30, 'نیم ساعت قبل'], [60, 'یک ساعت قبل'], [1440, 'یک روز قبل']];
export const remindLabel = (m: number) => REMIND_OPTIONS.find(([x]) => x === m)?.[1] ?? `${fa(m)} دقیقه قبل`;

/** Event colours (Google's palette, softened for a dark glass background). */
export const EVENT_COLORS: [string, string][] = [
  ['#D9B77E', 'طلایی'], ['#E9A08F', 'مرجانی'], ['#E58F9E', 'گلی'], ['#C79BE0', 'یاسی'], ['#8FA8E9', 'آبی'],
  ['#7FC4D9', 'فیروزه‌ای'], ['#8FD1A8', 'سبز'], ['#C6D98F', 'زیتونی'], ['#E9C88F', 'زعفرانی'], ['#A9AEB8', 'خاکستری'],
];
