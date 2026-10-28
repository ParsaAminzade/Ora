export const db: any = { tasks: { update: async () => {}, get: async () => undefined, toArray: async () => [] } };
export const uid = () => Math.random().toString(36).slice(2);
export type Task = any; export type CalEvent = any; export type Recurrence = any;
