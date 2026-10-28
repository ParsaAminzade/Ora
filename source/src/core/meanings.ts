// «معنی»: a short plain-words reading of a line. In order of trust:
//  1. a classical couplet → ganjoor.net's own prose meaning (written by its contributors), kept offline;
//  2. one of Ora's own metaphors or paradoxes → a reading written for it in advance, shipped with Ora;
//  3. your own reading («برداشت من»), which you can always add;
//  4. only if you set up a local model, and only when you ask: the model's explanation.
import { db, type Sentence } from './db';
import { coupletMeaning } from './ganjoor';
import { explainLine } from './sentences';
import { useStore } from './state';

export type MeaningSrc = 'ganjoor' | 'ora' | 'ai';
export interface Meaning { text: string; src: MeaningSrc }
export const MEANING_LABEL: Record<MeaningSrc, string> = { ganjoor: 'معنی از گنجور', ora: 'برداشت اورآ', ai: 'توضیح مدل محلی' };

/** Readings for the built-in classical couplets and the three «gold» lines. */
const BUILTIN: Record<string, string> = {
  'c-1': 'هر کس دانش دارد، توانا هم هست؛ و دانستن، حتی دلِ آدمِ پیر را جوان و سرزنده نگه می‌دارد.',
  'c-2': 'حتی مورچه‌ای را که دانه می‌برد آزار نده؛ او هم جان دارد و جانش برایش همان‌قدر شیرین است که جان تو برای تو.',
  'c-3': 'همه‌ی آدم‌ها مثل اعضای یک بدن‌اند و از یک اصل آفریده شده‌اند؛ پس به هم وابسته‌ایم و از هم جدا نیستیم.',
  'c-4': 'وقتی یک عضو بدن درد بگیرد، بقیه هم آرام نمی‌مانند؛ رنج یک انسان باید دیگران را هم بی‌قرار کند.',
  'c-5': 'صبر و پیروزی رفیق‌های قدیمی‌اند؛ معمولاً پیروزی درست پشت سرِ صبر از راه می‌رسد.',
  'c-6': 'همه‌ی جهان دست به دست هم داده تا تو نانی به دست بیاوری؛ پس قدرش را بدان و آن را بی‌توجه و ناسپاس نخور.',
  'c-7': 'همان‌طور که یوسفِ گمشده به خانه برگشت، آنچه از دست رفته ممکن است برگردد؛ خانه‌ی غم روزی گلستان می‌شود، ناامید نشو.',
  'c-8': 'روزهای سخت ماندنی نیستند؛ همان‌طور که حالِ قبلی نماند، این حال هم نمی‌ماند.',
  'c-9': 'ای دل، سوز و شوقِ درونت را دست‌کم نگیر؛ یک خواهشِ صادقانه‌ی نیمه‌شب می‌تواند گره‌های زیادی را باز کند.',
  'c-10': 'سال‌ها دنبال جامی جادویی (جام جم) بودیم که همه‌چیز را نشان بدهد، در حالی که خودمان آن را داشتیم؛ گاهی جواب را در دوردست می‌جوییم و درون خودمان است.',
  'c-11': 'بیا شاد باشیم و نظمِ کهنه و خسته‌کننده را بشکنیم و طرحی تازه برای زندگی بریزیم؛ دعوتی به شروعِ نو و جسورانه.',
  'c-12': 'حافظ می‌گوید هر خوشبختی‌ای که نصیبش شد، از برکتِ دعای شب و ذکرِ سحرگاهی بود.',
  'c-13': 'هر کس از ریشه و اصلِ خودش دور بیفتد، همیشه در دلش منتظرِ روزی است که دوباره به آن برگردد.',
  'c-14': 'به ناله‌ی نی گوش کن که از جدایی می‌نالد؛ نی نمادِ روحِ آدم است که از اصلش جدا شده و دلتنگِ بازگشت است.',
  'c-15': 'جهان مثل کوه است و کارهای ما مثل صدایی که در آن می‌پیچد؛ هر کاری بکنی، پژواکش به خودت برمی‌گردد.',
  'c-16': 'محبت تلخی‌ها را شیرین می‌کند و چیزهای کم‌ارزش را ارزشمند، مثل کیمیایی که مس را طلا می‌کند.',
  'c-17': 'عمر مثل کاروانی تند می‌گذرد؛ لحظه‌ی خوشی را که داری دریاب، چون آن هم می‌گذرد.',
  'gold-1': 'تشویق شدن لزوماً نشانه‌ی کارِ درست نیست؛ دلقک‌ها بیشترین تشویق را می‌گیرند چون سرگرم می‌کنند، نه چون مهم‌ترین کار را کرده‌اند. ملاکِ موفقیت را جای دیگری بگذار.',
  'gold-2': 'لحظه‌ها وقتی در جریان‌اند عادی به نظر می‌رسند؛ ارزششان را معمولاً وقتی می‌فهمیم که گذشته‌اند و فقط خاطره‌شان مانده.',
  'gold-3': 'ترس بیشتر از تصورِ خودمان می‌آید تا از خودِ موقعیت؛ ذهن در ابهام بدترین حالت‌ها را می‌سازد.',
};

let ora: Record<string, string> | null = null;
async function oraMeanings(): Promise<Record<string, string>> {
  if (!ora) ora = (await import('../data/meanings.json')).default as Record<string, string>;
  return ora;
}

/** The best reading we have without asking a model (may fetch ganjoor once and keep it). */
export async function meaningOf(s: Sentence): Promise<Meaning | null> {
  if (s.meaning && s.meaningSrc === 'ganjoor') return { text: s.meaning, src: 'ganjoor' };
  if (s.meaning && s.meaningSrc === 'ora') return { text: s.meaning, src: 'ora' }; // written on the Ora server
  if (BUILTIN[s.id]) return { text: BUILTIN[s.id], src: 'ora' };
  const m = (await oraMeanings())[s.id];
  if (m) return { text: m, src: 'ora' };
  const g = /^g-(\d+)-(\d+)$/.exec(s.id);
  if (g && s.meaningSrc !== 'none' && navigator.onLine) {
    try {
      const t = await coupletMeaning(Number(g[1]), Number(g[2]));
      await db.sentences.update(s.id, t ? { meaning: t, meaningSrc: 'ganjoor' } : { meaningSrc: 'none' });
      if (t) return { text: t, src: 'ganjoor' };
    } catch { /* offline or ganjoor down: try again another time */ }
  }
  if (s.meaning && s.meaningSrc === 'ai') return { text: s.meaning, src: 'ai' };
  return null;
}

export const hasModel = () => !!useStore.getState().settings.ai.model;

/** Ask the local model (only on request), and keep its answer with the line. */
export async function askModel(s: Sentence): Promise<Meaning> {
  const t = await explainLine(s);
  await db.sentences.update(s.id, { meaning: t, meaningSrc: 'ai' });
  return { text: t, src: 'ai' };
}

export async function saveMyMeaning(s: Sentence, text: string): Promise<void> {
  await db.sentences.update(s.id, { myMeaning: text.trim() || undefined });
}

/** Lines that have a ready reading (for the settings page). */
export async function meaningCoverage(): Promise<{ withMeaning: number; total: number }> {
  const all = await db.sentences.toArray();
  const o = await oraMeanings();
  const n = all.filter((s) => BUILTIN[s.id] || o[s.id] || (s.meaningSrc === 'ganjoor' && s.meaning)).length;
  return { withMeaning: n, total: all.length };
}
