import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AddToCart } from '../components/add-to-cart';
import { CatalogStore } from '../services/catalog-store';

const COP = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

@Component({
  selector: 'app-part-detail-page',
  imports: [RouterLink, AddToCart],
  template: `
    @if (part(); as part) {
      <nav class="text-sm text-slate-600" aria-label="Migas de pan">
        <a routerLink="/" class="rounded-sm hover:underline">Inicio</a>
        @if (part.family) {
          <span aria-hidden="true" class="mx-1">/</span>
          <a [routerLink]="['/familia', part.family]" class="rounded-sm hover:underline">
            {{ part.family }}
          </a>
        }
      </nav>

      <div class="mt-3 grid gap-6 md:grid-cols-[220px_1fr] md:items-start">
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          @if (part.photo; as photo) {
            <img
              [src]="photo"
              [attr.width]="part.photoWidth"
              [attr.height]="part.photoHeight"
              [alt]="'Foto de ' + part.description"
              class="mx-auto h-auto max-h-52 w-auto object-contain"
            />
          } @else {
            <p class="py-10 text-center text-sm text-slate-500">Sin foto disponible</p>
          }
        </div>

        <div>
          <h1 class="font-mono text-2xl font-bold tracking-tight text-slate-900">{{ part.code }}</h1>
          <p class="mt-1 text-lg text-slate-800">{{ part.description }}</p>

          @if (part.priceRegular !== null) {
            <p class="mt-3 text-2xl font-bold text-emerald-700">
              \${{ price(part.priceRegular) }}
              <span class="text-sm font-normal text-slate-500">COP</span>
              @if (part.priceGross !== null && part.priceGross !== part.priceRegular) {
                <span class="ml-2 align-middle text-sm font-normal text-slate-400 line-through"
                  >\${{ price(part.priceGross) }}</span
                >
              }
            </p>
          }

          <div class="no-print mt-4">
            <app-add-to-cart [code]="part.code" [name]="part.description" size="md" />
          </div>

          <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt class="font-medium text-slate-600">CMMF</dt>
            <dd class="font-mono text-slate-900">{{ part.cmmf ?? '—' }}</dd>
            <dt class="font-medium text-slate-600">EAN</dt>
            <dd class="font-mono text-slate-900">{{ part.ean ?? '—' }}</dd>
            <dt class="font-medium text-slate-600">Unidad de empaque</dt>
            <dd class="text-slate-900">{{ part.ue ?? '—' }}</dd>
            <dt class="font-medium text-slate-600">U.C/Master</dt>
            <dd class="text-slate-900">{{ part.ucMaster ?? '—' }}</dd>
            @if (part.productLine) {
              <dt class="font-medium text-slate-600">Línea</dt>
              <dd class="text-slate-900">{{ part.productLine }}</dd>
            }
            <dt class="font-medium text-slate-600">Fuente</dt>
            <dd class="text-slate-900">Catálogo {{ part.sources.join(', ') }}</dd>
          </dl>

          <h2 class="mt-6 text-base font-semibold text-slate-900">
            @if (models().length) {
              Se usa en {{ models().length }} {{ models().length === 1 ? 'modelo' : 'modelos' }}
            } @else {
              Sin modelo asociado
            }
          </h2>
          @if (models().length) {
            <ul class="mt-2 flex flex-wrap gap-2">
              @for (model of models(); track model.id) {
                <li>
                  <a
                    class="inline-block rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-blue-600"
                    [routerLink]="['/modelo', model.id]"
                    >{{ model.name }}</a
                  >
                </li>
              }
            </ul>
          } @else {
            <p class="mt-2 max-w-prose text-sm text-slate-600">
              Este repuesto aparece en el catálogo pero sin un modelo padre impreso, así que solo es
              alcanzable por búsqueda. Es habitual en accesorios.
            </p>
          }
        </div>
      </div>
    } @else if (!store.isLoading()) {
      <h1 class="text-xl font-bold text-slate-900">Repuesto no encontrado</h1>
      <p class="mt-2 text-slate-600">
        No hay ningún repuesto con el código «{{ code() }}».
        <a routerLink="/buscar" class="text-blue-800 hover:underline">Probar en el buscador</a>.
      </p>
    }
  `,
})
export class PartDetailPage {
  readonly code = input.required<string>();

  protected readonly store = inject(CatalogStore);
  protected readonly part = computed(() => this.store.part(this.code()));
  protected readonly models = computed(() => {
    const part = this.part();
    return part ? this.store.modelsOf(part) : [];
  });

  protected price(value: number): string {
    return COP.format(value);
  }
}
