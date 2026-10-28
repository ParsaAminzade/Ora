// Builds the phone/web app into dist-web: `vite build --mode web`, a PWA head for index.html,
// and app-sw.js with the exact list of files to keep offline.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';

const out = 'dist-web';
execSync('npx tsc --noEmit && npx vite build --mode web', { stdio: 'inherit' });

const head = `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>اورآ</title>
  <link rel="icon" type="image/png" href="./icons/app-192.png" />
  <link rel="manifest" href="./app.webmanifest" />
  <meta name="theme-color" content="#0B0D14" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="اورآ" />
  <link rel="apple-touch-icon" href="./icons/apple-180.png" />`;
let html = readFileSync(join(out, 'index.html'), 'utf8');
html = html.replace(/<meta charset="utf-8">[\s\S]*?<link rel="icon"[^>]*>/, head);
writeFileSync(join(out, 'index.html'), html);

// The browsers we serve all read woff2; the .woff/.ttf fallbacks only make the app heavier.
const walk0 = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk0(join(d, f)) : [join(d, f)]));
for (const f of walk0(out)) if (/\.(woff|ttf)$/.test(f)) unlinkSync(f);
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
// Fonts are cached the first time they are used; everything else is cached at install.
const files = walk(out).map((f) => relative(out, f).replace(/\\/g, '/'))
  .filter((f) => f !== 'app-sw.js' && !/\.(woff2?|ttf)$/.test(f)).sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(out, f)));
const list = ['./', ...files.map((f) => `./${f}`)];
const sw = readFileSync('scripts/app-sw.template.js', 'utf8')
  .replace("'__VERSION__'", `'${hash.digest('hex').slice(0, 12)}'`)
  .replace('__FILES__', JSON.stringify(list));
writeFileSync(join(out, 'app-sw.js'), sw);
console.log(`dist-web: ${list.length} files cached offline`);
