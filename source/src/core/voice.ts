// «لحن اورآ»: Ora says what the numbers mean for *you* instead of only showing them.
// Not «۱۲°» but «خنکه؛ یه ژاکت نازک بردار.» Not «مغرب ۱۷:۳۰» but «تا اذان مغرب بیست دقیقه مونده.»
//
// Three tones, chosen in settings › «لحن اورآ»:
//   friendly  خودمونی (default) — like a friend who checked the weather for you
//   formal    مؤدب و رسمی       — same meaning, written Persian
//   numbers   فقط عدد            — Ora stays quiet; only the data
// Rules (the 12 language rules of «قلب اورآ», short form): one thing at a time, specific, short, no
// exaggeration, no «باید», natural Persian, honest. Each situation has a few versions; the one shown
// changes by day so it doesn't feel canned, but stays the same all day so it doesn't flicker.
import { useStore } from './state';
import { fa } from './dates';
import type { Weather } from './location';

export type Tone = 'friendly' | 'formal' | 'numbers';
export const tone = (): Tone => useStore.getState().settings.voice ?? 'friendly';
type Line = [friendly: string[], formal: string[]];

/** Same version all day, a different one tomorrow (and different for different situations). */
const pick = (xs: string[], salt: string) => {
  const d = new Date();
  let h = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
  for (const c of salt) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return xs[h % xs.length];
};
const say = (l: Line, salt: string, t: Tone = tone()) => (t === 'numbers' ? '' : pick(t === 'formal' ? l[1] : l[0], salt));
const n = (x: number) => { const r = Math.round(x); return r < 0 ? `منفی ${fa(-r)}` : fa(r); };

/* ---------- weather ---------- */
const kindOf = (code: number) =>
  code >= 95 ? 'storm' : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow' : (code >= 51 && code <= 67) || (code >= 80 && code <= 82) ? 'rain' : code === 45 || code === 48 ? 'fog' : code <= 1 ? 'clear' : 'cloud';

/** The main line for the weather card: the one thing that matters most right now, plus at most one short extra. */
export function weatherLine(w: Weather, now = new Date(), t: Tone = tone()): string {
  if (t === 'numbers') return '';
  const f = w.current.feels, k = kindOf(w.current.code);
  const today = w.daily[0], tomorrow = w.daily[1];
  const night = now.getHours() >= 20 || now.getHours() < 5;
  const laterToday = !night && today && kindOf(today.code);

  // 1. what's happening outside right now beats everything
  let main: string;
  if (k === 'storm') main = say([['رعد و برقه؛ اگه لازم نیست، فعلاً بیرون نرو.', 'هوا طوفانیه؛ بیرون رفتن رو اگه می‌شه بذار برای بعد.'], ['رعد و برق است؛ اگر ضرورتی ندارد، فعلاً بیرون نروید.']], 'storm', t);
  else if (k === 'snow') main = say([['داره برف میاد! لباس گرم، کفشِ لیز نخور.', 'برف می‌باره؛ آروم راه برو و گرم بپوش.'], ['برف می‌بارد؛ لباس گرم و کفش مناسب بپوشید.']], 'snow', t);
  else if (k === 'rain') main = say([['داره بارون میاد؛ چتر یادت نره.', 'بارونیه؛ اگه می‌ری بیرون، چتر بردار.'], ['باران می‌بارد؛ چتر همراه داشته باشید.']], 'rain', t);
  else if (k === 'fog') main = say([['مه گرفته؛ اگه رانندگی می‌کنی، آروم.', 'هوا مه‌آلوده؛ دید کمه، با احتیاط.'], ['هوا مه‌آلود است؛ در رانندگی احتیاط کنید.']], 'fog', t);
  else if (laterToday === 'rain' || laterToday === 'storm') main = say([['امروز احتمال بارون هست؛ یه چتر بذار تو کیفت.', 'فعلاً خشکه ولی امروز بارون می‌گیره؛ چتر ببر.'], ['امروز احتمال بارش هست؛ چتر همراه داشته باشید.']], 'later-rain', t);
  // 2. otherwise: how it feels, and what to wear
  else if (f <= 0) main = say([[`${night ? 'امشب' : 'هوا'} یخبندونه؛ کلاه و دستکش.`, 'زیر صفره! حسابی گرم بپوش.'], [`${night ? 'امشب' : 'هوا'} یخبندان است؛ لباس گرم بپوشید.`]], 'freeze', t);
  else if (f <= 8) main = say([[`${night ? 'امشب' : 'هوا'} سرده؛ کاپشن بپوش.`, 'سرده؛ بی‌کاپشن بیرون نرو.'], [`${night ? 'امشب' : 'هوا'} سرد است؛ کاپشن بپوشید.`]], 'cold', t);
  else if (f <= 15) main = say([['هوا خنکه؛ یه ژاکت نازک بردار.', 'خنکه؛ یه لایه‌ی اضافه با خودت داشته باش.'], ['هوا خنک است؛ یک ژاکت نازک همراه داشته باشید.']], 'cool', t);
  else if (f <= 25) main = night
    ? say([['شبِ خوبیه؛ هوا ملایمه.', 'هوا امشب دلپذیره.'], ['هوای امشب ملایم و دلپذیر است.']], 'mild-night', t)
    : say([k === 'clear' ? ['هوا عالیه؛ اگه شد، یه قدم بیرون بزن.', 'آفتابی و ملایم؛ حیفه همه‌ش پشت میز باشی.'] : ['هوا ملایمه؛ نه سرد نه گرم.', 'هوای خوبیه، یه کم ابری.'], ['هوا ملایم و دلپذیر است.']], `mild-${k}`, t);
  else if (f <= 32) main = say([['گرمه؛ آب همراهت باشه.', 'هوا گرمه؛ یه بطری آب ببر.'], ['هوا گرم است؛ آب همراه داشته باشید.']], 'warm', t);
  else main = say([['خیلی گرمه؛ ظهر کمتر بیرون برو و آب زیاد بخور.', 'گرمای سنگینه؛ تو آفتاب نمون.'], ['هوا بسیار گرم است؛ ظهر کمتر بیرون بروید و آب کافی بنوشید.']], 'hot', t);

  // 3. one extra, only if it changes what you'd do
  let extra = '';
  const gap = w.current.temp - f;
  if (gap >= 4) extra = t === 'formal' ? `دما ${n(w.current.temp)} درجه است، ولی ${n(f)} درجه حس می‌شود.` : `${n(w.current.temp)} درجه‌ست ولی حسِ ${n(f)} رو داره.`;
  else if (w.current.wind >= 35) extra = t === 'formal' ? 'باد هم تند است.' : 'باد هم تنده.';
  else if (!night && today && today.max - today.min >= 12) extra = t === 'formal' ? 'اختلاف دمای روز و شب زیاد است؛ لایه‌لایه بپوشید.' : 'صبح و شب خیلی فرق داره؛ لایه‌لایه بپوش.';
  else if (tomorrow && today && tomorrow.max - today.max >= 6) extra = t === 'formal' ? 'فردا گرم‌تر می‌شود.' : 'فردا حسابی گرم‌تر می‌شه.';
  else if (tomorrow && today && today.max - tomorrow.max >= 6) extra = t === 'formal' ? 'فردا سردتر می‌شود.' : 'فردا حسابی سردتر می‌شه.';
  else if (tomorrow && (kindOf(tomorrow.code) === 'rain' || kindOf(tomorrow.code) === 'snow') && k !== 'rain' && k !== 'snow') extra = kindOf(tomorrow.code) === 'snow' ? (t === 'formal' ? 'فردا برف می‌بارد.' : 'فردا برف میاد.') : (t === 'formal' ? 'فردا باران می‌بارد.' : 'فردا بارونیه.');
  return extra ? `${main} ${extra}` : main;
}

