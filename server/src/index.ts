// Ora server on Cloudflare Workers: API for the extension and phone app, the admin panel,
// the public pages, and the phone app itself (static files under /app/).
import { handleAdmin } from './admin';
import { handleApi } from './api';
import { ensureSchema } from './db';
import { home, privacy } from './site';
import { json, type Env } from './util';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p === '/healthz') return json({ ok: true });
    if (p === '/app') return Response.redirect(`${url.origin}/app/`, 301);
    const dynamic = p.startsWith('/api/') || p === '/admin' || p.startsWith('/admin/') || p === '/' || p === '/privacy';
    if (!dynamic) return env.ASSETS.fetch(req);
    try {
      await ensureSchema(env.DB);
      if (p.startsWith('/api/')) return await handleApi(req, env, url);
      if (p.startsWith('/admin')) return await handleAdmin(req, env, url);
      if (p === '/privacy') return privacy();
      return await home(env, url);
    } catch (e) {
      console.error('ora error', p, e);
      return p.startsWith('/api/') ? json({ ok: false, error: 'server' }, 500, { 'Access-Control-Allow-Origin': '*' }) : new Response('خطای سرور. چند لحظه بعد دوباره امتحان کن.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  },
} satisfies ExportedHandler<Env>;
