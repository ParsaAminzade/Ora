// AI providers. Everything speaks the OpenAI-compatible chat API, which Ollama
// (http://localhost:11434/v1), LM Studio (http://localhost:1234/v1) and most cloud services
// expose, so switching models is only a change of base URL, model name and (optional) key.

export type AIPreset = 'ollama' | 'lmstudio' | 'custom';

export interface AICommand {
  /** Typed in Ctrl+K as "/<trigger> text" */
  trigger: string;
  title: string;
  /** {{text}} is replaced by what follows the trigger. */
  prompt: string;
}

export interface AISettings {
  preset: AIPreset;
  baseUrl: string;
  model: string;
  /** Embedding model for memory/knowledge search ('' = keyword search only). */
  embedModel: string;
  /** Let the assistant search your knowledge base for each question. */
  useKnowledge: boolean;
  apiKey: string;
  system: string;
  temperature: number;
  commands: AICommand[];
}

export const PRESET_URLS: Record<Exclude<AIPreset, 'custom'>, string> = {
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
};

export const DEFAULT_AI: AISettings = {
  preset: 'ollama',
  baseUrl: PRESET_URLS.ollama,
  model: '',
  embedModel: '',
  useKnowledge: true,
  apiKey: '',
  system: 'تو دستیار شخصی من هستی. کوتاه، دقیق و به فارسی جواب بده، مگر اینکه به زبان دیگری بخواهم. برای فرمول‌ها از LaTeX با $…$ استفاده کن.',
  temperature: 0.6,
  commands: [
    { trigger: 'break', title: 'شکستن به قدم‌های کوچک', prompt: 'این کار را به ۳ تا ۷ قدم کوچک و مشخص بشکن. فقط یک فهرست شماره‌دار بده، هر قدم در یک خط، بدون توضیح اضافه:\n\n{{text}}' },
    { trigger: 'sum', title: 'خلاصه کن', prompt: 'این متن را در چند جمله‌ی کوتاه خلاصه کن و نکته‌های کلیدی را فهرست کن:\n\n{{text}}' },
    { trigger: 'tex', title: 'تبدیل به LaTeX', prompt: 'این توضیح را به فرمول LaTeX تبدیل کن. فقط فرمول را داخل $$…$$ بده و در یک خط بگو هر نماد چیست:\n\n{{text}}' },
    { trigger: 'en', title: 'انگلیسی آکادمیک', prompt: 'Rewrite the following in clear, concise academic English. Return only the rewritten text:\n\n{{text}}' },
  ],
};

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const clean = (u: string) => u.trim().replace(/\/+$/, '');

function headers(cfg: AISettings): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey.trim()) h.Authorization = `Bearer ${cfg.apiKey.trim()}`;
  return h;
}

export type AIErrorKind = 'offline' | 'forbidden' | 'auth' | 'no-model' | 'http' | 'permission';

export class AIError extends Error {
  constructor(public kind: AIErrorKind, message: string) {
    super(message);
  }
}

/** Persian, actionable explanation for an error. */
export function explainAIError(e: unknown, cfg: AISettings): string {
  if (!(e instanceof AIError)) return `خطا: ${String((e as Error)?.message ?? e)}`;
  switch (e.kind) {
    case 'offline':
      return cfg.preset === 'ollama'
        ? 'به Ollama وصل نشد. مطمئن شو Ollama اجراست (آیکونش در System Tray ویندوز).'
        : cfg.preset === 'lmstudio'
          ? 'به LM Studio وصل نشد. در LM Studio بخش Developer، سرور محلی را Start کن.'
          : 'به سرور وصل نشد. آدرس را بررسی کن.';
    case 'forbidden':
      return 'سرور درخواست افزونه را رد کرد (403). راهنمای OLLAMA_ORIGINS را پایین همین بخش ببین.';
    case 'auth':
      return 'کلید API نامعتبر است یا لازم است.';
    case 'no-model':
      return 'هیچ مدلی انتخاب نشده. اول یک مدل نصب کن (مثلاً با ollama pull) و از فهرست انتخابش کن.';
    case 'permission':
      return 'اجازه‌ی دسترسی به این آدرس داده نشد.';
    default:
      return e.message;
  }
}

async function request(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AIError('offline', 'network');
  }
  if (res.status === 403) throw new AIError('forbidden', '403');
  if (res.status === 401) throw new AIError('auth', '401');
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
    throw new AIError('http', `خطای ${res.status}: ${detail}`);
  }
  return res;
}

/** Hosts other than localhost need an optional permission, asked for once. */
export async function ensureHostPermission(baseUrl: string): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return true;
  let origin: string;
  try { origin = `${new URL(baseUrl).origin}/*`; } catch { return false; }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/\*$/.test(origin)) return true;
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return chrome.permissions.request({ origins: [origin] });
}

export async function listModels(cfg: AISettings): Promise<string[]> {
  const res = await request(`${clean(cfg.baseUrl)}/models`, { headers: headers(cfg) });
  const data = (await res.json()) as { data?: { id: string }[] };
  return (data.data ?? []).map((m) => m.id).sort();
}

/** Streams a chat completion; calls onDelta with each new piece of text. Returns the full text. */
export async function streamChat(
  cfg: AISettings,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  system: string = cfg.system,
): Promise<string> {
  if (!cfg.model) throw new AIError('no-model', 'no model');
  const body = {
    model: cfg.model,
    stream: true,
    temperature: cfg.temperature,
    messages: system.trim() ? [{ role: 'system', content: system }, ...messages] : messages,
  };
  const res = await request(`${clean(cfg.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify(body),
    signal,
  });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return full;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content as string | undefined;
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        /* partial or non-JSON line: skip */
      }
    }
  }
  return full;
}

/**
 * Ollama rejects requests whose Origin is a chrome-extension:// URL unless OLLAMA_ORIGINS is set.
 * This session rule drops the Origin header on requests this extension (and only this extension)
 * makes to localhost, so Ollama works out of the box. If it can't be installed, the settings
 * page shows the manual OLLAMA_ORIGINS fix.
 */
export async function installLocalOriginRule(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest?.updateSessionRules) return;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1],
      addRules: [{
        id: 1,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [{ header: 'origin', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE }],
        },
        condition: {
          regexFilter: '^https?://(localhost|127\\.0\\.0\\.1)(:[0-9]+)?/',
          initiatorDomains: [chrome.runtime.id],
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST, chrome.declarativeNetRequest.ResourceType.OTHER],
        },
      }],
    });
  } catch {
    /* not critical */
  }
}

/** Embedding vectors for texts (OpenAI-compatible /embeddings; Ollama and LM Studio support it). */
export async function embed(cfg: AISettings, texts: string[]): Promise<number[][]> {
  if (!cfg.embedModel) throw new AIError('no-model', 'no embedding model');
  const res = await request(`${clean(cfg.baseUrl)}/embeddings`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({ model: cfg.embedModel, input: texts }),
  });
  const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
