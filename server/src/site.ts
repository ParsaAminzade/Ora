// The public pages: home (phone app + extension install steps) and the full terms.
import { kvGet } from './db';
import { esc, fa, html, jdate, page, type Env } from './util';
import LEGAL from './legal.json';

const head = (link: string) => `<header><img src="/static/icon.png" alt=""><b>اورآ</b><nav>${link}</nav></header>`;

export async function home(env: Env, url: URL): Promise<Response> {
  const latest = await kvGet<{ version: string; notes?: string; url?: string; at: number } | null>(env.DB, 'latest', null);
  const body = `<div class="site">${head('<a href="/privacy">قوانین و حریم خصوصی</a>')}
  <div class="hero">
    <h1>یک صفحه‌ی تب آرام، که کمکت می‌کند روزت را بچینی</h1>
    <p>جمله‌ای روی پس‌زمینه، کارهای امروز، تقویم شمسی، برنامه‌ی روز و جمع‌بندی شب. بدون تبلیغ، و تقریباً همه‌چیز بدون اینترنت.</p>
    ${latest ? `<p>${latest.url ? `<a class="btn btn-accent" href="${esc(latest.url)}">دریافت افزونه‌ی کروم، نسخه‌ی ${fa(latest.version)}</a>` : ''}<small class="faint">&nbsp; منتشرشده ${jdate(latest.at)}</small></p>
      ${latest.notes ? `<p class="muted" style="white-space:pre-line">${esc(latest.notes)}</p>` : ''}` : ''}
  </div>
  <div class="section"><h2>روی گوشی (اندروید و آیفون)</h2>
    <p><a class="btn btn-accent" href="/app/">باز کردن اورآ برای گوشی</a></p>
    <ol class="steps">
      <li>همین صفحه را در گوشی باز کن و دکمه‌ی بالا را بزن (یا مستقیم برو به <code class="ltr">${esc(url.host)}/app/</code>).</li>
      <li>اندروید: در <b>Chrome</b> منوی سه‌نقطه، بعد «Add to Home screen» یا «Install app». آیفون: در <b>Safari</b> دکمه‌ی Share، بعد «Add to Home Screen».</li>
      <li>از این به بعد اورآ را از آیکونش باز کن؛ تمام‌صفحه است، خودش به‌روز می‌شود و بدون اینترنت هم کار می‌کند.</li>
    </ol></div>
  <div class="section"><h2>نصب در کروم کامپیوتر</h2>
    <ol class="steps">
      <li>فایل zip را دریافت کن و در یک پوشه‌ی ثابت باز کن (مثلاً Documents\\Ora). این پوشه را بعداً پاک نکن.</li>
      <li>در کروم برو به <code>chrome://extensions</code> و «Developer mode» را روشن کن.</li>
      <li>«Load unpacked» را بزن و پوشه‌ای را انتخاب کن که <code>manifest.json</code> مستقیم داخلش است.</li>
      <li>یک تب تازه باز کن. اگر کروم پرسید، «Keep it» را بزن.</li>
    </ol>
    <h3>به‌روزرسانی</h3>
    <p class="muted">وقتی نسخه‌ی تازه بیاید، خود اورآ خبرت می‌کند. فایل تازه را روی همان پوشه جایگزین کن و در <code>chrome://extensions</code> دکمه‌ی بارگذاری دوباره را بزن. داده‌هایت سر جایشان می‌مانند.</p></div>
  <div class="section"><h2>داده‌های تو</h2>
    <div class="summary"><ul>${LEGAL.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
    <p style="margin-top:12px"><a href="/privacy">متن کامل قوانین و حریم خصوصی</a></p></div>
  <footer class="site-foot">اورآ · ساخته‌ی یک نفر، برای آرام‌تر کار کردن.</footer></div>`;
  return html(page('اورآ · تب شخصی', body));
}

export function privacy(): Response {
  const body = `<div class="site legal">${head('<a href="/">صفحه‌ی اصلی</a>')}
  <h1>${esc(LEGAL.title)}</h1><p class="faint">نسخه‌ی ${fa(LEGAL.version)} · به‌روزرسانی ${fa(LEGAL.updated)}</p>
  <div class="summary"><b>به زبان ساده</b><ul>${LEGAL.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
  ${LEGAL.sections.map((s) => `<h3>${esc(s.title)}</h3><p style="white-space:pre-line">${esc(s.body)}</p>`).join('')}</div>`;
  return html(page(LEGAL.title, body));
}
