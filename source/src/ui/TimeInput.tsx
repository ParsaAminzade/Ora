// A 24-hour time field. Chrome's native <input type=time> follows the OS locale and shows
// "05:00 AM" on an English Windows; this one always reads ۰۵:۰۰ and accepts either digit set.
import { useEffect, useState, type CSSProperties } from 'react';

const toFa = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const toEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

function parse(raw: string): string | null {
  const t = toEn(raw).replace(/[^\d:]/g, '');
  const m = /^(\d{1,2}):?(\d{2})$/.exec(t.includes(':') ? t : t.length > 2 ? `${t.slice(0, -2)}:${t.slice(-2)}` : `${t}:00`);
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function TimeInput({ value, onChange, label, style }: { value: string; onChange(v: string): void; label: string; style?: CSSProperties }) {
  const [draft, setDraft] = useState(toFa(value));
  const [bad, setBad] = useState(false);
  useEffect(() => { setDraft(toFa(value)); setBad(false); }, [value]);
  const commit = () => {
    const v = parse(draft);
    if (v) { setBad(false); setDraft(toFa(v)); if (v !== value) onChange(v); } else setBad(true);
  };
  const step = (d: number) => {
    const v = parse(draft) ?? value;
    const [h, m] = v.split(':').map(Number);
    const t = (h * 60 + m + d + 1440) % 1440;
    onChange(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'ArrowUp') { e.preventDefault(); step(e.shiftKey ? 60 : 5); }
        if (e.key === 'ArrowDown') { e.preventDefault(); step(e.shiftKey ? -60 : -5); }
      }}
      inputMode="numeric"
      dir="ltr"
      aria-label={label}
      aria-invalid={bad || undefined}
      title="۲۴ساعته، مثل ۰۶:۳۰ (با ↑ و ↓ پنج دقیقه جابه‌جا می‌شود)"
      placeholder="۰۰:۰۰"
      className="time-input tnum"
      style={style}
    />
  );
}
