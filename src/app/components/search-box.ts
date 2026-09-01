import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CatalogStore } from '../services/catalog-store';

const FIELD_LABEL: Record<string, string> = {
  codigo: 'Código',
  cmmf: 'CMMF',
  ean: 'EAN',
  descripcion: 'Descripción',
};

@Component({
  selector: 'app-search-box',
  imports: [RouterLink],
  template: `
    <div class="relative">
      <label class="block">
        <span class="sr-only">Buscar repuesto por código, CMMF, EAN o descripción</span>
        <input
          #input
          type="text"
          role="combobox"
          autocomplete="off"
          aria-autocomplete="list"
          aria-controls="resultados-busqueda"
          [attr.aria-expanded]="isOpen()"
          [attr.aria-activedescendant]="activeId()"
          class="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base shadow-sm placeholder:text-slate-500"
          placeholder="Ej. SS-151295, 5861032579 o «malla trasera»"
          [value]="term()"
          (input)="onInput($any($event.target).value)"
          (keydown)="onKeydown($event)"
          (focus)="open.set(true)"
          (blur)="onBlur()"
        />
      </label>

      <ul
        id="resultados-busqueda"
        role="listbox"
        aria-label="Resultados"
        class="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        [hidden]="!isOpen()"
      >
        @for (hit of hits(); track hit.part.code; let i = $index) {
          <li
            role="option"
            [id]="'resultado-' + i"
            [attr.aria-selected]="i === highlighted()"
            class="border-b border-slate-100 last:border-0"
            [class.bg-blue-50]="i === highlighted()"
          >
            <a
              class="flex items-center gap-3 px-3 py-2"
              [routerLink]="['/repuesto', hit.part.code]"
              (mousedown)="$event.preventDefault()"
              (click)="close()"
            >
              <span class="font-mono text-sm font-semibold text-blue-800">{{ hit.part.code }}</span>
              <span class="min-w-0 flex-1 truncate text-sm text-slate-700">
                {{ hit.part.description }}
              </span>
              <span class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                {{ label(hit.field) }}
              </span>
            </a>
          </li>
        } @empty {
          <li class="px-3 py-3 text-sm text-slate-600">
            Sin resultados para «{{ term() }}».
          </li>
        }
      </ul>
    </div>
  `,
})
export class SearchBox {
  private readonly store = inject(CatalogStore);
  private readonly router = inject(Router);

  protected readonly term = signal('');
  protected readonly open = signal(false);
  protected readonly highlighted = signal(-1);

  protected readonly hits = computed(() => this.store.search(this.term(), 8));
  protected readonly isOpen = computed(() => this.open() && this.term().trim().length >= 2);
  protected readonly activeId = computed(() =>
    this.highlighted() >= 0 ? `resultado-${this.highlighted()}` : null,
  );

  protected label(field: string): string {
    return FIELD_LABEL[field] ?? field;
  }

  protected onInput(value: string): void {
    this.term.set(value);
    this.open.set(true);
    this.highlighted.set(-1);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const results = this.hits();
    switch (event.key) {
      case 'ArrowDown':
        this.highlighted.update((i) => Math.min(results.length - 1, i + 1));
        break;
      case 'ArrowUp':
        this.highlighted.update((i) => Math.max(-1, i - 1));
        break;
      case 'Enter': {
        const hit = results[this.highlighted()];
        if (hit) {
          this.router.navigate(['/repuesto', hit.part.code]);
        } else if (this.term().trim()) {
          this.router.navigate(['/buscar'], { queryParams: { q: this.term().trim() } });
        }
        this.close();
        break;
      }
      case 'Escape':
        this.close();
        return;
      default:
        return;
    }
    event.preventDefault();
  }

  protected onBlur(): void {
    // Let a click on a result land before the list disappears.
    setTimeout(() => this.open.set(false), 120);
  }

  protected close(): void {
    this.open.set(false);
    this.highlighted.set(-1);
  }
}
