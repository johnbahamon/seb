import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CatalogStore, foldText } from './catalog-store';
import type { Catalog } from '../models/catalog.models';

const CATALOG: Catalog = {
  generatedFrom: ['test.pdf'],
  brands: ['SAMURAI', 'IMUSA'],
  families: ['Ventiladores', 'Licuadoras'],
  models: [
    {
      id: 'samurai-ventilador-demo',
      name: 'VENTILADOR DEMO',
      brand: 'SAMURAI',
      family: 'Ventiladores',
      ref: 'VE6730I0',
      brandOrigin: 'read',
      sources: ['2023'],
      diagrams: [{ image: 'images/despiece/demo-1.webp', width: 600, height: 800, part: 1 }],
      parts: [
        {
          rowId: 'samurai-ventilador-demo:0',
          code: 'SS-151181',
          hotspot: { x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.4, diagram: 0 },
        },
        { rowId: 'samurai-ventilador-demo:1', code: 'SS-148890', hotspot: null },
        // The same code twice: this is why rowId, not code, is the track key.
        { rowId: 'samurai-ventilador-demo:2', code: 'SS-151181', hotspot: null },
      ],
      equivalentRefs: [],
    },
  ],
  parts: {
    'SS-151181': {
      code: 'SS-151181',
      cmmf: '5861030187',
      description: 'MALLA DELANTERA CON DISCO',
      ean: '7702073511874',
      ue: 1,
      ucMaster: '4',
      family: 'Ventiladores',
      productLine: 'Turbo Silence',
      brand: 'SAMURAI',
      sources: ['2022', '2023'],
      models: ['samurai-ventilador-demo'],
      photo: 'images/partes/ss-151181.webp',
      photoWidth: 120,
      photoHeight: 120,
      priceRegular: null,
      priceGross: null,
      currency: null,
    },
    'SS-148890': {
      code: 'SS-148890',
      cmmf: '9100006022',
      description: 'MALLA TRASERA VENTILADOR PRESION',
      ean: null,
      ue: 1,
      ucMaster: null,
      family: 'Ventiladores',
      productLine: null,
      brand: 'SAMURAI',
      sources: ['2023'],
      models: [],
      photo: null,
      photoWidth: null,
      photoHeight: null,
      priceRegular: null,
      priceGross: null,
      currency: null,
    },
  },
};

async function makeStore(): Promise<CatalogStore> {
  const store = TestBed.inject(CatalogStore);
  // `tick()` runs the effect that issues the request. Awaiting stability first
  // would deadlock: the pending request is exactly what keeps the app unstable.
  TestBed.tick();
  TestBed.inject(HttpTestingController).expectOne('data/catalog.json').flush(CATALOG);
  await TestBed.inject(ApplicationRef).whenStable();
  return store;
}

describe('foldText', () => {
  it('ignores accents and case', () => {
    expect(foldText('Ollas a Presión')).toBe('ollas a presion');
  });
});

describe('CatalogStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('loads the catalog and exposes families with model counts', async () => {
    const store = await makeStore();
    expect(store.isReady()).toBe(true);
    expect(store.familySummaries()).toContainEqual({ family: 'Ventiladores', models: 1 });
  });

  it('finds a part by exact code regardless of punctuation', async () => {
    const store = await makeStore();
    expect(store.part('ss151181')?.description).toBe('MALLA DELANTERA CON DISCO');
    expect(store.search('SS-151181')[0]?.field).toBe('codigo');
  });

  it('finds a part by CMMF and by EAN', async () => {
    const store = await makeStore();
    expect(store.search('5861030187')[0]?.part.code).toBe('SS-151181');
    expect(store.search('7702073511874')[0]?.part.code).toBe('SS-151181');
  });

  it('matches descriptions without accents', async () => {
    const store = await makeStore();
    const hits = store.search('presion');
    expect(hits.map((h) => h.part.code)).toContain('SS-148890');
  });

  it('ignores queries shorter than two characters', async () => {
    const store = await makeStore();
    expect(store.search('S')).toEqual([]);
  });

  it('joins model rows to the shared part catalog keeping duplicate codes distinct', async () => {
    const store = await makeStore();
    const model = store.model('samurai-ventilador-demo')!;
    const rows = store.rowsOf(model);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.rowId)).size).toBe(3);
    expect(rows[0]!.part.description).toBe('MALLA DELANTERA CON DISCO');
    expect(rows[0]!.hotspot?.diagram).toBe(0);
    expect(rows[2]!.part.code).toBe('SS-151181');
  });

  it('reports models for a part and none for a catalog-only accessory', async () => {
    const store = await makeStore();
    expect(store.modelsOf(store.part('SS-151181')!).map((m) => m.id)).toEqual([
      'samurai-ventilador-demo',
    ]);
    expect(store.modelsOf(store.part('SS-148890')!)).toEqual([]);
  });
});
