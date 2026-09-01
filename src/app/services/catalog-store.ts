import { Service, computed } from '@angular/core';
import { httpResource } from '@angular/common/http';

import type { Catalog, Model, ModelRow, Part, SearchHit } from '../models/catalog.models';

/** Strips accents and case so `licuadora` matches `LICUADORA` and `presion` matches `presión`. */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Codes are typed off a sticker, so ignore punctuation and spacing entirely. */
function foldCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

const EMPTY_CATALOG: Catalog = {
  generatedFrom: [],
  brands: [],
  families: [],
  models: [],
  parts: {},
};

@Service()
export class CatalogStore {
  private readonly resource = httpResource<Catalog>(() => 'data/catalog.json');

  readonly isLoading = this.resource.isLoading;
  readonly error = this.resource.error;

  /** Re-fetches the catalog, for the retry button on the load-error banner. */
  reload(): void {
    this.resource.reload();
  }

  readonly catalog = computed(() => this.resource.value() ?? EMPTY_CATALOG);
  readonly models = computed(() => this.catalog().models);
  readonly brands = computed(() => this.catalog().brands);
  readonly families = computed(() => this.catalog().families);

  readonly isReady = computed(() => this.models().length > 0);

  private readonly modelsById = computed(
    () => new Map(this.models().map((model) => [model.id, model])),
  );

  /** Families with their model counts, for the home page cards. */
  readonly familySummaries = computed(() => {
    const counts = new Map<string, number>();
    for (const model of this.models()) {
      counts.set(model.family, (counts.get(model.family) ?? 0) + 1);
    }
    return this.families().map((family) => ({ family, models: counts.get(family) ?? 0 }));
  });

  /**
   * Lookup tables for the search box.
   *
   * These live in `computed()` over the catalog already in memory rather than in a
   * separate index file, which would mean a second fetch for data we hold.
   */
  private readonly index = computed(() => {
    const byCode = new Map<string, Part>();
    const byCmmf = new Map<string, Part>();
    const byEan = new Map<string, Part>();
    const parts = Object.values(this.catalog().parts);
    for (const part of parts) {
      byCode.set(foldCode(part.code), part);
      if (part.cmmf) {
        byCmmf.set(part.cmmf, part);
      }
      if (part.ean) {
        byEan.set(part.ean, part);
      }
    }
    return {
      byCode,
      byCmmf,
      byEan,
      searchable: parts.map((part) => ({
        part,
        haystack: foldText(`${part.description} ${part.code} ${part.productLine ?? ''}`),
      })),
    };
  });

  model(id: string): Model | undefined {
    return this.modelsById().get(id);
  }

  part(code: string): Part | undefined {
    return this.index().byCode.get(foldCode(code));
  }

  modelsOf(part: Part): Model[] {
    return part.models
      .map((id) => this.modelsById().get(id))
      .filter((model): model is Model => model !== undefined);
  }

  /** Joins a model's rows to the shared part catalog for rendering. */
  rowsOf(model: Model): ModelRow[] {
    const parts = this.catalog().parts;
    return model.parts.map((row) => ({
      rowId: row.rowId,
      hotspot: row.hotspot,
      part: parts[row.code] ?? {
        code: row.code,
        cmmf: null,
        description: row.code,
        ean: null,
        ue: null,
        ucMaster: null,
        family: model.family,
        productLine: null,
        brand: model.brand,
        sources: [],
        models: [model.id],
        photo: null,
        photoWidth: null,
        photoHeight: null,
        photoAlt: null,
        priceRegular: null,
        priceGross: null,
        currency: null,
      },
    }));
  }

  modelsIn(family: string, brand?: Brand | null): Model[] {
    return this.models().filter(
      (model) => model.family === family && (!brand || model.brand === brand),
    );
  }

  /**
   * Ranked search over code, CMMF, EAN and description.
   *
   * Exact identifier matches come first: at the counter the technician usually
   * arrives with a code copied off the part itself.
   */
  search(term: string, limit = 40): SearchHit[] {
    const raw = term.trim();
    if (raw.length < 2) {
      return [];
    }
    const { byCode, byCmmf, byEan, searchable } = this.index();
    const hits: SearchHit[] = [];
    const seen = new Set<string>();

    const push = (part: Part | undefined, field: SearchHit['field'], score: number) => {
      if (!part || seen.has(part.code)) {
        return;
      }
      seen.add(part.code);
      hits.push({ part, field, score });
    };

    push(byCode.get(foldCode(raw)), 'codigo', 0);
    push(byCmmf.get(raw.replace(/\D/g, '')), 'cmmf', 1);
    push(byEan.get(raw.replace(/\D/g, '')), 'ean', 2);

    const needle = foldText(raw);
    const foldedCode = foldCode(raw);
    for (const entry of searchable) {
      if (hits.length >= limit) {
        break;
      }
      if (foldedCode.length >= 3 && foldCode(entry.part.code).includes(foldedCode)) {
        push(entry.part, 'codigo', 3);
        continue;
      }
      const at = entry.haystack.indexOf(needle);
      if (at >= 0) {
        push(entry.part, 'descripcion', 4 + (at === 0 ? 0 : 1));
      }
    }

    return hits.sort((a, b) => a.score - b.score || a.part.code.localeCompare(b.part.code));
  }
}

type Brand = Catalog['brands'][number];
