// Start-up safety: safe mode, crash-loop detection, persistent storage.

const CRASH_KEY = 'nova:boot-crashes';

/** True when the page was opened with ?safe, or after three failed starts in a row. */
export const safeMode: boolean = (() => {
  try {
    if (new URLSearchParams(location.search).has('safe')) return true;
    const n = Number(localStorage.getItem(CRASH_KEY) ?? 0) + 1;
    localStorage.setItem(CRASH_KEY, String(n));
    // The counter is reset by markHealthy() once the page has really rendered, so opening several
    // tabs quickly is not mistaken for a crash loop.
    return n > 3;
  } catch {
    return false;
  }
})();

/** A whole-page error: keep this start counted as failed. */
export function noteCrash(): void {
  try { localStorage.setItem(CRASH_KEY, String(Math.max(1, Number(localStorage.getItem(CRASH_KEY) ?? 0)))); } catch { /* ignore */ }
  crashed = true;
}
let crashed = false;

/** Call once the page has loaded its state (a start that got this far is healthy unless it crashes). */
export function markHealthy(): void {
  if (crashed) return;
  try { localStorage.setItem(CRASH_KEY, '0'); } catch { /* ignore */ }
}

/** Ask the browser not to evict our data when the disk gets full. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

export async function storageReport(): Promise<{ usedMB: number; quotaMB: number; persisted: boolean } | null> {
  try {
    const e = await navigator.storage.estimate();
    return {
      usedMB: Math.round((e.usage ?? 0) / 1e6),
      quotaMB: Math.round((e.quota ?? 0) / 1e6),
      persisted: await navigator.storage.persisted(),
    };
  } catch {
    return null;
  }
}
