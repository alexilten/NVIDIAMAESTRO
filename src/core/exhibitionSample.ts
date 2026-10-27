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

/**
 * A generic 12 × 10 m peninsula stand with an upper deck at the back: a 6 × 4 m deck at 2700 mm with a stair
 * down its front edge and a lift on its right, two modules upstairs and the rest on the floor. Every plot,
 * limit and deck figure is a placeholder or Estimated.
 */
export function sampleTwoStorey(): Composition {
  let c = newExhibition('Sample two-storey booth');
  const booth = defaultBooth();
  booth.width = { ...booth.width, value: 12000 };
  booth.depth = { ...booth.depth, value: 10000 };
  booth.open = { front: true, right: true, back: false, left: true };
  booth.services = [{ id: 'sp-1', name: 'S1', kind: 'power-data', x: 0, y: 0, status: 'placeholder' }];
  booth.decks = [{
    id: 'deck-1', name: 'D1', x: 0, y: 3000, w: 6000, d: 4000, level: 2700, status: 'placeholder',
    stair: { side: 'front', offset: -2400, width: 1200 }, lift: { side: 'right', offset: 0 },
  }];
  c = { ...c, booth };
  const put = (id: string, at: [number, number], rot = 0, z = 0) => {
    const r = placeModule(c, tpl(id).build(), shapeOf, at, rot, true);
    c = z ? { ...r.comp, items: r.comp.items.map((i) => (r.ids.includes(i.id) ? { ...i, position: [i.position[0], i.position[1], i.position[2] + z] } : i)) } : r.comp;
  };
  put('tpl-station-podium', [-1000, 4200], 0, 2700);
  put('tpl-switch-table', [1500, 4300], 0, 2700);
  put('tpl-board-niche', [-4500, 4850]);
  put('tpl-board-niche', [-4500, 1300]);
  put('tpl-switch-table', [1500, 2500]);
  put('tpl-spark-counter', [-4000, -2600]);
  put('tpl-accessible-counter', [3000, -3200]);
  return c;
}
