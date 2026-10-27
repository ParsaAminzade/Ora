// The admin panel (/admin): overview, users (everything each one shared), lines, releases and
// announcements, messages, a full export, and built-in documentation.
import { checkCsrf, login, logoutCookie, passwordReady, session, type Session } from './auth';
import { all, bumpPackRev, eraseInstall, kvGet, kvSet, one, run } from './db';
import { SEARCH_CATS } from './api';
import { ago, countryName, esc, fa, html, jdate, json, now, page, randomHex, redirect, type Env } from './util';
import BUILTIN from './builtin.json';
import LEGAL from './legal.json';

const BUILT = BUILTIN as { id: string; text: string; theme?: string }[];
const BUILT_MAP = new Map(BUILT.map((b) => [b.id, b]));
const WHY: Record<string, string> = { words: 'کلمه‌ها یا اصطلاح', point: 'منظور کلی', context: 'ربطش به موقعیت', long: 'پیچیده یا طولانی' };
const THEMES: Record<string, string> = {
  action: 'عمل', focus: 'تمرکز', grit: 'پشتکار', learning: 'یادگیری', meaning: 'معنا', measure: 'معیار', mind: 'ذهن', people: 'آدم‌ها', self: 'خود', time: 'زمان',
};
const TAGS: Record<string, string> = { focus: 'تمرکز', gentle: 'روز خسته', comfort: 'دلگرمی', calm: 'آرامش', growth: 'رشد' };
const VERSION_RE = /^\d{1,4}(\.\d{1,4}){0,3}$/;

interface Ctx { req: Request; env: Env; url: URL; s: Session; flash?: { kind: 'ok' | 'err'; text: string } }

// ---------- layout ----------
const NAV: [string, string][] = [
  ['/admin', 'نمای کلی'], ['/admin/users', 'کاربران'], ['/admin/sentences', 'جمله‌ها'], ['/admin/release', 'نسخه و اعلان'],
  ['/admin/feedback', 'پیام‌ها'], ['/admin/data', 'داده و پشتیبان'], ['/admin/docs', 'راهنما'],
];
async function layout(c: Ctx, title: string, body: string, help?: string): Promise<string> {
  const unread = (await one<{ n: number }>(c.env.DB, 'SELECT COUNT(*) AS n FROM feedback WHERE read = 0'))?.n ?? 0;
  const path = c.url.pathname.replace(/\/$/, '') || '/admin';
  const nav = NAV.map(([href, name]) => {
    const on = href === '/admin' ? path === '/admin' : path.startsWith(href);
    const badge = href === '/admin/feedback' && unread ? ` <span class="badge">${fa(unread)}</span>` : '';
    return `<a href="${href}" class="${on ? 'on' : ''}">${name}${badge}</a>`;
  }).join('');
  const flash = c.flash ?? flashFrom(c.url);
  return page(`${title} · مدیریت اورآ`, `<div class="adm">
  <aside><div class="brand"><img src="/static/icon.png" alt=""> مدیریت اورآ</div>${nav}
    <a href="/" target="_blank">دیدن سایت ↗</a><a href="/app/" target="_blank">اپ گوشی ↗</a>
    <form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${c.s.csrf}"><button class="btn btn-sm">خروج</button></form>
  </aside>
  <main>${flash ? `<div class="flash ${flash.kind}">${esc(flash.text)}</div>` : ''}
    ${help ? `<details class="help"><summary>این صفحه چیست؟</summary><div>${help}</div></details>` : ''}
    ${body}</main></div><script src="/static/admin.js"></script>`);
}
const flashFrom = (u: URL) => (u.searchParams.get('ok') ? { kind: 'ok' as const, text: u.searchParams.get('ok')! } : u.searchParams.get('err') ? { kind: 'err' as const, text: u.searchParams.get('err')! } : undefined);
const back = (to: string, ok?: string, err?: string) => redirect(`${to}${to.includes('?') ? '&' : '?'}${ok ? `ok=${encodeURIComponent(ok)}` : `err=${encodeURIComponent(err ?? '')}`}`);
const csrf = (c: Ctx) => `<input type="hidden" name="csrf" value="${c.s.csrf}">`;
const postBtn = (c: Ctx, action: string, label: string, cls = 'btn btn-sm', confirm?: string, extra = '') =>
  `<form method="post" action="${action}" class="inline"${confirm ? ` data-confirm="${esc(confirm)}"` : ''}>${csrf(c)}${extra}<button class="${cls}">${label}</button></form>`;
const bar = (label: string, n: number, max: number, ltr = false) =>
  `<div class="bar"><span${ltr ? ' class="ltr"' : ''}>${esc(label)}</span><i style="width:${Math.round((n / Math.max(1, max)) * 100)}%"></i><em>${fa(n)}</em></div>`;
const empty = (t = 'هنوز داده‌ای نیست') => `<div class="empty">${t}</div>`;

// ---------- lines ----------
async function lineText(db: D1Database, id: string): Promise<{ text: string | null; src: string; by: string | null }> {
  const r = await one<{ text: string; by: string | null; builtin: number }>(db, 'SELECT text, by, builtin FROM sentences WHERE id = ?', id);
  if (r) return { text: r.text, src: r.builtin ? 'اصلاح‌شده‌ی داخلی' : 'سرور', by: r.by };
  const b = BUILT_MAP.get(id);
  if (b) return { text: b.text, src: 'داخلی', by: null };
  const e = await one<{ text: string; by: string | null }>(db, 'SELECT text, by FROM ext_lines WHERE id = ?', id);
  return e ? { text: e.text, src: 'شعر کلاسیک', by: e.by } : { text: null, src: 'نامشخص', by: null };
}
async function top(db: D1Database, kinds: string[], days: number, limit = 10) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await all<{ ref: string; n: number; u: number }>(db,
    `SELECT ref, SUM(n) AS n, COUNT(DISTINCT install) AS u FROM signals WHERE kind IN (${kinds.map(() => '?').join(',')}) AND day >= ?
     GROUP BY ref ORDER BY u DESC, n DESC LIMIT ?`, ...kinds, since, limit);
  return Promise.all(rows.map(async (r) => ({ ...r, ...(await lineText(db, r.ref)) })));
}
const lineItem = (l: { ref: string; u: number; text: string | null; src: string; by: string | null; why?: [string, number][] }) =>
  `<li><div>${esc(l.text ?? l.ref)}</div><div class="meta">${fa(l.u)} نفر · ${esc(l.src)}${l.by ? ` · ${esc(l.by)}` : ''} · <code>${esc(l.ref)}</code>
  ${(l.why ?? []).map(([w, n]) => `<span class="pill warn">${esc(w)}: ${fa(n)}</span>`).join('')}
  · <a href="/admin/sentences/${encodeURIComponent(l.ref)}/edit">ویرایش</a></div></li>`;

