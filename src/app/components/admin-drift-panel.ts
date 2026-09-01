import { Component, input, output } from '@angular/core';

import type { DriftRow } from '../services/admin-api';

const FIELD_LABEL: Record<string, string> = {
  name: 'Nombre',
  description: 'Descripción',
  family: 'Categoría',
  retired: 'Dado de baja en el origen',
};

/**
 * Review queue for rows where a manual edit and the pipeline disagree.
 *
 * Each row carries its own `field`, and the actions act on THAT field only —
 * accepting an upstream title must not discard a category the user also edited.
 */
@Component({
  selector: 'app-admin-drift-panel',
  template: `
    @if (!rows().length) {
      <p class="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-700">
        Nada que revisar: ninguna edición manual entra en conflicto con el origen.
      </p>
    } @else {
      <p class="max-w-prose text-sm text-slate-700">
        El origen cambió campos que ya habías editado. Tu valor sigue publicándose; decide campo por
        campo si lo conservas o si aceptas el del origen.
      </p>
      <div class="mt-3 overflow-x-auto">
        <table class="w-full border-collapse text-left text-sm">
          <caption class="sr-only">
            Ediciones manuales en conflicto con el origen, una fila por campo
          </caption>
          <thead class="bg-slate-100">
            <tr class="border-b border-slate-300">
              <th scope="col" class="px-3 py-2 font-semibold">Elemento</th>
              <th scope="col" class="px-3 py-2 font-semibold">Campo</th>
              <th scope="col" class="px-3 py-2 font-semibold">Valor al editar</th>
              <th scope="col" class="px-3 py-2 font-semibold">Origen ahora</th>
              <th scope="col" class="px-3 py-2 font-semibold">Tu valor</th>
              <th scope="col" class="px-3 py-2"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track key(row)) {
              <tr class="border-b border-slate-200" [attr.data-drift]="key(row)">
                <!-- row header: ties the three value cells to their entity for
                     anyone navigating the table without sight of the layout -->
                <th scope="row" class="px-3 py-2 text-left font-mono text-xs font-normal">
                  {{ row.entity === 'model' ? 'Modelo' : 'Repuesto' }} {{ row.entity_id }}
                </th>
                <td class="px-3 py-2">{{ label(row.field) }}</td>
                <td class="px-3 py-2 text-slate-700">{{ row.value_at_edit ?? '—' }}</td>
                <td class="px-3 py-2 text-amber-800">{{ row.pipeline_now ?? '—' }}</td>
                <td class="px-3 py-2 font-medium text-slate-900">{{ row.human_value ?? '—' }}</td>
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  @if (row.field === 'retired') {
                    <button type="button" class="rounded-sm text-xs text-red-700 underline" (click)="accept.emit(row)">
                      Descartar mi edición
                    </button>
                  } @else {
                    <button type="button" class="rounded-sm text-xs text-blue-800 underline" (click)="keep.emit(row)">
                      Conservar el mío
                    </button>
                    <button type="button" class="ml-3 rounded-sm text-xs text-red-700 underline" (click)="accept.emit(row)">
                      Aceptar el del origen
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminDriftPanel {
  readonly rows = input.required<readonly DriftRow[]>();
  readonly keep = output<DriftRow>();
  readonly accept = output<DriftRow>();

  protected key(row: DriftRow): string {
    return `${row.entity}:${row.entity_id}:${row.field}`;
  }

  protected label(field: string): string {
    return FIELD_LABEL[field] ?? field;
  }
}
