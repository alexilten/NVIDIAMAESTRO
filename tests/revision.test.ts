import rhino3dm from 'rhino3dm/rhino3dm.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { kitCandidates, planBatch, reviseFromSource, runBatch } from '../src/ingest/batch';
import { exportBundle, partChecksum, readBundle } from '../src/ingest/bundle';
import { blockPrints, diffCsv, diffSources, hash53, libraryImpact } from '../src/ingest/revision';
import { inspectSource, openDoc, type SourceSummary } from '../src/ingest/rhino';
import type { IngestedPart } from '../src/ingest/types';
import { buildFixture, FIXTURE, type Rh } from './fixture';

let rh: Rh;
let v1: Uint8Array, v2: Uint8Array;
let s1: SourceSummary, s2: SourceSummary;

beforeAll(async () => {
  rh = await rhino3dm();
  v1 = buildFixture(rh);
  v2 = buildFixture(rh, true);
  s1 = await inspectSource(rh, v1, 'show-r1.3dm');
  s2 = await inspectSource(rh, v2, 'show-r2.3dm');
});

describe('block fingerprints', () => {
  it('are stable across files and change with the geometry, nested blocks included', () => {
    const a = blockPrints(rh, openDoc(rh, v1), 'a');
    const again = blockPrints(rh, openDoc(rh, buildFixture(rh)), 'b');
    for (const [n, p] of a.blocks) expect(again.blocks.get(n)!.hash, n).toBe(p.hash);
    const b = blockPrints(rh, openDoc(rh, v2), 'c');
    expect(b.blocks.get(FIXTURE.cap)!.hash).not.toBe(a.blocks.get(FIXTURE.cap)!.hash);
    expect(b.blocks.get(FIXTURE.plinth)!.ownHash).toBe(a.blocks.get(FIXTURE.plinth)!.ownHash);
    expect(b.blocks.get(FIXTURE.plinth)!.hash).not.toBe(a.blocks.get(FIXTURE.plinth)!.hash);
    // extents through the nested cap, in mm: 3 ft body + 0.1 ft cap
    a.blocks.get(FIXTURE.plinth)!.dims.forEach((v, i) => expect(v).toBeCloseTo(FIXTURE.dims[i], 0));
    expect(hash53('a')).not.toBe(hash53('b'));
  });
});

describe('revision diff', () => {
  it('reports changed, nested, renamed and added blocks with their size change', () => {
    const rows = diffSources(blockPrints(rh, openDoc(rh, v1), s1.fileName), blockPrints(rh, openDoc(rh, v2), s2.fileName));
    const by = new Map(rows.map((r) => [r.name, r]));
    expect(by.get(FIXTURE.cap)!.change).toBe('changed');
    expect(by.get(FIXTURE.cap)!.delta![2]).toBeCloseTo(15.2, 1); // 0.05 ft
    expect(by.get(FIXTURE.plinth)!.change).toBe('nested');
    expect(by.get(FIXTURE.plinth)!.detail).toMatch(/SUB_Cap changed/);
    expect(by.get('NV_PART_Header Sign')).toMatchObject({ change: 'renamed', from: 'NV_PART_Sign' });
    expect(by.get('NV_PART_Stool')!.change).toBe('added');
    expect(rows.some((r) => r.change === 'removed')).toBe(false);
    expect(rows[0].change).toBe('changed');
    expect(diffCsv(blockPrints(rh, openDoc(rh, v1), 'a'), blockPrints(rh, openDoc(rh, v2), 'b'), rows).split('\n')[0]).toMatch(/^Block,Change,Was/);
    // and the reverse direction removes the stool
    const back = diffSources(blockPrints(rh, openDoc(rh, v2), 'b'), blockPrints(rh, openDoc(rh, v1), 'a'));
    expect(back.find((r) => r.name === 'NV_PART_Stool')!.change).toBe('removed');
  });
});

