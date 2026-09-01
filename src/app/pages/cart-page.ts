import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CartStore } from '../services/cart-store';
import { CatalogStore } from '../services/catalog-store';
import { downloadXlsx, type CellValue } from '../services/xlsx';

const COP = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** Column order is fixed by the export spec: cmmf, name, cantidad, valor. */
const EXPORT_HEADER = ['cmmf', 'name', 'cantidad', 'valor'] as const;

@Component({
  selector: 'app-cart-page',
  imports: [RouterLink],
  template: `
    <nav class="no-print text-sm text-slate-600" aria-label="Migas de pan">
      <a routerLink="/" class="rounded-sm hover:underline">Inicio</a>
    </nav>

    <div class="mt-2 flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold tracking-tight text-slate-900">Carrito</h1>
      <p class="text-sm text-slate-600" aria-live="polite">
        {{ cart.distinctCount() }} {{ cart.distinctCount() === 1 ? 'repuesto' : 'repuestos' }} ·
        {{ cart.count() }} {{ cart.count() === 1 ? 'unidad' : 'unidades' }}
      </p>
    </div>

    @if (store.isLoading()) {
      <p class="mt-8 text-slate-600" role="status">Cargando catálogo…</p>
    } @else if (cart.isEmpty()) {
      <p class="mt-6 max-w-prose text-slate-600">
        El carrito está vacío. Agrega repuestos desde la
        <a routerLink="/buscar" class="text-blue-800 hover:underline">búsqueda</a>
        o desde la tabla de cualquier modelo.
      </p>
    } @else {
      <div class="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left text-sm">
            <caption class="sr-only">
              Repuestos agregados al carrito, con cantidad y valor.
            </caption>
            <thead class="bg-slate-50">
              <tr class="border-b border-slate-200">
                <th scope="col" class="px-3 py-2 font-semibold text-slate-700">CMMF</th>
                <th scope="col" class="px-3 py-2 font-semibold text-slate-700">Repuesto</th>
                <th scope="col" class="px-3 py-2 text-right font-semibold text-slate-700">
                  Precio unit.
                </th>
                <th scope="col" class="px-3 py-2 text-center font-semibold text-slate-700">
                  Cantidad
                </th>
                <th scope="col" class="px-3 py-2 text-right font-semibold text-slate-700">Valor</th>
                <th scope="col" class="px-3 py-2"><span class="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              @for (line of cart.lines(); track line.part.code) {
                <tr class="border-b border-slate-100">
                  <td class="px-3 py-2 font-mono text-slate-600">{{ line.part.cmmf ?? '—' }}</td>
                  <td class="px-3 py-2">
                    <a
                      class="rounded-sm font-medium text-blue-800 hover:underline"
                      [routerLink]="['/repuesto', line.part.code]"
                      >{{ line.part.description }}</a
                    >
                    <span class="block font-mono text-xs text-slate-500">{{ line.part.code }}</span>
                  </td>
                  <td class="px-3 py-2 text-right font-mono tabular-nums text-slate-600">
                    {{ line.part.priceRegular === null ? '—' : '$' + money(line.part.priceRegular) }}
                  </td>
                  <td class="px-3 py-2 text-center">
                    <label class="sr-only" [attr.for]="'qty-' + line.part.code">
                      Cantidad de {{ line.part.description }}
                    </label>
                    <input
                      [id]="'qty-' + line.part.code"
                      type="number"
                      min="1"
                      step="1"
                      class="w-16 rounded-md border border-slate-300 px-2 py-1 text-center tabular-nums"
                      [value]="line.quantity"
                      (change)="cart.setQuantity(line.part.code, $any($event.target).valueAsNumber)"
                    />
                  </td>
                  <td class="px-3 py-2 text-right font-mono font-semibold tabular-nums text-slate-900">
                    {{ line.lineTotal === null ? '—' : '$' + money(line.lineTotal) }}
                  </td>
                  <td class="px-3 py-2 text-right">
                    <button
                      type="button"
                      class="rounded-md px-2 py-1 text-sm text-red-700 hover:bg-red-50 hover:underline"
                      (click)="cart.remove(line.part.code)"
                      [attr.aria-label]="'Quitar ' + line.part.description + ' del carrito'"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr class="bg-slate-50">
                <td colspan="4" class="px-3 py-2 text-right font-semibold text-slate-700">Total</td>
                <td class="px-3 py-2 text-right font-mono text-base font-bold tabular-nums text-emerald-700">
                  \${{ money(cart.total()) }}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      @if (cart.hasUnpricedLines()) {
        <p class="mt-2 text-sm text-amber-700">
          Algunos repuestos no tienen precio en la lista 2026, así que el total es parcial.
        </p>
      }

      <div class="no-print mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-md border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          (click)="exportToExcel()"
        >
          Exportar a Excel
        </button>
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-red-600 hover:text-red-700"
          (click)="cart.clear()"
        >
          Vaciar carrito
        </button>
      </div>
    }
  `,
})
export class CartPage {
  protected readonly cart = inject(CartStore);
  protected readonly store = inject(CatalogStore);

  protected money(value: number): string {
    return COP.format(value);
  }

  /** cmmf · name · cantidad · valor, one row per part, in that exact order. */
  protected readonly exportRows = computed<CellValue[][]>(() => [
    [...EXPORT_HEADER],
    ...this.cart.lines().map((line) => [
      line.part.cmmf ?? '',
      line.part.description,
      line.quantity,
      line.lineTotal,
    ]),
  ]);

  protected exportToExcel(): void {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadXlsx(`carrito-repuestos-${stamp}.xlsx`, this.exportRows(), {
      sheetName: 'Repuestos',
      widths: [16, 52, 10, 14],
    });
  }
}
