// Iran's official public holidays. Solar ones are fixed; lunar ones are computed from the
// Hijri date (Umm al-Qura + the user's offset), so they can be a day off from the official
// moon-sighting calendar. The "تصحیح تاریخ قمری" setting fixes that.
import { addDays, toJalali } from './dates';

const SOLAR: Record<string, string> = {
  '1-1': 'عید نوروز',
  '1-2': 'عید نوروز',
  '1-3': 'عید نوروز',
  '1-4': 'عید نوروز',
  '1-12': 'روز جمهوری اسلامی',
  '1-13': 'روز طبیعت',
  '3-14': 'رحلت امام خمینی',
  '3-15': 'قیام ۱۵ خرداد',
  '11-22': 'پیروزی انقلاب اسلامی',
  '12-29': 'ملی شدن صنعت نفت',
};

const LUNAR: Record<string, string> = {
  '1-9': 'تاسوعای حسینی',
  '1-10': 'عاشورای حسینی',
  '2-20': 'اربعین حسینی',
  '2-28': 'رحلت پیامبر اکرم و شهادت امام حسن مجتبی',
  '3-8': 'شهادت امام حسن عسکری',
  '3-17': 'میلاد پیامبر اکرم و امام جعفر صادق',
  '6-3': 'شهادت حضرت فاطمه زهرا',
  '7-13': 'ولادت امام علی',
  '7-27': 'مبعث پیامبر اکرم',
  '8-15': 'ولادت حضرت قائم',
  '9-21': 'شهادت امام علی',
  '10-1': 'عید سعید فطر',
  '10-2': 'تعطیل به مناسبت عید فطر',
  '10-25': 'شهادت امام جعفر صادق',
  '12-10': 'عید سعید قربان',
  '12-18': 'عید سعید غدیر خم',
};

const hijriParts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { month: 'numeric', day: 'numeric' });

function hijriMD(d: Date): { m: number; d: number } {
  let m = 0, day = 0;
  for (const p of hijriParts.formatToParts(d)) {
    if (p.type === 'month') m = Number(p.value);
    else if (p.type === 'day') day = Number(p.value);
  }
  return { m, d: day };
}

export interface Holiday {
  name: string;
  lunar: boolean;
}

export function holidaysOn(date: Date, hijriOffset: number): Holiday[] {
  const out: Holiday[] = [];
  const j = toJalali(date);
  const solar = SOLAR[`${j.jm}-${j.jd}`];
  if (solar) out.push({ name: solar, lunar: false });

  const shifted = addDays(date, hijriOffset);
  const h = hijriMD(shifted);
  const lunar = LUNAR[`${h.m}-${h.d}`];
  if (lunar) out.push({ name: lunar, lunar: true });
  // Martyrdom of Imam Reza: the last day of Safar (29th or 30th).
  if (h.m === 2 && (h.d === 30 || (h.d === 29 && hijriMD(addDays(shifted, 1)).m === 3))) {
    out.push({ name: 'شهادت امام رضا', lunar: true });
  }
  return out;
}