describe('batch extraction', () => {
  it('offers the top-level blocks, skips what the library already holds and extracts the rest', async () => {
    expect(kitCandidates(s1).sort()).toEqual([FIXTURE.plinth, 'NV_PART_Sign'].sort());
    const prints = blockPrints(rh, openDoc(rh, v1), s1.fileName);
    let plan = planBatch(s1, prints, kitCandidates(s1), []);
    expect(plan.every((r) => r.state === 'new')).toBe(true);
    const seen: string[] = [];
    const res = await runBatch(rh, openDoc(rh, v1), s1, plan, 'Test', { onProgress: (_d, _t, b) => { if (b) seen.push(b); } });
    expect(res.filter((r) => r.ok)).toHaveLength(2);
    expect(seen).toHaveLength(2);
    const parts = res.map((r) => r.part!);
    expect(parts.every((p) => p.source.geometryHash)).toBe(true);
    // again: everything is already in the library
    plan = planBatch(s1, prints, kitCandidates(s1), parts);
    expect(plan.map((r) => r.state)).toEqual(['in-library', 'in-library']);
    // the renamed sign in the revision is the same geometry as the one held
    const plan2 = planBatch(s2, blockPrints(rh, openDoc(rh, v2), s2.fileName), ['NV_PART_Header Sign', 'NV_PART_Stool'], parts);
    expect(plan2.map((r) => r.state)).toEqual(['same-geometry', 'new']);
    const res2 = await runBatch(rh, openDoc(rh, v2), s2, plan2, 'Test');
    expect(res2.map((r) => r.ok)).toEqual([false, true]);
    expect(res2[0].skipped).toMatch(/Same geometry/);
  });

  it('reports a block it cannot read and carries on', async () => {
    const plan = [{ block: 'NOT_THERE', state: 'new' as const, note: '' }, ...planBatch(s1, null, [FIXTURE.plinth], [])];
    const res = await runBatch(rh, openDoc(rh, v1), s1, plan, 'Test');
    expect(res[0]).toMatchObject({ ok: false, error: expect.stringMatching(/Not in this file/) });
    expect(res[1].ok).toBe(true);
  });
});

describe('library impact of a revision', () => {
  it('proposes the next version of a part whose block changed, and relinks a renamed one', async () => {
    const prints1 = blockPrints(rh, openDoc(rh, v1), s1.fileName), prints2 = blockPrints(rh, openDoc(rh, v2), s2.fileName);
    const res = await runBatch(rh, openDoc(rh, v1), s1, planBatch(s1, prints1, kitCandidates(s1), []), 'Test');
    const parts: IngestedPart[] = res.map((r) => ({ ...r.part!, status: 'approved' as const }));
    const impact = libraryImpact(diffSources(prints1, prints2), parts, s1.fileName);
    expect(impact.map((i) => [i.part.source.block, i.action]).sort()).toEqual([[FIXTURE.plinth, 'revise'], ['NV_PART_Sign', 'relink']].sort());
    const plinth = parts.find((p) => p.source.block === FIXTURE.plinth)!;
    const next = reviseFromSource(rh, openDoc(rh, v2), s2, prints2, plinth, FIXTURE.plinth);
    expect(next).toMatchObject({ id: plinth.id, version: 2, supersedes: 1, status: 'proposed', name: plinth.name });
    expect(next.dims[2] - plinth.dims[2]).toBeCloseTo(15.24, 1);
    expect(next.source.sha256).toBe(s2.sha256);
    expect(next.source.geometryHash).toBe(prints2.blocks.get(FIXTURE.plinth)!.hash);
  });
});

describe('library bundles', () => {
  it('round-trips approved parts with their meshes, and never overwrites a different local part', async () => {
    const res = await runBatch(rh, openDoc(rh, v1), s1, planBatch(s1, null, kitCandidates(s1), []), 'Test');
    const parts: IngestedPart[] = res.map((r, i) => ({ ...r.part!, status: i === 0 ? 'approved' as const : 'proposed' as const }));
    const b = exportBundle(parts, 'Team library', { by: 'tester' });
    expect(b.parts).toHaveLength(1);
    const text = JSON.stringify(b);
    const fresh = readBundle(text, []);
    expect(fresh.add).toHaveLength(1);
    const got = fresh.add[0];
    expect(got.sharedFrom).toMatchObject({ bundle: 'Team library', by: 'tester' });
    expect(Array.from(got.mesh[0].positions)).toEqual(Array.from(parts[0].mesh[0].positions));
    expect(partChecksum(got)).toBe(partChecksum(parts[0]));
    expect(readBundle(text, parts).same).toHaveLength(1);
    const changed = { ...parts[0], dims: [1, 2, 3] as [number, number, number] };
    expect(readBundle(text, [changed]).conflicts).toHaveLength(1);
    const tampered = JSON.parse(text); tampered.parts[0].dims[0] += 10;
    expect(readBundle(JSON.stringify(tampered), []).damaged).toHaveLength(1);
    expect(() => readBundle('{}', [])).toThrow(/not a MAESTRO library bundle/);
  });
});
