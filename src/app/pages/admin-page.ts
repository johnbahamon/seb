import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { AdminDriftPanel } from '../components/admin-drift-panel';
import { AdminRowEditor, type EditableRow, type RowPatch } from '../components/admin-row-editor';
import {
  AdminApi,
  describeError,
  type AdminModel,
  type AdminPart,
  type DriftRow,
  type FamilyRow,
} from '../services/admin-api';

type Section = 'modelos' | 'repuestos' | 'divergencias';

const PAGE_SIZE = 50;

@Component({
  selector: 'app-admin-page',
  imports: [AdminRowEditor, AdminDriftPanel],
  template: `
    <h1 class="text-2xl font-bold tracking-tight text-slate-900">Administración del catálogo</h1>
    <p class="mt-1 max-w-2xl text-sm text-slate-700">
      Los cambios se guardan en una capa aparte, así que una nueva extracción desde los PDF o la API
      no los pisa. Si el origen cambia un campo que editaste, aparece en «Divergencias».
    </p>

    <!-- Always in the DOM: a live region created together with its text is not
         announced reliably. -->
    <p class="sr-only" role="status" aria-live="polite">{{ status() }}</p>

    <nav class="mt-5 flex flex-wrap gap-1 border-b border-slate-300" aria-label="Secciones">
      @for (item of sections; track item.id) {
        <button
          type="button"
          [attr.aria-current]="section() === item.id ? 'page' : null"
          [class]="section() === item.id ? activeClass : idleClass"
          (click)="section.set(item.id)"
        >
          {{ item.label }}
          @if (item.id === 'divergencias' && drift().length) {
            <span
              class="ml-1 inline-block min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-xs font-bold text-slate-900"
              >{{ drift().length }}<span class="sr-only">{{ driftSuffix() }}</span></span
            >
          }
        </button>
      }
    </nav>

    @if (error(); as text) {
      <p role="alert" class="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
        {{ text }}
      </p>
    }

    @if (section() === 'divergencias') {
      <div #panel tabindex="-1" class="mt-4" aria-label="Divergencias">
        <app-admin-drift-panel
          [rows]="drift()"
          (keep)="keepMine($event)"
          (accept)="acceptSource($event)"
        />
      </div>
    } @else {
      <div class="mt-4 flex flex-wrap items-end gap-3">
        <label class="flex-1 text-sm">
          <span class="block font-medium text-slate-800">Buscar</span>
          <input
            type="search"
            class="mt-1 w-full rounded-md border border-slate-400 px-3 py-2 text-sm"
            [placeholder]="isModels() ? 'Nombre o referencia…' : 'Código, descripción o CMMF…'"
            [value]="search()"
            (input)="onSearch($any($event.target).value)"
          />
        </label>
        <label class="text-sm">
          <span class="block font-medium text-slate-800">Familia</span>
          <select
            class="mt-1 rounded-md border border-slate-400 px-3 py-2 text-sm"
            (change)="onFamilyFilter($any($event.target).value)"
          >
            <option value="" [selected]="!family()">Todas</option>
            @for (option of families(); track option.id) {
              <option [value]="option.name" [selected]="option.name === family()">
                {{ option.name }}
              </option>
            }
          </select>
        </label>
      </div>

      <div #panel tabindex="-1" class="mt-4">
        <p class="text-sm text-slate-700">
          {{ loading() ? 'Cargando…' : summary() }}
        </p>

        <ul class="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          @for (row of rows(); track row.id) {
            <li class="p-3">
              <app-admin-row-editor
                [row]="row"
                [kind]="isModels() ? 'model' : 'part'"
                [families]="families()"
                (save)="saveRow($event)"
                (revert)="revertRow($event)"
                (announce)="status.set($event)"
              />
            </li>
          } @empty {
            <li class="px-4 py-6 text-sm text-slate-700">Sin resultados.</li>
          }
        </ul>

        @if (total() > pageSize) {
          <div class="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              class="rounded-md border border-slate-400 px-3 py-1.5 text-sm disabled:opacity-50"
              [disabled]="offset() === 0"
              (click)="goTo(offset() - pageSize)"
            >
              ← Anteriores
            </button>
            <span class="text-sm text-slate-700">
              {{ offset() + 1 }}–{{ lastOnPage() }} de {{ total() }}
            </span>
            <button
              type="button"
              class="rounded-md border border-slate-400 px-3 py-1.5 text-sm disabled:opacity-50"
              [disabled]="lastOnPage() >= total()"
              (click)="goTo(offset() + pageSize)"
            >
              Siguientes →
            </button>
          </div>
        }
      </div>
    }
  `,
})
export class AdminPage {
  protected readonly sections = [
    { id: 'modelos' as const, label: 'Modelos' },
    { id: 'repuestos' as const, label: 'Repuestos' },
    { id: 'divergencias' as const, label: 'Divergencias' },
  ];
  protected readonly activeClass =
    'rounded-t-md border-b-2 border-blue-700 px-4 py-2 text-sm font-semibold text-blue-800';
  protected readonly idleClass =
    'rounded-t-md border-b-2 border-transparent px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900';
  protected readonly pageSize = PAGE_SIZE;

