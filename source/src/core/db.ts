// IndexedDB (via Dexie) for everything that grows: tasks, notes, calendar events, uploaded files,
// the assistant's memory and knowledge base. Schema changes go through numbered versions so
// existing data is upgraded in place, never lost.
import Dexie, { type Table } from 'dexie';

export interface Task {
  id: string;
  title: string;
  done: boolean;
  /** 0 = عادی, 1 = مهم */
  priority: 0 | 1;
  order: number;
  createdAt: number;
  doneAt?: number;
  /** Life area, e.g. «پژوهش». */
  area?: string;
  /** The day you plan to do it (yyyy-mm-dd). Empty = no date yet (inbox). */
  when?: string;
  /** A real deadline (yyyy-mm-dd), separate from the plan. */
  due?: string;
  /** Planned start, HH:MM (a time block). */
  time?: string;
  /** The time is a commitment (class, meeting): auto-planning never moves it. */
  fixed?: boolean;
  /** Estimate in minutes. */
  est?: number;
  /** One of today's top three. */
  top?: boolean;
  /** Parked for «بعداً / یه روزی». */
  someday?: boolean;
  /** Repeats: when done, the next one appears on its next day. */
  repeat?: Recurrence;
  notes?: string;
  steps?: { id: string; title: string; done: boolean }[];
  /** Focus minutes logged with the timer. */
  spent?: number;
  /** How many times it was pushed to a later day. */
  slips?: number;
  /** Length of its time block, when you set it by dragging in the calendar (minutes). */
  len?: number;
  /** The project (and its phase) this task moves forward. */
  project?: string;
  phase?: string;
  /** A session of a recurring goal. */
  goal?: string;
}

export type SentenceWhen = 'morning' | 'day' | 'evening' | 'night';

/** A line for the background: classical poetry, your own words, insights, packs, API or the local model. */
/** What made a line hard to get. */
export type UnclearWhy = 'words' | 'point' | 'context' | 'long';

export interface Sentence {
  id: string;
  text: string;
  by?: string;
  /** classic · mine · insight · ai · pack:<name> · api:<name> */
  source: string;
  area?: string;
  /** focus · gentle · comfort · calm · growth (matched to modes) */
  tags?: string[];
  when?: SentenceWhen[];
  /** Mode ids this line belongs to (empty = any). */
  modes?: string[];
  addedAt: number;
  lastShown?: number;
  likes?: number;
  /** Taxonomy (see data/sentences/GUIDE.md): theme, rhetorical form, tone. */
  theme?: string;
  form?: string;
  tone?: string;
  /** Not shown in the «دل‌گرفته» mode. */
  sadUnsafe?: boolean;
  /** «کمتر از این نوع» on this very line: hidden for a long while. */
  dislikedAt?: number;
  /** «منظورش را نفهمیدم»: set aside until it is rewritten (and why, if you said). */
  unclearAt?: number;
  unclearWhy?: UnclearWhy;
  /** Where it came from (e.g. the poem on ganjoor.net). */
  link?: string;
  /** Plain-words meaning: ganjoor's own commentary for a couplet, or a local model's ('none' = looked, nothing). */
  meaning?: string;
  meaningSrc?: 'ganjoor' | 'ai' | 'none' | 'ora';
  /** Hidden by the Ora server (a weak or wrong line). */
  hidden?: boolean;
  /** The original text when the server fixed a built-in line. */
  origText?: string;
  /** Your own reading of the line. */
  myMeaning?: string;
}

export interface Note {
  /** One note per notes-widget instance, keyed by the widget's id. */
  id: string;
  body: string;
  updatedAt: number;
}

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Repeat rule. `calendar` decides what "monthly"/"yearly" mean: same Jalali or Gregorian day. */
export interface Recurrence {
  freq: Freq;
  interval: number;
  calendar: 'jalali' | 'gregorian';
  /** Last day (inclusive, YYYY-MM-DD) or number of occurrences. */
  until?: string;
  count?: number;
  /** For weekly: JS weekdays 0=Sun … 6=Sat. Empty = the start day's weekday. */
  byWeekday?: number[];
}

export interface CalEvent {
  id: string;
  title: string;
  /** Local day key, YYYY-MM-DD (for a recurring event: the first occurrence). */
  day: string;
  /** Optional HH:mm. */
  time?: string;
  /** Which provider owns it: 'local' or 'google:<calendar id>'. */
  source: string;
  externalId?: string;
  /** iCalendar UID, kept so the same event is recognised across files and servers. */
  icalUid?: string;
  /** Calendar colour (from Google, or the accent for local events). */
  color?: string;
  updatedAt: number;
  rrule?: Recurrence;
  /** Days removed from a recurring series. */
  exdates?: string[];
  /** 1 when rrule is set (indexed, so masters can be found quickly). */
  recurring?: 0 | 1;
  /** CalDAV copy of this event on your own server. */
  dav?: { href: string; etag?: string };
  /** For an expanded occurrence: the series it came from (never stored). */
  seriesId?: string;
  /** End time HH:mm (on `endDay` when set). Missing = one hour after `time`. */
  end?: string;
  /** Last day of a multi-day event (inclusive). */
  endDay?: string;
  location?: string;
  notes?: string;
  /** Reminders, minutes before the start (0 = at the start). */
  remind?: number[];
  /** Which of your own calendars it belongs to (local events). */
  cal?: string;
  /** A one-day change to a repeating series («فقط این»): the series and the day it replaces. */
  overrideOf?: string;
  origDay?: string;
  /** Google: the series this instance belongs to. */
  recurringEventId?: string;
  /** «زمان تمرکز» (a protected window the planner fills with your important work) or «بیرون از دسترس». */
  kind?: 'focus' | 'off';
}

