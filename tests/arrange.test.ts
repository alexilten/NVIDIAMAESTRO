import { describe, expect, it } from 'vitest';
import { placeOn, snapDelta, supportSurfaces, worldBoxes } from '../src/core/arrange';
import { addItem, newComposition } from '../src/core/compose';
import { defaultParams } from '../src/core/geometry/kit';
import { boxSize, shapeBounds } from '../src/core/geometry/shape';
import { resolveRef } from '../src/core/library';
import { schedule, scheduleCsv } from '../src/core/services';
import { buildSheet } from '../src/core/sheet';
import { TEMPLATES, insertComposition } from '../src/core/templates';
import type { Composition, ItemRef, Placement, Vec3 } from '../src/core/schema';

const shapeOf = (p: Placement) => resolveRef(p.ref, [])?.shape ?? null;
const dimsOf = (ref: ItemRef): Vec3 => boxSize(shapeBounds(resolveRef(ref, [])!.shape!));
const kit = (id: string, over: Record<string, number> = {}): ItemRef => ({ kind: 'kit', id, params: { ...defaultParams(id), ...over } });
const spark: ItemRef = { kind: 'product', id: 'nv-dgx-spark' };
const add = (c: Composition, ref: ItemRef, at: Vec3 = [0, 0, 0]) => addItem(c, ref, 'x', dimsOf(ref), at);
const item = (c: Composition, id: string) => c.items.find((i) => i.id === id)!;

describe('placing items on surfaces', () => {
  it('stands an item on the worktop it is over, or on the accessible section when it is over that', () => {
    let c = newComposition();
    const counter = add(c, kit('kit-demo-counter', { width: 2400, accessible: 900 })); c = counter.comp;
    const a = add(c, spark, [600, 0, 0]); c = a.comp;
    const b = add(c, spark, [-800, 0, 0]); c = b.comp;
    c = placeOn(c, a.id, counter.id, shapeOf)!.comp;
    c = placeOn(c, b.id, counter.id, shapeOf)!.comp;
    expect(item(c, a.id).position).toEqual([600, 0, 1000]);
    expect(item(c, b.id).position[2]).toBe(860);
  });

  it('steps through a niche’s base and shelves, and keeps items inside the niche depth', () => {
    let c = newComposition();
    const niche = add(c, kit('kit-gallery-niche')); c = niche.comp;
    const board = add(c, { kind: 'product', id: 'nv-rtx-pro-5000' }); c = board.comp;
    const surfaces = supportSurfaces(shapeOf(item(c, niche.id))!);
    expect(surfaces.map((s) => s.name)).toEqual(['NICHE_BASE', 'SHELF_1', 'SHELF_2']);
    const seen: number[] = [];
    for (let k = 0; k < 4; k++) { c = placeOn(c, board.id, niche.id, shapeOf)!.comp; seen.push(item(c, board.id).position[2]); }
    // positions are kept to 0.1 mm
    [...surfaces.map((s) => s.z), surfaces[0].z].forEach((z, k) => expect(seen[k]).toBeCloseTo(z, 1));
    const y = item(c, board.id).position[1];
    expect(y).toBeGreaterThan(surfaces[0].min[1]);
    expect(y).toBeLessThan(surfaces[0].max[1]);
  });

  it('follows a rotated support', () => {
    let c = newComposition();
    const table = add(c, kit('kit-light-table'), [1000, 500, 0]); c = table.comp;
    c = { ...c, items: c.items.map((i) => (i.id === table.id ? { ...i, rotation: 90 } : i)) };
    const s = add(c, spark, [1000, 500, 0]); c = s.comp;
    const r = placeOn(c, s.id, table.id, shapeOf)!;
    expect(r.surface).toBe('LIGHT_TOP');
    expect(item(r.comp, s.id).position).toEqual([1000, 500, 899]);
    expect(r.overhang).toBe(false);
  });
});

describe('snapping', () => {
  const other = { min: [0, 0, 0] as Vec3, max: [1000, 600, 900] as Vec3 };
  const mover = { min: [1100, 0, 0] as Vec3, max: [1500, 400, 900] as Vec3 };
  it('butts faces and lines up edges within the tolerance', () => {
    const s = snapDelta(mover, [other], [-70, 25, 0]);
    expect(s.delta).toEqual([-100, 0, 0]);
    expect(s.note).toBe('X butt, Y flush');
  });
  it('leaves a move alone beyond the tolerance', () => {
    expect(snapDelta(mover, [other], [-300, 150, 0]).delta).toEqual([-300, 150, 0]);
  });
});

