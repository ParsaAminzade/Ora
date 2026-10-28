const m = new Map(); export async function kvGet(k: string) { return m.get(k); } export async function kvSet(k: string, v: any) { m.set(k, v); }
