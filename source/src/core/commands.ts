// Command palette registry (Ctrl+K). Static commands register once; "dynamic" providers turn
// the typed text into commands (e.g. "+ buy bread" → add a task). Later phases add AI commands here.
import type { ReactNode } from 'react';

export interface Command {
  id: string;
  title: string;
  hint?: string;
  keywords?: string;
  icon?: ReactNode;
  /** Shown after matching commands (e.g. a plain web search). */
  fallback?: boolean;
  run(): void | Promise<void>;
}

type Provider = (query: string) => Command[];

const commands = new Map<string, Command>();
const providers: Provider[] = [];

export const registerCommand = (c: Command) => commands.set(c.id, c);
export const registerProvider = (p: Provider) => providers.push(p);

const norm = (s: string) => s.toLowerCase().replace(/[‌\s]+/g, ' ').trim();

export function queryCommands(q: string): Command[] {
  const query = norm(q);
  const all = providers.flatMap((p) => p(q));
  const dynamic = all.filter((c) => !c.fallback);
  const fallback = all.filter((c) => c.fallback);
  if (!query) return [...dynamic, ...commands.values()];
  const words = query.split(' ');
  const scored = [...commands.values()]
    .map((c) => {
      const hay = norm(`${c.title} ${c.keywords ?? ''}`);
      if (!words.every((w) => hay.includes(w))) return null;
      return { c, score: hay.startsWith(query) ? 0 : 1 };
    })
    .filter((x): x is { c: Command; score: number } => !!x)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.c);
  return [...dynamic, ...scored, ...fallback];
}
