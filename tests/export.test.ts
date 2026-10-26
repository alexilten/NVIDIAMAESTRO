import rhino3dm from 'rhino3dm/rhino3dm.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { exportItemFor } from '../src/core/library';
import { addItem, newComposition, rotateItems } from '../src/core/compose';
import { defaultParams } from '../src/core/geometry/kit';
import { exportComposition, readBack } from '../src/export/rhino';
import type { Composition, Placement } from '../src/core/schema';
import { analyseBooth } from '../src/core/booth';
import { sampleExhibition } from '../src/core/exhibitionSample';
import { resolveRef } from '../src/core/library';
import { boothAnnotations } from '../src/export/boothAnnotations';

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

describe('Rhino export of a booth', () => {
  it('adds the plot, service points and approach zones as curves on their layers, beside the module instances', () => {
    const c = sampleExhibition();
    const a = analyseBooth(c, (p: Placement) => resolveRef(p.ref, [])?.shape ?? null)!;
    const notes = boothAnnotations(c, a);
    const r = exportComposition(rh, c, (p) => exportItemFor(p, []), 'test', notes);
    const back = readBack(rh, r.bytes);
    for (const l of ['50_EXHIBITION_ARCHITECTURE::BOOTH_PLOT', '60_TECHNICAL_INFRASTRUCTURE::SERVICE_POINTS', '91_CLEARANCES::APPROACH_ZONES']) expect(back.layers).toContain(`NVIDIA_MAESTRO::${l}`);
    expect(r.instances).toBe(c.items.length);
    expect(back.groups).toBe(c.groups.length);
    expect(back.composition?.booth?.services).toHaveLength(2);
    expect(notes.filter((n) => n.layer.endsWith('APPROACH_ZONES'))).toHaveLength(6);
    const doc = rh.File3dm.fromByteArray(r.bytes);
    let plot = null as null | Record<string, string>;
    for (let i = 0; i < doc.objects().count; i++) {
      const o = doc.objects().get(i);
      const at = o.attributes();
      if (at.name === 'BOOTH_PLOT') { const g = o.geometry(); const bb = g.getBoundingBox(); plot = { w: String(Math.round(bb.max[0] - bb.min[0])), d: String(Math.round(bb.max[1] - bb.min[1])), u: at.getUserString('maestro.width_mm') }; }
    }
    expect(plot).toEqual({ w: '10000', d: '8000', u: '10000' });
  });
});
