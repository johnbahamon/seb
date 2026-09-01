import { Component, computed, input, model, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AddToCart } from './add-to-cart';
import { foldText } from '../services/catalog-store';
import type { ModelRow } from '../models/catalog.models';

type SortKey = 'code' | 'description' | 'cmmf' | 'priceRegular';
type SortDirection = 'asc' | 'desc';

const COP = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

@Component({
  selector: 'app-parts-table',
  imports: [RouterLink, AddToCart],
  template: `
    <div class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 no-print">
      <label class="flex flex-1 items-center gap-2 text-sm">
        <span class="sr-only">Filtrar repuestos de este modelo</span>
        <input
          type="search"
          class="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm placeholder:text-slate-500"
          placeholder="Filtrar por código o descripción…"
          [value]="filter()"
          (input)="filter.set($any($event.target).value)"
        />
      </label>
      <p class="text-sm text-slate-600" aria-live="polite">
        {{ visibleRows().length }} de {{ rows().length }} repuestos
      </p>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-sm">
        <caption class="sr-only">
          Repuestos de {{ modelName() }}. Al enfocar una fila se resalta la pieza en la lámina.
        </caption>
        <thead class="bg-white">
          <tr class="border-b border-slate-200">
            <th scope="col" class="w-12 px-2 py-2"><span class="sr-only">Foto</span></th>
            @for (column of columns; track column.key) {
              <th
                scope="col"
                class="px-2 py-2 font-semibold text-slate-700"
                [attr.aria-sort]="ariaSort(column.key)"
              >
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-sm hover:underline"
                  (click)="toggleSort(column.key)"
                >
                  {{ column.label }}
                  <span aria-hidden="true" class="text-xs">
                    {{ sortKey() === column.key ? (sortDirection() === 'asc' ? '▲' : '▼') : '' }}
                  </span>
                </button>
              </th>
            }
            <th scope="col" class="px-2 py-2"><span class="sr-only">Agregar al carrito</span></th>
          </tr>
        </thead>
        <tbody>
          @for (row of visibleRows(); track row.rowId) {
            <tr
              class="border-b border-slate-100"
              [class.bg-blue-50]="row.rowId === activeRow()"
              (mouseenter)="activeRow.set(row.rowId)"
              (focusin)="activeRow.set(row.rowId)"
            >
              <td class="px-2 py-1.5">
                @if (row.part.photo; as photo) {
                  <img
                    [src]="photo"
                    [width]="40"
                    [height]="40"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    class="h-10 w-10 object-contain"
                  />
                } @else {
                  <span
                    class="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400"
                    aria-hidden="true"
                    >s/f</span
                  >
                }
              </td>
              <td class="px-2 py-1.5">
                <a
                  class="rounded-sm font-mono font-semibold text-blue-800 hover:underline"
                  [routerLink]="['/repuesto', row.part.code]"
                  >{{ row.part.code }}</a
                >
                @if (row.hotspot) {
                  <span class="ml-1 text-xs text-slate-500" [title]="'Señalado en la lámina'">◉</span>
                }
              </td>
              <td class="px-2 py-1.5 text-slate-800">{{ row.part.description }}</td>
              <td class="px-2 py-1.5 font-mono text-slate-600">{{ row.part.cmmf ?? '—' }}</td>
              <td class="px-2 py-1.5 text-right font-mono tabular-nums text-slate-800">
                @if (row.part.priceRegular !== null) {
                  <span>\${{ price(row.part.priceRegular) }}</span>
                } @else {
                  <span class="text-slate-400">—</span>
                }
              </td>
              <td class="px-2 py-1.5 text-right">
                <app-add-to-cart [code]="row.part.code" [name]="row.part.description" />
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6" class="px-3 py-6 text-center text-slate-600">
                Ningún repuesto coincide con «{{ filter() }}».
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  host: { class: 'block overflow-hidden rounded-lg border border-slate-200 bg-white' },
})
export class PartsTable {
  readonly rows = input.required<readonly ModelRow[]>();
  readonly modelName = input('');
  readonly activeRow = model<string | null>(null);

  protected readonly columns = [
    { key: 'code' as const, label: 'Código' },
    { key: 'description' as const, label: 'Descripción' },
    { key: 'cmmf' as const, label: 'CMMF' },
    { key: 'priceRegular' as const, label: 'Precio (COP)' },
  ];

  protected price(value: number): string {
    return COP.format(value);
  }

  protected readonly filter = signal('');
  protected readonly sortKey = signal<SortKey | null>(null);
  protected readonly sortDirection = signal<SortDirection>('asc');

  protected readonly visibleRows = computed(() => {
    const needle = foldText(this.filter().trim());
    let rows = [...this.rows()];
    if (needle) {
      rows = rows.filter((row) =>
        foldText(`${row.part.code} ${row.part.description} ${row.part.cmmf ?? ''}`).includes(needle),
      );
    }
    const key = this.sortKey();
    if (key) {
      const direction = this.sortDirection() === 'asc' ? 1 : -1;
      if (key === 'priceRegular') {
        rows.sort((a, b) => direction * ((a.part.priceRegular ?? -1) - (b.part.priceRegular ?? -1)));
      } else {
        rows.sort((a, b) => direction * String(a.part[key] ?? '').localeCompare(String(b.part[key] ?? '')));
      }
    }
    return rows;
  });

  protected ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) {
      return 'none';
    }
    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  protected toggleSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    this.sortKey.set(key);
    this.sortDirection.set('asc');
  }
}
