/** Shape of `public/data/catalog.json`, produced by `tools/extract/run.py`. */

export type Brand =
  | 'SAMURAI'
  | 'IMUSA'
  | 'T-FAL'
  | 'KRUPS'
  | 'MOULINEX'
  | 'ROWENTA'
  | 'UMCO'
  | 'LAGOSTINA';

/** Legend dot colour per brand; used for the small badge next to a model. */
export const BRAND_COLORS: Record<Brand, string> = {
  SAMURAI: '#d22e1c',
  IMUSA: '#ff5100',
  'T-FAL': '#c8102e',
  KRUPS: '#111827',
  MOULINEX: '#6d28d9',
  ROWENTA: '#e11d48',
  UMCO: '#0057a8',
  LAGOSTINA: '#7a1f2b',
};

/** Brand badge colour, with a neutral fallback for any unmapped value. */
export function brandColor(brand: Brand | string | null | undefined): string {
  return (brand && BRAND_COLORS[brand as Brand]) || '#64748b';
}

/** Which source document a field came from, for provenance in the UI. */
export type SourceId = '2023' | '2026' | '2022' | 'xls' | 'api' | 'precios';

export interface Diagram {
  readonly image: string;
  readonly width: number;
  readonly height: number;
  /** 1 or 2: some models print their despiece across two plates. */
  readonly part: number;
}

/** Normalised against the rendered plate, so it maps straight onto CSS percentages. */
export interface Hotspot {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** Index into `Model.diagrams`. */
  readonly diagram: number;
}

export interface ModelPart {
  /** Stable per-row key: part codes repeat within a model, so they cannot be the track key. */
  readonly rowId: string;
  readonly code: string;
  readonly hotspot: Hotspot | null;
}

export interface Model {
  readonly id: string;
  readonly name: string;
  readonly brand: Brand;
  readonly family: string;
  /** Commercial equipment reference. Only the 2022 catalog and the spreadsheet carry one. */
  readonly ref: string | null;
  /** `read` when taken from the page artwork, `derived` when inferred from the family. */
  readonly brandOrigin: 'read' | 'derived';
  readonly sources: readonly SourceId[];
  readonly diagrams: readonly Diagram[];
  readonly parts: readonly ModelPart[];
  /** References whose parts list is identical to this model's. */
  readonly equivalentRefs: readonly string[];
}

export interface Part {
  readonly code: string;
  readonly cmmf: string | null;
  readonly description: string;
  readonly ean: string | null;
  readonly ue: number | string | null;
  readonly ucMaster: string | null;
  readonly family: string | null;
  readonly productLine: string | null;
  readonly brand: Brand | null;
  readonly sources: readonly SourceId[];
  /** Ids of every model this part belongs to; empty for catalog-only accessories. */
  readonly models: readonly string[];
  readonly photo: string | null;
  readonly photoWidth: number | null;
  readonly photoHeight: number | null;
  /** Regular (net) price from the 2026 price list, in COP. Null when the part isn't priced. */
  readonly priceRegular: number | null;
  /** Gross list price before commercial discount, in COP. */
  readonly priceGross: number | null;
  readonly currency: string | null;
}

export interface Catalog {
  readonly generatedFrom: readonly string[];
  readonly brands: readonly Brand[];
  readonly families: readonly string[];
  readonly models: readonly Model[];
  readonly parts: Readonly<Record<string, Part>>;
}

/** A part joined to its per-model row, which is what the detail table renders. */
export interface ModelRow {
  readonly rowId: string;
  readonly part: Part;
  readonly hotspot: Hotspot | null;
}

export interface SearchHit {
  readonly part: Part;
  /** Why it matched, so the UI can explain the result. */
  readonly field: 'codigo' | 'cmmf' | 'ean' | 'descripcion';
  readonly score: number;
}