describe('templates', () => {
  it('builds every template from resolvable items, with each product standing on a surface', () => {
    for (const t of TEMPLATES) {
      const c = t.build();
      expect(c.items.length, t.id).toBeGreaterThan(1);
      expect(c.groups).toHaveLength(1);
      const supports = c.items.filter((i) => i.ref.kind === 'kit');
      for (const p of c.items.filter((i) => i.ref.kind === 'product')) {
        expect(shapeOf(p), `${t.id} ${p.name}`).not.toBeNull();
        const zs = supports.flatMap((s) => supportSurfaces(shapeOf(s)!).map((x) => s.position[2] + x.z));
        expect(zs.some((z) => Math.abs(z - p.position[2]) <= 0.05), `${t.id}: ${p.name} at ${p.position[2]}`).toBe(true);
      }
    }
  });

  it('inserts a template as one new group with fresh ids', () => {
    const base = TEMPLATES[0].build();
    const r = insertComposition(base, TEMPLATES[0].build(), [3000, 0, 0]);
    expect(r.comp.items).toHaveLength(base.items.length * 2);
    expect(r.comp.groups).toHaveLength(2);
    expect(new Set(r.comp.items.map((i) => i.id)).size).toBe(r.comp.items.length);
    expect(new Set(r.comp.items.map((i) => i.name)).size).toBe(r.comp.items.length);
  });
});

describe('power and data schedule', () => {
  it('sums stated figures for live items only and counts what is unknown', () => {
    let c = TEMPLATES.find((t) => t.id === 'tpl-board-niche')!.build();
    let s = schedule(c, (p) => p.name);
    expect(s.knownWatts).toBe(0); // boards on display are static by default
    c = { ...c, items: c.items.map((i) => (i.ref.kind === 'product' && i.ref.id === 'nv-rtx-pro-6000-ws' ? { ...i, live: true } : i)) };
    s = schedule(c, (p) => p.name);
    expect(s.knownWatts).toBe(600);
    const spark2 = TEMPLATES[0].build();
    const ss = schedule(spark2, (p) => p.name);
    expect(ss.knownWatts).toBe(480);
    expect(ss.unknownLive).toBe(1); // the counter's display and outlets
    expect(scheduleCsv(ss, 'x').split('\n')[0]).toMatch(/^Item,Quantity,Live/);
  });
});

describe('elevation sheet', () => {
  it('draws a module to a standard scale with its overall dimensions and an item per placement', () => {
    const c = TEMPLATES.find((t) => t.id === 'tpl-board-niche')!.build();
    const r = buildSheet(c, shapeOf, { statusOf: () => 'estimated', date: '2026-10-26' })!;
    expect(r.scale).toBe(20);
    expect(r.overall.map(Math.round)).toEqual([1500, 300, 2700]);
    expect(r.items).toHaveLength(c.items.length);
    expect(r.svg).toContain('width="420mm"');
    for (const v of ['>1500<', '>2700<', '>300<', 'Scale 1:20']) expect(r.svg).toContain(v);
    expect((r.svg.match(/<g /g) ?? []).length).toBe((r.svg.match(/<\/g>/g) ?? []).length);
    expect(buildSheet(newComposition(), shapeOf, { statusOf: () => 'verified' })).toBeNull();
  });
});

describe('placed boxes of large meshes', () => {
  it('boxes a large mesh by 1 m tiles, so an L of wall does not block the floor inside the L', () => {
    // two thin walls, 6 m along X and 6 m along Y, meeting at the origin
    const quad = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, 0, x1, y1, 0, x1, y1, 2400, x0, y0, 2400];
    const positions = new Float32Array([...quad(0, 0, 6000, 0), ...quad(0, 0, 0, 6000)]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    const shape = { parts: [{ kind: 'mesh' as const, name: 'WALL', material: 'm', positions, indices }], materials: {} };
    const p: Placement = { id: 'w', ref: kit('kit-demo-counter'), name: 'Wall', position: [0, 0, 0], rotation: 0, snapshot: { width: 6000, depth: 6000, height: 2400, version: 1 } };
    const boxes = worldBoxes(p, shape);
    expect(boxes.length).toBeGreaterThan(1);
    // nothing covers the middle of the L
    expect(boxes.some((b) => b.min[0] < 3000 && b.max[0] > 3000 && b.min[1] < 3000 && b.max[1] > 3000)).toBe(false);
  });
});
