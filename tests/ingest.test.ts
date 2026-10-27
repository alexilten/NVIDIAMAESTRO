import rhino3dm from 'rhino3dm/rhino3dm.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { exportItemFor } from '../src/core/library';
import { addItem, duplicateItems, groupItems, newComposition } from '../src/core/compose';
import { exportComposition, readBack } from '../src/export/rhino';
import { addCheck, approvalBlockers, approve, checkState, proposePart, revise } from '../src/ingest/pipeline';
import { applyReview, exportReview, parseReview } from '../src/ingest/review';
import { extractPart, inspectSource, openDoc } from '../src/ingest/rhino';
import type { IngestedPart } from '../src/ingest/types';
import { buildFixture, FIXTURE, type Rh } from './fixture';

let rh: Rh;
let bytes: Uint8Array;
let part: IngestedPart;

beforeAll(async () => {
  rh = await rhino3dm();
  bytes = buildFixture(rh);
  const s = await inspectSource(rh, bytes, FIXTURE.fileName);
  const c = s.blocks.find((b) => b.name === FIXTURE.plinth)!;
  part = proposePart(s, c, extractPart(rh, openDoc(rh, bytes), FIXTURE.plinth), 'Test project');
});

describe('reading a source model', () => {
  it('lists blocks with nesting, use and provenance', async () => {
    const s = await inspectSource(rh, bytes, FIXTURE.fileName);
    expect(s.units).toBe('Feet');
    const plinth = s.blocks.find((b) => b.name === FIXTURE.plinth)!;
    expect(plinth.nested).toEqual([FIXTURE.cap]);
    expect(plinth.placements).toBe(1);
    expect(plinth.derivedFrom).toBe('PLINTH');
    expect(plinth.category).toBe('pedestal');
    expect(s.blocks.find((b) => b.name === FIXTURE.cap)!.usedIn).toEqual([FIXTURE.plinth]);
  });

  it('keeps the exact source geometry and measures it in millimetres', () => {
    part.dims.forEach((v, i) => expect(v).toBeCloseTo(FIXTURE.dims[i], 1));
    expect(part.geometry.sourceUnits).toBe('Feet');
    expect(part.geometry.unitScale).toBeCloseTo(304.8, 6);
    expect(Object.keys(part.geometry.defs)).toContain(FIXTURE.cap);
    expect(part.mesh.map((m) => m.material).sort()).toEqual(['Cap Black', 'Plinth Body White']);
    expect(part.stats.approximatedFaces).toBe(0);
  });
});

describe('review', () => {
  it('blocks approval until a page is confirmed and a dimension compared', () => {
    expect(approvalBlockers(part).length).toBe(2);
    expect(() => approve(part, 'test')).toThrow();
  });

  it('never resolves a discrepancy silently', () => {
    let p: IngestedPart = { ...part, docs: [{ id: 'd1', document: 'deck.pdf', page: 4, title: 'Plinth', origin: 'confirmed' }] };
    p = addCheck(p, 'Width on drawing', 'overall width', p.dims[0], 600, 2, 'd1');
    const c = p.checks.at(-1)!;
    expect(checkState(c)).toBe('discrepancy');
    expect(approvalBlockers(p)).toHaveLength(1);
    p = { ...p, checks: p.checks.map((x) => (x.id === c.id ? { ...x, resolution: 'model' as const } : x)) };
    expect(approvalBlockers(p)).toHaveLength(0);
    const a = approve(p, 'test');
    expect(a.status).toBe('approved');
    const v2 = revise(a, part);
    expect([v2.id, v2.version, v2.supersedes, v2.status]).toEqual([a.id, 2, 1, 'proposed']);
  });

  it('applies and exports review notes by block name', () => {
    const r = parseReview(JSON.stringify({
      schema: 'maestro.review', version: 1, entries: [{
        block: FIXTURE.plinth, notes: 'Checked against the deck.',
        docs: [{ document: 'deck.pdf', page: 7, title: 'Plinth GA', reference: 'X-01' }],
        checks: [{ label: 'Height on GA', measure: 'overall height', drawing: 945, document: 'deck.pdf', page: 7 }],
      }],
    }));
    const p = applyReview(part, r);
    expect(p).not.toBe(part);
    expect(p.docs[0]).toMatchObject({ page: 7, origin: 'confirmed', reference: 'X-01' });
    const h = p.checks.find((c) => c.measure === 'overall height')!;
    expect(h.drawing).toBe(945);
    expect(h.docLinkId).toBe(p.docs[0].id);
    expect(checkState(h)).toBe('match');
    expect(applyReview(p, r)).toBe(p);
    const out = exportReview([p]);
    expect(out.entries[0].checks).toEqual([expect.objectContaining({ measure: 'overall height', drawing: 945, page: 7 })]);
    expect(() => parseReview('{"schema":"other"}')).toThrow();
  });
});

describe('Rhino export of an ingested part', () => {
  it('rebuilds the source geometry in millimetres, with identity, groups and the composition', () => {
    const ref = { kind: 'ingested' as const, id: part.id, version: part.version };
    let c = newComposition('Fixture module');
    c = addItem(c, ref, part.name, part.dims, [0, 0, 0]).comp;
    c = addItem(c, { kind: 'product', id: 'nv-dgx-spark' }, 'DGX Spark', [150, 150, 50.5], [0, 0, 945]).comp;
    c = groupItems(c, c.items.map((i) => i.id), 'Station').comp;
    c = duplicateItems(c, c.items.map((i) => i.id), [2000, 0, 0]).comp;
    const r = exportComposition(rh, c, (p) => exportItemFor(p, [part]), 'test');
    expect(r.skipped).toEqual([]);
    const back = readBack(rh, r.bytes);
    expect(back.units).toBe('Millimeters');
    expect(back.instances).toHaveLength(4);
    expect(back.groups).toBe(2);
    expect(back.composition?.items).toHaveLength(4);
    expect(back.layers).toContain('NVIDIA_MAESTRO::30_DISPLAY_FURNITURE::PEDESTALS');
    const top = back.blocks.find((b) => !b.name.startsWith('SRC_') && b.bbox && Math.abs(b.bbox.max[2] - b.bbox.min[2] - 914.4) < 1);
    expect(top, 'plinth body scaled to mm').toBeTruthy();
    expect(back.blocks.some((b) => b.name.startsWith('SRC_') && b.name.endsWith(FIXTURE.cap))).toBe(true);
    const inst = back.instances.find((i) => i.user['maestro.ref']?.startsWith('ingested:'))!;
    expect(Number(inst.user['maestro.height_mm'])).toBeCloseTo(FIXTURE.dims[2], 0);
    expect(inst.user['maestro.source']).toBe(`${FIXTURE.fileName}#${FIXTURE.plinth}`);
  });

  it('exports the display mesh of a part published without its source geometry', () => {
    const light: IngestedPart = { ...part, geometry: { ...part.geometry, defs: {} } };
    const ref = { kind: 'ingested' as const, id: part.id, version: part.version };
    const c = addItem(newComposition('Light'), ref, part.name, part.dims, [0, 0, 0]).comp;
    const item = exportItemFor(c.items[0], [light])!;
    expect(item.part).toBeUndefined();
    expect(item.description).toMatch(/Simplified display mesh/);
    const r = exportComposition(rh, c, (p) => exportItemFor(p, [light]), 'test');
    expect(r.skipped).toEqual([]);
    const back = readBack(rh, r.bytes);
    expect(back.instances).toHaveLength(1);
    expect(back.blocks.some((b) => b.name.startsWith('SRC_'))).toBe(false);
  });
});
