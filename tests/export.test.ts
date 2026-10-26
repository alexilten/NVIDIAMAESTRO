import rhino3dm from 'rhino3dm/rhino3dm.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { exportItemFor } from '../src/core/library';
import { addItem, newComposition, rotateItems } from '../src/core/compose';
import { defaultParams } from '../src/core/geometry/kit';
import { exportComposition, readBack } from '../src/export/rhino';
import type { Composition } from '../src/core/schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rh: any;
beforeAll(async () => { rh = await rhino3dm(); });

function sample(): Composition {
  let c = newComposition('Export test');
  c = addItem(c, { kind: 'product', id: 'nv-dgx-b200' }, 'DGX B200', [482.3, 897.1, 444], [0, 0, 0]).comp;
  c = addItem(c, { kind: 'kit', id: 'kit-demo-counter', params: defaultParams('kit-demo-counter') }, 'Counter', [1800, 700, 1000], [2000, 0, 0]).comp;
  c = addItem(c, { kind: 'product', id: 'nv-vera-rubin-nvl72' }, 'Vera Rubin', [0, 0, 0], [4000, 0, 0]).comp;
  return rotateItems(c, [c.items[0].id], 90);
}

describe('Rhino export', () => {
  it('writes millimetres, the MAESTRO layer tree and one block per item', () => {
    const r = exportComposition(rh, sample(), (p) => exportItemFor(p, []), 'test');
    const back = readBack(rh, r.bytes);
    expect(back.units).toBe('Millimeters');
    for (const l of ['NVIDIA_MAESTRO', 'NVIDIA_MAESTRO::10_NVIDIA_HARDWARE', 'NVIDIA_MAESTRO::30_DISPLAY_FURNITURE::COUNTERS', 'NVIDIA_MAESTRO::90_DIMENSIONS::LABELS'])
      expect(back.layers).toContain(l);
    expect(r.instances).toBe(2);
    expect(r.skipped).toEqual([expect.stringMatching(/Vera Rubin/)]); // no published dimensions: skipped, never guessed
    expect(back.composition?.name).toBe('Export test');
  });

  it('carries identity, status and dimensions on every instance', () => {
    const back = readBack(rh, exportComposition(rh, sample(), (p) => exportItemFor(p, []), 'test').bytes);
    const b200 = back.instances.find((i) => i.user['maestro.ref'] === 'product:nv-dgx-b200')!;
    expect(b200.layer).toMatch(/10_NVIDIA_HARDWARE/);
    expect(b200.user['maestro.verification']).toBe('verified');
    expect(b200.user['maestro.rotation_deg']).toBe('90');
    expect(Number(b200.user['maestro.width_mm'])).toBeCloseTo(482.3, 1);
    expect(b200.user['maestro.source']).toMatch(/^https:\/\//);
    const block = back.blocks.find((b) => b.name === b200.block)!;
    expect(block.bbox!.max[0] - block.bbox!.min[0]).toBeCloseTo(482.3, 1);
    const counter = back.instances.find((i) => i.user['maestro.ref']?.startsWith('kit:kit-demo-counter'))!;
    expect(counter.user['maestro.verification']).toBe('estimated'); // kit parameters are design inputs until a project approves them
  });
});
