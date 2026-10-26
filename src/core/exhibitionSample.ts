import type { ShapeOf } from './arrange';
import { defaultBooth, newExhibition, placeModule } from './booth';
import { resolveRef } from './library';
import type { Composition, Placement } from './schema';
import { TEMPLATES } from './templates';

/**
 * A generic sample exhibition built from the public templates: a 10 × 8 m corner booth, open to the front and
 * left aisles. It stands for no real show; its plot, limits and service points are placeholders.
 */

const shapeOf: ShapeOf = (p: Placement) => resolveRef(p.ref, [])?.shape ?? null;
const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!;

export function sampleExhibition(): Composition {
  let c = newExhibition('Sample corner booth');
  const booth = defaultBooth();
  booth.services = [
    { id: 'sp-1', name: 'S1', kind: 'power-data', x: 2000, y: 1200, status: 'placeholder' },
    { id: 'sp-2', name: 'S2', kind: 'power', x: -4500, y: 3500, status: 'placeholder' },
  ];
  c = { ...c, booth };
  const put = (id: string, at: [number, number], rot = 0) => { c = placeModule(c, tpl(id).build(), shapeOf, at, rot, true).comp; };
  put('tpl-board-niche', [-3000, 3850]);
  put('tpl-board-niche', [-1200, 3850]);
  put('tpl-station-podium', [1500, 3300]);
  put('tpl-spark-counter', [4500, 500], 270);
  put('tpl-switch-table', [-800, 400]);
  put('tpl-accessible-counter', [1600, -2600]);
  return c;
}
