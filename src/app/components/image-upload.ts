import { Component, effect, inject, input, output, signal } from '@angular/core';

import { AdminApi, describeError, type ImageRow } from '../services/admin-api';

/**
 * Uploads photos for one model or part and lists what is already stored.
 *
 * The file input is never `disabled`: a disabled control is skipped by screen
 * readers and drops focus the moment it becomes unreachable. Validation happens
 * on submit instead, which is also where the error belongs.
 */
@Component({
  selector: 'app-image-upload',
  template: `
    <div class="flex flex-wrap items-start gap-4">
      @for (image of stored(); track image.id) {
        <figure class="w-20">
          <img
            [src]="api.imageUrl(image.storage_key)"
            [alt]="image.alt_text"
            width="72"
            height="72"
            class="h-18 w-18 rounded border border-slate-300 object-contain"
          />
          <figcaption class="mt-1 truncate text-xs text-slate-600" [title]="image.alt_text">
            {{ image.alt_text || 'Decorativa' }}
          </figcaption>
          <button
            type="button"
            class="mt-0.5 rounded-sm text-xs text-red-700 underline"
            (click)="remove(image)"
          >
            Quitar
          </button>
        </figure>
      }

      <div class="flex flex-col gap-2">
        <label class="text-xs font-medium text-slate-700">
          <span class="block">Texto alternativo (vacío = decorativa)</span>
          <input
            type="text"
            class="mt-1 w-60 rounded-md border border-slate-400 px-2 py-1 text-sm"
            placeholder="Ej. Vista frontal del ventilador"
            [value]="altText()"
            (input)="altText.set($any($event.target).value)"
          />
        </label>

        <label class="text-xs font-medium text-slate-700">
          <span class="block">Foto (webp, jpg o png)</span>
          <input
            #picker
            type="file"
            accept="image/webp,image/jpeg,image/png"
            class="mt-1 w-60 text-xs"
            (change)="upload($any($event.target).files, picker)"
          />
        </label>

        @if (message(); as text) {
          <p class="max-w-60 text-xs" [class]="failed() ? 'text-red-700' : 'text-emerald-700'">
            {{ text }}
          </p>
        }
      </div>
    </div>
  `,
})
export class ImageUpload {
  readonly entityType = input.required<'model' | 'part'>();
  readonly entityId = input.required<string>();
  /** Emitted so the page can announce the result in its own live region. */
  readonly announce = output<string>();

  protected readonly api = inject(AdminApi);
  protected readonly stored = signal<readonly ImageRow[]>([]);
  protected readonly altText = signal('');
  protected readonly message = signal('');
  protected readonly failed = signal(false);

  constructor() {
    // An effect reads the inputs once Angular has actually set them, which a
    // constructor cannot do for a required input.
    effect(() => {
      const type = this.entityType();
      const id = this.entityId();
      void this.refresh(type, id);
    });
  }

  private async refresh(type: 'model' | 'part', id: string): Promise<void> {
    try {
      this.stored.set(await this.api.images(type, id));
    } catch (error) {
      // Surfaced rather than swallowed: an empty gallery and a failed fetch
      // look identical otherwise.
      this.failed.set(true);
      this.message.set(`No se pudieron cargar las fotos. ${describeError(error)}`);
    }
  }

  protected async upload(files: FileList | null, picker: HTMLInputElement): Promise<void> {
    const file = files?.[0];
    if (!file) {
      return;
    }
    this.failed.set(false);
    this.message.set('Subiendo…');
    try {
      await this.api.uploadImage(file, this.entityType(), this.entityId(), this.altText().trim());
      await this.refresh(this.entityType(), this.entityId());
      this.message.set('Imagen guardada.');
      this.announce.emit('Imagen guardada.');
      this.altText.set('');
    } catch (error) {
      this.failed.set(true);
      this.message.set(describeError(error));
      this.announce.emit(`Error al subir la imagen. ${describeError(error)}`);
    } finally {
      // Cleared either way so the same file can be retried.
      picker.value = '';
    }
  }

  protected async remove(image: ImageRow): Promise<void> {
    this.failed.set(false);
    try {
      await this.api.deleteImage(image.id);
      await this.refresh(this.entityType(), this.entityId());
      this.message.set('Imagen eliminada.');
      this.announce.emit('Imagen eliminada.');
    } catch (error) {
      this.failed.set(true);
      this.message.set(describeError(error));
    }
  }
}
