// When someone writes to Ora that they are in a very bad place.
//
// The safest default until a clinical psychologist reviews it (see the «قلب اورآ» document, appendix A):
// · a fixed, reviewed-draft message — never written by a model, never a coaching reply
// · Ora stops coaching in that conversation; anything written after gets the same short, warm
//   pointer to people who can help
// · every other nudge (tips, tour, coach prompts, rituals) goes quiet for the rest of the day
// · nothing about it leaves the device; Ora does not bring it up again by itself
// · «کمک فوری» stays one tap away in the conversation
// Wording errs on the side of showing help: a false alarm costs a moment; a miss costs much more.
import { normalize } from './text';

const PATTERNS: RegExp[] = [
  /خود ?کشی/, /خودم(و|ر[اوو]?) ?(بکشم|می ?کشم|بکشم)/, /(می ?خوام|میخام|دلم می ?خواد|کاش) (بمیرم|نباشم|نمیرم|بمیرم)/,
  /(نمی ?خوام|نمیخام) (دیگه )?(زنده|باشم|ادامه بدم)/, /زندگی (ارزش|معنی|فایده)(ی)? (نداره|ندارد)/, /دیگه (تحمل|طاقت) (ندارم|نمی ?کنم)/,
  /(به )?خودم آسیب/, /خودمو? (زخمی|ببرم|بزنم)/, /رگ ?(م|مو|مو بزنم|زدن)/, /(قرص|دارو) ?(زیاد|همه) (بخورم|خوردم)/,
  /همه چی(ز)?(و|رو)? تموم کنم/, /زندگی ?(م|مو|مو|ام)? ?(رو|را)? ?تموم کنم/, /خداحافظی (همیشگی|آخر)/, /دنیا بدون من/, /نبودنم/,
  /\bsuicid/i, /kill (my ?self|me)/i, /self ?harm/i, /want to die/i, /end (it|my life)/i, /cut(ting)? my ?self/i,
];

export function isCrisis(text: string): boolean {
  const t = normalize(text).replace(/‌/g, ' ').replace(/\s+/g, ' ');
  return PATTERNS.some((p) => p.test(t));
}

/** The fixed message (draft of appendix A, safest choices made while waiting for the expert review). */
export const CRISIS_TEXT = [
  'چیزی که نوشتی مهمه و ممنونم که گفتی.',
  'من فقط یه برنامه‌ام و نمی‌تونم جای یه آدم رو بگیرم که الان کنارت باشه.',
  'اگه حالت خیلی سخته، لطفاً همین الان با یکی از این‌ها حرف بزن:',
].join('\n');
export const CRISIS_LINES: { label: string; tel: string; note: string }[] = [
  { label: 'اورژانس اجتماعی', tel: '123', note: 'شبانه‌روزی و رایگان' },
  { label: 'صدای مشاور (بهزیستی)', tel: '1480', note: 'مشاوره‌ی تلفنی' },
];
export const CRISIS_PEOPLE = 'یا با یه آدم که بهش اعتماد داری: پدر یا مادر، یه دوست، مشاور مدرسه یا یه معلم.';
export const CRISIS_DANGER = 'اگه همین الان در خطری، با ۱۱۵ یا ۱۱۰ تماس بگیر.';
/** What Ora says to anything written after that, in the same conversation. */
export const CRISIS_AFTER = 'من این‌جام و حرفت رو خوندم. چیزی که الان مهمه اینه که با یه آدم حرف بزنی؛ ۱۲۳ شبانه‌روزی جواب می‌ده.';

/** Quiet for the rest of the day: no tips, tour cards, coach prompts or rituals. */
export function quietRestOfDay() {
  const end = new Date(); end.setHours(24, 0, 0, 0);
  try {
    localStorage.setItem('ora:quiet-until', String(end.getTime()));
    localStorage.setItem('ora:tip-at', String(end.getTime())); // every «spoke recently» check now waits
  } catch { /* private */ }
}
export const isQuiet = () => { try { return Date.now() < Number(localStorage.getItem('ora:quiet-until') ?? 0); } catch { return false; } };
