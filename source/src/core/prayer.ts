// Prayer times computed offline with adhan.js using the Institute of Geophysics, Tehran method
// (Fajr 17.7°, Isha 14°, Maghrib 4.5° after sunset). Midnight = halfway between sunset and next Fajr.
import { CalculationMethod, Coordinates, PrayerTimes, SunnahTimes } from 'adhan';
import type { Place } from './location';

export interface PrayerTime {
  key: 'fajr' | 'sunrise' | 'dhuhr' | 'sunset' | 'maghrib' | 'midnight';
  label: string;
  time: Date;
}

export function prayerTimes(place: Place, date: Date): PrayerTime[] {
  const coords = new Coordinates(place.lat, place.lon);
  const p = new PrayerTimes(coords, date, CalculationMethod.Tehran());
  const s = new SunnahTimes(p);
  return [
    { key: 'fajr', label: 'اذان صبح', time: p.fajr },
    { key: 'sunrise', label: 'طلوع آفتاب', time: p.sunrise },
    { key: 'dhuhr', label: 'اذان ظهر', time: p.dhuhr },
    { key: 'sunset', label: 'غروب آفتاب', time: p.sunset },
    { key: 'maghrib', label: 'اذان مغرب', time: p.maghrib },
    { key: 'midnight', label: 'نیمه‌شب شرعی', time: s.middleOfTheNight },
  ];
}

/** The next upcoming time from now (today's list, then tomorrow's Fajr). */
export function nextPrayer(place: Place, now: Date): PrayerTime {
  const today = prayerTimes(place, now).find((t) => t.time > now);
  if (today) return today;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return prayerTimes(place, tomorrow)[0];
}

/** HH:mm in the city's own time zone, with Persian digits. */
export function formatInZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(d);
}