// ---------- pages ----------
async function dashboard(c: Ctx) {
  const db = c.env.DB, t = now();
  const n = async (sql: string, ...a: unknown[]) => (await one<{ n: number }>(db, sql, ...a))?.n ?? 0;
  const s = {
    total: await n('SELECT COUNT(*) AS n FROM installs'),
    active7: await n('SELECT COUNT(*) AS n FROM installs WHERE last_seen >= ?', t - 7 * 86400),
    active30: await n('SELECT COUNT(*) AS n FROM installs WHERE last_seen >= ?', t - 30 * 86400),
    new7: await n('SELECT COUNT(*) AS n FROM installs WHERE created >= ?', t - 7 * 86400),
    profile: await n('SELECT COUNT(*) AS n FROM installs WHERE c_profile = 1 AND (name IS NOT NULL OR interests != \'[]\')'),
    email: await n('SELECT COUNT(*) AS n FROM installs WHERE email IS NOT NULL'),
    unread: await n('SELECT COUNT(*) AS n FROM feedback WHERE read = 0'),
    lines: await n('SELECT COUNT(*) AS n FROM sentences WHERE builtin = 0 AND active = 1'),
  };
  const days = [...Array(14)].map((_, i) => new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10));
  const act = new Map((await all<{ day: string; n: number }>(db, 'SELECT day, COUNT(DISTINCT install) AS n FROM signals WHERE day >= ? GROUP BY day', days[0])).map((r) => [r.day, r.n]));
  const dmax = Math.max(1, ...days.map((d) => act.get(d) ?? 0));
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const cats = await all<{ ref: string; n: number }>(db, "SELECT ref, SUM(n) AS n FROM signals WHERE kind = 'search' AND day >= ? GROUP BY ref ORDER BY n DESC", since90);
  const countries = await all<{ country: string | null; n: number }>(db, 'SELECT country, COUNT(*) AS n FROM installs GROUP BY country ORDER BY n DESC');
  const versions = await all<{ v: string; n: number }>(db, "SELECT COALESCE(version, '؟') AS v, COUNT(*) AS n FROM installs GROUP BY v ORDER BY n DESC");
  const platforms = await all<{ p: string; n: number }>(db, "SELECT COALESCE(platform, '؟') AS p, COUNT(*) AS n FROM installs GROUP BY p ORDER BY n DESC");
  const interests = new Map<string, number>();
  for (const r of await all<{ interests: string }>(db, 'SELECT interests FROM installs WHERE interests IS NOT NULL')) {
    try { for (const i of JSON.parse(r.interests) as string[]) interests.set(i, (interests.get(i) ?? 0) + 1); } catch { /* skip */ }
  }
  const ints = [...interests.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const liked = await top(db, ['like', 'save'], 90);
  const unclear = await top(db, ['unclear', ...Object.keys(WHY).map((w) => `unclear:${w}`)], 90);
  for (const u of unclear as (typeof unclear[number] & { why?: [string, number][] })[]) {
    u.why = (await all<{ kind: string; n: number }>(db, "SELECT kind, COUNT(DISTINCT install) AS n FROM signals WHERE ref = ? AND kind LIKE 'unclear:%' GROUP BY kind", u.ref))
      .map((r) => [WHY[r.kind.split(':')[1]] ?? r.kind, r.n]);
  }
  const less = await top(db, ['less'], 90);
  const latest = await kvGet<Record<string, string> | null>(db, 'latest', null);
  const announce = await kvGet<Record<string, string> | null>(db, 'announce', null);
  const pname: Record<string, string> = { extension: 'افزونه‌ی کروم', web: 'اپ گوشی/وب' };
  const body = `<h1>نمای کلی</h1>
  <div class="tiles">
    <div class="tile"><span>کاربران</span><b>${fa(s.total)}</b><small>${fa(s.new7)} نفر در هفته‌ی اخیر</small></div>
    <div class="tile"><span>فعال در ۷ روز</span><b>${fa(s.active7)}</b><small>${fa(s.active30)} نفر در ۳۰ روز</small></div>
    <div class="tile"><span>پروفایل پر کرده</span><b>${fa(s.profile)}</b><small>${fa(s.email)} نفر ایمیل داده‌اند</small></div>
    <div class="tile"><span>پیام نخوانده</span><b>${fa(s.unread)}</b><small><a href="/admin/feedback">صندوق پیام‌ها</a></small></div>
    <div class="tile"><span>جمله‌های سرور</span><b>${fa(s.lines)}</b><small><a href="/admin/sentences/new">+ جمله‌ی تازه</a></small></div>
    <div class="tile"><span>آخرین نسخه</span><b class="ltr">${esc(latest?.version ?? '—')}</b><small>${announce ? 'یک اعلان فعال' : 'بدون اعلان'}</small></div>
  </div>
  <div class="card"><h2>فعالیت دو هفته‌ی اخیر <small class="faint">کسانی که هر روز بازخورد یا جست‌وجو داشتند</small></h2>
    <div class="spark">${days.map((d) => `<div title="${d}: ${act.get(d) ?? 0}"><i style="height:${Math.round(((act.get(d) ?? 0) / dmax) * 100)}%"></i><small>${fa(+d.slice(8))}</small></div>`).join('')}</div></div>
  <div class="grid2">
    <div class="card"><h2>محبوب‌ترین جمله‌ها <small class="faint">۹۰ روز</small></h2>${liked.length ? `<ol class="lines">${liked.map(lineItem).join('')}</ol>` : empty()}</div>
    <div class="card"><h2>نامفهوم‌ترین‌ها <small class="faint">برای بازنویسی</small></h2>${unclear.length ? `<ol class="lines">${unclear.map(lineItem).join('')}</ol>` : empty()}</div>
  </div>
  <div class="grid2" style="margin-top:16px">
    <div class="card"><h2>کشورها</h2>${countries.length ? `<div class="bars">${countries.map((r) => bar(countryName(r.country), r.n, countries[0].n)).join('')}</div>` : empty()}
      <h2 style="margin-top:20px">کجا استفاده می‌کنند</h2>${platforms.length ? `<div class="bars">${platforms.map((r) => bar(pname[r.p] ?? r.p, r.n, platforms[0].n)).join('')}</div>` : empty()}</div>
    <div class="card"><h2>دسته‌ی جست‌وجوها <small class="faint">۹۰ روز، بدون متن</small></h2>${cats.length ? `<div class="bars">${cats.map((r) => bar(SEARCH_CATS[r.ref] ?? r.ref, r.n, cats[0].n)).join('')}</div>` : empty()}
      <h2 style="margin-top:20px">علایق</h2>${ints.length ? `<div class="bars">${ints.map(([k, v]) => bar(k, v, ints[0][1])).join('')}</div>` : empty('هنوز کسی علاقه‌ای ننوشته')}</div>
  </div>
  <div class="grid2" style="margin-top:16px">
    <div class="card"><h2>بیشترین «کمتر از این»</h2>${less.length ? `<ol class="lines">${less.map(lineItem).join('')}</ol>` : empty()}</div>
    <div class="card"><h2>نسخه‌های نصب‌شده</h2>${versions.length ? `<div class="bars">${versions.map((r) => bar(r.v, r.n, versions[0].n, true)).join('')}</div>` : empty()}</div>
  </div>`;
  return html(await layout(c, 'نمای کلی', body, 'خلاصه‌ی همه‌چیز: چند نفر از اورآ استفاده می‌کنند، کدام جمله‌ها دوست داشته شده‌اند یا نامفهوم بوده‌اند، از کدام کشورها، و به چه موضوع‌هایی علاقه دارند. فقط کسانی شمرده می‌شوند که اشتراک داده را قبول کرده‌اند.'));
}

interface Install { id: string; created: number; last_seen: number; version: string | null; terms_version: string | null; terms_at: number | null;
  c_likes: number; c_search: number; c_profile: number; c_email: number; name: string | null; interests: string | null; email: string | null;
  extra: string | null; syncs: number; country: string | null; platform: string | null }
