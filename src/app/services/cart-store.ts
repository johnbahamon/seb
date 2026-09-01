import { Service, computed, effect, inject, signal } from '@angular/core';

import { CatalogStore } from './catalog-store';
import type { Part } from '../models/catalog.models';

/**
 * Namespaced by deploy path: github.io serves every project of an account from
 * one origin, so an unprefixed key would collide across sibling Pages sites.
 */
const STORAGE_KEY = 'seb:/seb/:cart-v1';

export interface CartLine {
  readonly part: Part;
  readonly quantity: number;
  /** `quantity * priceRegular`, or null when the part carries no price. */
  readonly lineTotal: number | null;
}

/** Only the quantities are persisted; part data is always re-read from the catalog. */
type Quantities = Readonly<Record<string, number>>;

function readStored(): Quantities {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const out: Record<string, number> = {};
    for (const [code, value] of Object.entries(parsed as Record<string, unknown>)) {
      const qty = Math.floor(Number(value));
      if (Number.isFinite(qty) && qty > 0) {
        out[code] = qty;
      }
    }
    return out;
  } catch {
    // Private windows and blocked site data throw on access; an empty cart is fine.
    return {};
  }
}

@Service()
export class CartStore {
  private readonly catalog = inject(CatalogStore);
  private readonly quantities = signal<Quantities>(readStored());

  constructor() {
    effect(() => {
      const value = this.quantities();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        // Storage unavailable: the cart still works for this session.
      }
    });
  }

  /** Total units, which is what the top-bar badge shows. */
  readonly count = computed(() =>
    Object.values(this.quantities()).reduce((sum, qty) => sum + qty, 0),
  );

  /** Number of distinct parts. */
  readonly distinctCount = computed(() => Object.keys(this.quantities()).length);

  readonly isEmpty = computed(() => this.distinctCount() === 0);

  /**
   * Cart rows joined to the catalog.
   *
   * Codes the catalog no longer knows are skipped rather than dropped, so a cart
   * saved before a catalog rebuild survives it. This is empty while the catalog
   * is still loading, which is why the badge counts quantities instead.
   */
  readonly lines = computed<CartLine[]>(() => {
    const lines: CartLine[] = [];
    for (const [code, quantity] of Object.entries(this.quantities())) {
      const part = this.catalog.part(code);
      if (!part) {
        continue;
      }
      const unit = part.priceRegular;
      lines.push({ part, quantity, lineTotal: unit === null ? null : unit * quantity });
    }
    return lines.sort((a, b) => a.part.description.localeCompare(b.part.description));
  });

  readonly total = computed(() =>
    this.lines().reduce((sum, line) => sum + (line.lineTotal ?? 0), 0),
  );

  /** True when at least one line has no price, so the total is a partial figure. */
  readonly hasUnpricedLines = computed(() => this.lines().some((line) => line.lineTotal === null));

  quantityOf(code: string): number {
    return this.quantities()[code] ?? 0;
  }

  add(code: string, quantity = 1): void {
    this.setQuantity(code, this.quantityOf(code) + quantity);
  }

  setQuantity(code: string, quantity: number): void {
    const next = Math.floor(Number(quantity));
    this.quantities.update((current) => {
      const draft = { ...current };
      if (!Number.isFinite(next) || next <= 0) {
        delete draft[code];
      } else {
        draft[code] = next;
      }
      return draft;
    });
  }

  remove(code: string): void {
    this.setQuantity(code, 0);
  }

  clear(): void {
    this.quantities.set({});
  }
}
