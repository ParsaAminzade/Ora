import { useEffect, useState } from 'react';
import { useStore } from '../../core/state';
import { caldavState, syncCalDav } from '../../core/providers/caldav';
import { Section } from '../Panels';

const input = { height: 38, borderRadius: 10, border: '1px solid var(--line-2)', background: 'rgba(0,0,0,.25)', padding: '0 10px', fontSize: 12 } as const;

export function CalDavSection() {
  const c = useStore((s) => s.settings.caldav);
  const setSettings = useStore((s) => s.setSettings);
  const set = (patch: Partial<typeof c>) => setSettings({ caldav: { ...useStore.getState().settings.caldav, ...patch } });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(0);

  useEffect(() => { void caldavState().then((s) => setLast(s.lastSync)); }, [msg]);

  const sync = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (!useStore.getState().settings.caldav.enabled) set({ enabled: true });
      setMsg({ ok: true, text: await syncCalDav() });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="سرور تقویم شخصی (CalDAV)">
      <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>
        تقویم اورآ با سرور خودت (مثلاً Radicale روی همین کامپیوتر) همگام می‌شود؛ گوشی هم با DAVx5 یا حساب CalDAV آیفون به همان سرور وصل می‌شود. روی شبکه‌ی خانه بدون اینترنت هم کار می‌کند.
      </span>
      <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={c.enabled} onChange={(e) => set({ enabled: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
        همگام‌سازی خودکار روشن باشد
      </label>
      <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
        آدرس تقویم
        <input value={c.url} onChange={(e) => set({ url: e.target.value.trim() })} dir="ltr" aria-label="آدرس CalDAV" style={input} />
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={c.username} onChange={(e) => set({ username: e.target.value })} dir="ltr" placeholder="نام کاربری" aria-label="نام کاربری CalDAV" autoComplete="off" style={{ ...input, flex: 1, minWidth: 0 }} />
        <input type="password" value={c.password} onChange={(e) => set({ password: e.target.value })} dir="ltr" placeholder="رمز" aria-label="رمز CalDAV" autoComplete="off" style={{ ...input, flex: 1, minWidth: 0 }} />
      </div>
      <button className="btn" disabled={busy || !c.url} onClick={() => void sync()}>{busy ? 'در حال همگام‌سازی…' : 'همگام‌سازی الان'}</button>
      {msg && <span style={{ fontSize: 12, lineHeight: 1.7, color: msg.ok ? 'var(--accent)' : 'var(--danger)' }}>{msg.text}</span>}
      {last > 0 && <span className="faint" style={{ fontSize: 11 }}>آخرین همگام‌سازی: {new Date(last).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
      <span className="faint" style={{ fontSize: 11, lineHeight: 1.8 }}>رمز فقط روی همین مرورگر ذخیره می‌شود و در فایل پشتیبان نمی‌آید.</span>
    </Section>
  );
}
