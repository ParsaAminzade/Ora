import { useEffect } from 'react';
import { effectiveLook, useStore } from './core/state';
import { AutoModeToast, NightLayer, useModeEngine, useModeHotkeys } from './ui/Modes';
import { loadFont, SENTENCE_BUILTIN, stack } from './core/fonts';
import { Background } from './ui/Background';
import { Grid } from './ui/Grid';
import { schedulePrayerAlarms, watchInPage } from './core/reminders';
import { migrateTasks } from './core/planner';
import { watchBlocks } from './core/live';
import { scheduleEventAlarms, watchEventReminders } from './core/event-reminders';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './core/db';
import { EditBar, Rail, SettingsPanel } from './ui/Panels';
import { Palette } from './ui/Palette';
import { TasteTest } from './ui/TasteTest';
import { DialogHost } from './ui/Dialog';
import { TaskEditorHost } from './ui/TaskEditor';
import { PlannerHost } from './ui/Planner';
import { ScheduleHost } from './ui/Schedule';
import { EventEditorHost } from './ui/cal/EventEditor';
import { ScopeHost } from './ui/cal/ScopeAsk';
import { ReviewHost } from './ui/Review';
import { ProjectsHost } from './ui/Projects';
import { CoachHost } from './ui/Coach';
import { watchCoach } from './core/coach-watch';
import { markHealthy, requestPersistence, safeMode } from './core/health';
import { runAutoBackup } from './core/backup';
import { syncCalDav } from './core/providers/caldav';
import { usePhone } from './core/platform';
import { PhoneShell } from './ui/Phone';
import { LegalHost } from './ui/Legal';
import { TourHost } from './ui/Tour';
import { UpdateHost } from './ui/Update';
import { NotifyHost } from './ui/NotifyAsk';
import { CauseHost } from './ui/CauseCard';
import { remoteTick } from './core/remote';
import { watchOpen } from './core/rhythm';

/** Pick black or white text for a given accent colour. */
function onColor(hex: string): string {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#14110C' : '#FFFFFF';
}

function useThemeVars() {
  const s = useStore((st) => st.settings);
  const phone = usePhone();
  const blur = phone ? (s.panelBlurPhone ?? 2) : s.panelBlur;
  const accent = effectiveLook(s).accent;
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--accent', accent);
    root.setProperty('--on-accent', onColor(accent));
    root.setProperty('--blur', `${blur}px`);
    root.setProperty('--panel-a', String(s.panelOpacity / 100));
    document.documentElement.dataset.panels = s.panelStyle ?? 'premium';
  }, [accent, blur, s.panelOpacity, s.panelStyle]);

  // Fonts from your library: the active mode's own font, else the default one.
  const mode = s.modes.find((m) => m.id === s.mode.active);
  const pageFont = safeMode ? undefined : (mode?.font || s.font.assetId);
  const sentencePick = safeMode ? 'naskh' : (mode?.sentenceFont || (s.sentences.font === 'custom' ? (pageFont ?? 'vazir') : s.sentences.font));
  useEffect(() => {
    const root = document.documentElement.style;
    let alive = true;
    if (!pageFont) root.removeProperty('--font');
    else void loadFont(pageFont).then((f) => { if (!alive) return; if (f) root.setProperty('--font', stack(f)); else root.removeProperty('--font'); });
    return () => { alive = false; };
  }, [pageFont]);
  useEffect(() => {
    const root = document.documentElement.style;
    let alive = true;
    if (SENTENCE_BUILTIN[sentencePick]) root.setProperty('--font-sentence', SENTENCE_BUILTIN[sentencePick]);
    else void loadFont(sentencePick).then((f) => { if (alive) root.setProperty('--font-sentence', f ? `'${f}', ${SENTENCE_BUILTIN.naskh}` : SENTENCE_BUILTIN.naskh); });
    return () => { alive = false; };
  }, [sentencePick]);
}

