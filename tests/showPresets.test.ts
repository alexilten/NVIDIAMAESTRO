import { describe, expect, it } from 'vitest';
import { analyseBooth, insidePlot, itemInPlot, plotEdges, rectInPlot } from '../src/core/booth';
import { addItem } from '../src/core/compose';
import { sampleExhibition } from '../src/core/exhibitionSample';
import { defaultParams } from '../src/core/geometry/kit';
import { boxSize, shapeBounds } from '../src/core/geometry/shape';
import { resolveRef } from '../src/core/library';
import { missingParts, parseShowPresets, showsOf, startFromPreset, type ShowPreset } from '../src/core/showPresets';
import type { Booth, Composition, ItemRef, Placement, Vec3 } from '../src/core/schema';

const shapeOf = (p: Placement) => resolveRef(p.ref, [])?.shape ?? null;
const dimsOf = (ref: ItemRef): Vec3 => boxSize(shapeBounds(resolveRef(ref, [])!.shape!));
const kit = (id: string, over: Record<string, number> = {}): ItemRef => ({ kind: 'kit', id, params: { ...defaultParams(id), ...over } });

/** a synthetic stepped plot: 10 × 6 m, with a 4 × 3 m notch out of the back-left corner, open to the front */
function stepped(): Composition {
  const c = sampleExhibition();
  const b: Booth = {
    ...c.booth!, width: { value: 10000, status: 'project' }, depth: { value: 6000, status: 'project' },
    open: { front: true, back: false, left: false, right: false }, services: [], columns: [],
    outline: [[-5000, -3000], [5000, -3000], [5000, 3000], [-1000, 3000], [-1000, 0], [-5000, 0]],
  };
  return { ...c, items: [], groups: [], booth: b };
}

describe('stepped plots', () => {
  it('tests points and rectangles against the outline, not the rectangle', () => {
    const b = stepped().booth!;
    expect(insidePlot(b, 0, 0.5)).toBe(true);
    expect(insidePlot(b, -3000, 1500)).toBe(false);
    expect(insidePlot(b, -3000, -1500)).toBe(true);
    expect(rectInPlot(b, [-4500, -2500], [-1500, -500])).toBe(true);
    expect(rectInPlot(b, [-4500, -2500], [-1500, 1500])).toBe(false);
  });

  it('opens only the edges that lie on an open side', () => {
    const e = plotEdges(stepped().booth!);
    expect(e).toHaveLength(6);
    expect(e.filter((x) => x.open)).toEqual([{ a: [-5000, -3000], b: [5000, -3000], open: true }]);
  });

  it('flags an item in the notch, and not one in the plot', () => {
    let c = stepped();
    const ref = kit('kit-light-table', { width: 1200, depth: 600, height: 900 });
    c = addItem(c, ref, 'in the notch', dimsOf(ref), [-3000, 1500, 0]).comp;
    c = addItem(c, ref, 'on the floor', dimsOf(ref), [2000, 1500, 0]).comp;
    const out = analyseBooth(c, shapeOf)!.issues.filter((i) => i.text.includes('outside the booth plot'));
    expect(out.map((i) => i.text)).toEqual(['in the notch stands outside the booth plot.']);
  });

  it('follows the geometry of an item whose extent crosses a step', () => {
    const b = stepped().booth!;
    // an L of two triangles' worth of points: the extent covers the notch, the points do not
    const shape = { parts: [{ kind: 'mesh' as const, name: 'L', material: 'm', positions: new Float32Array([-4000, -2000, 0, 3000, -2000, 0, 3000, 2000, 0]), indices: new Uint32Array([0, 1, 2]) }], materials: {} };
    const p = { id: 'l', ref: { kind: 'kit', id: 'x', params: {} }, name: 'L', position: [0, 0, 0], rotation: 0, snapshot: { width: 0, depth: 0, height: 0, version: 1 } } as unknown as Placement;
    const e = { min: [-4000, -2000, 0] as Vec3, max: [3000, 2000, 0] as Vec3 };
    expect(rectInPlot(b, [e.min[0], e.min[1]], [e.max[0], e.max[1]])).toBe(false);
    expect(itemInPlot(b, p, shape, e)).toBe(true);
    expect(itemInPlot(b, { ...p, position: [-1500, 0, 0] }, shape, { min: [-5500, -2000, 0], max: [1500, 2000, 0] })).toBe(false);
  });

  it('does not count a column an item is built around as a clash', () => {
    let c = stepped();
    const ref = kit('kit-light-table', { width: 1600, depth: 1600, height: 900 });
    const r = addItem(c, ref, 'shroud', dimsOf(ref), [2000, -1000, 0]);
    c = r.comp;
    const id = c.items[0].id;
    c.booth!.columns = [{ id: 'k', name: 'C1', x: 2000, y: -1000, w: 600, d: 600, status: 'project' }];
    expect(analyseBooth(c, shapeOf)!.issues.some((i) => i.text.includes('runs into column C1'))).toBe(true);
    c.booth!.columns[0].enclosedBy = id;
    expect(analyseBooth(c, shapeOf)!.issues.some((i) => i.text.includes('runs into column'))).toBe(false);
  });
});

describe('show presets', () => {
  const preset = (id: string, show: string, comp: Composition = stepped()): ShowPreset => ({ id, show, name: `${show} test`, summary: 'synthetic', sources: [], comp });
  const file = (presets: unknown[]) => JSON.stringify({ schema: 'maestro.show-presets', version: 1, name: 'test', exportedAt: '2026-01-01', presets });

  it('reads a presets file and refuses anything else', () => {
    const f = parseShowPresets(file([preset('a', 'GTC Berlin')]));
    expect(f.presets[0].comp.booth?.outline).toHaveLength(6);
    expect(() => parseShowPresets('{}')).toThrow(/not a MAESTRO show presets file/);
    expect(() => parseShowPresets(JSON.stringify({ schema: 'maestro.show-presets', version: 2, presets: [] }))).toThrow(/version 2/);
    const mod = { ...stepped(), kind: 'module' as const };
    expect(() => parseShowPresets(file([preset('m', 'GTC DC', mod)]))).toThrow(/has no booth/);
  });

  it('orders shows as the year runs, others after', () => {
    expect(showsOf([preset('a', 'CES Las Vegas'), preset('b', 'Computex'), preset('c', 'GTC San Jose'), preset('d', 'GTC Berlin')])).toEqual(['GTC San Jose', 'GTC Berlin', 'CES Las Vegas', 'Computex']);
  });

  it('starts a new exhibition from a preset without changing the preset', () => {
    const p = preset('a', 'GTC Berlin');
    const c = startFromPreset(p);
    expect(c.id).not.toBe(p.comp.id);
    expect(c.presetId).toBe('a');
    c.booth!.width.value = 1;
    expect(p.comp.booth!.width.value).toBe(10000);
  });

  it('lists the project parts a preset needs that this browser lacks', () => {
    const c = stepped();
    c.items = [{ id: 'i', ref: { kind: 'ingested', id: 'part-x', version: 2 }, name: 'x', position: [0, 0, 0], rotation: 0, snapshot: { width: 1, depth: 1, height: 1, version: 2 } }];
    expect(missingParts(preset('a', 'GTC Berlin', c), [])).toEqual([{ kind: 'ingested', id: 'part-x', version: 2 }]);
  });
});