const parseList = (s: string | null) => { try { return s ? (JSON.parse(s) as string[]) : []; } catch { return []; } };

async function users(c: Ctx) {
  const q = (c.url.searchParams.get('q') ?? '').trim().slice(0, 60);
  const sort = c.url.searchParams.get('sort') ?? 'last';
  const cc = (c.url.searchParams.get('country') ?? '').slice(0, 2);
  const order = ({ last: 'last_seen DESC', new: 'created DESC', name: 'name IS NULL, name' } as Record<string, string>)[sort] ?? 'last_seen DESC';
  const where: string[] = [], args: unknown[] = [];
  if (q) { where.push('(name LIKE ? OR email LIKE ? OR interests LIKE ? OR id LIKE ?)'); args.push(...Array(4).fill(`%${q}%`)); }
  if (cc) { where.push('country = ?'); args.push(cc); }
  const rows = await all<Install>(c.env.DB, `SELECT * FROM installs${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT 500`, ...args);
  const counts = new Map((await all<{ install: string; a: number; b: number }>(c.env.DB,
    "SELECT install, SUM(CASE WHEN kind != 'search' THEN n ELSE 0 END) AS a, SUM(CASE WHEN kind = 'search' THEN n ELSE 0 END) AS b FROM signals GROUP BY install")).map((r) => [r.install, r]));
  const ccs = await all<{ country: string | null; n: number }>(c.env.DB, 'SELECT country, COUNT(*) AS n FROM installs GROUP BY country ORDER BY n DESC');
  const body = `<h1>کاربران <span class="actions"><a class="btn btn-sm" href="/admin/users.csv">خروجی CSV</a></span></h1>
  <form class="row" method="get">
    <input type="search" name="q" value="${esc(q)}" placeholder="جست‌وجو در نام، ایمیل، علایق" aria-label="جست‌وجو">
    <select name="country" aria-label="کشور"><option value="">همه‌ی کشورها</option>${ccs.filter((r) => r.country).map((r) => `<option value="${esc(r.country)}"${r.country === cc ? ' selected' : ''}>${esc(countryName(r.country))} (${fa(r.n)})</option>`).join('')}</select>
    <select name="sort" aria-label="مرتب‌سازی">${[['last', 'آخرین بازدید'], ['new', 'تازه‌ترین'], ['name', 'نام']].map(([v, n]) => `<option value="${v}"${v === sort ? ' selected' : ''}>${n}</option>`).join('')}</select>
    <button class="btn btn-sm">نمایش</button>
  </form>
  <div class="card">${rows.length ? `<table><thead><tr><th>کاربر</th><th>کشور</th><th>علایق</th><th>فعالیت</th><th>نسخه</th><th>آخرین بازدید</th></tr></thead><tbody>
  ${rows.map((u) => { const k = counts.get(u.id); return `<tr>
    <td><a href="/admin/users/${u.id}">${esc(u.name || 'بی‌نام')}</a>${u.email ? `<br><small class="ltr">${esc(u.email)}</small>` : ''}<br><small class="faint ltr">${u.id.slice(0, 8)}…</small></td>
    <td>${esc(countryName(u.country))}</td>
    <td>${parseList(u.interests).map((i) => `<span class="pill">${esc(i)}</span>`).join('')}</td>
    <td><small>${fa(k?.a ?? 0)} بازخورد · ${fa(k?.b ?? 0)} جست‌وجو</small></td>
    <td class="ltr">${esc(u.version ?? '—')}</td><td><small>${ago(u.last_seen)}</small></td></tr>`; }).join('')}</tbody></table>`
    : empty(q || cc ? 'چیزی پیدا نشد' : 'هنوز کاربری داده‌ای نفرستاده')}</div>`;
  return html(await layout(c, 'کاربران', body, 'هر ردیف یک مرورگر یا گوشی است که اشتراک داده را قبول کرده. روی هر کدام بزن تا همه‌ی چیزهایی را که فرستاده ببینی. IP ذخیره نمی‌شود؛ فقط کشوری که کلادفلر از روی اتصال تشخیص می‌دهد.'));
}

async function user(c: Ctx, id: string) {
  const db = c.env.DB;
  const u = await one<Install>(db, 'SELECT * FROM installs WHERE id = ?', id);
  if (!u) return html(await layout(c, 'پیدا نشد', `<h1>این کاربر نیست</h1><p><a href="/admin/users">برگشت به کاربران</a></p>`), 404);
  const extra = (() => { try { return u.extra ? (JSON.parse(u.extra) as Record<string, string>) : {}; } catch { return {}; } })();
  const sig = await all<{ ref: string; kind: string; n: number; last: string }>(db,
    "SELECT ref, kind, SUM(n) AS n, MAX(day) AS last FROM signals WHERE install = ? AND kind != 'search' GROUP BY ref, kind ORDER BY last DESC LIMIT 300", id);
  const label = (k: string) => ({ like: 'دوست داشت', save: 'نگه داشت', less: 'کمتر' } as Record<string, string>)[k] ?? `نامفهوم${k.includes(':') ? ` (${WHY[k.split(':')[1]]})` : ''}`;
  const lines = await Promise.all(sig.map(async (r) => ({ ...r, ...(await lineText(db, r.ref)) })));
  const cats = await all<{ ref: string; n: number }>(db, "SELECT ref, SUM(n) AS n FROM signals WHERE install = ? AND kind = 'search' GROUP BY ref ORDER BY n DESC", id);
  const fb = await all<{ text: string; created: number }>(db, 'SELECT text, created FROM feedback WHERE install = ? ORDER BY created DESC', id);
  const pill = (on: number, t: string) => `<span class="pill ${on ? 'on' : 'off'}">${t}</span>`;
  const body = `<h1>${esc(u.name || 'کاربر بی‌نام')} <span class="actions">${postBtn(c, `/admin/users/${id}/delete`, 'پاک کردن همه‌ی داده‌ها', 'btn btn-sm btn-danger', 'همه‌ی داده‌های این کاربر پاک شود؟')}
    <a class="btn btn-sm" href="/admin/users/${id}.json">خروجی JSON</a></span></h1>
  <div class="grid2"><div class="card"><h2>پروفایل</h2><dl class="kv">
    <dt>شناسه</dt><dd class="ltr">${esc(u.id)}</dd><dt>نام</dt><dd>${esc(u.name ?? '—')}</dd>
    <dt>ایمیل</dt><dd class="ltr">${esc(u.email ?? '—')}</dd>
    <dt>علایق</dt><dd>${parseList(u.interests).map((i) => `<span class="pill">${esc(i)}</span>`).join('') || '—'}</dd>
    ${Object.entries(extra).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
    <dt>کشور</dt><dd>${esc(countryName(u.country))}</dd>
    <dt>کجا</dt><dd>${u.platform === 'web' ? 'اپ گوشی/وب' : u.platform === 'extension' ? 'افزونه‌ی کروم' : '—'}</dd>
    <dt>اشتراک</dt><dd>${pill(u.c_likes, 'جمله‌ها')}${pill(u.c_search, 'جست‌وجو')}${pill(u.c_profile, 'پروفایل')}${pill(u.c_email, 'ایمیل')}</dd>
    <dt>قوانین</dt><dd>نسخه‌ی ${fa(u.terms_version ?? '—')} · ${jdate(u.terms_at)}</dd>
    <dt>نسخه‌ی اورآ</dt><dd class="ltr">${esc(u.version ?? '—')}</dd>
    <dt>اولین بار</dt><dd>${jdate(u.created, true)}</dd><dt>آخرین بار</dt><dd>${jdate(u.last_seen, true)} (${ago(u.last_seen)})</dd>
    <dt>دفعات ارسال</dt><dd>${fa(u.syncs)}</dd></dl></div>
  <div class="card"><h2>دسته‌ی جست‌وجوها</h2>${cats.length ? `<div class="bars">${cats.map((r) => bar(SEARCH_CATS[r.ref] ?? r.ref, r.n, cats[0].n)).join('')}</div>` : empty('—')}
    ${fb.length ? `<h2 style="margin-top:18px">پیام‌هایش</h2>${fb.map((f) => `<div class="fb"><small class="faint">${jdate(f.created, true)}</small><p>${esc(f.text)}</p></div>`).join('')}` : ''}</div></div>
  <div class="card" style="margin-top:16px"><h2>بازخورد جمله‌ها</h2>${lines.length ? `<table><thead><tr><th>جمله</th><th>واکنش</th><th>آخرین بار</th></tr></thead><tbody>
    ${lines.map((l) => `<tr><td class="line">${esc(l.text ?? l.ref)}${l.by ? ` <small class="faint">— ${esc(l.by)}</small>` : ''}</td><td><span class="pill">${label(l.kind)}${l.n > 1 ? ` ×${fa(l.n)}` : ''}</span></td><td><small>${fa(l.last)}</small></td></tr>`).join('')}
    </tbody></table>` : empty('—')}</div>`;
  return html(await layout(c, u.name || 'کاربر', body, 'همه‌ی چیزهایی که این کاربر فرستاده. «پاک کردن همه‌ی داده‌ها» کاربر را کامل از پایگاه داده برمی‌دارد؛ پیام‌هایش می‌مانند ولی دیگر به او وصل نیستند.'));
}

