import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CatalogStore } from '../services/catalog-store';
import { brandColor } from '../models/catalog.models';
import type { Brand } from '../models/catalog.models';

@Component({
  selector: 'app-family-page',
  imports: [RouterLink],
  template: `
    <nav class="text-sm text-slate-600" aria-label="Migas de pan">
      <a routerLink="/" class="rounded-sm hover:underline">Inicio</a>
    </nav>

    <h1 class="mt-2 text-2xl font-bold tracking-tight text-slate-900">{{ family() }}</h1>
    <p class="mt-1 text-slate-600">
      {{ models().length }} {{ models().length === 1 ? 'modelo' : 'modelos' }}
      @if (marca()) {
        de {{ marca() }}
      }
    </p>

    <ul class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      @for (model of models(); track model.id) {
        <li>
          <a
            class="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 hover:border-blue-600 hover:shadow-sm"
            [routerLink]="['/modelo', model.id]"
          >
            @if (model.photo; as photo) {
              <img
                [src]="photo"
                [alt]="model.photoAlt ?? ''"
                width="96"
                height="96"
                loading="lazy"
                decoding="async"
                class="mb-2 h-24 w-full object-contain"
              />
            }
            <span class="flex items-center gap-2">
              <span
                class="inline-block h-3 w-3 shrink-0 rounded-sm"
                [style.background-color]="brandColor(model.brand)"
                aria-hidden="true"
              ></span>
              <span class="text-xs font-medium uppercase tracking-wide text-slate-500">
                {{ model.brand }}
              </span>
            </span>
            <span class="mt-1 font-semibold text-slate-900">{{ model.name }}</span>
            <span class="mt-2 text-sm text-slate-600">
              {{ model.parts.length }} repuestos
              @if (model.ref) {
                · <span class="font-mono">{{ model.ref }}</span>
              }
            </span>
            @if (model.diagrams.length) {
              <span class="mt-1 text-xs font-medium text-blue-800">Con lámina de despiece</span>
            }
          </a>
        </li>
      } @empty {
        <li class="text-slate-600">No hay modelos en esta familia.</li>
      }
    </ul>
  `,
})
export class FamilyPage {
  protected readonly brandColor = brandColor;
  readonly family = input.required<string>();
  /** Optional `?marca=` filter carried over from the home page. */
  readonly marca = input<Brand | undefined>(undefined);

  private readonly store = inject(CatalogStore);

  protected readonly models = computed(() =>
    this.store
      .modelsIn(this.family(), this.marca() ?? null)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
}
