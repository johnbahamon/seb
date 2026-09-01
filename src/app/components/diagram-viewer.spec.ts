import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { DiagramViewer } from './diagram-viewer';
import { PartsTable } from './parts-table';
import type { Diagram, ModelRow, Part } from '../models/catalog.models';

const DIAGRAMS: Diagram[] = [
  { image: 'images/despiece/demo-1.webp', width: 600, height: 800, part: 1 },
  { image: 'images/despiece/demo-2.webp', width: 600, height: 800, part: 2 },
];

function part(code: string, description: string): Part {
  return {
    code,
    cmmf: '5861030187',
    description,
    ean: null,
    ue: 1,
    ucMaster: null,
    family: 'Ventiladores',
    productLine: null,
    brand: 'SAMURAI',
    sources: ['2023'],
    models: ['demo'],
    photo: null,
    photoWidth: null,
    photoHeight: null,
    priceRegular: null,
    priceGross: null,
    currency: null,
  };
}

const ROWS: ModelRow[] = [
  {
    rowId: 'demo:0',
    part: part('SS-111111', 'MALLA DELANTERA'),
    // Deliberately the largest hotspot, to check the ordering.
    hotspot: { x0: 0, y0: 0, x1: 0.9, y1: 0.9, diagram: 0 },
  },
  {
    rowId: 'demo:1',
    part: part('SS-222222', 'PERILLA DE VELOCIDADES'),
    hotspot: { x0: 0.1, y0: 0.1, x1: 0.3, y1: 0.3, diagram: 0 },
  },
  {
    rowId: 'demo:2',
    part: part('SS-333333', 'MOTOR'),
    hotspot: { x0: 0.2, y0: 0.2, x1: 0.5, y1: 0.5, diagram: 1 },
  },
  { rowId: 'demo:3', part: part('SS-444444', 'TORNILLO'), hotspot: null },
];

@Component({
  imports: [DiagramViewer, PartsTable],
  template: `
    <app-diagram-viewer [diagrams]="diagrams" [rows]="rows" [(activeRow)]="active" />
    <app-parts-table [rows]="rows" [(activeRow)]="active" />
  `,
})
class Host {
  readonly diagrams = DIAGRAMS;
  readonly rows = ROWS;
  readonly active = signal<string | null>(null);
}

describe('DiagramViewer', () => {
  async function render() {
    // PartsTable links each code to its part page, so RouterLink needs a router.
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture;
  }

  it('renders only the hotspots of the active plate, largest first', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const hotspots = element.querySelectorAll('app-diagram-viewer [aria-pressed]');
    // Two plate buttons plus the two hotspots that belong to plate 1.
    const labels = [...hotspots].map((node) => node.textContent?.trim());
    expect(labels).toContain('Parte 1');
    expect(labels.some((l) => l?.includes('SS-111111'))).toBe(true);
    expect(labels.some((l) => l?.includes('SS-222222'))).toBe(true);
    // SS-333333 lives on plate 2 and must not be rendered yet.
    expect(labels.some((l) => l?.includes('SS-333333'))).toBe(false);
  });

  it('links a hotspot click to the table selection', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const hotspot = [...element.querySelectorAll('app-diagram-viewer button')].find((node) =>
      node.textContent?.includes('SS-222222'),
    ) as HTMLButtonElement;

    hotspot.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.active()).toBe('demo:1');
    const highlighted = element.querySelectorAll('app-parts-table tr.bg-blue-50');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]!.textContent).toContain('SS-222222');
  });

  it('highlights the hotspot when the table row takes focus', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const link = [...element.querySelectorAll('app-parts-table a')].find((node) =>
      node.textContent?.includes('SS-111111'),
    ) as HTMLAnchorElement;

    link.dispatchEvent(new Event('focusin', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.active()).toBe('demo:0');
    // `.absolute` picks the hotspot overlay buttons, not the plate selector,
    // which is also an aria-pressed toggle.
    const pressed = element.querySelector('app-diagram-viewer button.absolute[aria-pressed="true"]');
    expect(pressed?.textContent).toContain('SS-111111');
  });

  it('exposes zoom controls and clamps the scale at 100% initially', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('100%');
    const zoomOut = [...element.querySelectorAll('app-diagram-viewer button')].find((node) =>
      node.textContent?.includes('Alejar'),
    ) as HTMLButtonElement;
    expect(zoomOut.disabled).toBe(true);
  });

  it('switches plates and shows the other plate hotspots', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const plate2 = [...element.querySelectorAll('app-diagram-viewer button')].find(
      (node) => node.textContent?.trim() === 'Parte 2',
    ) as HTMLButtonElement;

    plate2.click();
    fixture.detectChanges();

    const labels = [...element.querySelectorAll('app-diagram-viewer button')].map((n) =>
      n.textContent?.trim(),
    );
    expect(labels.some((l) => l?.includes('SS-333333'))).toBe(true);
    expect(labels.some((l) => l?.includes('SS-111111'))).toBe(false);
  });
});
