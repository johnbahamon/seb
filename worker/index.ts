/**
 * Cloudflare Worker for the spare-parts catalog.
 *
 * Only `/api/*` reaches this script (see `run_worker_first` in wrangler.jsonc);
 * every other request is served straight from static assets, which is free and
 * never invokes the Worker. That split is what keeps the site on the free plan,
 * and it is also why the site does not use SSR.
 *
 * `/api/*` and `/admin` are fronted by Cloudflare Access, so the public
 * catalog stays open while every write is behind a login.
 */
import { routes } from './routes';
import type { Env } from './env';

export type { Env };

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const { pathname } = new URL(request.url);
    // Defensive: run_worker_first should mean we only ever see /api/*.
    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }
    return routes.fetch(request, env, ctx);
  },
};
