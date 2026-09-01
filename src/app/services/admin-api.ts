import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Client for the `/api` admin surface.
 *
 * Same origin, so no base URL and no CORS. Authentication is not handled here:
 * Cloudflare Access sits in front of `/api` and `/admin`, so a request that
 * reaches this code has already been through a login.
 */

export interface FamilyRow {
  readonly id: number;
  readonly name: string;
}

export interface AdminModel {
  readonly id: string;
  readonly name: string;
  readonly brand: string | null;
  readonly family: string | null;
  readonly ref: string | null;
  readonly edited: boolean;
}

export interface AdminPart {
  readonly code: string;
  readonly cmmf: string | null;
  readonly description: string;
  readonly family: string | null;
  readonly brand: string | null;
  readonly price_regular: number | null;
  readonly edited: boolean;
}

export interface DriftRow {
  readonly entity: 'model' | 'part';
  readonly entity_id: string;
  readonly field: 'name' | 'description' | 'family' | 'retired';
  readonly value_at_edit: string | null;
  readonly pipeline_now: string | null;
  readonly human_value: string | null;
  readonly edited_at: string;
  readonly retired_at: string | null;
}

export interface ImageRow {
  readonly id: number;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly storage_key: string;
  readonly alt_text: string;
  readonly sort_order: number;
}

/** A page of results plus the grand total, so the UI can page honestly. */
export interface Page<T> {
  readonly rows: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface ListQuery {
  readonly search?: string;
  readonly family?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/** A partial edit: only the keys present are written. `null` clears a field. */
export type ModelPatch = { name?: string | null; family?: string | null };
export type PartPatch = { description?: string | null; family?: string | null };

function toParams(query: ListQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.search) params['search'] = query.search;
  if (query.family) params['family'] = query.family;
  params['limit'] = String(query.limit ?? 50);
  params['offset'] = String(query.offset ?? 0);
  return params;
}

/**
 * Turns a transport failure into something a person can act on.
 *
 * 403 is the expected state when an Access session expires, and it is the one
 * case where the fix is obvious — so say it, rather than showing the raw body.
 */
export function describeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403 || error.status === 401) {
      return 'Tu sesión de Cloudflare Access expiró. Recarga la página para volver a entrar.';
    }
    if (error.status === 0) {
      return 'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.';
    }
    const body: unknown = error.error;
    const detail =
      typeof body === 'string'
        ? body
        : typeof (body as { error?: unknown })?.error === 'string'
          ? (body as { error: string }).error
          : error.message;
    return `Error ${error.status}: ${String(detail).slice(0, 160)}`;
  }
  return String(error).slice(0, 160);
}

@Service()
export class AdminApi {
  private readonly http = inject(HttpClient);

  families(): Promise<FamilyRow[]> {
    return firstValueFrom(this.http.get<FamilyRow[]>('/api/families'));
  }

  models(query: ListQuery = {}): Promise<Page<AdminModel>> {
    return firstValueFrom(
      this.http.get<Page<AdminModel>>('/api/models', { params: toParams(query) }),
    );
  }

  parts(query: ListQuery = {}): Promise<Page<AdminPart>> {
    return firstValueFrom(this.http.get<Page<AdminPart>>('/api/parts', { params: toParams(query) }));
  }

  saveModel(id: string, patch: ModelPatch): Promise<unknown> {
    return firstValueFrom(this.http.patch(`/api/models/${encodeURIComponent(id)}`, patch));
  }

  savePart(code: string, patch: PartPatch): Promise<unknown> {
    return firstValueFrom(this.http.patch(`/api/parts/${encodeURIComponent(code)}`, patch));
  }

  /** Drops every manual edit on the row so the pipeline's values take over. */
  revertModel(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/models/${encodeURIComponent(id)}/override`));
  }

  revertPart(code: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/parts/${encodeURIComponent(code)}/override`));
  }

  drift(): Promise<DriftRow[]> {
    return firstValueFrom(this.http.get<DriftRow[]>('/api/drift'));
  }

  images(entityType: string, entityId: string): Promise<ImageRow[]> {
    return firstValueFrom(
      this.http.get<ImageRow[]>('/api/images', { params: { entityType, entityId } }),
    );
  }

  uploadImage(file: File, entityType: string, entityId: string, altText: string): Promise<unknown> {
    const form = new FormData();
    form.set('file', file);
    form.set('entityType', entityType);
    form.set('entityId', entityId);
    form.set('altText', altText);
    return firstValueFrom(this.http.post('/api/images', form));
  }

  deleteImage(id: number): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/images/${id}`));
  }

  /** URL the browser can render an uploaded image from. */
  imageUrl(storageKey: string): string {
    return `/api/images/file/${storageKey}`;
  }
}