async function usersCsv(c: Ctx) {
  const rows = await all<Install>(c.env.DB, 'SELECT * FROM installs ORDER BY last_seen DESC');
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['id', 'first_seen', 'last_seen', 'country', 'platform', 'version', 'terms', 'name', 'interests', 'email'].join(','),
    ...rows.map((u) => [u.id, new Date(u.created * 1000).toISOString(), new Date(u.last_seen * 1000).toISOString(), u.country, u.platform, u.version,
      u.terms_version, u.name, parseList(u.interests).join('، '), u.email].map(cell).join(','))];
  return new Response('﻿' + lines.join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=ora-users.csv' } });
}

async function sentences(c: Ctx) {
  const tab = c.url.searchParams.get('tab') === 'builtin' ? 'builtin' : 'server';
  const q = (c.url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const sort = c.url.searchParams.get('sort') ?? '';
  const db = c.env.DB;
  const counts = new Map<string, { like: number; less: number; unclear: number }>();
  for (const r of await all<{ ref: string; kind: string; u: number }>(db, "SELECT ref, kind, COUNT(DISTINCT install) AS u FROM signals WHERE kind != 'search' GROUP BY ref, kind")) {
    const d = counts.get(r.ref) ?? { like: 0, less: 0, unclear: 0 };
    if (r.kind.startsWith('unclear')) d.unclear = Math.max(d.unclear, r.u); else if (r.kind === 'less') d.less += r.u; else d.like += r.u;
    counts.set(r.ref, d);
  }
  const hidden = new Set((await all<{ id: string }>(db, 'SELECT id FROM hidden')).map((r) => r.id));
  const cnt = (id: string) => { const x = counts.get(id); return x ? `<span class="count">${x.like ? `♥ ${fa(x.like)}` : ''}${x.unclear ? ` · ؟ ${fa(x.unclear)}` : ''}${x.less ? ` · ↓ ${fa(x.less)}` : ''}</span>` : ''; };
  let rows: { id: string; html: string; c: { like: number; less: number; unclear: number } }[] = [];
  if (tab === 'builtin') {
    const ov = new Map((await all<{ id: string; text: string }>(db, 'SELECT id, text FROM sentences WHERE builtin = 1')).map((r) => [r.id, r.text]));
    for (const b of BUILT) {
      const text = ov.get(b.id) ?? b.text;
      if (q && !text.includes(q) && !b.id.includes(q)) continue;
      const hid = hidden.has(b.id), edited = ov.has(b.id);
      rows.push({ id: b.id, c: counts.get(b.id) ?? { like: 0, less: 0, unclear: 0 }, html: `<tr class="${hid ? 'dim' : ''}"><td class="line">${esc(text)}${edited ? `<div class="strike">${esc(b.text)}</div>` : ''}
        <div><small class="faint ltr">${esc(b.id)}</small>${b.theme ? ` <span class="pill">${esc(THEMES[b.theme] ?? b.theme)}</span>` : ''}${edited ? '<span class="pill on">اصلاح‌شده</span>' : ''}${hid ? '<span class="pill warn">پنهان</span>' : ''}${cnt(b.id)}</div></td>
        <td style="white-space:nowrap"><a class="btn btn-sm" href="/admin/sentences/${encodeURIComponent(b.id)}/edit">اصلاح</a>
        ${edited ? postBtn(c, `/admin/sentences/${encodeURIComponent(b.id)}/delete`, 'متن اصلی') : ''}
        ${postBtn(c, `/admin/builtin/${encodeURIComponent(b.id)}/hide`, hid ? 'نمایش دوباره' : 'پنهان کن', hid ? 'btn btn-sm' : 'btn btn-sm btn-danger', undefined, hid ? '<input type="hidden" name="undo" value="1">' : '')}</td></tr>` });
    }
  } else {
    for (const r of await all<{ id: string; text: string; by: string | null; theme: string | null; tags: string | null; meaning: string | null; active: number }>(db,
      'SELECT * FROM sentences WHERE builtin = 0 ORDER BY updated DESC')) {
      if (q && !r.text.includes(q) && !(r.by ?? '').includes(q)) continue;
      rows.push({ id: r.id, c: counts.get(r.id) ?? { like: 0, less: 0, unclear: 0 }, html: `<tr class="${r.active ? '' : 'dim'}"><td class="line">${esc(r.text)}${r.by ? ` <small class="faint">— ${esc(r.by)}</small>` : ''}
        <div>${r.theme ? `<span class="pill">${esc(THEMES[r.theme] ?? r.theme)}</span>` : ''}${(r.tags ?? '').split(',').filter(Boolean).map((t) => `<span class="pill">${esc(TAGS[t] ?? t)}</span>`).join('')}${r.meaning ? '<span class="pill">معنی دارد</span>' : ''}${r.active ? '' : '<span class="pill off">غیرفعال</span>'}${cnt(r.id)}</div></td>
        <td style="white-space:nowrap"><a class="btn btn-sm" href="/admin/sentences/${encodeURIComponent(r.id)}/edit">ویرایش</a>
        ${postBtn(c, `/admin/sentences/${encodeURIComponent(r.id)}/toggle`, r.active ? 'غیرفعال' : 'فعال')}
        ${postBtn(c, `/admin/sentences/${encodeURIComponent(r.id)}/delete`, 'حذف', 'btn btn-sm btn-danger', 'این جمله حذف شود؟')}</td></tr>` });
    }
  }
  if (sort === 'like' || sort === 'unclear' || sort === 'less') rows.sort((a, b) => b.c[sort] - a.c[sort]);
  const shown = rows.slice(0, 300);
  const body = `<h1>جمله‌ها <span class="actions"><a class="btn btn-sm btn-accent" href="/admin/sentences/new">+ جمله‌ی تازه</a><a class="btn btn-sm" href="/admin/sentences/export.json">خروجی JSON</a></span></h1>
  <div class="tabs"><a href="/admin/sentences" class="${tab === 'server' ? 'on' : ''}">جمله‌های سرور</a><a href="/admin/sentences?tab=builtin" class="${tab === 'builtin' ? 'on' : ''}">جمله‌های داخلی اورآ (${fa(BUILT.length)})</a></div>
  <form class="row" method="get"><input type="hidden" name="tab" value="${tab}"><input type="search" name="q" value="${esc(q)}" placeholder="جست‌وجو در متن" aria-label="جست‌وجو در جمله‌ها">
    <select name="sort" aria-label="مرتب‌سازی"><option value="">پیش‌فرض</option>${[['like', 'بیشترین ♥'], ['unclear', 'بیشترین «نامفهوم»'], ['less', 'بیشترین «کمتر»']].map(([v, n]) => `<option value="${v}"${v === sort ? ' selected' : ''}>${n}</option>`).join('')}</select>
    <button class="btn btn-sm">نمایش</button></form>
  ${tab === 'server' ? `<form class="row" method="post" action="/admin/sentences/import" enctype="multipart/form-data">${csrf(c)}<label class="muted" style="font-size:13px">وارد کردن یک‌جا (JSON):</label><input type="file" name="file" accept=".json,application/json" required aria-label="فایل JSON"><button class="btn btn-sm">وارد کن</button></form>` : ''}
  <div class="card">${shown.length ? `<table><tbody>${shown.map((r) => r.html).join('')}</tbody></table>${rows.length > shown.length ? `<p class="faint">${fa(shown.length)} از ${fa(rows.length)} نشان داده شد؛ برای بقیه جست‌وجو کن.</p>` : ''}`
    : empty(q ? 'چیزی پیدا نشد' : 'هنوز جمله‌ای روی سرور نیست. اولی را اضافه کن.')}</div>`;
  return html(await layout(c, 'جمله‌ها', body, tab === 'server'
    ? 'جمله‌هایی که اینجا اضافه می‌کنی روزی یک بار به اورآی همه می‌رسند. «غیرفعال» یعنی از کاربرها برداشته می‌شود. فایل JSON می‌تواند آرایه‌ای از متن‌ها یا {"items": [{"text": "…", "by": "…"}]} باشد.'
    : 'جمله‌هایی که داخل خود اورآ هستند. «اصلاح» متن یا معنی را برای همه عوض می‌کند و «پنهان کن» آن را از همه برمی‌دارد؛ بدون انتشار نسخه‌ی تازه. با «بیشترین نامفهوم» ببین کدام‌ها را باید ساده‌تر کنی.'));
}

async function sentenceForm(c: Ctx, id: string | null) {
  const db = c.env.DB;
  const row = id ? await one<{ id: string; text: string; by: string | null; theme: string | null; tags: string | null; meaning: string | null; active: number }>(db, 'SELECT * FROM sentences WHERE id = ?', id) : null;
  const b = id ? BUILT_MAP.get(id) : undefined;
  if (id && !row && !b) return html(await layout(c, 'پیدا نشد', '<h1>این جمله نیست</h1>'), 404);
  const s = row ?? (b ? { id: b.id, text: b.text, by: null, theme: null, tags: null, meaning: null, active: 1 } : null);
  const tags = (s?.tags ?? '').split(',');
  const body = `<h1>${b ? 'اصلاح جمله‌ی داخلی' : s ? 'ویرایش جمله' : 'جمله‌ی تازه'}</h1>
  ${b ? `<p class="muted">متن اصلی: «${esc(b.text)}». اصلاح تو در دریافت بعدی جای این متن را در اورآی همه می‌گیرد.</p>` : ''}
  <form method="post" class="card" style="max-width:720px">${csrf(c)}
    <label class="f">متن جمله (حداکثر ۴۰۰ نویسه؛ برای شعر، مصراع‌ها را در دو خط بنویس)<textarea name="text" required maxlength="400" autofocus>${esc(s?.text ?? '')}</textarea></label>
    ${b ? '' : `<label class="f">گوینده یا منبع (اختیاری)<input type="text" name="by" maxlength="60" value="${esc(s?.by ?? '')}"></label>
    <label class="f">موضوع<select name="theme"><option value="">—</option>${Object.entries(THEMES).map(([k, v]) => `<option value="${k}"${s?.theme === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
    <div class="f">حال‌وهوا<div class="checks">${Object.entries(TAGS).map(([k, v]) => `<label><input type="checkbox" name="tags" value="${k}"${tags.includes(k) ? ' checked' : ''}> ${v}</label>`).join('')}</div></div>`}
    <label class="f">معنی به زبان ساده (اختیاری؛ زیر دکمه‌ی «؟» نشان داده می‌شود)<textarea name="meaning" maxlength="600">${esc(s?.meaning ?? '')}</textarea></label>
    ${row && !b ? `<div class="f"><div class="checks"><label><input type="radio" name="active" value="1"${row.active ? ' checked' : ''}> فعال</label><label><input type="radio" name="active" value="0"${row.active ? '' : ' checked'}> غیرفعال</label></div></div>` : ''}
    <p><button class="btn btn-accent">ذخیره</button>${s ? '' : ' <button class="btn" name="again" value="1">ذخیره و بعدی</button>'} <a class="btn" href="/admin/sentences${b ? '?tab=builtin' : ''}">انصراف</a></p>
  </form>`;
  return html(await layout(c, s ? 'ویرایش جمله' : 'جمله‌ی تازه', body));
}

async function saveSentence(c: Ctx, form: FormData, id: string | null): Promise<Response> {
  const db = c.env.DB;
  const text = String(form.get('text') ?? '').trim();
  if (!text || text.length > 400) return back(id ? `/admin/sentences/${encodeURIComponent(id)}/edit` : '/admin/sentences/new', undefined, 'متن جمله لازم است و حداکثر ۴۰۰ نویسه.');
  const by = String(form.get('by') ?? '').trim().slice(0, 60) || null;
  const theme = THEMES[String(form.get('theme'))] ? String(form.get('theme')) : null;
  const tags = form.getAll('tags').map(String).filter((t) => TAGS[t]).join(',') || null;
  const meaning = String(form.get('meaning') ?? '').trim().slice(0, 600) || null;
  const active = form.get('active') === '0' ? 0 : 1;
  const t = now();
  const b = id ? BUILT_MAP.get(id) : undefined;
  if (!id) {
    await run(db, 'INSERT INTO sentences(id, text, by, theme, tags, meaning, builtin, active, created, updated) VALUES(?,?,?,?,?,?,0,?,?,?)',
      `r-${randomHex(4)}`, text, by, theme, tags, meaning, active, t, t);
  } else if (await one(db, 'SELECT 1 AS x FROM sentences WHERE id = ?', id)) {
    await run(db, 'UPDATE sentences SET text=?, by=?, theme=?, tags=?, meaning=?, active=?, updated=? WHERE id=?', text, b ? null : by, b ? null : theme, b ? null : tags, meaning, b ? 1 : active, t, id);
  } else if (b) {
    await run(db, 'INSERT INTO sentences(id, text, meaning, builtin, active, created, updated) VALUES(?,?,?,1,1,?,?)', id, text, meaning, t, t);
  } else return back('/admin/sentences', undefined, 'این جمله نیست.');
  await bumpPackRev(db);
  if (!id && form.get('again')) return back('/admin/sentences/new', 'ذخیره شد. بعدی را بنویس.');
  return back(b ? '/admin/sentences?tab=builtin' : '/admin/sentences', id ? 'ذخیره شد.' : 'جمله اضافه شد. کاربرها در دریافت بعدی (حداکثر یک روز) می‌بینندش.');
}

async function importSentences(c: Ctx, form: FormData): Promise<Response> {
  const f = form.get('file');
  let data: unknown = null;
  try { data = f && typeof f !== 'string' ? JSON.parse(await f.text()) : null; } catch { data = null; }
  const items = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : null;
  if (!items) return back('/admin/sentences', undefined, 'فایل JSON معتبر نیست؛ آرایه‌ای از جمله‌ها یا {"items": [...]} لازم است.');
  const db = c.env.DB;
  const have = new Set((await all<{ text: string }>(db, 'SELECT text FROM sentences')).map((r) => r.text));
  const t = now();
  const stmts: D1PreparedStatement[] = [];
  for (const x0 of items.slice(0, 2000)) {
    const x = (typeof x0 === 'string' ? { text: x0 } : x0 && typeof x0 === 'object' ? x0 : {}) as Record<string, unknown>;
    const text = String(x.text ?? '').trim();
    if (!text || text.length > 400 || have.has(text)) continue;
    have.add(text);
    const tags = Array.isArray(x.tags) ? x.tags.map(String).filter((g) => TAGS[g]).join(',') : '';
    stmts.push(db.prepare('INSERT INTO sentences(id, text, by, theme, tags, meaning, builtin, active, created, updated) VALUES(?,?,?,?,?,?,0,1,?,?)')
      .bind(`r-${randomHex(4)}`, text, String(x.by ?? '').slice(0, 60) || null, THEMES[String(x.theme)] ? String(x.theme) : null, tags || null, String(x.meaning ?? '').slice(0, 600) || null, t, t));
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  await bumpPackRev(db);
  return back('/admin/sentences', `${fa(stmts.length)} جمله‌ی تازه وارد شد (تکراری‌ها رد شدند).`);
}

async function release(c: Ctx) {
  const latest = await kvGet<{ version: string; notes?: string; url?: string; at: number } | null>(c.env.DB, 'latest', null);
  const announce = await kvGet<{ id: string; text: string; link?: string; at: number } | null>(c.env.DB, 'announce', null);
  const body = `<h1>نسخه و اعلان</h1><div class="grid2">
  <form method="post" class="card">${csrf(c)}<input type="hidden" name="what" value="release"><h2>انتشار نسخه‌ی تازه‌ی افزونه</h2>
    <p class="muted">اورآی هر کسی که افزونه‌اش قدیمی‌تر باشد یک بار پیام «نسخه‌ی تازه آمد» با دکمه‌ی دریافت می‌بیند. اپ گوشی خودش به‌روز می‌شود و این را لازم ندارد.</p>
    ${latest ? `<p>الان: نسخه‌ی <b class="ltr">${esc(latest.version)}</b> · ${jdate(latest.at)}${latest.url ? ` · <a href="${esc(latest.url)}">لینک دانلود</a>` : ''}</p>` : ''}
    <label class="f">شماره‌ی نسخه (همان که در manifest.json است)<input type="text" name="version" class="ltr" placeholder="2.3.0" required pattern="\\d+(\\.\\d+){0,3}"></label>
    <label class="f">چه چیزهایی عوض شده (به زبان ساده)<textarea name="notes" maxlength="1500"></textarea></label>
    <label class="f">لینک دانلود (مثلاً صفحه‌ی Release در گیت‌هاب)<input type="url" name="url" class="ltr" placeholder="https://github.com/ParsaAminzade/Ora/releases/latest" required></label>
    <button class="btn btn-accent">ثبت نسخه</button></form>
  <form method="post" class="card">${csrf(c)}<input type="hidden" name="what" value="announce"><h2>اعلان برای همه</h2>
    <p class="muted">یک پیام کوتاه که هر کاربر یک بار در اورآ می‌بیند.</p>
    ${announce ? `<div class="flash ok">فعال: ${esc(announce.text)}${announce.link ? ` · <a href="${esc(announce.link)}">لینک</a>` : ''} <small class="faint">(${jdate(announce.at)})</small></div>` : ''}
    <label class="f">متن اعلان<textarea name="text" maxlength="400"></textarea></label>
    <label class="f">لینک (اختیاری، https)<input type="url" name="link" class="ltr" placeholder="https://…"></label>
    <button class="btn btn-accent">انتشار اعلان</button>${announce ? ' <button class="btn" name="clear" value="1">برداشتن اعلان</button>' : ''}</form></div>`;
  return html(await layout(c, 'نسخه و اعلان', body, 'نسخه‌ی تازه‌ی افزونه را در گیت‌هاب (بخش Releases) بگذار و لینکش را اینجا ثبت کن. اعلان برای خبرهای کوتاه است، مثل «جمله‌های تازه‌ی پاییزی اضافه شد».'));
}

async function saveRelease(c: Ctx, form: FormData): Promise<Response> {
  const db = c.env.DB;
  if (form.get('what') === 'release') {
    const version = String(form.get('version') ?? '').trim();
    const url = String(form.get('url') ?? '').trim();
    if (!VERSION_RE.test(version)) return back('/admin/release', undefined, 'شماره‌ی نسخه مثل 2.3.0 باشد.');
    if (!/^https:\/\/\S+$/.test(url)) return back('/admin/release', undefined, 'لینک دانلود باید با https:// شروع شود.');
    await kvSet(db, 'latest', { version, notes: String(form.get('notes') ?? '').trim().slice(0, 1500), url, at: now() });
    await bumpPackRev(db);
    return back('/admin/release', 'نسخه ثبت شد. کاربرها در دریافت بعدی خبرش را می‌بینند.');
  }
  const text = String(form.get('text') ?? '').trim().slice(0, 400);
  const link = String(form.get('link') ?? '').trim().slice(0, 300);
  if (form.get('clear') || !text) { await kvSet(db, 'announce', null); await bumpPackRev(db); return back('/admin/release', 'اعلان برداشته شد.'); }
  if (link && !/^https:\/\/\S+$/.test(link)) return back('/admin/release', undefined, 'لینک باید با https:// شروع شود.');
  await kvSet(db, 'announce', { id: randomHex(4), text, link: link || null, at: now() });
  await bumpPackRev(db);
  return back('/admin/release', 'اعلان منتشر شد؛ هر کاربر یک بار می‌بیندش.');
}

async function feedbackPage(c: Ctx) {
  const rows = await all<{ id: number; install: string | null; text: string; version: string | null; country: string | null; created: number; read: number }>(c.env.DB,
    'SELECT * FROM feedback ORDER BY read, created DESC LIMIT 300');
  const body = `<h1>پیام‌ها</h1><div class="card">${rows.length ? rows.map((f) => `<div class="fb ${f.read ? '' : 'unread'}">
    <small class="faint">${jdate(f.created, true)}${f.country ? ` · ${esc(countryName(f.country))}` : ''}${f.version ? ` · نسخه‌ی <span class="ltr">${esc(f.version)}</span>` : ''}${f.install ? ` · <a href="/admin/users/${f.install}">کاربر</a>` : ''}</small>
    <p>${esc(f.text)}</p>${postBtn(c, `/admin/feedback/${f.id}`, f.read ? 'نخوانده' : 'خوانده شد')} ${postBtn(c, `/admin/feedback/${f.id}`, 'حذف', 'btn btn-sm btn-danger', 'این پیام حذف شود؟', '<input type="hidden" name="act" value="delete">')}</div>`).join('') : empty('پیامی نیست')}</div>`;
  return html(await layout(c, 'پیام‌ها', body, 'چیزهایی که کاربرها با «به سازنده بگو» فرستاده‌اند. پیام‌های نخوانده خط طلایی دارند.'));
}

async function dataPage(c: Ctx) {
  const db = c.env.DB;
  const n = async (t: string) => (await one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${t}`))?.n ?? 0;
  const body = `<h1>داده و پشتیبان</h1>
  <div class="tiles">${(await Promise.all([['installs', 'کاربر'], ['signals', 'ردیف بازخورد/جست‌وجو'], ['feedback', 'پیام'], ['sentences', 'جمله‌ی سرور']].map(async ([t, l]) => `<div class="tile"><span>${l}</span><b>${fa(await n(t))}</b></div>`))).join('')}</div>
  <div class="card"><h2>پشتیبان کامل</h2><p class="muted">همه‌ی جدول‌ها در یک فایل JSON: کاربرها، بازخوردها، پیام‌ها، جمله‌ها، نسخه و اعلان. هر چند وقت یک بار دانلودش کن و روی سیستم خودت نگه دار.</p>
    <p><a class="btn btn-accent" href="/admin/export.json">دانلود پشتیبان کامل</a> <a class="btn" href="/admin/users.csv">فقط کاربران (CSV)</a></p></div>
  <div class="card"><h2>چه چیزی ذخیره می‌شود</h2><ul class="lines">
    <li>شناسه‌ی تصادفی هر مرورگر/گوشی، نسخه‌ی اورآ، تاریخ پذیرش قوانین، کشور (از کلادفلر). <b>IP ذخیره نمی‌شود.</b></li>
    <li>جمله‌هایی که دوست داشت، نگه داشت، «کمتر» زد یا نفهمید (فقط شناسه‌ی جمله؛ جمله‌های خود کاربر نه).</li>
    <li>دسته‌ی جست‌وجوها و تعدادشان در روز (متن جست‌وجو هرگز).</li>
    <li>پروفایل: نام، علایق، ایمیل؛ هر چه خودش نوشته.</li>
    <li>پیام‌هایی که با «به سازنده بگو» فرستاده.</li></ul>
    <p class="faint">کاربر هر وقت در تنظیمات اشتراک را خاموش کند یا «پاک کردن داده‌ها» را بزند، ردیفش همان لحظه از اینجا پاک می‌شود.</p></div>`;
  return html(await layout(c, 'داده و پشتیبان', body));
}

