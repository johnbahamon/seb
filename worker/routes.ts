/**
 * Admin API. Everything here lives under `/api`, which Cloudflare Access gates:
 * the public site never calls it — it reads the static catalog.json — so the
 * whole surface can be treated as privileged.
 */
import { Hono } from 'hono';

import { Supabase } from './supabase';
import { isEmptyOverride, mergeOverride, type FieldSpec } from './overrides';
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

/**
 * Escapes a term for a PostgREST `ilike` inside an `or=(...)` logic tree.
 *
 * Commas and parentheses are the tree's own syntax, so an unescaped one both
 * breaks the query and lets a caller reshape the filter. Doubling the quotes
 * and wrapping the value keeps it a literal.
 */
function likeLiteral(term: string): string {
  return `"*${term.replace(/["\\]/g, '\\$&')}*"`;
}

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

interface PageQuery {
  readonly filters: string;
  readonly limit: number;
  readonly offset: number;
}

/**
 * `order` is not cosmetic: PostgREST gives no stable ordering without it, so
 * limit/offset paging silently repeats and drops rows.
 */
function pageQuery(
  raw: Record<string, string>,
  orderBy: string,
  searchColumns: readonly string[],
): PageQuery {
  const limit = Math.min(Math.max(Number(raw['limit']) || 50, 1), 200);
  const offset = Math.max(Number(raw['offset']) || 0, 0);
  const filters = [`select=*`, `order=${orderBy}`, `limit=${limit}`, `offset=${offset}`];
  if (raw['search']) {
    const literal = likeLiteral(raw['search']);
    filters.push(`or=(${searchColumns.map((column) => `${column}.ilike.${literal}`).join(',')})`);
  }
  if (raw['family']) {
    filters.push(`family=${eq(raw['family'])}`);
  }
  return { filters: filters.join('&'), limit, offset };
}

/** Rows plus the grand total, so the UI can page instead of pretending 100 is all. */
async function page(supabase: Supabase, relation: string, query: PageQuery) {
  const [rows, total] = await Promise.all([
    supabase.select(relation, query.filters),
    supabase.count(relation, query.filters.replace(/&?(limit|offset)=\d+/g, '')),
  ]);
  return { rows, total, limit: query.limit, offset: query.offset };
}

routes.get('/models', async (c) =>
  c.json(await page(db(c.env), 'v_model', pageQuery(c.req.query(), 'name', ['name', 'ref']))),
);

routes.get('/parts', async (c) =>
  c.json(
    await page(db(c.env), 'v_part', pageQuery(c.req.query(), 'code', ['code', 'description', 'cmmf'])),
  ),
);

async function familyIdOf(supabase: Supabase, name: unknown): Promise<number | null> {
  if (name === null || name === undefined || name === '') {
    return null;
  }
  const [row] = await supabase.select<{ id: number }>('family', `select=id&name=${eq(String(name))}`);
  if (!row) {
    throw new Error(`familia desconocida: ${String(name)}`);
  }
  return row.id;
}

const MODEL_FIELDS: Record<string, FieldSpec> = {
  name: { column: 'name', baseColumn: 'base_name', sourceColumn: 'name' },
  family: { column: 'family_id', baseColumn: 'base_family_id', sourceColumn: 'family_id' },
};

const PART_FIELDS: Record<string, FieldSpec> = {
  description: { column: 'description', baseColumn: 'base_description', sourceColumn: 'description' },
  family: { column: 'family_id', baseColumn: 'base_family_id', sourceColumn: 'family_id' },
};

/**
 * Applies a partial edit.
 *
 * Only the keys present in the body are touched; everything else on the
 * override survives untouched. When the last value is cleared the row is
 * deleted outright, so the pipeline takes over again.
 */
async function patchOverride(
  supabase: Supabase,
  options: {
    table: string;
    baseTable: string;
    keyColumn: string;
    keyValue: string;
    fields: Record<string, FieldSpec>;
    baseSelect: string;
    patch: Record<string, unknown>;
    editor: string;
  },
) {
  const { table, baseTable, keyColumn, keyValue, fields, baseSelect, patch, editor } = options;

  const [base] = await supabase.select<Record<string, unknown>>(
    baseTable,
    `select=${baseSelect}&${keyColumn}=${eq(keyValue)}`,
  );
  if (!base) {
    return null;
  }
  const [existing] = await supabase.select<Record<string, unknown>>(
    table,
    `select=*&${keyColumn}=${eq(keyValue)}`,
  );

  // Family arrives as a name and is stored as an id.
  const resolved: Record<string, unknown> = { ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, 'family')) {
    resolved['family'] = await familyIdOf(supabase, patch['family']);
  }

  const row = mergeOverride(
    { [keyColumn]: keyValue },
    fields,
    resolved,
    existing,
    base,
    editor,
    new Date().toISOString(),
  );

  if (isEmptyOverride(row, fields)) {
    await supabase.delete(table, `${keyColumn}=${eq(keyValue)}`);
    return { cleared: true };
  }
  const [stored] = await supabase.upsert<Record<string, unknown>>(table, [row], keyColumn);
  return stored;
}

routes.patch('/models/:id', async (c) => {
  const result = await patchOverride(db(c.env), {
    table: 'model_override',
    baseTable: 'model',
    keyColumn: 'model_id',
    keyValue: c.req.param('id'),
    fields: MODEL_FIELDS,
    baseSelect: 'name,family_id',
    patch: await c.req.json<Record<string, unknown>>(),
    editor: editorOf(c.req.raw),
  });
  return result ? c.json(result) : c.json({ error: 'modelo no encontrado' }, 404);
});

routes.patch('/parts/:code', async (c) => {
  const result = await patchOverride(db(c.env), {
    table: 'part_override',
    baseTable: 'part',
    keyColumn: 'code',
    keyValue: c.req.param('code'),
    fields: PART_FIELDS,
    baseSelect: 'description,family_id',
    patch: await c.req.json<Record<string, unknown>>(),
    editor: editorOf(c.req.raw),
  });
  return result ? c.json(result) : c.json({ error: 'repuesto no encontrado' }, 404);
});

/** Removes every manual edit on the row, so the pipeline's values take over. */
routes.delete('/models/:id/override', async (c) => {
  await db(c.env).delete('model_override', `model_id=${eq(c.req.param('id'))}`);
  return c.body(null, 204);
});

routes.delete('/parts/:code/override', async (c) => {
  await db(c.env).delete('part_override', `code=${eq(c.req.param('code'))}`);
  return c.body(null, 204);
});

routes.get('/drift', async (c) =>
  c.json(await db(c.env).select('v_drift', 'select=*&order=edited_at.desc')),
);

const IMAGE_TYPES: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

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
        // Empty means decorative, which is a deliberate choice the UI forces.
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
  const filters = ['select=*', 'order=sort_order,id'];
  if (entityType) filters.push(`entity_type=${eq(entityType)}`);
  if (entityId) filters.push(`entity_id=${eq(entityId)}`);
  return c.json(await db(c.env).select('v_image', filters.join('&')));
});

/** Soft-deletes the record and drops the object, so the bucket does not grow forever. */
routes.delete('/images/:id', async (c) => {
  const supabase = db(c.env);
  const id = c.req.param('id');
  const [row] = await supabase.select<{ storage_key: string }>(
    'image',
    `select=storage_key&id=${eq(id)}`,
  );
  if (!row) {
    return c.json({ error: 'no encontrada' }, 404);
  }
  await supabase.patch('image', `id=${eq(id)}`, { deleted_at: new Date().toISOString() });
  await c.env.IMAGES.delete(row.storage_key);
  return c.body(null, 204);
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
