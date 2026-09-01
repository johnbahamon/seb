import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CatalogStore } from '../services/catalog-store';
import { SearchBox } from '../components/search-box';
import type { Brand } from '../models/catalog.models';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, SearchBox],
  template: `
    <h1 class="text-2xl font-bold tracking-tight text-slate-900">Despiece de repuestos</h1>
    <p class="mt-1 max-w-2xl text-slate-600">
      Busca un repuesto por código, CMMF o EAN, o entra por familia para ver la lámina de despiece
      del modelo.
    </p>

    <div class="mt-5 max-w-2xl">
      <app-search-box />
    </div>

    @if (store.isLoading()) {
      <p class="mt-8 text-slate-600" role="status">Cargando catálogo…</p>
    } @else {
      <section class="mt-8" aria-labelledby="familias">
        <div class="flex flex-wrap items-center gap-3">
          <h2 id="familias" class="text-lg font-semibold text-slate-900">Familias</h2>
          <div class="ml-auto flex items-center gap-1" role="group" aria-label="Filtrar por marca">
            <button
              type="button"
              class="chip"
              [class.chip-on]="brand() === null"
              [attr.aria-pressed]="brand() === null"
              (click)="brand.set(null)"
            >
              Todas
            </button>
            @for (item of store.brands(); track item) {
              <button
                type="button"
                class="chip"
                [class.chip-on]="brand() === item"
                [attr.aria-pressed]="brand() === item"
                (click)="brand.set(item)"
              >
                {{ item }}
              </button>
            }
          </div>
        </div>

        <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (entry of families(); track entry.family) {
            <li>
              <a
                class="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 hover:border-blue-600 hover:shadow-sm"
                [routerLink]="['/familia', entry.family]"
                [queryParams]="brand() ? { marca: brand() } : {}"
              >
                <span class="text-base font-semibold text-slate-900">{{ entry.family }}</span>
                <span class="mt-1 text-sm text-slate-600">
                  {{ entry.models }} {{ entry.models === 1 ? 'modelo' : 'modelos' }}
                </span>
              </a>
            </li>
          } @empty {
            <li class="text-slate-600">No hay modelos para esa marca.</li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    @reference "tailwindcss";

    .chip {
      @apply rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700;
    }
    .chip-on {
      @apply border-blue-700 bg-blue-700 text-white;
    }
  `,
})
export class HomePage {
  protected readonly store = inject(CatalogStore);
  protected readonly brand = signal<Brand | null>(null);

  protected readonly families = computed(() => {
    const brand = this.brand();
    if (!brand) {
      return this.store.familySummaries().filter((entry) => entry.models > 0);
    }
    const counts = new Map<string, number>();
    for (const model of this.store.models()) {
      if (model.brand === brand) {
        counts.set(model.family, (counts.get(model.family) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([family, models]) => ({ family, models }))
      .sort((a, b) => a.family.localeCompare(b.family));
  });
}
