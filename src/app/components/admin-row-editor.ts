import { Component, computed, input, output, signal } from '@angular/core';

import { ImageUpload } from './image-upload';
import type { FamilyRow } from '../services/admin-api';

/** One editable catalog row, shared by the models and the parts panel. */
export interface EditableRow {
  readonly id: string;
  /** The model's name or the part's description. */
  readonly text: string;
  readonly family: string | null;
  /** Reference for a model, CMMF for a part. */
  readonly meta: string | null;
  readonly edited: boolean;
}

/** Only the touched field travels, so a save never pins the other one. */
export interface RowPatch {
  readonly id: string;
  readonly text?: string;
  readonly family?: string | null;
}

const NO_FAMILY = '__ninguna__';

@Component({
  selector: 'app-admin-row-editor',
  imports: [ImageUpload],
  template: `
    <div class="flex flex-wrap items-center gap-3" [attr.data-row]="row().id">
      @if (kind() === 'part') {
        <span class="font-mono text-xs font-semibold text-slate-700">{{ row().id }}</span>
      }

      <label class="min-w-64 flex-1">
        <span class="sr-only">{{ textLabel() }} de {{ row().id }}</span>
        <input
          type="text"
          class="w-full rounded-md border border-slate-400 px-2 py-1.5 text-sm"
          [value]="row().text"
          (change)="onText($any($event.target).value)"
        />
      </label>

      <label>
        <span class="sr-only">Familia de {{ row().id }}</span>
        <select
          class="rounded-md border border-slate-400 px-2 py-1.5 text-sm"
          (change)="onFamily($any($event.target).value)"
        >
          <!-- [selected] on the option, not [value] on the select: the select's
               value is applied before @for has created the options, so binding
               it there leaves every row showing the first family. -->
          <option [value]="noFamily" [selected]="!row().family">— sin familia —</option>
          @for (option of families(); track option.id) {
            <option [value]="option.name" [selected]="option.name === row().family">
              {{ option.name }}
            </option>
          }
        </select>
      </label>

      <span class="font-mono text-xs text-slate-600">{{ row().meta ?? '—' }}</span>

      @if (row().edited) {
        <span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
          editado
        </span>
        <button type="button" class="rounded-sm text-xs text-red-700 underline" (click)="revert.emit(row().id)">
          Revertir
        </button>
      }

      <button
        type="button"
        class="rounded-sm text-xs text-blue-800 underline"
        [attr.aria-expanded]="showPhotos()"
        (click)="showPhotos.set(!showPhotos())"
      >
        {{ showPhotos() ? 'Ocultar fotos' : 'Fotos' }}
      </button>
    </div>

    @if (showPhotos()) {
      <div class="mt-3 border-t border-slate-200 pt-3">
        <app-image-upload
          [entityType]="kind()"
          [entityId]="row().id"
          (announce)="announce.emit($event)"
        />
      </div>
    }
  `,
})
export class AdminRowEditor {
  readonly row = input.required<EditableRow>();
  readonly kind = input.required<'model' | 'part'>();
  readonly families = input.required<readonly FamilyRow[]>();

  readonly save = output<RowPatch>();
  readonly revert = output<string>();
  readonly announce = output<string>();

  protected readonly noFamily = NO_FAMILY;
  protected readonly showPhotos = signal(false);
  protected readonly textLabel = computed(() => (this.kind() === 'model' ? 'Nombre' : 'Descripción'));

  protected onText(value: string): void {
    const text = value.trim();
    if (text && text !== this.row().text) {
      this.save.emit({ id: this.row().id, text });
    }
  }

  protected onFamily(value: string): void {
    const family = value === NO_FAMILY ? null : value;
    if (family !== this.row().family) {
      this.save.emit({ id: this.row().id, family });
    }
  }
}