  private readonly api = inject(AdminApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly section = signal<Section>('modelos');
  protected readonly search = signal('');
  protected readonly family = signal('');
  protected readonly offset = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly status = signal('');

  protected readonly families = signal<readonly FamilyRow[]>([]);
  protected readonly rows = signal<readonly EditableRow[]>([]);
  protected readonly total = signal(0);
  protected readonly drift = signal<readonly DriftRow[]>([]);

  protected readonly isModels = computed(() => this.section() === 'modelos');
  protected readonly lastOnPage = computed(() => Math.min(this.offset() + PAGE_SIZE, this.total()));
  protected readonly summary = computed(() =>
    this.total() === 0
      ? 'Sin resultados'
      : `${this.offset() + 1}–${this.lastOnPage()} de ${this.total()}`,
  );
  protected readonly driftSuffix = computed(() =>
    this.drift().length === 1 ? ' pendiente de revisar' : ' pendientes de revisar',
  );

  private debounce: ReturnType<typeof setTimeout> | undefined;
  /** Guards against a slow response for an old query overwriting a newer one. */
  private generation = 0;

  constructor() {
    void this.run(async () => this.families.set(await this.api.families()));
    void this.refreshDrift();

    effect((onCleanup) => {
      const section = this.section();
      const search = this.search();
      const family = this.family();
      const offset = this.offset();
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => void this.reload(section, search, family, offset), 250);
      onCleanup(() => clearTimeout(this.debounce));
    });
  }

  private async run(work: () => Promise<unknown>): Promise<boolean> {
    this.error.set('');
    try {
      await work();
      return true;
    } catch (error) {
      this.error.set(describeError(error));
      return false;
    }
  }

  private async reload(
    section: Section,
    search: string,
    family: string,
    offset: number,
  ): Promise<void> {
    if (section === 'divergencias') {
      await this.refreshDrift();
      return;
    }
    const ticket = ++this.generation;
    this.loading.set(true);
    await this.run(async () => {
      const query = { search, family, limit: PAGE_SIZE, offset };
      if (section === 'modelos') {
        const page = await this.api.models(query);
        if (ticket !== this.generation) return; // a newer query already landed
        this.rows.set(page.rows.map(toModelRow));
        this.total.set(page.total);
      } else {
        const page = await this.api.parts(query);
        if (ticket !== this.generation) return;
        this.rows.set(page.rows.map(toPartRow));
        this.total.set(page.total);
      }
    });
    if (ticket === this.generation) {
      this.loading.set(false);
    }
  }

  private async refreshDrift(): Promise<void> {
    await this.run(async () => this.drift.set(await this.api.drift()));
  }

