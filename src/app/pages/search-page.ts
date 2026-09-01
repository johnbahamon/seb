import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CatalogStore } from '../services/catalog-store';
import { SearchBox } from '../components/search-box';

@Component({
  selector: 'app-search-page',
  imports: [RouterLink, SearchBox],
  template: `
    <h1 class="text-2xl font-bold tracking-tight text-slate-900">Buscar repuestos</h1>
    <div class="mt-4 max-w-2xl">
      <app-search-box />
    </div>

    @if (q()) {
      <p class="mt-6 text-slate-700" aria-live="polite">
        {{ hits().length }} resultados para «{{ q() }}»
      </p>
      <ul class="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        @for (hit of hits(); track hit.part.code) {
          <li>
            <a class="flex items-center gap-3 px-4 py-3" [routerLink]="['/repuesto', hit.part.code]">
              @if (hit.part.photo; as photo) {
                <img [src]="photo" width="40" height="40" alt="" loading="lazy" class="h-10 w-10 object-contain" />
              } @else {
                <span class="h-10 w-10 rounded bg-slate-100" aria-hidden="true"></span>
              }
              <span class="font-mono text-sm font-semibold text-blue-800">{{ hit.part.code }}</span>
              <span class="min-w-0 flex-1 text-sm text-slate-700">{{ hit.part.description }}</span>
              <span class="shrink-0 font-mono text-xs text-slate-500">{{ hit.part.cmmf }}</span>
            </a>
          </li>
        } @empty {
          <li class="px-4 py-6 text-slate-600">Sin resultados.</li>
        }
      </ul>
    }
  `,
})
export class SearchPage {
  readonly q = input('');

  private readonly store = inject(CatalogStore);
  protected readonly hits = computed(() => this.store.search(this.q(), 100));
}
