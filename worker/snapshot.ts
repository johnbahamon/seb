/**
 * The published catalog, kept as a single object in R2.
 *
 * Why a snapshot instead of querying Supabase per visit: the free Supabase plan
 * allows 5 GB of egress a month, and this catalog is 1.8 MB — about 2 800 page
 * loads before the site goes dark mid-month. R2 egress is free and unmetered,
 * so the public read never touches Supabase at all.
 *
 * Why Postgres assembles it: building 1.8 MB of JSON from ~8 000 rows does not
 * fit in the 10 ms of CPU the free Workers plan allows. `catalog_json()` does
 * that work in the database, and this module only pipes bytes — the body is
 * streamed from one fetch straight into R2 and is never parsed.
 */
import type { Env } from './env';

export const SNAPSHOT_KEY = 'catalog/current.json';

/** Rebuilds the published catalog. Called after every admin write. */
export async function refreshSnapshot(env: Env): Promise<void> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/catalog_json`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      ...(env.SUPABASE_SERVICE_ROLE_KEY.startsWith('eyJ')
        ? { authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
        : {}),
      'content-type': 'application/json',
    },
    body: '{}',
  });
  if (!response.ok || !response.body) {
    throw new Error(`no se pudo regenerar el catalogo: ${response.status} ${await response.text()}`);
  }
  // Streamed, not parsed: that is what keeps this inside the CPU budget.
  await env.IMAGES.put(SNAPSHOT_KEY, response.body, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

/**
 * Serves the published catalog.
 *
 * Falls back to the copy shipped with the build when no snapshot exists yet, so
 * the public site can never be taken down by a missing or half-written object.
 */
export async function serveSnapshot(request: Request, env: Env): Promise<Response> {
  const object = await env.IMAGES.get(SNAPSHOT_KEY);
  if (!object) {
    return env.ASSETS.fetch(request);
  }
  const etag = `"${object.etag}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }
  return new Response(object.body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      etag,
      // Revalidate every load: an edit has to show up on refresh, and a 304 is
      // cheap. Without must-revalidate a stale catalog could sit in a browser
      // for as long as its heuristic cache decided.
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}

/** Serves an uploaded image straight from R2, with no authentication. */
export async function serveImage(pathname: string, env: Env): Promise<Response> {
  const key = decodeURIComponent(pathname.slice('/img/'.length));
  if (!key || key.includes('..')) {
    return new Response('not found', { status: 404 });
  }
  const object = await env.IMAGES.get(key);
  if (!object) {
    return new Response('not found', { status: 404 });
  }
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      etag: `"${object.etag}"`,
      // Keys are content addressed, so a given key never changes contents.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
