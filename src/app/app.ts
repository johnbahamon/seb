import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import { CartStore } from './services/cart-store';
import { CatalogStore } from './services/catalog-store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `
    <a
      class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-blue-800 focus:shadow-lg"
      href="#contenido"
      (click)="skipToContent($event)"
    >
      Saltar al contenido
    </a>

    <header class="no-print border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <a routerLink="/" class="flex items-baseline gap-2 rounded-sm">
          <span class="text-lg font-bold tracking-tight text-slate-900">Despiece</span>
          <span class="text-sm text-slate-600">Repuestos Groupe SEB</span>
        </a>
        <nav class="ml-auto flex items-center gap-4 text-sm" aria-label="Principal">
          <a routerLink="/buscar" class="rounded-sm font-medium text-blue-800 hover:underline">
            Buscar repuesto
          </a>
          <a
            routerLink="/cart"
            class="relative flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:border-blue-600 hover:text-blue-800"
            [attr.aria-label]="cartLabel()"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M2.5 3h2.2l2.1 11.3a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.2L19.7 7H6" />
              <circle cx="9.5" cy="20" r="1.4" />
              <circle cx="17" cy="20" r="1.4" />
            </svg>
            <span>Carrito</span>
            @if (cart.count() > 0) {
              <span
                class="min-w-5 rounded-full bg-blue-700 px-1.5 py-0.5 text-center text-xs font-bold text-white"
                aria-hidden="true"
                >{{ cart.count() }}</span
              >
            }
          </a>
        </nav>
      </div>
    </header>

    <main id="contenido" tabindex="-1" class="mx-auto max-w-7xl px-4 py-6">
      @if (store.error()) {
        <div role="alert" class="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
          <p class="font-semibold">No pudimos cargar el catálogo.</p>
          <p class="mt-1 text-sm">Revisa tu conexión e inténtalo de nuevo.</p>
          <button
            type="button"
            class="mt-3 rounded-md border border-red-700 bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
            (click)="store.reload()"
          >
            Reintentar
          </button>
        </div>
      }
      <!-- The outlet stays mounted on error so routing keeps working. -->
      <router-outlet />
    </main>

    <footer class="no-print mx-auto max-w-7xl px-4 py-8 text-xs text-slate-500">
      Datos extraídos de los catálogos de repuestos de Groupe SEB Colombia.
      Marcas cubiertas: {{ store.brands().join(' · ') }}.
    </footer>
  `,
})
export class App {
  protected readonly store = inject(CatalogStore);
  protected readonly cart = inject(CartStore);

  /**
   * Moves focus to the main region.
   *
   * A bare `#contenido` href cannot do this on its own: with `<base href="/seb/">`
   * the browser resolves the fragment against the base, so on a deep route the
   * link navigates to the home page instead of scrolling.
   */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    const main = document.getElementById('contenido');
    main?.focus();
    main?.scrollIntoView();
  }

  /** The badge is decorative, so the count lives in the link's accessible name. */
  protected readonly cartLabel = computed(() => {
    const count = this.cart.count();
    if (count === 0) {
      return 'Carrito, vacío';
    }
    return `Carrito, ${count} ${count === 1 ? 'unidad' : 'unidades'}`;
  });
}
