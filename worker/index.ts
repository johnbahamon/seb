/**
 * Cloudflare Worker for the spare-parts catalog.
 *
 * Three kinds of traffic, and the split is what keeps this on the free plan:
 *
 *  - the app shell, bundles and despiece plates are static assets, served from
 *    the edge without invoking this script at all — free and unmetered;
 *  - `/data/catalog.json` and `/img/*` are public but dynamic, so an edit made
 *    in /admin shows up on the next refresh with no publish step;
 *  - `/api/*` and `/admin` are fronted by Cloudflare Access, so every write is
 *    behind a login while the catalog stays open to everyone.
 *
 * The site deliberately does not use SSR: that would turn every page view into
 * a Worker invocation, metered and capped at 10 ms of CPU.
 */
import { routes } from './routes';
import { serveImage, serveSnapshot } from './snapshot';
import type { Env } from './env';

export type { Env };

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const { pathname } = new URL(request.url);

    if (pathname === '/data/catalog.json') {
      return serveSnapshot(request, env);
    }
    if (pathname.startsWith('/img/')) {
      return serveImage(pathname, env);
    }
    if (pathname.startsWith('/api/')) {
      return routes.fetch(request, env, ctx);
    }
    // Defensive: run_worker_first should mean nothing else reaches us.
    return env.ASSETS.fetch(request);
  },
};
