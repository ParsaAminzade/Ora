// Markdown + LaTeX rendering for notes. Loaded lazily so the new tab stays fast.
// Math is pulled out first ($…$ inline, $$…$$ display), Markdown is rendered, then the math is
// put back as KaTeX HTML, and the result is sanitized.
import { marked } from 'marked';
import katex from 'katex';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(src: string): string {
  const math: string[] = [];
  const stash = (tex: string, display: boolean) => {
    math.push(katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'htmlAndMathml' }));
    return `@@MATH${math.length - 1}@@`;
  };
  const text = src
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => stash(tex.trim(), true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) => stash(tex.trim(), true))
    .replace(/\\\((.+?)\\\)/g, (_, tex: string) => stash(tex, false))
    .replace(/(^|[^\\$])\$([^\s$](?:[^$\n]*?[^\s$])?)\$/g, (_, pre: string, tex: string) => pre + stash(tex, false));
  let html = marked.parse(text, { async: false }) as string;
  html = html.replace(/@@MATH(\d+)@@/g, (_, i: string) => math[Number(i)]);
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true, mathMl: true, svg: true } });
}
