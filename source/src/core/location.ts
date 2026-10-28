// City lookup and weather from Open-Meteo (free, no API key). The city is chosen once in settings;
// weather is cached and refreshed at most every 30 minutes.
import { kvGet, kvSet } from './kv';

export interface Place {
  name: string;
  /** e.g. "تهران، ایران" */
  label: string;
  lat: number;
  lon: number;
  timezone: string;
}

export const DEFAULT_PLACE: Place = { name: 'تهران', label: 'تهران، ایران', lat: 35.6892, lon: 51.389, timezone: 'Asia/Tehran' };

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  country?: string;
  admin1?: string;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', '6');
  url.searchParams.set('language', 'fa');
  url.searchParams.set('format', 'json');
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`geocoding ${res.status}`);
  const data = (await res.json()) as { results?: GeoResult[] };
  return (data.results ?? []).map((r) => ({
    name: r.name,
    label: [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : null, r.country].filter(Boolean).join('، '),
    lat: r.latitude,
    lon: r.longitude,
    timezone: r.timezone ?? 'UTC',
  }));
}

export interface Weather {
  fetchedAt: number;
  key: string;
  current: { temp: number; feels: number; code: number; isDay: boolean; humidity: number; wind: number };
  daily: { date: string; code: number; max: number; min: number }[];
}

const CACHE_KEY = 'nova:weather';
const MAX_AGE = 30 * 60_000;

export async function getWeather(place: Place, force = false): Promise<Weather> {
  const key = `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
  const cached = await kvGet<Weather>(CACHE_KEY);
  if (!force && cached && cached.key === key && Date.now() - cached.fetchedAt < MAX_AGE) return cached;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(place.lat));
  url.searchParams.set('longitude', String(place.lon));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '5');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`forecast ${res.status}`);
    const d = await res.json();
    const w: Weather = {
      fetchedAt: Date.now(),
      key,
      current: {
        temp: d.current.temperature_2m,
        feels: d.current.apparent_temperature,
        code: d.current.weather_code,
        isDay: d.current.is_day === 1,
        humidity: d.current.relative_humidity_2m,
        wind: d.current.wind_speed_10m,
      },
      daily: (d.daily.time as string[]).map((date, i) => ({
        date,
        code: d.daily.weather_code[i],
        max: d.daily.temperature_2m_max[i],
        min: d.daily.temperature_2m_min[i],
      })),
    };
    await kvSet(CACHE_KEY, w);
    return w;
  } catch (e) {
    // Offline: show the last known weather rather than nothing.
    if (cached && cached.key === key) return cached;
    throw e;
  }
}

/** WMO weather codes → Persian label + icon family. */
export function describeWeather(code: number): { label: string; kind: 'clear' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' } {
  if (code === 0) return { label: 'صاف', kind: 'clear' };
  if (code === 1) return { label: 'تقریباً صاف', kind: 'partly' };
  if (code === 2) return { label: 'نیمه‌ابری', kind: 'partly' };
  if (code === 3) return { label: 'ابری', kind: 'cloud' };
  if (code === 45 || code === 48) return { label: 'مه', kind: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'نم‌نم باران', kind: 'rain' };
  if (code >= 61 && code <= 67) return { label: 'باران', kind: 'rain' };
  if (code >= 71 && code <= 77) return { label: 'برف', kind: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'رگبار', kind: 'rain' };
  if (code === 85 || code === 86) return { label: 'بارش برف', kind: 'snow' };
  if (code >= 95) return { label: 'رعد و برق', kind: 'storm' };
  return { label: '—', kind: 'cloud' };
}
