/**
 * Admin API. Everything here lives under `/api`, which Cloudflare Access gates:
 * the public site never calls it — it reads the static catalog.json — so the
 * whole surface can be treated as privileged.
 */
import { Hono } from 'hono';

import { Supabase } from './supabase';
import type { Env } from './env';

/** Access puts the authenticated identity in this header once it fronts the app. */
function editorOf(request: Request): string {
  return request.headers.get('cf-access-authenticated-user-email') ?? 'anonimo';
}

function db(env: Env): Supabase {
  return new Supabase({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
}

/** PostgREST filters travel in the query string, so values must be escaped. */
const eq = (value: string) => `eq.${encodeURIComponent(value)}`;

export const routes = new Hono<{ Bindings: Env }>().basePath('/api');

routes.get('/health', async (c) => {
  const supabase = db(c.env);
  if (!c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return c.json({ ok: false, reason: 'missing_service_role_key' }, 503);
  }
  try {
    await supabase.select('family', 'select=id&limit=1');
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ ok: false, reason: String(error).slice(0, 200), key: supabase.describeKey() }, 502);
  }
});

routes.get('/families', async (c) =>
  c.json(await db(c.env).select('family', 'select=id,name&order=sort_order,name')),
);

/**
 * Paged model list.
 *
 * `order` is not cosmetic: PostgREST gives no stable ordering without it, so
 * limit/offset paging silently repeats and drops rows.
 */
routes.get('/models', async (c) => {
  const { search = '', family = '', limit = '50', offset = '0' } = c.req.query();
  const filters = [`select=*`, `order=name`, `limit=${Number(limit) || 50}`, `offset=${Number(offset) || 0}`];
  if (search) {
    filters.push(`or=(name.ilike.*${encodeURIComponent(search)}*,ref.ilike.*${encodeURIComponent(search)}*)`);
  }
  if (family) {
    filters.push(`family=${eq(family)}`);
  }
  return c.json(await db(c.env).select('v_model', filters.join('&')));
});

routes.get('/parts', async (c) => {
  const { search = '', family = '', limit = '50', offset = '0' } = c.req.query();
  const filters = [`select=*`, `order=code`, `limit=${Number(limit) || 50}`, `offset=${Number(offset) || 0}`];
  if (search) {
    const term = encodeURIComponent(search);
    filters.push(`or=(code.ilike.*${term}*,description.ilike.*${term}*,cmmf.ilike.*${term}*)`);
  }
  if (family) {
    filters.push(`family=${eq(family)}`);
  }
  return c.json(await db(c.env).select('v_part', filters.join('&')));
});

interface FamilyRow {
  readonly id: number;
  readonly name: string;
}

async function familyIdOf(supabase: Supabase, name: string | undefined): Promise<number | null> {
  if (!name) {
    return null;
  }
  const [row] = await supabase.select<FamilyRow>('family', `select=id&name=${eq(name)}`);
  if (!row) {
    throw new Error(`familia desconocida: ${name}`);
  }
  return row.id;
}

/**
 * Edits a model's title and/or category.
 *
 * The pipeline's current values are snapshotted into `base_*` on every save.
 * That is what lets v_drift tell "the pipeline moved since you decided" apart
 * from "you and the pipeline agree" — and re-saving is therefore also how a
 * reviewed drift clears itself.
 */
routes.patch('/models/:id', async (c) => {
  const supabase = db(c.env);
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; family?: string }>();

  const [base] = await supabase.select<{ name: string; family_id: number | null }>(
    'model',
    `select=name,family_id&id=${eq(id)}`,
  );
  if (!base) {
    return c.json({ error: 'modelo no encontrado' }, 404);
  }

  const [stored] = await supabase.upsert<Record<string, unknown>>(
    'model_override',
    [
      {
        model_id: id,
        name: body.name ?? null,
        family_id: await familyIdOf(supabase, body.family),
        base_name: base.name,
        base_family_id: base.family_id,
        edited_by: editorOf(c.req.raw),
        edited_at: new Date().toISOString(),
      },
    ],
    'model_id',
  );
  return c.json(stored);
});

