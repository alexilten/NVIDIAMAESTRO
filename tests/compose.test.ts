import { describe, expect, it } from 'vitest';
import { addItem, alignItems, duplicateItems, groupItems, moveItems, newComposition, parseComposition, rotateItems, staleItems, ungroup } from '../src/core/compose';
import type { Composition, Vec3 } from '../src/core/schema';

const spark = { kind: 'product' as const, id: 'nv-dgx-spark' };
const dims: Vec3 = [150, 150, 50.5];

function module3(): Composition {
  let c = newComposition('Test');
  for (const x of [0, 1000, 2000]) c = addItem(c, spark, 'DGX Spark', dims, [x, 0, 0]).comp;
  return c;
}

describe('composition', () => {
  it('gives each placement a unique name and keeps a snapshot of its dimensions', () => {
    const c = module3();
    expect(new Set(c.items.map((i) => i.name)).size).toBe(3);
    expect(c.items[0].snapshot).toMatchObject({ width: 150, depth: 150, height: 50.5 });
  });

  it('moves and rotates placements without touching their dimensions', () => {
    let c = module3();
    const ids = c.items.map((i) => i.id);
    c = moveItems(c, ids, [10, 20, 30]);
    expect(c.items[0].position).toEqual([10, 20, 30]);
    c = rotateItems(c, ids, 90);
    expect(c.items.map((i) => i.rotation)).toEqual([90, 90, 90]);
    expect(c.items[1].position[0]).toBeCloseTo(1010, 6); // the centre of rotation is the centroid
    expect(c.items[0].position[1]).toBeCloseTo(-980, 6);
    expect(c.items.every((i) => i.snapshot.width === 150)).toBe(true);
  });

  it('duplicates groups as groups and ungroups', () => {
    let c = module3();
    const g = groupItems(c, [c.items[0].id, c.items[1].id], 'Station');
    c = g.comp;
    const d = duplicateItems(c, [c.items[0].id, c.items[1].id], [0, 2000, 0]);
    c = d.comp;
    expect(c.items).toHaveLength(5);
    expect(c.groups).toHaveLength(2);
    const copies = c.items.filter((i) => d.ids.includes(i.id));
    expect(new Set(copies.map((i) => i.groupId)).size).toBe(1);
    expect(copies[0].groupId).not.toBe(g.groupId);
    c = ungroup(c, g.groupId);
    expect(c.groups).toHaveLength(1);
  });

  it('aligns to the first selected item', () => {
    let c = module3();
    c = moveItems(c, [c.items[1].id], [0, 300, 0]);
    c = alignItems(c, [c.items[1].id, c.items[0].id, c.items[2].id], 1);
    expect(c.items.map((i) => i.position[1])).toEqual([300, 300, 300]);
  });

  it('flags placements whose catalog record changed', () => {
    const c = module3();
    expect(staleItems(c, () => ({ dims, version: 1 }))).toEqual([]);
    const s = staleItems(c, (p) => (p.id === c.items[0].id ? { dims: [150, 150, 60], version: 1 } : p.id === c.items[1].id ? { dims, version: 2 } : null));
    expect(s.map((x) => x.reason)).toEqual([expect.stringMatching(/dimensions changed/), expect.stringMatching(/newer version/), expect.stringMatching(/no longer/)]);
  });

  it('round-trips as JSON and rejects other files', () => {
    const c = module3();
    expect(parseComposition(JSON.stringify(c))).toEqual(c);
    expect(() => parseComposition('{"items":[]}')).toThrow();
  });
});
