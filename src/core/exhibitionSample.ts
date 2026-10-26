import type { ShapeOf } from './arrange';
import { defaultBooth, newExhibition, placeModule, planExtent } from './booth';
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

/**
 * A generic 9 × 9 m island booth, open on all four sides: two board niches back to back in the middle, and the
 * other modules round the edges, each facing its nearest aisle. Placeholder plot, limits and service point.
 */
export function sampleIsland(): Composition {
  let c = newExhibition('Sample island booth');
  const booth = defaultBooth();
  booth.width = { ...booth.width, value: 9000 };
  booth.depth = { ...booth.depth, value: 9000 };
  booth.open = { front: true, right: true, back: true, left: true };
  booth.services = [{ id: 'sp-1', name: 'S1', kind: 'power-data', x: 0, y: 0, status: 'placeholder' }];
  c = { ...c, booth };
  const put = (id: string, at: [number, number], rot = 0) => { c = placeModule(c, tpl(id).build(), shapeOf, at, rot, true).comp; };
  const half = (id: string) => { const e = planExtent(tpl(id).build().items, shapeOf)!; return (e.max[1] - e.min[1]) / 2; };
  const n = half('tpl-board-niche');
  put('tpl-board-niche', [0, -n], 0);
  put('tpl-board-niche', [0, n], 180);
  put('tpl-spark-counter', [-3400, 0], 270);
  put('tpl-switch-table', [3400, 0], 90);
  put('tpl-station-podium', [-2700, 3300], 180);
  put('tpl-accessible-counter', [2700, -3300], 0);
  return c;
}
