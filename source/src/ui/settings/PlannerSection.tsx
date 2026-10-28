import { useStore } from '../../core/state';
import { DEFAULT_PLANNER, openPlanner } from '../../core/planner';
import { fa } from '../../core/dates';
import { Row, Section, Segmented, Slider } from '../Panels';

export function PlannerSection() {
  const saved = useStore((s) => s.settings.planner);
  const setSettings = useStore((s) => s.setSettings);
  const p = { ...DEFAULT_PLANNER, ...saved };
  const set = (x: Partial<typeof p>) => setSettings({ planner: { ...p, ...x } });
  return (
    <Section title="برنامه‌ریزی" hint="هر کار یک «روزِ انجام» دارد و جدا از آن یک مهلت. هر روز سه کار مهم انتخاب می‌کنی، و برآورد کارها با ساعت‌هایی که واقعاً داری مقایسه می‌شود.">
      <Slider label="معمولاً روزی چند ساعت برای کارهایت وقت داری؟" value={p.hours} min={1} max={12} unit=" ساعت" onChange={(v) => set({ hours: v })} />
      <Row label="حاشیه‌ی برآورد" hint="کارها تقریباً همیشه بیشتر از حدسمان طول می‌کشند (خطای برنامه‌ریزی). این حاشیه به برآوردها اضافه می‌شود.">
        <Segmented label="حاشیه‌ی برآورد" value={p.buffer} options={[[1, 'هیچ'], [1.25, '۲۵٪'], [1.5, '۵۰٪']] as const} onChange={(v) => set({ buffer: v })} />
      </Row>
      <Row label="برنامه‌ریزی صبح" hint="اولین تب صبح، اورآ پیشنهاد می‌دهد دو دقیقه برنامه‌ی روز را بچینی.">
        <Segmented label="برنامه‌ریزی صبح" value={p.morning ? 'on' : 'off'} options={[['on', 'روشن'], ['off', 'خاموش']] as const} onChange={(v) => set({ morning: v === 'on' })} />
      </Row>
      <Row label="جمع‌بندی عصر" hint={`از ساعت ${fa(p.eveningAt)} به بعد، اورآ پیشنهاد می‌دهد روز را ببندی و مانده‌ها را برای فردا بچینی.`}>
        <Segmented label="جمع‌بندی عصر" value={p.evening ? p.eveningAt : 0} options={[[0, 'خاموش'], [17, '۱۷'], [18, '۱۸'], [19, '۱۹'], [20, '۲۰']] as const} onChange={(v) => set(v ? { evening: true, eveningAt: v } : { evening: false })} />
      </Row>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={() => openPlanner('plan')}>برنامه‌ریزی امروز</button>
        <button className="btn" onClick={() => openPlanner('shutdown')}>جمع‌بندی امروز</button>
      </div>
    </Section>
  );
}
