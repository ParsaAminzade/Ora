// Projects: a long-term aim, done in phases. Each phase moves forward through ordinary tasks; the
// project always knows its current phase, its next concrete step, how much time it got this week,
// and whether its deadline is still realistic.
import { db, uid, type Project, type Task } from './db';
import { addDays, dayKey } from './dates';
import { today } from './planner';
import { tokens } from './text';
import { weekDays } from './goals';

export const PROJECT_COLORS = ['#D9B77E', '#8FA8E9', '#8FD1A8', '#E9A08F', '#C79BE0', '#7FC4D9', '#E9C88F', '#E58F9E'];

export const currentPhase = (p: Project) => p.phases.find((x) => !x.done) ?? null;
const blockLen = (t: Task) => t.len ?? t.est ?? 30;

/** Words that carry meaning in a task title (for linking tasks to projects). */
const WEAK = new Set(['کار', 'انجام', 'کردن', 'کنم', 'بکنم', 'باید', 'امروز', 'فردا', 'دقیقه', 'ساعت', 'بخش', 'ادامه', 'شروع', 'تمام', 'نوشتن', 'خواندن', 'خوندن', 'جلسه', 'مرور', 'روی', 'برای']);
export const keyWords = (s: string) => tokens(s.replace(/#\S+/g, '')).filter((t) => t.length >= 3 && !WEAK.has(t) && !/^\d+$/.test(t));

export async function createProject(input: { title: string; why?: string; phases?: string[]; due?: string; weekly?: number; area?: string; color?: string; taskIds?: string[] }): Promise<Project> {
  const n = await db.projects.count();
  const p: Project = {
    id: uid(), title: input.title.trim(), why: input.why?.trim() || undefined, area: input.area, due: input.due, weekly: input.weekly,
    color: input.color ?? PROJECT_COLORS[n % PROJECT_COLORS.length], status: 'active', createdAt: Date.now(),
    phases: (input.phases?.length ? input.phases : ['شروع']).filter((x) => x.trim()).map((t) => ({ id: uid(), title: t.trim(), done: false })),
    keys: [...new Set(keyWords(input.title))].slice(0, 12),
  };
  await db.projects.put(p);
  if (input.taskIds?.length) for (const id of input.taskIds) await attachTask(id, p.id);
  return p;
}

/** Put a task in a project (its current phase unless said otherwise), and learn the task's words. */
export async function attachTask(taskId: string, projectId: string | undefined, phaseId?: string): Promise<void> {
  if (!projectId) { await db.tasks.update(taskId, { project: undefined, phase: undefined }); return; }
  const p = await db.projects.get(projectId);
  const t = await db.tasks.get(taskId);
  if (!p || !t) return;
  await db.tasks.update(taskId, { project: p.id, phase: phaseId ?? currentPhase(p)?.id, area: t.area ?? p.area });
  const keys = [...new Set([...(p.keys ?? []), ...keyWords(t.title)])].slice(-16);
  await db.projects.update(p.id, { keys });
}

/** Which active project a new task title probably belongs to (by the words of its past tasks). */
export function suggestProject(title: string, projects: Project[]): Project | null {
  const w = new Set(keyWords(title));
  if (!w.size) return null;
  let best: Project | null = null, bestN = 0;
  for (const p of projects) {
    if (p.status !== 'active') continue;
    const n = (p.keys ?? []).filter((k) => w.has(k)).length;
    if (n > bestN) { best = p; bestN = n; }
  }
  return bestN ? best : null;
}

export async function completePhase(p: Project, phaseId: string, done = true): Promise<void> {
  const phases = p.phases.map((x) => (x.id === phaseId ? { ...x, done, doneAt: done ? Date.now() : undefined } : x));
  const all = phases.every((x) => x.done);
  await db.projects.update(p.id, { phases, status: all ? 'done' : p.status === 'done' ? 'active' : p.status, doneAt: all ? Date.now() : undefined });
  // open tasks of a finished phase move on with the project
  const next = phases.find((x) => !x.done);
  if (done && next) await db.tasks.filter((t) => t.project === p.id && t.phase === phaseId && !t.done).modify({ phase: next.id });
}

export interface ProjectState {
  phase: Project['phases'][number] | null;
  phaseIndex: number;
  progress: number; // 0..1, phases done plus the share of the current phase's tasks done
  next: Task | null;
  open: number; doneTasks: number;
  weekMin: number; weekPlanned: number;
  lastActive?: number; stalledDays: number;
  remainingMin: number;
  dueRisk: 'ok' | 'tight' | 'late' | null;
}

export function projectState(p: Project, tasks: Task[], now = new Date()): ProjectState {
  const mine = tasks.filter((t) => t.project === p.id);
  const phase = currentPhase(p);
  const idx = phase ? p.phases.indexOf(phase) : p.phases.length;
  const inPhase = mine.filter((t) => t.phase === phase?.id);
  const share = inPhase.length ? inPhase.filter((t) => t.done).length / inPhase.length : 0;
  const progress = p.phases.length ? (p.phases.filter((x) => x.done).length + (phase ? share * 0.9 : 0)) / p.phases.length : 0;
  const open = mine.filter((t) => !t.done);
  const next = [...open].sort((a, b) => Number(a.phase !== phase?.id) - Number(b.phase !== phase?.id) || Number(!!b.top) - Number(!!a.top) || (a.when ?? '9').localeCompare(b.when ?? '9') || a.order - b.order)[0] ?? null;
  const week = weekDays(dayKey(now));
  const inWeek = (t: Task) => !!t.when && t.when >= week[0] && t.when <= week[6];
  const weekMin = mine.filter((t) => t.done && inWeek(t)).reduce((a, t) => a + Math.max(blockLen(t), t.spent ?? 0), 0);
  const weekPlanned = mine.filter((t) => !t.done && inWeek(t)).reduce((a, t) => a + blockLen(t), 0);
  const lastActive = mine.filter((t) => t.doneAt).reduce((m, t) => Math.max(m, t.doneAt!), 0) || undefined;
  const stalledDays = Math.floor((now.getTime() - (lastActive ?? p.createdAt)) / 864e5);
  const remainingMin = open.reduce((a, t) => a + blockLen(t), 0);
  let dueRisk: ProjectState['dueRisk'] = null;
  if (p.due && p.status === 'active') {
    const daysLeft = Math.max(0, Math.round((new Date(`${p.due}T12:00`).getTime() - new Date(`${dayKey(now)}T12:00`).getTime()) / 864e5));
    const phasesLeft = p.phases.filter((x) => !x.done).length;
    // a rough pace: phases left vs days left (at least ~3 days per phase), and the week's time budget
    const budget = (p.weekly ?? 0) * (daysLeft / 7);
    dueRisk = daysLeft === 0 && phasesLeft ? 'late' : phasesLeft * 3 > daysLeft || (budget && remainingMin > budget) ? 'tight' : 'ok';
  }
  return { phase, phaseIndex: idx, progress, next, open: open.length, doneTasks: mine.length - open.length, weekMin, weekPlanned, lastActive, stalledDays, remainingMin, dueRisk };
}

/** The word in its written form (with its half-space) that contains a normalised key. */
function writtenWord(titles: string[], key: string): string {
  const c = new Map<string, number>();
  for (const t of titles) for (const w of t.split(/[\s:،,.!؟?()«»\-–—/]+/)) if (w && tokens(w).some((x) => x === key)) c.set(w, (c.get(w) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? key;
}

/** Recently repeated work that isn't a project yet: «این چند وقت زیاد روی X کار می‌کنی». */
export interface Candidate { key: string; label: string; taskIds: string[]; days: number; minutes: number; why: 'repeat' | 'big' }
export function projectCandidates(tasks: Task[], projects: Project[], dismissed: Record<string, number> = {}, now = new Date()): Candidate[] {
  const since = dayKey(addDays(now, -21));
  const pool = tasks.filter((t) => !t.project && !t.goal && (t.when ?? dayKey(new Date(t.createdAt))) >= since);
  const taken = new Set(projects.flatMap((p) => p.keys ?? []));
  const byKey = new Map<string, Task[]>();
  for (const t of pool) for (const k of new Set(keyWords(t.title))) { if (!taken.has(k)) byKey.set(k, [...(byKey.get(k) ?? []), t]); }
  const out: Candidate[] = [];
  for (const [k, ts] of byKey) {
    if ((dismissed[k] ?? 0) > now.getTime()) continue;
    const days = new Set(ts.map((t) => t.when ?? dayKey(new Date(t.createdAt)))).size;
    const minutes = ts.reduce((a, t) => a + (t.done ? blockLen(t) : 0) + (t.spent ?? 0), 0);
    if (ts.length >= 3 && days >= 3) {
      // the label: the same title if they all share it, else the word as you wrote it («پایان‌نامه»)
      const same = ts.every((t) => t.title.trim() === ts[0].title.trim());
      out.push({ key: k, label: same && ts[0].title.length <= 30 ? ts[0].title.trim() : writtenWord(ts.map((t) => t.title), k), taskIds: ts.map((t) => t.id), days, minutes, why: 'repeat' });
    }
  }
  // one big task that keeps slipping is a project in disguise
  for (const t of pool) {
    if (!t.done && (t.slips ?? 0) >= 3 && (t.est ?? 0) >= 120 && !(dismissed[`big:${t.id}`] > now.getTime())) out.push({ key: `big:${t.id}`, label: t.title, taskIds: [t.id], days: 0, minutes: t.est ?? 0, why: 'big' });
  }
  // merge candidates that are the same tasks under two words
  const seen = new Set<string>();
  return out.sort((a, b) => b.taskIds.length - a.taskIds.length || b.days - a.days).filter((c) => { const sig = [...c.taskIds].sort().join(); if (seen.has(sig)) return false; seen.add(sig); return true; }).slice(0, 3);
}

export interface ProjectsOpen { id?: string; create?: string; taskIds?: string[] }
export const openProjects = (o: ProjectsOpen = {}) => dispatchEvent(new CustomEvent('ora:projects', { detail: o }));
export const isActive = (p: Project) => p.status === 'active';
export { today };
