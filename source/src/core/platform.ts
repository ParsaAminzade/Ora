// Where Ora is running: the Chrome extension, or the web/phone app (VITE_TARGET=web).
import { useEffect, useState } from 'react';

export const IS_WEB_BUILD = import.meta.env.VITE_TARGET === 'web';
export const IS_EXTENSION = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
export const APP_VERSION: string = (() => {
  try { if (IS_EXTENSION) return chrome.runtime.getManifest().version; } catch { /* not an extension */ }
  return __APP_VERSION__;
})();

const PHONE_QUERY = '(max-width: 720px)';
export const isPhone = () => typeof matchMedia !== 'undefined' && matchMedia(PHONE_QUERY).matches;
export function usePhone(): boolean {
  const [phone, setPhone] = useState(isPhone);
  useEffect(() => {
    const m = matchMedia(PHONE_QUERY);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}