/* ---------- prayer ---------- */
const PRAYER_NAME: Record<string, string> = { fajr: 'اذان صبح', sunrise: 'طلوع آفتاب', dhuhr: 'اذان ظهر', sunset: 'غروب آفتاب', maghrib: 'اذان مغرب', midnight: 'نیمه‌شب شرعی' };
const span = (min: number, t: Tone) => {
  if (min < 1) return t === 'formal' ? 'چند لحظه' : 'چند لحظه';
  if (min < 60) return `${n(min)} دقیقه`;
  const h = Math.floor(min / 60), m = Math.round((min % 60) / 5) * 5;
  const hs = h === 1 && t === 'friendly' ? 'یه ساعت' : `${n(h)} ساعت`;
  return m ? `${hs} و ${n(m)} دقیقه` : hs;
};
/** «تا اذان مغرب بیست دقیقه مونده.» — or empty in «فقط عدد». */
export function prayerLine(key: string, at: Date, now = new Date(), t: Tone = tone()): string {
  if (t === 'numbers') return '';
  const name = PRAYER_NAME[key] ?? '';
  const min = (at.getTime() - now.getTime()) / 60_000;
  if (min <= 15) return t === 'formal' ? `${name} نزدیک است؛ ${span(min, t)} دیگر.` : `${name} نزدیکه؛ ${span(min, t)} دیگه.`;
  return t === 'formal' ? `تا ${name} ${span(min, t)} مانده است.` : `تا ${name} ${span(min, t)} مونده.`;
}

/* ---------- an empty day ---------- */
export function emptyAgendaLine(t: Tone = tone()): string {
  return say([['امروز چیزی تو تقویمت نیست؛ روزت دست خودته.', 'تقویمت خالیه؛ وقت خوبیه برای کاری که همیشه عقب می‌افته.'], ['امروز رویدادی در تقویم ندارید.']], 'empty-day', t);
}

export const TONE_LABEL: [Tone, string, string][] = [
  ['friendly', 'خودمونی', 'مثل یه دوست که هوا رو برات نگاه کرده.'],
  ['formal', 'رسمی', 'همان معنی، با فارسی نوشتاری و مؤدب.'],
  ['numbers', 'فقط عدد', 'اورآ چیزی نمی‌گوید؛ فقط داده‌ها.'],
];
