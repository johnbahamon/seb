import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CartStore } from './cart-store';
import type { Catalog, Part } from '../models/catalog.models';

function part(code: string, description: string, cmmf: string | null, price: number | null): Part {
  return {
    code,
    cmmf,
    description,
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
    priceRegular: price,
    priceGross: null,
    currency: price === null ? null : 'COP',
  };
}

const CATALOG: Catalog = {
  generatedFrom: ['test.pdf'],
  brands: ['SAMURAI'],
  families: ['Ventiladores'],
  models: [],
  parts: {
    'SS-100': part('SS-100', 'MALLA DELANTERA', '5861030187', 10_000),
    'SS-200': part('SS-200', 'ASPA VENTILADOR', '9100006022', 2_500),
    'SS-300': part('SS-300', 'TORNILLO SIN PRECIO', null, null),
  },
};

async function makeCart(): Promise<CartStore> {
  const cart = TestBed.inject(CartStore);
  TestBed.tick();
  TestBed.inject(HttpTestingController).expectOne('data/catalog.json').flush(CATALOG);
  await TestBed.inject(ApplicationRef).whenStable();
  return cart;
}

describe('CartStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
  });

  it('starts empty', async () => {
    const cart = await makeCart();
    expect(cart.isEmpty()).toBe(true);
    expect(cart.count()).toBe(0);
    expect(cart.lines()).toEqual([]);
  });

  it('accumulates units for the same code and counts distinct parts', async () => {
    const cart = await makeCart();
    cart.add('SS-100');
    cart.add('SS-100');
    cart.add('SS-200');
    expect(cart.count()).toBe(3);
    expect(cart.distinctCount()).toBe(2);
  });

  it('joins lines to the catalog and computes the line total', async () => {
    const cart = await makeCart();
    cart.add('SS-100', 3);
    const line = cart.lines()[0]!;
    expect(line.part.description).toBe('MALLA DELANTERA');
    expect(line.quantity).toBe(3);
    expect(line.lineTotal).toBe(30_000);
  });

  it('totals only the priced lines and flags the partial total', async () => {
    const cart = await makeCart();
    cart.add('SS-100', 2); // 20.000
    cart.add('SS-300', 5); // sin precio
    expect(cart.total()).toBe(20_000);
    expect(cart.hasUnpricedLines()).toBe(true);
  });

  it('removes a line when the quantity drops to zero or below', async () => {
    const cart = await makeCart();
    cart.add('SS-100');
    cart.setQuantity('SS-100', 0);
    expect(cart.isEmpty()).toBe(true);

    cart.add('SS-200');
    cart.setQuantity('SS-200', -4);
    expect(cart.isEmpty()).toBe(true);
  });

  it('skips codes the catalog no longer knows but keeps them counted', async () => {
    localStorage.setItem('seb:/seb/:cart-v1', JSON.stringify({ 'SS-100': 1, 'GONE-999': 2 }));
    const cart = await makeCart();
    expect(cart.lines().map((l) => l.part.code)).toEqual(['SS-100']);
    expect(cart.count()).toBe(3);
  });

  it('persists quantities and drops non-positive stored values', async () => {
    const cart = await makeCart();
    cart.add('SS-200', 4);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('seb:/seb/:cart-v1')!)).toEqual({ 'SS-200': 4 });

    localStorage.setItem('seb:/seb/:cart-v1', JSON.stringify({ 'SS-100': 0, 'SS-200': 2 }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const restored = await makeCart();
    expect(restored.quantityOf('SS-100')).toBe(0);
    expect(restored.quantityOf('SS-200')).toBe(2);
  });

  it('clears every line', async () => {
    const cart = await makeCart();
    cart.add('SS-100');
    cart.add('SS-200');
    cart.clear();
    expect(cart.isEmpty()).toBe(true);
    expect(cart.total()).toBe(0);
  });
});
