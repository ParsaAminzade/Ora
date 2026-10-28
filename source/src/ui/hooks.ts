import { useEffect, useState } from 'react';
import { db } from '../core/db';

/** Current time, re-rendered every `stepMs` and aligned to the step boundary. */
export function useNow(stepMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: number;
    const tick = () => {
      setNow(new Date());
      t = window.setTimeout(tick, stepMs - (Date.now() % stepMs));
    };
    t = window.setTimeout(tick, stepMs - (Date.now() % stepMs));
    return () => window.clearTimeout(t);
  }, [stepMs]);
  return now;
}

/** Object URL for an uploaded asset stored in IndexedDB. */
export function useAssetUrl(assetId?: string): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!assetId) {
      setUrl(undefined);
      return;
    }
    let u: string | undefined;
    let alive = true;
    void db.assets.get(assetId).then((a) => {
      if (!alive || !a) return;
      u = URL.createObjectURL(a.blob);
      setUrl(u);
    });
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [assetId]);
  return url;
}
