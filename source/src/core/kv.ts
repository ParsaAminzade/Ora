// Small async key-value store. Inside the extension it uses chrome.storage.local;
// when the page is opened with `npm run dev` in a normal tab it falls back to localStorage.

const hasChromeStorage = typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (hasChromeStorage) {
    const r = await chrome.storage.local.get(key);
    return r[key] as T | undefined;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep running in memory */
  }
}
