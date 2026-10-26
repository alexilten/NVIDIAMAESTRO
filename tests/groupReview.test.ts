import { describe, expect, it } from 'vitest';
import { approveReady, checkAll, confirmPage, drawingGroups, sharedMeasures } from '../src/ingest/groupReview';
import type { DocLink, IngestedPart } from '../src/ingest/types';

const link = (document: string, page: number, origin: DocLink['origin'] = 'suggested'): DocLink => ({ id: `${document}-${page}-${Math.random()}`, document, page, title: `Page ${page}`, origin });
/** a proposed part with no mesh, so only the overall measures exist */
function part(name: string, dims: [number, number, number], docs: DocLink[]): IngestedPart {
  return { schema: 'maestro.ingested-part', id: name, version: 1, name, category: 'counter', status: 'proposed', project: 'Test', tags: [], createdAt: '', source: { fileName: 'fixture.3dm', fileSize: 0, sha256: '', units: 'mm', block: name, description: '' }, bbox: { min: [0, 0, 0], max: dims }, dims, geometry: {} as IngestedPart['geometry'], mesh: [], materials: {}, stats: {} as IngestedPart['stats'], docs, checks: [], notes: '' } as IngestedPart;
}

describe('group review', () => {
  const a = part('Table A', [1200, 600, 900], [link('fab.pdf', 12), link('fab.pdf', 3)]);
  const b = part('Table B', [1600, 600, 900], [link('fab.pdf', 12)]);
  const c = part('Plinth', [800, 800, 450], [link('fab.pdf', 12, 'confirmed')]);
  const lone = part('Sign', [500, 50, 2000], [link('fab.pdf', 3)]);

  it('groups proposed parts by shared page, ignoring single links and approved parts', () => {
    const done = { ...lone, id: 'done', status: 'approved' as const, docs: [link('fab.pdf', 3)] };
    const g = drawingGroups([a, b, c, lone, done]);
    expect(g.map((x) => x.key)).toEqual(['fab.pdf#12', 'fab.pdf#3']);
    expect(g[0].parts).toHaveLength(3);
    expect(g[0].confirmed).toBe(1);
    expect(g[1].parts.map((p) => p.name)).toEqual(['Table A', 'Sign']);
  });

  it('confirms the page on every part and leaves other links alone', () => {
    const [g] = drawingGroups([a, b, c]);
    const out = confirmPage(g, g.parts);
    expect(out.every((p) => p.docs.find((d) => d.page === 12)!.origin !== 'suggested')).toBe(true);
    expect(out[0].docs.find((d) => d.page === 3)!.origin).toBe('suggested');
    expect(drawingGroups(out)[0].confirmed).toBe(3);
  });

  it('checks one shared measure on all parts, updating rather than doubling a check', () => {
    const [g] = drawingGroups([a, b, c]);
    expect(sharedMeasures(g.parts)).toEqual(['overall width', 'overall depth', 'overall height']);
    const once = checkAll(g, g.parts, 'overall height', 900).parts;
    expect(once.map((p) => p.checks.length)).toEqual([1, 1, 1]);
    const twice = checkAll(g, once, 'overall height', 901).parts;
    expect(twice.map((p) => p.checks.length)).toEqual([1, 1, 1]);
    expect(twice[0].checks[0]).toMatchObject({ drawing: 901, docLinkId: a.docs[0].id });
    expect(checkAll(g, g.parts, 'Oak · width', 10).skipped).toHaveLength(3);
  });

  it('approves only parts that clear the rules on their own', () => {
    const [g] = drawingGroups([a, b, c]);
    const checked = checkAll(g, confirmPage(g, g.parts), 'overall height', 900).parts;
    const r = approveReady(checked, 'Reviewer');
    expect(r.approved.map((p) => p.name)).toEqual(['Table A', 'Table B']);
    expect(r.approved.every((p) => p.status === 'approved' && p.approvedBy === 'Reviewer')).toBe(true);
    expect(r.blocked.map((x) => x.part.name)).toEqual(['Plinth']);
    expect(r.blocked[0].blockers[0]).toMatch(/discrepanc/);
  });
});

describe('group review, after approval', () => {
  it('keeps approved parts in the group only when asked', () => {
    const a = part('A', [1, 1, 1], [link('d.pdf', 1)]);
    const b = { ...part('B', [1, 1, 1], [link('d.pdf', 1)]), status: 'approved' as const };
    expect(drawingGroups([a, b])).toHaveLength(0);
    expect(drawingGroups([a, b], true)[0].parts.map((p) => p.name)).toEqual(['A', 'B']);
  });
});