async function exportAll(c: Ctx) {
  const db = c.env.DB;
  const tables = ['installs', 'signals', 'feedback', 'sentences', 'hidden', 'ext_lines'];
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), legal_version: LEGAL.version };
  for (const t of tables) out[t] = await all(db, `SELECT * FROM ${t}`);
  out.latest = await kvGet(db, 'latest', null);
  out.announce = await kvGet(db, 'announce', null);
  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename=ora-backup-${new Date().toISOString().slice(0, 10)}.json` } });
}

async function docs(c: Ctx) {
  const origin = c.url.origin;
  const body = `<h1>راهنمای پنل و سیستم اورآ</h1>
  <div class="card docs">
  <h2>اجزای سیستم</h2><ul class="lines">
    <li><b>افزونه‌ی کروم</b>: صفحه‌ی تب جدید. همه‌چیز روی خود مرورگر کار می‌کند و فقط اگر کاربر قبول کرده باشد، داده‌ها را به این سرور می‌فرستد.</li>
    <li><b>اپ گوشی</b>: <a href="/app/">${esc(origin)}/app/</a>. همان اورآ برای گوشی که با «Add to Home screen» نصب می‌شود و خودش به‌روز می‌شود. یک نسخه هم روی GitHub Pages هست.</li>
    <li><b>این سرور</b>: یک Cloudflare Worker با پایگاه داده‌ی D1. رایگان است، در ایران فیلتر نیست و تمدید ماهانه ندارد.</li>
    <li><b>گیت‌هاب</b>: مخزن <a href="https://github.com/ParsaAminzade/Ora">ParsaAminzade/Ora</a>. کد سرور در پوشه‌ی <code>server/</code> و اپ گوشی در ریشه‌ی آن است. هر تغییری که در گیت‌هاب ثبت شود، کلادفلر خودکار روی سرور می‌برد.</li></ul>
  <h2>جریان داده</h2><ol class="lines">
    <li>کاربر بار اول صفحه‌ی قوانین را می‌بیند و «قبول دارم» یا «ادامه بدون ارسال» را می‌زند.</li>
    <li>اگر قبول کرده باشد، اورآ روزی یک بار (و بعد از هر تغییر پروفایل) یک بسته به <code>/api/sync</code> می‌فرستد.</li>
    <li>سرور کشور را از کلادفلر می‌گیرد، IP را نگه نمی‌دارد، ورودی‌ها را بررسی و ذخیره می‌کند.</li>
    <li>اگر کاربر اشتراک را خاموش کند یا «پاک کردن داده‌ها» را بزند، ردیفش کامل پاک می‌شود.</li></ol>
  <h2>API</h2><table><tbody>
    <tr><td class="ltr"><code>GET /api/pack</code></td><td>جمله‌های تازه، اصلاح جمله‌ها، جمله‌های پنهان، آخرین نسخه، اعلان. بدون داده‌ی کاربر.</td></tr>
    <tr><td class="ltr"><code>GET /api/legal</code></td><td>متن فعلی قوانین (نسخه‌ی ${fa(LEGAL.version)}).</td></tr>
    <tr><td class="ltr"><code>POST /api/sync</code></td><td>داده‌های کاربری که قبول کرده. حداکثر ۶۴ کیلوبایت؛ هر ۳۰ ثانیه یک بار برای هر کاربر.</td></tr>
    <tr><td class="ltr"><code>POST /api/feedback</code></td><td>پیام «به سازنده بگو».</td></tr>
    <tr><td class="ltr"><code>POST /api/delete</code></td><td>پاک کردن همه‌ی داده‌های یک کاربر.</td></tr></tbody></table>
  <h2>کارهای معمول</h2><ul class="lines">
    <li><b>جمله‌ی تازه</b>: جمله‌ها، بعد «+ جمله‌ی تازه». حداکثر تا یک روز به همه می‌رسد.</li>
    <li><b>نسخه‌ی تازه‌ی افزونه</b>: فایل zip را در گیت‌هاب، بخش Releases، بگذار؛ بعد لینکش را در «نسخه و اعلان» ثبت کن.</li>
    <li><b>پشتیبان</b>: «داده و پشتیبان»، بعد «دانلود پشتیبان کامل».</li>
    <li><b>تغییر رمز پنل</b>: در کلادفلر: Workers، بعد ora، بعد Settings، بعد Variables and Secrets، بعد <code>ADMIN_PASSWORD</code>. با عوض شدن رمز، همه‌ی ورودها باطل می‌شوند.</li>
    <li><b>دیدن خطاها</b>: در کلادفلر: Workers، بعد ora، بعد Logs.</li></ul>
  <h2>سقف‌های رایگان کلادفلر</h2><ul class="lines">
    <li>۱۰۰٬۰۰۰ درخواست در روز برای Worker. هر کاربر روزانه چند درخواست کوچک می‌فرستد.</li>
    <li>D1: ۵ گیگابایت فضا، ۵ میلیون خواندن و ۱۰۰ هزار نوشتن در روز.</li>
    <li>اگر روزی به سقف رسید، پلن پولی کلادفلر از حدود ۵ دلار در ماه شروع می‌شود.</li></ul>
  </div>`;
  return html(await layout(c, 'راهنما', body));
}

function loginPage(error?: string, ready = true) {
  return html(page('ورود · مدیریت اورآ', `<div class="login"><h1>مدیریت اورآ</h1>${error ? `<div class="flash err">${esc(error)}</div>` : ''}
  ${ready ? `<form method="post" class="card"><label class="f">رمز<input type="password" name="password" autocomplete="current-password" autofocus required></label><button class="btn btn-accent">ورود</button></form>`
    : `<div class="card"><p>رمز پنل هنوز تعریف نشده.</p><p class="muted">در کلادفلر: Workers، بعد <b>ora</b>، بعد Settings، بعد Variables and Secrets، بعد Add. نوع را Secret بگذار، نام را <code>ADMIN_PASSWORD</code>، و مقدار را رمزی با دست‌کم ۱۰ نویسه. بعد Deploy را بزن.</p></div>`}</div>`), error ? 401 : 200);
}

// ---------- router ----------
export async function handleAdmin(req: Request, env: Env, url: URL): Promise<Response> {
  const p = url.pathname.replace(/\/+$/, '') || '/admin';
  if (p === '/admin/login') {
    if (req.method === 'POST') {
      const f = await req.formData();
      const r = await login(env, String(f.get('password') ?? ''));
      return r.cookie ? redirect('/admin', { 'Set-Cookie': r.cookie }) : loginPage(r.error, passwordReady(env));
    }
    return loginPage(undefined, passwordReady(env));
  }
  const s = await session(req, env);
  if (!s) return redirect('/admin/login');
  const c: Ctx = { req, env, url, s };
  let form: FormData | null = null;
  if (req.method === 'POST') {
    form = await req.formData();
    if (!(await checkCsrf(s, form))) return html(page('خطا', '<div class="login"><div class="flash err">فرم منقضی شده؛ صفحه را دوباره باز کن.</div></div>'), 400);
  }
  if (p === '/admin/logout' && form) return redirect('/admin/login', { 'Set-Cookie': logoutCookie });
  if (p === '/admin') return dashboard(c);
  if (p === '/admin/users') return users(c);
  if (p === '/admin/users.csv') return usersCsv(c);
  let m = p.match(/^\/admin\/users\/([a-z0-9]{20,40})(\.json|\/delete)?$/);
  if (m) {
    if (m[2] === '/delete' && form) { await eraseInstall(env.DB, m[1]); return back('/admin/users', 'همه‌ی داده‌های این کاربر پاک شد.'); }
    if (m[2] === '.json') {
      const u = await one(env.DB, 'SELECT * FROM installs WHERE id = ?', m[1]);
      if (!u) return json({ error: 404 }, 404);
      return json({ install: u, signals: await all(env.DB, 'SELECT * FROM signals WHERE install = ?', m[1]), feedback: await all(env.DB, 'SELECT * FROM feedback WHERE install = ?', m[1]) });
    }
    return user(c, m[1]);
  }
  if (p === '/admin/sentences') return sentences(c);
  if (p === '/admin/sentences/export.json') {
    const rows = await all<{ text: string; by: string | null; theme: string | null; tags: string | null; meaning: string | null }>(env.DB, 'SELECT * FROM sentences WHERE builtin = 0');
    const items = rows.map((r) => Object.fromEntries(Object.entries({ text: r.text, by: r.by, theme: r.theme, tags: r.tags ? r.tags.split(',') : null, meaning: r.meaning }).filter(([, v]) => v)));
    return new Response(JSON.stringify({ name: 'Ora server', items }, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename=ora-sentences.json' } });
  }
  if (p === '/admin/sentences/new') return form ? saveSentence(c, form, null) : sentenceForm(c, null);
  if (p === '/admin/sentences/import' && form) return importSentences(c, form);
  m = p.match(/^\/admin\/sentences\/([^/]{1,80})\/(edit|delete|toggle)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (m[2] === 'edit') return form ? saveSentence(c, form, id) : sentenceForm(c, id);
    if (form && m[2] === 'delete') {
      await run(env.DB, 'DELETE FROM sentences WHERE id = ?', id); await bumpPackRev(env.DB);
      return BUILT_MAP.has(id) ? back('/admin/sentences?tab=builtin', 'متن اصلی برگشت.') : back('/admin/sentences', 'جمله حذف شد.');
    }
    if (form && m[2] === 'toggle') { await run(env.DB, 'UPDATE sentences SET active = 1 - active, updated = ? WHERE id = ? AND builtin = 0', now(), id); await bumpPackRev(env.DB); return back('/admin/sentences', 'تغییر کرد.'); }
  }
  m = p.match(/^\/admin\/builtin\/([^/]{1,80})\/hide$/);
  if (m && form) {
    const id = decodeURIComponent(m[1]);
    if (!BUILT_MAP.has(id)) return back('/admin/sentences?tab=builtin', undefined, 'این جمله نیست.');
    if (form.get('undo')) await run(env.DB, 'DELETE FROM hidden WHERE id = ?', id);
    else await run(env.DB, 'INSERT OR IGNORE INTO hidden(id, at) VALUES(?, ?)', id, now());
    await bumpPackRev(env.DB);
    return back('/admin/sentences?tab=builtin', form.get('undo') ? 'دوباره نمایش داده می‌شود.' : 'پنهان شد.');
  }
  if (p === '/admin/release') return form ? saveRelease(c, form) : release(c);
  if (p === '/admin/feedback') return feedbackPage(c);
  m = p.match(/^\/admin\/feedback\/(\d+)$/);
  if (m && form) {
    if (form.get('act') === 'delete') await run(env.DB, 'DELETE FROM feedback WHERE id = ?', +m[1]);
    else await run(env.DB, 'UPDATE feedback SET read = 1 - read WHERE id = ?', +m[1]);
    return redirect('/admin/feedback');
  }
  if (p === '/admin/data') return dataPage(c);
  if (p === '/admin/export.json') return exportAll(c);
  if (p === '/admin/docs') return docs(c);
  return html(await layout(c, 'پیدا نشد', '<h1>این صفحه نیست</h1>'), 404);
}
