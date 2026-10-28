import { dayKey } from '../core/dates';
// Tired mode: just one small thing at a time, no counts, no pressure.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { defineWidget } from '../core/widgets';
import { db, uid } from '../core/db';
import { IconLeaf } from '../ui/icons';
import { NONE } from '../core/none';

const RESTS = [
  'پنج دقیقه چشم‌ها را ببند.',
  'یک لیوان آب بخور.',
  'بلند شو و کمی کش‌وقوس بیا.',
  'پنجره را باز کن و چند نفس عمیق بکش.',
  'چند دقیقه بدون صفحه‌نمایش راه برو.',
];

defineWidget<{ skip: string[] }>({
  type: 'onetask',
  name: 'فقط یک کار',
  description: 'برای روزهای خسته: یک کار کوچک در هر لحظه',
  icon: <IconLeaf />,
  defaultSize: { w: 10, h: 8 },
  minSize: { w: 6, h: 6 },
  defaultConfig: { skip: [] },
  Component: function OneTask({ config, setConfig }) {
    const open = useLiveQuery(() => db.tasks.filter((t) => !t.done).toArray(), []) ?? NONE;
    const sorted = [...open].sort((a, b) => b.priority - a.priority || a.order - b.order);
    const pool = sorted.filter((t) => !config.skip.includes(t.id));
    const task = pool[0] ?? sorted[0];
    const [draft, setDraft] = useState('');
    const [rest] = useState(() => RESTS[new Date().getHours() % RESTS.length]);

    const add = async () => {
      const title = draft.trim();
      if (!title) return;
      setDraft('');
      await db.tasks.put({ id: uid(), title, done: false, priority: 0, order: Date.now(), createdAt: Date.now(), when: dayKey(new Date()) });
    };

    return (
      <div style={{ height: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <span className="faint" style={{ fontSize: 13 }}>فقط همین یکی، با هر سرعتی که می‌توانی</span>
        {task ? (
          <>
            <div style={{ fontSize: 24, fontWeight: 400, lineHeight: 1.7 }}>{task.title}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-accent" onClick={() => { void db.tasks.update(task.id, { done: true, doneAt: Date.now() }); setConfig({ skip: [] }); }}>انجام شد</button>
              <button className="btn" onClick={() => setConfig({ skip: pool.length > 1 ? [...config.skip, task.id] : [] })}>یکی دیگر</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 20, lineHeight: 1.8 }}>همین که اینجایی کافی است.</div>
            <form className="field" style={{ width: '100%', maxWidth: 380 }} onSubmit={(e) => { e.preventDefault(); void add(); }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="یک کار خیلی کوچک…" aria-label="کار کوچک" />
            </form>
          </>
        )}
        <span className="muted" style={{ fontSize: 13 }}>پیشنهاد استراحت: {rest}</span>
      </div>
    );
  },
});
