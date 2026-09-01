import { Component, computed, input, model, signal, viewChild, ElementRef } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';

import type { Diagram, ModelRow } from '../models/catalog.models';

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const STEP = 0.4;

@Component({
  selector: 'app-diagram-viewer',
  imports: [NgOptimizedImage],
  template: `
    <div class="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 no-print">
      @if (diagrams().length > 1) {
        <div class="flex items-center gap-1" role="group" aria-label="Láminas del despiece">
          @for (diagram of diagrams(); track diagram.image; let i = $index) {
            <button
              type="button"
              class="rounded-md border px-2.5 py-1 text-sm font-medium"
              [class.border-blue-700]="i === activeDiagram()"
              [class.bg-blue-700]="i === activeDiagram()"
              [class.text-white]="i === activeDiagram()"
              [class.border-slate-300]="i !== activeDiagram()"
              [class.bg-white]="i !== activeDiagram()"
              [attr.aria-pressed]="i === activeDiagram()"
              (click)="selectDiagram(i)"
            >
              Parte {{ diagram.part }}
            </button>
          }
        </div>
      }

      <div class="ml-auto flex items-center gap-1" role="group" aria-label="Zoom">
        <button type="button" class="zoom-btn" (click)="zoomBy(-STEP)" [disabled]="scale() <= MIN_SCALE">
          <span aria-hidden="true">−</span><span class="sr-only">Alejar</span>
        </button>
        <span class="w-14 text-center text-sm tabular-nums text-slate-700" aria-live="polite">
          {{ (scale() * 100).toFixed(0) }}%
        </span>
        <button type="button" class="zoom-btn" (click)="zoomBy(STEP)" [disabled]="scale() >= MAX_SCALE">
          <span aria-hidden="true">+</span><span class="sr-only">Acercar</span>
        </button>
        <button type="button" class="zoom-btn w-auto px-2 text-xs" (click)="reset()">Ajustar</button>
      </div>
    </div>

    <div
      #frame
      class="relative touch-none overflow-hidden bg-white"
      [style.aspect-ratio]="aspectRatio()"
      [class.cursor-grab]="scale() > 1 && !panning()"
      [class.cursor-grabbing]="panning()"
      tabindex="0"
      role="group"
      [attr.aria-label]="
        'Lámina de despiece. Usa más y menos para el zoom, cero para ajustar, y las flechas para desplazarte.'
      "
      (keydown)="onKeydown($event)"
      (wheel)="onWheel($event)"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerUp($event)"
    >
      <div
        class="absolute inset-0 origin-top-left"
        [style.transform]="'translate(' + offsetX() + 'px,' + offsetY() + 'px) scale(' + scale() + ')'"
        [style.transition]="panning() ? 'none' : 'transform 120ms ease-out'"
      >
        @if (current(); as diagram) {
          <img
            [ngSrc]="diagram.image"
            fill
            priority
            [alt]="alt()"
            class="object-contain"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        }

        @for (row of hotspotRows(); track row.rowId) {
          <button
            type="button"
            class="absolute rounded-sm border-2 transition-colors"
            [class.border-blue-700]="row.rowId === activeRow()"
            [class.bg-blue-700/15]="row.rowId === activeRow()"
            [class.border-transparent]="row.rowId !== activeRow()"
            [class.hover:border-blue-500]="row.rowId !== activeRow()"
            [style.left.%]="row.hotspot!.x0 * 100"
            [style.top.%]="row.hotspot!.y0 * 100"
            [style.width.%]="(row.hotspot!.x1 - row.hotspot!.x0) * 100"
            [style.height.%]="(row.hotspot!.y1 - row.hotspot!.y0) * 100"
            [attr.aria-pressed]="row.rowId === activeRow()"
            (click)="activeRow.set(row.rowId)"
            (focus)="activeRow.set(row.rowId)"
            (mouseenter)="activeRow.set(row.rowId)"
          >
            <span class="sr-only">{{ row.part.code }} — {{ row.part.description }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    /* Component styles compile in isolation under Tailwind 4, so @apply needs this. */
    @reference "tailwindcss";

    .zoom-btn {
      @apply flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-base font-semibold text-slate-700 disabled:opacity-40;
    }
  `,
  host: { class: 'block overflow-hidden rounded-lg border border-slate-200 bg-white' },
})
export class DiagramViewer {
  readonly diagrams = input.required<readonly Diagram[]>();
  readonly rows = input.required<readonly ModelRow[]>();
  readonly alt = input('Lámina de despiece');
  /** Two-way bound with the parts table so hovering either side highlights the other. */
  readonly activeRow = model<string | null>(null);