function usePrayerReminders() {
  const loaded = useStore((s) => s.loaded);
  const place = useStore((s) => s.settings.place);
  const rem = useStore((s) => s.settings.prayerReminder);
  useEffect(() => { if (loaded) void schedulePrayerAlarms().catch((e) => console.warn('[Ora] reminders', e)); }, [loaded, place, rem]);
  useEffect(() => (loaded ? watchInPage() : undefined), [loaded]);
  useEffect(() => (loaded ? watchBlocks() : undefined), [loaded]);
  useEffect(() => (loaded ? watchEventReminders() : undefined), [loaded]);
  useEffect(() => (loaded ? watchCoach() : undefined), [loaded]);
  // event reminders: re-schedule whenever events change (debounced), and every half hour
  const evSig = useLiveQuery(async () => { const all = await db.events.toArray(); return `${all.length}:${all.reduce((t, e) => Math.max(t, e.updatedAt ?? 0), 0)}`; }, []);
  useEffect(() => {
    if (!loaded || evSig === undefined) return;
    const t = window.setTimeout(() => {
      void scheduleEventAlarms().catch((e) => console.warn('[Ora] event reminders', e));
      dispatchEvent(new Event('ora:events-changed'));
      void import('./core/goals').then(({ planGoals }) => planGoals()).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(t);
  }, [loaded, evSig]);
  useEffect(() => { if (!loaded) return; const iv = window.setInterval(() => void scheduleEventAlarms().catch(() => {}), 30 * 60_000); return () => window.clearInterval(iv); }, [loaded]);
}

export default function App() {
  const loaded = useStore((s) => s.loaded);
  usePrayerReminders();
  const editing = useStore((s) => s.editing);
  const setEditing = useStore((s) => s.setEditing);
  const setPanel = useStore((s) => s.setPanel);
  useThemeVars();
  useModeEngine();
  useModeHotkeys();
  const phone = usePhone();

  useEffect(() => {
    if (!loaded) return;
    void requestPersistence();
    // «ریتم تو»: count this opening (never what you do; core/rhythm)
    const unwatch = watchOpen();
    // State loaded and the page rendered without a page-level error: this start is healthy.
    markHealthy();
    void migrateTasks();
    const t = window.setTimeout(() => void runAutoBackup().catch((e) => console.warn('[Nova] auto backup', e)), 4000);
    // Keep the own-server calendar in step while the tab is open.
    const davSync = () => { if (useStore.getState().settings.caldav.enabled) void syncCalDav().catch(() => {}); };
    davSync();
    const iv = window.setInterval(davSync, 10 * 60_000);
    // v1.2: put the sentence widget on the page once for people upgrading.
    const st = useStore.getState();
    if (!st.settings.sentences.placed) {
      if (!st.widgets.some((w) => w.type === 'sentence')) st.addWidget('sentence');
      st.setSettings({ sentences: { ...useStore.getState().settings.sentences, placed: true } });
    }
    // The Ora server: fresh lines and, only with consent, what you liked (core/remote).
    const r1 = window.setTimeout(() => void remoteTick(), 6000);
    const r2 = window.setInterval(() => void remoteTick(), 3 * 3600_000);
    return () => { unwatch(); window.clearTimeout(t); window.clearInterval(iv); window.clearTimeout(r1); window.clearInterval(r2); };
  }, [loaded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (useStore.getState().panel !== 'none') setPanel('none');
      else if (editing) setEditing(false);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [editing, setEditing, setPanel]);

  return (
    <>
      <Background />
      {phone ? <PhoneShell /> : (
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', gap: 16, padding: 20 }}>
          <Rail />
          <main className="scroll" style={{ flex: 1, minWidth: 0, height: '100%', overflowX: 'hidden', paddingTop: editing ? 64 : 0, transition: 'padding-top .2s' }}>
            {loaded && <Grid />}
          </main>
        </div>
      )}
      {safeMode && (
        <div role="status" style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'var(--danger)', color: '#1a0f0c', padding: '8px 16px', borderRadius: 12, fontSize: 13 }}>
          حالت امن: پس‌زمینه و فونت شخصی خاموش‌اند. <a href={location.pathname} style={{ color: 'inherit', fontWeight: 700 }}>خروج از حالت امن</a>
        </div>
      )}
      {!phone && <EditBar />}
      <SettingsPanel />
      <Palette />
      <AutoModeToast />
      <TasteTest />
      <DialogHost />
      <TaskEditorHost />
      <PlannerHost />
      <ScheduleHost />
      <EventEditorHost />
      <ScopeHost />
      <ReviewHost />
      <ProjectsHost />
      <CoachHost />
      <LegalHost />
      <TourHost />
      <UpdateHost />
      <NotifyHost />
      <CauseHost />
      <NightLayer />
    </>
  );
}
