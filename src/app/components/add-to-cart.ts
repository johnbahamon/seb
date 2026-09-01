import { Component, computed, inject, input } from '@angular/core';

import { CartStore } from '../services/cart-store';

/**
 * Add-to-cart control that turns into a quantity stepper once the part is in
 * the cart, so the table row never grows a second column.
 */
@Component({
  selector: 'app-add-to-cart',
  template: `
    @if (quantity() > 0) {
      <span class="inline-flex items-center gap-0.5 rounded-md border border-blue-700 bg-white">
        <button
          type="button"
          class="rounded-l-md px-2 py-1 text-blue-800 hover:bg-blue-50"
          [class.py-1.5]="size() === 'md'"
          (click)="cart.setQuantity(code(), quantity() - 1)"
          [attr.aria-label]="'Quitar una unidad de ' + label()"
        >
          −
        </button>
        <span class="min-w-6 text-center text-sm font-semibold tabular-nums text-slate-900">
          {{ quantity() }}
        </span>
        <button
          type="button"
          class="rounded-r-md px-2 py-1 text-blue-800 hover:bg-blue-50"
          [class.py-1.5]="size() === 'md'"
          (click)="cart.add(code())"
          [attr.aria-label]="'Agregar una unidad de ' + label()"
        >
          +
        </button>
      </span>
    } @else {
      <button
        type="button"
        class="rounded-md border border-blue-700 bg-blue-700 font-medium text-white hover:bg-blue-800"
        [class]="size() === 'md' ? 'px-4 py-2 text-sm' : 'px-2.5 py-1 text-xs'"
        (click)="cart.add(code())"
        [attr.aria-label]="'Agregar ' + label() + ' al carrito'"
      >
        Agregar
      </button>
    }
  `,
})
export class AddToCart {
  readonly code = input.required<string>();
  /** Used only for the accessible name; falls back to the code. */
  readonly name = input('');
  readonly size = input<'sm' | 'md'>('sm');

  protected readonly cart = inject(CartStore);
  protected readonly quantity = computed(() => this.cart.quantityOf(this.code()));
  protected readonly label = computed(() => this.name() || this.code());
}
