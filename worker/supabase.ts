/**
 * Thin PostgREST client.
 *
 * Deliberately not `supabase-js`: the Worker only needs REST reads/writes and a
 * Storage upload, and hand-rolling those keeps the bundle small and the
 * dependency surface at zero. All calls carry the service_role key, which
 * bypasses RLS — so this module must never be reachable from the browser.
 */

export interface SupabaseConfig {
  readonly url: string;
  readonly serviceRoleKey: string;
}

export class SupabaseError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`supabase ${status}: ${detail}`);
  }
}

export class Supabase {
  constructor(private readonly config: SupabaseConfig) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const key = this.config.serviceRoleKey;
    // Legacy service_role keys are JWTs and want both headers. The newer
    // `sb_secret_...` keys are not JWTs: PostgREST tries to parse the bearer
    // token and rejects the request, so they travel in `apikey` alone.
    const isJwt = key.startsWith('eyJ');
    return {
      apikey: key,
      ...(isJwt ? { authorization: `Bearer ${key}` } : {}),
      ...extra,
    };
  }

  /** Key shape only — never the value. Used by /api/health to diagnose 401s. */
  describeKey(): { format: string; length: number } {
    const key = this.config.serviceRoleKey ?? '';
    const format = key.startsWith('eyJ')
      ? 'jwt'
      : key.startsWith('sb_secret_')
        ? 'sb_secret'
        : key.startsWith('sb_publishable_')
          ? 'sb_publishable (WRONG: this is the public key)'
          : 'unknown';
    return { format, length: key.length };
  }

  /** GET against PostgREST. `query` is the raw query string, e.g. `select=*&limit=5`. */
  async select<T>(table: string, query = ''): Promise<T[]> {
    const response = await fetch(`${this.config.url}/rest/v1/${table}?${query}`, {
      headers: this.headers({ accept: 'application/json' }),
    });
    if (!response.ok) {
      throw new SupabaseError(response.status, await response.text());
    }
    return response.json();
  }

  /** Exact row count, via the Content-Range header rather than fetching rows. */
  async count(relation: string): Promise<number | null> {
    const response = await fetch(`${this.config.url}/rest/v1/${relation}?select=*&limit=0`, {
      headers: this.headers({ prefer: 'count=exact' }),
    });
    if (!response.ok) {
      throw new SupabaseError(response.status, await response.text());
    }
    const range = response.headers.get('content-range');
    const total = range?.split('/')[1];
    return total && total !== '*' ? Number(total) : null;
  }

  /** Upsert rows, returning the stored representation. */
  async upsert<T>(table: string, rows: readonly unknown[], onConflict?: string): Promise<T[]> {
    const conflict = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
    const response = await fetch(`${this.config.url}/rest/v1/${table}${conflict}`, {
      method: 'POST',
      headers: this.headers({
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=representation',
      }),
      body: JSON.stringify(rows),
    });
    if (!response.ok) {
      throw new SupabaseError(response.status, await response.text());
    }
    return response.json();
  }

  async delete(table: string, query: string): Promise<void> {
    const response = await fetch(`${this.config.url}/rest/v1/${table}?${query}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new SupabaseError(response.status, await response.text());
    }
  }

  /** Uploads a file to Storage and returns its object key. */
  async upload(bucket: string, key: string, body: ArrayBuffer, contentType: string): Promise<string> {
    const response = await fetch(
      `${this.config.url}/storage/v1/object/${bucket}/${key}`,
      {
        method: 'POST',
        headers: this.headers({ 'content-type': contentType, 'x-upsert': 'true' }),
        body,
      },
    );
    if (!response.ok) {
      throw new SupabaseError(response.status, await response.text());
    }
    return key;
  }
}
