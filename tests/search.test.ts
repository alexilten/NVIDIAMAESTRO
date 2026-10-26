import { describe, expect, it } from 'vitest';
import { kitEntries, productEntries } from '../src/core/library';
import { parseQuery, search } from '../src/core/search';

const all = [...productEntries(), ...kitEntries()];
const ids = (q: string) => search(all, q).map((e) => (e.ref.kind === 'kit' || e.ref.kind === 'product' ? e.ref.id : e.key));

describe('catalog search', () => {
  it('reads dimension phrases in any unit', () => {
    expect(parseQuery('under 1 m wide').dims).toEqual([{ axis: 0, op: '<', mm: 1000 }]);
    expect(parseQuery('taller than 2m').dims).toEqual([{ axis: 2, op: '>', mm: 2000 }]);
    expect(parseQuery('< 30 cm deep').dims).toEqual([{ axis: 1, op: '<', mm: 300 }]);
  });

  it('finds products by name words', () => {
    expect(ids('dgx spark')).toContain('nv-dgx-spark');
    expect(ids('jetson thor')).toEqual(['nv-agx-thor-devkit']);
  });

  it('filters by size and leaves out items with no recorded dimensions', () => {
    const tall = ids('taller than 2m');
    expect(tall).toContain('gb-gb200-nvl72-rack');
    expect(tall).not.toContain('nv-dgx-spark');
    expect(tall).not.toContain('nv-vera-rubin-nvl72');
  });

  it('lists everything not Verified on request', () => {
    const r = search(all, 'unverified');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.verification !== 'verified')).toBe(true);
  });
});
