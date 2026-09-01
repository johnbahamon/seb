/**
 * Cloudflare Worker for the spare-parts catalog.
 *
 * Only `/api/*` reaches this script (see `run_worker_first` in wrangler.jsonc);
 * every other request is served straight from static assets, which is free and
 * never invokes the Worker. That split is what keeps the site on the free plan.
 */
import { Hono } from 'hono';

export interface Env {
  readonly DB: D1Database;
  readonly ASSETS: Fetcher;
}

const api = new Hono<{ Bindings: Env }>().basePath('/api');

api.get('/health', async (c) => {
  const row = await c.env.DB.prepare('select 1 as ok').first<{ ok: number }>();
  return c.json({ ok: row?.ok === 1 });
});

api.notFound((c) => c.json({ error: 'not_found' }, 404));

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const { pathname } = new URL(request.url);
    // Defensive: run_worker_first should mean we only ever see /api/*.
    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }
    return api.fetch(request, env, ctx);
  },
};
