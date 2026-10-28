/** One shared empty list: `useLiveQuery(...) ?? NONE` keeps the same reference while loading, so memos and effects don't re-run every render. */
export const NONE: never[] = [];
