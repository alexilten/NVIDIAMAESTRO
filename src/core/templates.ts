import { placeOn } from './arrange';
import { addItem, groupItems, newComposition, uid } from './compose';
import { defaultParams } from './geometry/kit';
import { boxSize, shapeBounds } from './geometry/shape';
import { resolveRef } from './library';
import type { Composition, ItemRef, Placement, Vec3 } from './schema';

/**
 * Starting points for demo modules, built only from the public catalog and the parametric kit. A template is
 * an ordinary composition: once inserted, every item can be moved, swapped or deleted.
 */

export interface Template { id: string; name: string; description: string; build: () => Composition }

const shapeOf = (p: Placement) => resolveRef(p.ref, [])?.shape ?? null;
const dimsOf = (ref: ItemRef): Vec3 => boxSize(shapeBounds(resolveRef(ref, [])!.shape!));
const kit = (id: string, over: Record<string, number> = {}): ItemRef => ({ kind: 'kit', id, params: { ...defaultParams(id), ...over } });
const product = (id: string): ItemRef => ({ kind: 'product', id });

/** a small builder: place items, stand them on each other, group the result */
class Builder {
  c: Composition;
  constructor(name: string) { this.c = newComposition(name); }
  add(ref: ItemRef, name: string, at: Vec3 = [0, 0, 0]) { const r = addItem(this.c, ref, name, dimsOf(ref), at); this.c = r.comp; return r.id; }
  on(item: string, support: string, times = 1) { for (let k = 0; k < times; k++) this.c = placeOn(this.c, item, support, shapeOf)!.comp; return item; }
  group(name: string) { this.c = groupItems(this.c, this.c.items.map((i) => i.id), name).comp; return this.c; }
}

export const TEMPLATES: Template[] = [
  {
    id: 'tpl-spark-counter',
    name: 'DGX Spark demo counter',
    description: 'A 1800 mm counter with a 55-inch display and two DGX Spark units on the worktop.',
    build: () => {
      const b = new Builder('DGX Spark demo counter');
      const counter = b.add(kit('kit-demo-counter'), 'Demo counter');
      b.on(b.add(product('nv-dgx-spark'), 'DGX Spark', [-300, 0, 0]), counter);
      b.on(b.add(product('nv-dgx-spark'), 'DGX Spark', [300, 0, 0]), counter);
      return b.group('Spark counter');
    },
  },
  {
    id: 'tpl-accessible-counter',
    name: 'Accessible demo counter',
    description: 'A 2400 mm counter whose left 900 mm drops to 860 mm, with a DGX Spark at each height.',
    build: () => {
      const b = new Builder('Accessible demo counter');
      const counter = b.add(kit('kit-demo-counter', { width: 2400, accessible: 900 }), 'Demo counter');
      b.on(b.add(product('nv-dgx-spark'), 'DGX Spark (seated)', [-750, 0, 0]), counter);
      b.on(b.add(product('nv-dgx-spark'), 'DGX Spark (standing)', [450, 0, 0]), counter);
      return b.group('Accessible counter');
    },
  },
  {
    id: 'tpl-station-podium',
    name: 'DGX Station podium',
    description: 'A low 1400 × 800 mm light table carrying two DGX Station desksides.',
    build: () => {
      const b = new Builder('DGX Station podium');
      const table = b.add(kit('kit-light-table', { width: 1400, depth: 800, height: 400 }), 'Podium');
      b.on(b.add(product('dell-pro-max-gb300'), 'Dell Pro Max with GB300', [-330, 0, 0]), table);
      b.on(b.add(product('gb-w775-v10'), 'GIGABYTE W775-V10-L01', [330, 0, 0]), table);
      return b.group('Station podium');
    },
  },
  {
    id: 'tpl-board-niche',
    name: 'RTX PRO board niche',
    description: 'A lit wall niche with two shelves: RTX PRO 6000 Workstation Edition on the base, RTX PRO 5000 and RTX PRO 6000 Max-Q on the shelves.',
    build: () => {
      const b = new Builder('RTX PRO board niche');
      const niche = b.add(kit('kit-gallery-niche', { depth: 300 }), 'Gallery niche');
      b.on(b.add(product('nv-rtx-pro-6000-ws'), 'RTX PRO 6000 Workstation Edition'), niche);
      b.on(b.add(product('nv-rtx-pro-5000'), 'RTX PRO 5000'), niche, 2);
      b.on(b.add(product('nv-rtx-pro-6000-maxq'), 'RTX PRO 6000 Max-Q'), niche, 3);
      return b.group('Board niche');
    },
  },
  {
    id: 'tpl-switch-table',
    name: 'Spectrum-X switch table',
    description: 'A 1200 × 1100 mm light table with the SN6800-LD and SN6810-LD Photonics switches side by side.',
    build: () => {
      const b = new Builder('Spectrum-X switch table');
      const table = b.add(kit('kit-light-table', { width: 1200, depth: 1100 }), 'Light table');
      b.on(b.add(product('nv-sn6800-ld'), 'SN6800-LD', [-260, 0, 0]), table);
      b.on(b.add(product('nv-sn6810-ld'), 'SN6810-LD', [260, 0, 0]), table);
      return b.group('Switch table');
    },
  },
];

/**
 * Insert one composition into another as a new group, offset so it lands clear of what is there. Items get new
 * ids; their references, rotations and snapshots are kept.
 */
export function insertComposition(target: Composition, src: Composition, offset: Vec3, groupName = src.name): { comp: Composition; ids: string[] } {
  const gid = uid('grp');
  const names = new Set(target.items.map((i) => i.name));
  const ids: string[] = [];
  const items = src.items.map((i) => {
    let name = i.name;
    for (let k = 2; names.has(name); k++) name = `${i.name} ${k}`;
    names.add(name);
    const id = uid('it');
    ids.push(id);
    return { ...i, id, name, groupId: gid, position: [i.position[0] + offset[0], i.position[1] + offset[1], i.position[2] + offset[2]] as Vec3 };
  });
  return { comp: { ...target, items: [...target.items, ...items], groups: [...target.groups, { id: gid, name: groupName }], updatedAt: new Date().toISOString() }, ids };
}
