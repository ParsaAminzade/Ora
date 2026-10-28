// The assistant conversation, shared by the assistant widget and the Ctrl+K AI commands.
// Before each answer it gathers what you taught it (memory) and what you gave it to read
// (knowledge base), and puts both in the system prompt. Everything runs locally.
import { create } from 'zustand';
import { kvGet, kvSet } from './kv';
import { useStore } from './state';
import { explainAIError, streamChat, type ChatMessage } from './providers/ai';
import { looksLikeRule, parseRememberCommand, relevantMemories, remember, saveCorrection } from './memory';
import { searchKnowledge, syncNotes } from './knowledge';

export interface Msg extends ChatMessage {
  id: string;
  error?: boolean;
  /** Short text shown in the chat instead of a long templated prompt. */
  display?: string;
  /** Knowledge-base documents the answer drew on. */
  sources?: string[];
  /** How many memories were in play. */
  memories?: number;
  /** A local reply (e.g. "remembered") that never went to the model. */
  local?: boolean;
}

interface AssistantState {
  messages: Msg[];
  busy: boolean;
  loaded: boolean;
  load(): Promise<void>;
  send(text: string, display?: string): Promise<void>;
  correct(messageId: string, correction: string): Promise<void>;
  stop(): void;
  clear(): void;
}

const KEY = 'nova:chat';
const MAX = 60;
let ctrl: AbortController | null = null;
let loading: Promise<void> | null = null;
const mid = () => Math.random().toString(36).slice(2, 10);

async function buildSystem(question: string): Promise<{ system: string; sources: string[]; memCount: number }> {
  const cfg = useStore.getState().settings.ai;
  const parts = [cfg.system.trim()];
  const st = useStore.getState().settings;
  const mode = st.modes.find((m) => m.id === st.mode.active);
  if (mode?.tone?.trim()) parts.push(`حالت فعلی کاربر: «${mode.name}». ${mode.tone.trim()}`);
  const mems = await relevantMemories(question).catch(() => []);
  if (mems.length) {
    const rules = mems.filter((m) => m.kind === 'rule');
    const facts = mems.filter((m) => m.kind === 'fact');
    const fixes = mems.filter((m) => m.kind === 'correction');
    if (rules.length) parts.push(`قانون‌هایی که کاربر برای جواب دادن گذاشته (همیشه رعایت کن):\n${rules.map((m) => `- ${m.text}`).join('\n')}`);
    if (facts.length) parts.push(`چیزهایی که کاربر درباره‌ی خودش و کارش گفته:\n${facts.map((m) => `- ${m.text}`).join('\n')}`);
    if (fixes.length) parts.push(`اصلاح‌هایی که کاربر قبلاً کرده؛ از تکرار همان اشتباه‌ها پرهیز کن:\n${fixes.map((m) => `- ${m.text}`).join('\n')}`);
  }
  let sources: string[] = [];
  if (cfg.useKnowledge) {
    await syncNotes().catch(() => 0);
    const hits = await searchKnowledge(question).catch(() => []);
    if (hits.length) {
      sources = [...new Set(hits.map((h) => h.title))];
      parts.push(`بخش‌هایی از یادداشت‌ها و فایل‌های خود کاربر که شاید به این سؤال مربوط باشند. اگر از آن‌ها استفاده کردی، با شماره‌ی منبع مثل [1] اشاره کن؛ اگر مربوط نبودند، نادیده بگیر:\n${hits.map((h, i) => `[${i + 1}] «${h.title}»: ${h.text}`).join('\n\n')}`);
    }
  }
  return { system: parts.filter(Boolean).join('\n\n'), sources, memCount: mems.length };
}

export const useAssistant = create<AssistantState>((set, get) => ({
  messages: [],
  busy: false,
  loaded: false,

  load() {
    // One shared promise, so concurrent callers can't overwrite messages sent in the meantime.
    loading ??= kvGet<Msg[]>(KEY).then((saved) => {
      set({ messages: [...(saved ?? []), ...get().messages], loaded: true });
    });
    return loading;
  },

  async send(text, display) {
    const content = text.trim();
    if (!content || get().busy) return;
    await get().load(); // don't let a late load() overwrite this turn
    const save = () => void kvSet(KEY, get().messages.slice(-MAX));

    // "یادت باشه …" is handled right here, instantly and offline.
    const toRemember = parseRememberCommand(content);
    if (toRemember) {
      const kind = looksLikeRule(toRemember) ? 'rule' : 'fact';
      await remember(toRemember, kind);
      set({
        messages: [...get().messages,
          { id: mid(), role: 'user', content, display },
          { id: mid(), role: 'assistant', content: kind === 'rule' ? `از این به بعد رعایت می‌کنم: ${toRemember}` : `به خاطر سپردم: ${toRemember}`, local: true }],
      });
      save();
      return;
    }

    const cfg = useStore.getState().settings.ai;
    const user: Msg = { id: mid(), role: 'user', content, display };
    const reply: Msg = { id: mid(), role: 'assistant', content: '' };
    // Only the last few turns go to the model, to stay inside small local context windows.
    const history = [...get().messages.filter((m) => !m.error && !m.local), user].slice(-12).map(({ role, content: c }) => ({ role, content: c }));
    set({ messages: [...get().messages, user, reply], busy: true });
    ctrl = new AbortController();
    const patch = (fn: (m: Msg) => Msg) => set({ messages: get().messages.map((m) => (m.id === reply.id ? fn(m) : m)) });
    try {
      const { system, sources, memCount } = await buildSystem(content);
      patch((m) => ({ ...m, sources, memories: memCount }));
      await streamChat(cfg, history, (d) => patch((m) => ({ ...m, content: m.content + d })), ctrl.signal, system);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') patch((m) => ({ ...m, content: explainAIError(e, cfg), error: true }));
    } finally {
      ctrl = null;
      set({ busy: false });
      save();
    }
  },

  async correct(messageId, correction) {
    const msgs = get().messages;
    const i = msgs.findIndex((m) => m.id === messageId);
    if (i < 0 || !correction.trim()) return;
    const answer = msgs[i].content;
    const question = [...msgs.slice(0, i)].reverse().find((m) => m.role === 'user');
    await saveCorrection(question?.content ?? '', answer, correction.trim());
    await get().send(`جواب قبلی‌ات را این‌طور اصلاح کردم: ${correction.trim()}\nبا در نظر گرفتن این اصلاح، جواب را دوباره و درست بنویس.`, `اصلاح: ${correction.trim()}`);
  },

  stop() {
    ctrl?.abort();
  },

  clear() {
    ctrl?.abort();
    set({ messages: [] });
    void kvSet(KEY, []);
  },
}));

/** Fill a command template: {{text}} → the user's text. */
export const fillPrompt = (template: string, text: string) =>
  template.includes('{{text}}') ? template.replaceAll('{{text}}', text) : `${template}\n\n${text}`;
