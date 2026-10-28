import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../core/state';
import { exportBackup, importBackup, lastAutoBackup, runAutoBackup } from '../../core/backup';
import { storageReport } from '../../core/health';
import { fa } from '../../core/dates';
import { IconDownload, IconUpload } from '../icons';
import { Section } from '../Panels';

export function BackupSection() {
  const cfg = useStore((s) => s.settings.backup);
  const setSettings = useStore((s) => s.setSettings);
  const setCfg = (patch: Partial<typeof cfg>) => setSettings({ backup: { ...useStore.getState().settings.backup, ...patch } });
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [last, setLast] = useState(0);
  const [disk, setDisk] = useState<Awaited<ReturnType<typeof storageReport>>>(null);

  useEffect(() => {
    void lastAutoBackup().then(setLast);
    void storageReport().then(setDisk);
  }, [msg]);

  const lastText = last ? new Date(last).toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'هنوز نه';

  return (
    <Section title="پشتیبان‌گیری و پایداری">
      <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>
        همه‌چیز فقط روی همین مرورگر است. پشتیبان خودکار در پوشه‌ی <span dir="ltr">Downloads/Ora-backups</span> ذخیره می‌شود (۸ نسخه‌ی آخر). آن پوشه را گاهی روی هارد یا فلش جدا کپی کن.
      </span>
      <label className="muted" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
        پشتیبان خودکار
        <select value={cfg.autoDays} onChange={(e) => setCfg({ autoDays: Number(e.target.value) as 0 | 1 | 7 })} aria-label="پشتیبان خودکار"
          style={{ height: 34, borderRadius: 10, border: '1px solid var(--line-2)', background: '#12141B', padding: '0 8px' }}>
          <option value={1}>هر روز</option>
          <option value={7}>هر هفته</option>
          <option value={0}>خاموش</option>
        </select>
      </label>
      <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={cfg.includeAssets} onChange={(e) => setCfg({ includeAssets: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
        تصویرها و فونت‌های بارگذاری‌شده هم در پشتیبان باشند (ویدیو نه)
      </label>
      <span className="faint" style={{ fontSize: 12 }}>آخرین پشتیبان خودکار: {lastText}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => void runAutoBackup(true).then((n) => setMsg(n ? `ذخیره شد: ${n}` : 'پشتیبان‌گیری در این مرورگر ممکن نیست'))}>الان پشتیبان بگیر</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => void exportBackup(cfg.includeAssets)}><IconDownload size={16} />خروجی دستی</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => file.current?.click()}><IconUpload size={16} />بازگردانی</button>
      </div>
      <input ref={file} type="file" accept="application/json,.json" hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) setMsg(await importBackup(f));
        }} />
      {msg && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{msg}</span>}
      {disk && (
        <span className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>
          فضای استفاده‌شده: {fa(disk.usedMB)} مگابایت · {disk.persisted ? 'حافظه‌ی ماندگار فعال است' : 'افزونه مجوز ذخیره‌ی نامحدود دارد'}؛ کروم داده‌های اورآ را برای کمبود جا پاک نمی‌کند، ولی پاک کردن «داده‌های مرور» یا حذف افزونه آن‌ها را پاک می‌کند. پشتیبان را جدی بگیر.
        </span>
      )}
    </Section>
  );
}