  /**
   * Restores focus after a mutation.
   *
   * Saving or reverting destroys the very control that was clicked — the row
   * can leave the filtered page, or the badge that held the button disappears.
   * Without this the caret lands on `<body>` and a keyboard user is silently
   * thrown to the top of the document.
   */
  private focusAfterRender(selector: string): void {
    afterNextRender(
      () => {
        const host = this.host.nativeElement;
        const target =
          host.querySelector<HTMLElement>(selector) ??
          host.querySelector<HTMLElement>('[tabindex="-1"]');
        target?.focus();
      },
      { injector: this.injector },
    );
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.offset.set(0);
  }

  protected onFamilyFilter(value: string): void {
    this.family.set(value);
    this.offset.set(0);
  }

  protected goTo(offset: number): void {
    this.offset.set(Math.max(0, offset));
  }

  protected async saveRow(patch: RowPatch): Promise<void> {
    const models = this.isModels();
    // Only the touched key is sent, so the other field is never pinned as an
    // override and its pending drift is not silently dismissed.
    const body = models
      ? { ...(patch.text !== undefined && { name: patch.text }), ...(patch.family !== undefined && { family: patch.family }) }
      : { ...(patch.text !== undefined && { description: patch.text }), ...(patch.family !== undefined && { family: patch.family }) };

    const ok = await this.run(async () => {
      await (models ? this.api.saveModel(patch.id, body) : this.api.savePart(patch.id, body));
    });
    if (ok) {
      this.status.set('Cambio guardado.');
      await this.reloadCurrent();
      await this.refreshDrift();
      this.focusAfterRender(`[data-row="${cssEscape(patch.id)}"] input`);
    }
  }

  protected async revertRow(id: string): Promise<void> {
    const models = this.isModels();
    const ok = await this.run(async () => {
      await (models ? this.api.revertModel(id) : this.api.revertPart(id));
    });
    if (ok) {
      this.status.set('Edición revertida; vuelve a mandar el valor del origen.');
      await this.reloadCurrent();
      await this.refreshDrift();
      this.focusAfterRender(`[data-row="${cssEscape(id)}"] input`);
    }
  }

  /**
   * Keeps the human value for the drifted field, re-snapshotting the pipeline's
   * current value so the row leaves the queue. Only that one field is written.
   */
  protected async keepMine(row: DriftRow): Promise<void> {
    const ok = await this.run(async () => {
      const value = row.human_value;
      if (row.entity === 'model') {
        await this.api.saveModel(
          row.entity_id,
          row.field === 'family' ? { family: value } : { name: value },
        );
      } else {
        await this.api.savePart(
          row.entity_id,
          row.field === 'family' ? { family: value } : { description: value },
        );
      }
    });
    if (ok) {
      this.status.set('Se conservó tu valor.');
      await this.refreshDrift();
      this.focusAfterRender('[tabindex="-1"]');
    }
  }

  /** Clears only the drifted field, so an edit to the other one survives. */
  protected async acceptSource(row: DriftRow): Promise<void> {
    const ok = await this.run(async () => {
      if (row.entity === 'model') {
        await this.api.saveModel(row.entity_id, row.field === 'family' ? { family: null } : { name: null });
      } else {
        await this.api.savePart(
          row.entity_id,
          row.field === 'family' ? { family: null } : { description: null },
        );
      }
    });
    if (ok) {
      this.status.set('Se adoptó el valor del origen.');
      await this.refreshDrift();
      this.focusAfterRender('[tabindex="-1"]');
    }
  }

  private reloadCurrent(): Promise<void> {
    return this.reload(this.section(), this.search(), this.family(), this.offset());
  }
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

function toModelRow(model: AdminModel): EditableRow {
  return {
    id: model.id,
    text: model.name,
    family: model.family,
    meta: model.ref,
    edited: model.edited,
  };
}

function toPartRow(part: AdminPart): EditableRow {
  return {
    id: part.code,
    text: part.description,
    family: part.family,
    meta: part.cmmf,
    edited: part.edited,
  };
}
