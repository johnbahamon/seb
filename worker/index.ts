/**
 * Cloudflare Worker for the spare-parts catalog.
 *
 * Only `/api/*` reaches this script (see `run_worker_first` in wrangler.jsonc);
 * every other request is served straight from static assets, which is free and
 * never invokes the Worker. That split is what keeps the site on the free plan,
 * and it is also why the site does not use SSR.
 */
import { Hono } from 'hono';

import { Supabase } from './supabase';

export interface Env {
  readonly ASSETS: Fetcher;
  readonly SUPABASE_URL: string;
  /** Set with `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`. Never in config. */
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
}

const api = new Hono<{ Bindings: Env }>().basePath('/api');

function db(env: Env): Supabase {
  return new Supabase({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
}

api.get('/health', async (c) => {
  if (!c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return c.json({ ok: false, reason: 'missing_service_role_key' }, 503);
  }
  const supabase = db(c.env);
  try {
    // A single row proves connectivity, the key, and the grants at once.
    await supabase.select('family', 'select=id&limit=1');
    return c.json({ ok: true });
  } catch (error) {
    // Key shape (never its value) turns a bare 401 into an actionable answer.
    return c.json({ ok: false, reason: String(error).slice(0, 200), key: supabase.describeKey() }, 502);
  }
});

/** Row counts per relation, so a half-applied migration is visible at a glance. */
api.get('/status', async (c) => {
  const supabase = db(c.env);
  const relations = [
    'family', 'brand', 'catalog_meta', 'model', 'part',
    'model_part', 'diagram', 'model_override', 'part_override', 'image',
    'v_model', 'v_part', 'v_image', 'v_drift',
  ];
  const counts: Record<string, number | string> = {};
  await Promise.all(
    relations.map(async (relation) => {
      try {
        counts[relation] = (await supabase.count(relation)) ?? 0;
      } catch (error) {
        counts[relation] = `ERROR: ${String(error).slice(0, 80)}`;
      }
    }),
  );
  const families = await supabase
    .select<{ name: string }>('family', 'select=name&order=sort_order')
    .catch(() => []);
  return c.json({ counts, families: families.map((f) => f.name) });
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