/** A recurring goal, Google-Goals style: «ورزش، ۳ بار در هفته، ۴۵ دقیقه، صبح». Its sessions are tasks. */
export interface Goal {
  id: string;
  title: string;
  area?: string;
  perWeek: number;
  minutes: number;
  part: 'morning' | 'afternoon' | 'evening' | 'any';
  /** Allowed weekdays (JS getDay); empty = any day that isn't a day off. */
  days?: number[];
  active: boolean;
  createdAt: number;
  project?: string;
}

/** A long-term aim with phases («پروژه»): the tasks of each phase move it forward. */
export interface Project {
  id: string;
  title: string;
  /** Why it matters / what «done» looks like. */
  why?: string;
  area?: string;
  color?: string;
  due?: string;
  status: 'active' | 'paused' | 'done';
  createdAt: number;
  doneAt?: number;
  phases: { id: string; title: string; done: boolean; due?: string; doneAt?: number }[];
  /** Hours per week you want to give it (minutes). */
  weekly?: number;
  /** Words that point to it in a task title (learned from the tasks you attach). */
  keys?: string[];
}

export type Reason = 'estimate' | 'interrupt' | 'energy' | 'unclear' | 'avoid' | 'blocked' | 'priority' | 'big';

/** The end-of-day review: how far each priority got, and the day's score. */
export interface DayReview {
  day: string;
  items: { taskId: string; title: string; rank: number; level: 0 | 1 | 2 | 3 | 4; reason?: Reason; note?: string; area?: string; project?: string }[];
  /** Unplanned work that came up and was done. */
  extra?: { title: string; minutes: number }[];
  score: number;
  parts: { priorities: number; focus: number; rest: number };
  /** How the day felt (1–5), to learn what helps you. */
  energy?: number;
  note?: string;
  at: number;
}

export interface Asset {
  id: string;
  kind: 'image' | 'video' | 'font' | 'html';
  name: string;
  mime: string;
  blob: Blob;
  createdAt: number;
}

/** A background you saved (or that was saved for you when you ran/uploaded it). */
export interface SavedBackground {
  id: string;
  name: string;
  /** The full background settings (kind, scene params, shader code, asset ids…). */
  bg: import('./state').Background;
  /** Small preview image (data URL) when one could be made. */
  thumb?: string;
  createdAt: number;
}

/** Something the user taught the assistant. */
export interface Memory {
  id: string;
  text: string;
  /** fact = about you/your world · rule = how to answer · correction = fix to a past answer */
  kind: 'fact' | 'rule' | 'correction';
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  /** Embedding vector from the local model, if one is configured. */
  vec?: number[];
  vecModel?: string;
}

/** A corrected answer, kept as training data for later fine-tuning. */
export interface Feedback {
  id: string;
  prompt: string;
  answer: string;
  correction: string;
  createdAt: number;
}

/** A document in the knowledge base (a note, a pasted text, an uploaded file). */
export interface KDoc {
  id: string;
  title: string;
  source: 'note' | 'file' | 'text';
  text: string;
  updatedAt: number;
  chunkCount: number;
}

export interface Chunk {
  id: string;
  docId: string;
  idx: number;
  text: string;
  vec?: number[];
  vecModel?: string;
}

/** Remembers deletions so they can be pushed to a sync server. */
export interface Tombstone {
  id: string;
  href: string;
  deletedAt: number;
}

class NovaDB extends Dexie {
  tasks!: Table<Task, string>;
  notes!: Table<Note, string>;
  events!: Table<CalEvent, string>;
  assets!: Table<Asset, string>;
  memories!: Table<Memory, string>;
  feedback!: Table<Feedback, string>;
  docs!: Table<KDoc, string>;
  chunks!: Table<Chunk, string>;
  tombstones!: Table<Tombstone, string>;
  sentences!: Table<Sentence, string>;
  backgrounds!: Table<SavedBackground, string>;
  goals!: Table<Goal, string>;
  projects!: Table<Project, string>;
  reviews!: Table<DayReview, string>;

  constructor() {
    super('nova');
    this.version(1).stores({
      tasks: 'id, order, done',
      notes: 'id, updatedAt',
      events: 'id, day, source',
      assets: 'id, kind',
    });
    this.version(2).stores({
      events: 'id, day, source, recurring',
      memories: 'id, kind, updatedAt',
      feedback: 'id, createdAt',
      docs: 'id, updatedAt',
      chunks: 'id, docId',
      tombstones: 'id',
    });
    this.version(3).stores({
      sentences: 'id, source, lastShown',
    });
    this.version(4).stores({
      backgrounds: 'id, createdAt',
    });
    this.version(5).stores({
      goals: 'id, active',
      projects: 'id, status',
      reviews: 'day',
    });
  }
}

export const db = new NovaDB();

export const uid = (): string =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