  protected readonly MIN_SCALE = MIN_SCALE;
  protected readonly MAX_SCALE = MAX_SCALE;
  protected readonly STEP = STEP;

  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
  protected readonly activeDiagram = signal(0);
  protected readonly scale = signal(1);
  protected readonly offsetX = signal(0);
  protected readonly offsetY = signal(0);
  protected readonly panning = signal(false);

  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStart: { distance: number; scale: number } | null = null;
  private panOrigin: { x: number; y: number; ox: number; oy: number } | null = null;

  protected readonly current = computed<Diagram | undefined>(
    () => this.diagrams()[this.activeDiagram()],
  );

  protected readonly aspectRatio = computed(() => {
    const diagram = this.current();
    return diagram ? `${diagram.width} / ${diagram.height}` : '3 / 4';
  });

  protected readonly hotspotRows = computed(() =>
    this.rows()
      .filter((row) => row.hotspot?.diagram === this.activeDiagram())
      // Largest first so a small hotspot nested inside a big one stays clickable.
      .sort(
        (a, b) =>
          (b.hotspot!.x1 - b.hotspot!.x0) * (b.hotspot!.y1 - b.hotspot!.y0) -
          (a.hotspot!.x1 - a.hotspot!.x0) * (a.hotspot!.y1 - a.hotspot!.y0),
      ),
  );

  protected selectDiagram(index: number): void {
    this.activeDiagram.set(index);
    this.reset();
  }

  protected reset(): void {
    this.scale.set(1);
    this.offsetX.set(0);
    this.offsetY.set(0);
  }

  protected zoomBy(delta: number, anchor?: { x: number; y: number }): void {
    const previous = this.scale();
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, previous + delta));
    if (next === previous) {
      return;
    }
    const element = this.frame()?.nativeElement;
    const point = anchor ?? {
      x: (element?.clientWidth ?? 0) / 2,
      y: (element?.clientHeight ?? 0) / 2,
    };
    // Keep the anchor point stationary while the scale changes.
    const ratio = next / previous;
    this.offsetX.set(point.x - (point.x - this.offsetX()) * ratio);
    this.offsetY.set(point.y - (point.y - this.offsetY()) * ratio);
    this.scale.set(next);
    this.clamp();
  }

  private clamp(): void {
    const element = this.frame()?.nativeElement;
    if (!element) {
      return;
    }
    const scale = this.scale();
    const maxX = 0;
    const minX = element.clientWidth * (1 - scale);
    const minY = element.clientHeight * (1 - scale);
    this.offsetX.set(Math.min(maxX, Math.max(minX, this.offsetX())));
    this.offsetY.set(Math.min(0, Math.max(minY, this.offsetY())));
  }

  protected onWheel(event: WheelEvent): void {
    // Only take over the wheel when the user asks for zoom, so the page keeps scrolling.
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.zoomBy(event.deltaY < 0 ? STEP : -STEP, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    const nudge = 40;
    switch (event.key) {
      case '+':
      case '=':
        this.zoomBy(STEP);
        break;
      case '-':
      case '_':
        this.zoomBy(-STEP);
        break;
      case '0':
        this.reset();
        break;
      case 'ArrowLeft':
        this.offsetX.update((v) => v + nudge);
        this.clamp();
        break;
      case 'ArrowRight':
        this.offsetX.update((v) => v - nudge);
        this.clamp();
        break;
      case 'ArrowUp':
        this.offsetY.update((v) => v + nudge);
        this.clamp();
        break;
      case 'ArrowDown':
        this.offsetY.update((v) => v - nudge);
        this.clamp();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  protected onPointerDown(event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      this.pinchStart = { distance: this.pointerDistance(), scale: this.scale() };
      return;
    }
    if (this.scale() > 1) {
      this.panning.set(true);
      this.panOrigin = {
        x: event.clientX,
        y: event.clientY,
        ox: this.offsetX(),
        oy: this.offsetY(),
      };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) {
      return;
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size === 2 && this.pinchStart) {
      const factor = this.pointerDistance() / this.pinchStart.distance;
      const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.pinchStart.scale * factor));
      this.zoomBy(target - this.scale());
      return;
    }
    if (this.panning() && this.panOrigin) {
      this.offsetX.set(this.panOrigin.ox + (event.clientX - this.panOrigin.x));
      this.offsetY.set(this.panOrigin.oy + (event.clientY - this.panOrigin.y));
      this.clamp();
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) {
      this.pinchStart = null;
    }
    if (this.pointers.size === 0) {
      this.panning.set(false);
      this.panOrigin = null;
    }
  }

  private pointerDistance(): number {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) {
      return 1;
    }
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }
}