routes.patch('/parts/:code', async (c) => {
  const supabase = db(c.env);
  const code = c.req.param('code');
  const body = await c.req.json<{ description?: string; family?: string }>();

  const [base] = await supabase.select<{ description: string; family_id: number | null }>(
    'part',
    `select=description,family_id&code=${eq(code)}`,
  );
  if (!base) {
    return c.json({ error: 'repuesto no encontrado' }, 404);
  }

  const [stored] = await supabase.upsert<Record<string, unknown>>(
    'part_override',
    [
      {
        code,
        description: body.description ?? null,
        family_id: await familyIdOf(supabase, body.family),
        base_description: base.description,
        base_family_id: base.family_id,
        edited_by: editorOf(c.req.raw),
        edited_at: new Date().toISOString(),
      },
    ],
    'code',
  );
  return c.json(stored);
});

/** Removes a manual edit, so the pipeline's value takes over again. */
routes.delete('/models/:id/override', async (c) => {
  await db(c.env).delete('model_override', `model_id=${eq(c.req.param('id'))}`);
  return c.body(null, 204);
});

routes.delete('/parts/:code/override', async (c) => {
  await db(c.env).delete('part_override', `code=${eq(c.req.param('code'))}`);
  return c.body(null, 204);
});

/** The review queue: where a human edit and the pipeline disagree. */
routes.get('/drift', async (c) =>
  c.json(await db(c.env).select('v_drift', 'select=*&order=edited_at.desc')),
);

const IMAGE_TYPES: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** Uploads one image to R2 and records it against a model or a part. */
routes.post('/images', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  const entityType = String(form.get('entityType') ?? '');
  const entityId = String(form.get('entityId') ?? '');
  const altText = String(form.get('altText') ?? '');

  if (!(file instanceof File)) {
    return c.json({ error: 'falta el archivo' }, 400);
  }
  if (entityType !== 'model' && entityType !== 'part') {
    return c.json({ error: 'entityType debe ser model o part' }, 400);
  }
  const extension = IMAGE_TYPES[file.type];
  if (!extension) {
    return c.json({ error: `tipo no soportado: ${file.type}` }, 415);
  }

  const bytes = await file.arrayBuffer();
  // Content-addressed: re-uploading the same bytes reuses the key instead of
  // littering the bucket, and the unique index on (bucket, storage_key) turns
  // the second upload into an update.
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const key = `${entityType}/${entityId}/${sha256.slice(0, 16)}.${extension}`;

  await c.env.IMAGES.put(key, bytes, { httpMetadata: { contentType: file.type } });

  const [stored] = await db(c.env).upsert<Record<string, unknown>>(
    'image',
    [
      {
        entity_type: entityType,
        entity_id: entityId,
        bucket: 'groupe-seb-images',
        storage_key: key,
        alt_text: altText,
        sha256,
        uploaded_by: editorOf(c.req.raw),
      },
    ],
    'bucket,storage_key',
  );
  return c.json(stored, 201);
});

routes.get('/images', async (c) => {
  const { entityType = '', entityId = '' } = c.req.query();
  const filters = ['select=*'];
  if (entityType) filters.push(`entity_type=${eq(entityType)}`);
  if (entityId) filters.push(`entity_id=${eq(entityId)}`);
  return c.json(await db(c.env).select('v_image', filters.join('&')));
});

/** Serves an image out of R2 so the bucket needs no public URL of its own. */
routes.get('/images/file/*', async (c) => {
  const key = c.req.path.replace('/api/images/file/', '');
  const object = await c.env.IMAGES.get(key);
  if (!object) {
    return c.json({ error: 'no encontrada' }, 404);
  }
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
});

routes.notFound((c) => c.json({ error: 'not_found' }, 404));
