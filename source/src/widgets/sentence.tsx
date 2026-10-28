// A line on the background: big, quiet, with its source and why it was chosen.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defineWidget } from '../core/widgets';
import { useStore } from '../core/state';
import type { Sentence } from '../core/db';
import { current, explainLine, feedback, markUnclear, next as nextLine, pinUntilTomorrow, refreshSources, sourceLabel, UNCLEAR_WHY, unpin, type Pick } from '../core/sentences';
import type { UnclearWhy } from '../core/db';
import { THEMES } from '../core/taste';
import { bingeMessage, cooldownLeft, DAILY_FRESH, noteNext, shouldSayCap } from '../core/binge';
import { fa } from '../core/dates';
import { IconBook, IconDown, IconHeart, IconHelp, IconPinTop, IconReset, IconSpark } from '../ui/icons';
import { meaningOf } from '../core/meanings';
import { MeaningCard } from '../ui/MeaningCard';

defineWidget<Record<string, never>>({
  type: 'sentence',
  name: 'جمله روی پس‌زمینه',
  description: 'شعر، جمله‌ها و برداشت‌های خودت، بسته‌ها و API',
  icon: <IconSpark />,
  defaultSize: { w: 11, h: 6 },
  minSize: { w: 5, h: 3 },
  defaultConfig: {},
  card: false,
  Component: function SentenceWidget({ editing }) {
    const mode = useStore((s) => s.settings.mode.active);
    const look = useStore((s) => s.settings.sentences);
    const [cur, setCur] = useState<{ sentence: Sentence; pick: Pick } | null | undefined>(undefined);
    const [liked, setLiked] = useState(false);

    const [rest, setRest] = useState(0);
    const load = useCallback(async (next?: boolean) => {
      if (next) {
        // Flipping through too fast? Ora steps in instead of showing another line.
        const v = noteNext();
        if (v === 'binge' || v === 'resting') {
          setRest(cooldownLeft());
          if (v === 'binge') {
            const m = await bingeMessage();
            dispatchEvent(new CustomEvent('ora:say', { detail: { text: m.text, mood: 'firm', sticky: true,
              action: m.task ? { label: `برو سراغ «${m.task.title.length > 22 ? m.task.title.slice(0, 22) + '…' : m.task.title}»`, run: () => dispatchEvent(new CustomEvent('ora:focus-task', { detail: m.task!.id })) }
                : { label: 'یک کار بنویس', run: () => (document.querySelector('[aria-label="تسک جدید"]') as HTMLInputElement | null)?.focus() } } }));
          }
          return;
        }
        if (v === 'replay' && shouldSayCap()) {
          dispatchEvent(new CustomEvent('ora:say', { detail: { text: `امروز ${fa(DAILY_FRESH)} جمله‌ی تازه دیدی. از اینجا تا فردا، از جمله‌هایی نشانت می‌دهم که دوستشان داشتی؛ تازه‌ها را برای فردا نگه داریم.` } }));
        }
        setLiked(false);
        setCur(await nextLine(cur ?? null, { replay: v === 'replay' }));
        return;
      }
      setLiked(false);
      setCur(await current());
    }, [cur]);
    // «منظورش را نفهمیدم»: set the line aside, ask (one tap) what was unclear, offer an explanation.
    const hasModel = useStore((s) => !!s.settings.ai.model);
    const [meaningFor, setMeaningFor] = useState<{ s: Sentence; rect: DOMRect; ask: boolean } | null>(null);
    const plateRect = () => figRef.current?.querySelector('.sentence-plate')?.getBoundingClientRect() ?? new DOMRect(innerWidth / 2 - 200, 200, 400, 100);
    // «؟» first offers the line's meaning when there is one; only if it is still unclear is it set aside.
    const unclear = async () => {
      if (!cur) return;
      const m = await meaningOf(cur.sentence).catch(() => null);
      if (m) { setMeaningFor({ s: cur.sentence, rect: plateRect(), ask: true }); return; }
      await unclearFlow();
    };
    const unclearFlow = async () => {
      if (!cur) return;
      const s = cur.sentence;
      await markUnclear(s);
      const say = (detail: object) => dispatchEvent(new CustomEvent('ora:say', { detail }));
      const thanks = (why?: UnclearWhy) => {
        if (why) void markUnclear(s, why);
        say({ text: 'ممنون. این جمله کنار رفت و در فهرست «نامفهوم‌ها» ثبت شد تا ساده‌ترش کنیم.', action: hasModel ? { label: 'توضیحش بده', run: explain } : undefined });
      };
      const explain = async () => {
        say({ text: 'دارم فکر می‌کنم…', sticky: true });
        try { say({ title: `«${s.text.length > 60 ? s.text.slice(0, 60) + '…' : s.text}»`, text: await explainLine(s), sticky: true }); }
        catch { say({ text: 'الان به مدل دسترسی ندارم؛ ولی جمله ثبت شد.' }); }
      };
      say({
        text: 'کجایش گنگ بود؟ (اختیاری؛ کمک می‌کند بدانیم دقیقاً چه چیزی را باید عوض کرد)',
        sticky: true,
        choices: (Object.keys(UNCLEAR_WHY) as UnclearWhy[]).map((k) => ({ label: UNCLEAR_WHY[k], run: () => thanks(k) })),
        action: hasModel ? { label: 'فقط توضیحش بده', run: explain } : undefined,
      });
      setLiked(false);
      setCur(await nextLine(null));
    };

    useEffect(() => { setMeaningFor((x) => (x && x.s.id !== cur?.sentence.id ? null : x)); }, [cur?.sentence.id]);
    // count the rest down so «دیگری» shows how long is left
    useEffect(() => {
      if (!rest) return;
      const t = window.setInterval(() => setRest(cooldownLeft()), 1000);
      return () => window.clearInterval(t);
    }, [rest]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { void load(); }, [mode]);
    useEffect(() => { const t = window.setTimeout(() => void refreshSources(), 6000); return () => window.clearTimeout(t); }, []);
    useEffect(() => {
      const next = () => void load(true);
      const reload = () => void load();
      addEventListener('nova:sentence-next', next);
      addEventListener('nova:sentence-reload', reload);
      return () => { removeEventListener('nova:sentence-next', next); removeEventListener('nova:sentence-reload', reload); };
    }, [load]);

    // Auto-fit: start from the CSS size and step down until the plate fits the box.
    const figRef = useRef<HTMLElement>(null);
    const quoteRef = useRef<HTMLQuoteElement>(null);
    useLayoutEffect(() => {
      const fig = figRef.current, q = quoteRef.current;
      if (!fig || !q) return;
      const fit = () => {
        q.style.fontSize = q.dataset.fs ?? '';
        const plate = q.parentElement!;
        const room = fig.clientHeight - 16;
        let size = parseFloat(getComputedStyle(q).fontSize);
        for (let i = 0; i < 40 && size > 13 && (plate.scrollHeight > room || q.scrollWidth > q.clientWidth + 1); i++) {
          size -= 1;
          q.style.fontSize = `${size}px`;
        }
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(fig);
      return () => ro.disconnect();
    }, [cur, look.size, look.weight, look.frame]);

    if (cur === undefined) return null;
    if (cur === null) {
      return <div className="faint" style={{ height: '100%', display: 'grid', placeItems: 'center', fontSize: 13, textAlign: 'center' }}>جمله‌ای برای این ساعت و حالت نیست. در شخصی‌سازی ← جمله‌ها، منبعی را روشن کن یا جمله‌ی خودت را بنویس.</div>;
    }
    const s = cur.sentence;
    const lines = s.text.split('\n');
    const len = s.text.length;
    // Size follows the widget's own box (container units), so it is never lost and never overflows.
    const scale = { m: 0.85, l: 1, xl: 1.2 }[look.size];
    const base = (len < 45 ? 5.4 : len < 90 ? 4.2 : 3.3) * scale;
    // A couplet keeps each hemistich on one line: shrink to fit the longest one.
    const verse = lines.length > 1;
    const longest = Math.max(...lines.map((l) => l.length));
    const widthCap = verse ? 170 / longest : 99;
    const pinned = !!cur.pick.pinnedUntil && cur.pick.pinnedUntil > Date.now();

    return (
      <figure ref={figRef} className={`sentence frame-${look.frame}`} aria-label="جمله روی پس‌زمینه">
        {look.frame === 'halo' && <div className="sentence-halo" aria-hidden="true" />}
        <div className="sentence-plate">
        <span className="sentence-mark" aria-hidden="true" />
        <blockquote ref={quoteRef} data-fs={`clamp(16px, min(${base}cqw, ${widthCap}cqw, ${(30 * scale) / Math.max(lines.length, verse ? 2 : 1.7)}cqh), 64px)` } className={verse ? 'verse' : undefined} style={{ fontWeight: look.weight, fontSize: `clamp(16px, min(${base}cqw, ${widthCap}cqw, ${(30 * scale) / Math.max(lines.length, verse ? 2 : 1.7)}cqh), 64px)` }}>
          {lines.map((l, i) => <div key={i}>{l}</div>)}
        </blockquote>
        <figcaption>
          <span className="cap-src">{[s.source !== 'nova' && s.by && s.by !== sourceLabel(s) ? s.by : null, sourceLabel(s), s.source === 'nova' && s.theme ? THEMES[s.theme] : null].filter(Boolean).join(' · ')}
            {s.link && <> · <a href={s.link} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>گنجور</a></>}
            {pinned && ' · سنجاق تا فردا'}
            {!editing && !look.tasteTestDone && <span className="taste-hint" aria-hidden="true"> · سلیقه‌ات را یادم بده</span>}
          </span>
          {!editing && (
            <span className="sentence-actions">
              <button aria-label="دیگری" title={rest ? `اورآ گفت فعلاً بسه؛ ${fa(Math.ceil(rest / 60))} دقیقه‌ی دیگر` : 'جمله‌ی دیگر'} disabled={rest > 0} onClick={() => void load(true)}><IconReset size={15} /></button>
              <button aria-label={pinned ? 'برداشتن سنجاق' : 'سنجاق تا فردا'} title={pinned ? 'برداشتن سنجاق' : 'سنجاق تا فردا'} aria-pressed={pinned}
                onClick={async () => { if (pinned) await unpin(); else { await pinUntilTomorrow(); await feedback(s, 'pin'); } await load(); }}><IconPinTop size={15} /></button>
              <button aria-label="به دلم نشست" title="به دلم نشست (بیشتر نشانش بده)" aria-pressed={liked} disabled={liked}
                onClick={async () => { await feedback(s, 'like'); setLiked(true); }}><IconHeart size={15} /></button>
              <button aria-label="کمتر از این نوع" title="کمتر از این نوع (این جمله پنهان می‌شود و جمله‌های شبیهش کمتر می‌آیند)" onClick={async () => { await feedback(s, 'less'); setLiked(false); setCur(await nextLine(null)); }}><IconDown size={15} /></button>
              <button aria-label="معنی" title="معنی و برداشت" aria-pressed={!!meaningFor} onClick={() => setMeaningFor(meaningFor ? null : { s, rect: plateRect(), ask: false })}><IconBook size={15} /></button>
              <button aria-label="منظورش را نفهمیدم" title="منظورش را نفهمیدم" onClick={() => void unclear()}><IconHelp size={15} /></button>
              {!look.tasteTestDone && (
                <button className="taste-offer" aria-label="سلیقه‌ات را به اورآ یاد بده (یک دقیقه)" title="یک آزمون یک‌دقیقه‌ای: از هر دو جمله، آن را که بیشتر دوست داری انتخاب کن"
                  onClick={() => dispatchEvent(new Event('nova:taste-test'))}>سلیقه‌ات را یادم بده</button>
              )}
            </span>
          )}
        </figcaption>
        </div>
        {meaningFor && <MeaningCard key={meaningFor.s.id + String(meaningFor.ask)} s={meaningFor.s} anchor={meaningFor.rect} ask={meaningFor.ask} onClose={() => setMeaningFor(null)} onStillUnclear={() => { setMeaningFor(null); void unclearFlow(); }} />}
      </figure>
    );
  },
});
