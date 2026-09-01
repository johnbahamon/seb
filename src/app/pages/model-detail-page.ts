import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CatalogStore } from '../services/catalog-store';
import { brandColor } from '../models/catalog.models';
import { DiagramViewer } from '../components/diagram-viewer';
import { PartsTable } from '../components/parts-table';

@Component({
  selector: 'app-model-detail-page',
  imports: [RouterLink, DiagramViewer, PartsTable],
  template: `
    @if (model(); as model) {
      <nav class="no-print text-sm text-slate-600" aria-label="Migas de pan">
        <a routerLink="/" class="rounded-sm hover:underline">Inicio</a>
        <span aria-hidden="true" class="mx-1">/</span>
        <a [routerLink]="['/familia', model.family]" class="rounded-sm hover:underline">
          {{ model.family }}
        </a>
      </nav>

      <div class="mt-2 flex flex-wrap items-start gap-x-4 gap-y-2">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900">{{ model.name }}</h1>
          <p class="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span
              class="inline-block h-3 w-3 rounded-sm"
              [style.background-color]="brandColor(model.brand)"
              aria-hidden="true"
            ></span>
            <span>{{ model.brand }}</span>
            @if (model.ref) {
              <span aria-hidden="true">·</span>
              <span>Ref. <span class="font-mono">{{ model.ref }}</span></span>
            }
            @if (model.equivalentRefs.length) {
              <span aria-hidden="true">·</span>
              <span>
                También aplica a
                <span class="font-mono">{{ model.equivalentRefs.join(', ') }}</span>
              </span>
            }
            <span aria-hidden="true">·</span>
            <span>{{ rows().length }} repuestos</span>
          </p>
        </div>
      </div>

      <div class="mt-5 grid gap-5 lg:grid-cols-2 lg:items-start">
        <div class="lg:sticky lg:top-4">
          @if (model.diagrams.length) {
            <app-diagram-viewer
              [diagrams]="model.diagrams"
              [rows]="rows()"
              [alt]="'Lámina de despiece de ' + model.name"
              [(activeRow)]="activeRow"
            />
            <p class="mt-2 text-xs text-slate-500 no-print">
              Ctrl + rueda para acercar, arrastra para desplazar. Con el teclado:
              <kbd class="kbd">+</kbd> <kbd class="kbd">−</kbd> <kbd class="kbd">0</kbd> y flechas.
            </p>
          } @else {
            <div class="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-600">
              <p class="font-medium text-slate-800">Este modelo no tiene lámina de despiece.</p>
              <p class="mt-1 text-sm">
                Solo el catálogo 2023 publica láminas. Este modelo procede de
                {{ model.sources.join(' y ') }}, así que se muestra su lista de repuestos con la
                foto de cada pieza cuando existe.
              </p>
            </div>
          }
        </div>

        <app-parts-table [rows]="rows()" [modelName]="model.name" [(activeRow)]="activeRow" />
      </div>
    } @else if (!store.isLoading()) {
      <h1 class="text-xl font-bold text-slate-900">Modelo no encontrado</h1>
      <p class="mt-2 text-slate-600">
        Puede que el enlace sea antiguo. <a routerLink="/" class="text-blue-800 hover:underline">Volver al inicio</a>.
      </p>
    }
  `,
  styles: `
    @reference "tailwindcss";

    .kbd {
      @apply rounded border border-slate-300 bg-slate-100 px-1 font-mono text-[11px];
    }
  `,
})
export class ModelDetailPage {
  protected readonly brandColor = brandColor;
  /** Bound from the route via `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  protected readonly store = inject(CatalogStore);
  protected readonly activeRow = signal<string | null>(null);

  protected readonly model = computed(() => this.store.model(this.id()));
  protected readonly rows = computed(() => {
    const model = this.model();
    return model ? this.store.rowsOf(model) : [];
  });
}
