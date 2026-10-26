import { describe, expect, it } from 'vitest';
import { SOURCE_BY_ID } from '../src/core/catalog/sources';
import { MODELS, PHYSICAL, PHYSICAL_BY_ID } from '../src/core/catalog/products';
import { boxSize, shapeBounds } from '../src/core/geometry/shape';
import { hasEnvelope, productShape } from '../src/core/geometry/proxies';
import { KIT, defaultParams, kitShape, resolveParams, ACCESSIBLE_HEIGHT } from '../src/core/geometry/kit';
import { kitEntries, productEntries } from '../src/core/library';
import type { Spec } from '../src/core/schema';

const specs = (o: unknown): Spec<unknown>[] => {
  const out: Spec<unknown>[] = [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if ('status' in v && 'value' in v) { out.push(v as Spec<unknown>); return; }
    Object.values(v).forEach(walk);
  };
  walk(o);
  return out;
};

describe('hardware catalog', () => {
  it('cites a source for every Verified value and records no value for a Placeholder', () => {
    for (const s of [...specs(MODELS), ...specs(PHYSICAL)]) {
      if (s.status === 'verified') expect(s.sourceId && SOURCE_BY_ID.has(s.sourceId), JSON.stringify(s)).toBeTruthy();
      if (s.status === 'placeholder') expect(s.value, JSON.stringify(s)).toBeNull();
    }
  });

  it('lists only known sources on each model', () => {
    for (const m of MODELS) for (const s of m.sources) expect(SOURCE_BY_ID.has(s), `${m.id} → ${s}`).toBe(true);
  });

  it('draws every proxy inside its recorded envelope, at full size', () => {
    for (const m of MODELS) {
      const pa = m.physicalAssetId ? PHYSICAL_BY_ID.get(m.physicalAssetId) : undefined;
      const shape = productShape(m.id);
      if (!pa || !hasEnvelope(pa)) { expect(shape, `${m.id} has no envelope, so no geometry`).toBeNull(); continue; }
      const size = boxSize(shapeBounds(shape!));
      const want = [pa.dims.width.value!, pa.dims.depth.value!, pa.dims.height.value!];
      size.forEach((v, i) => expect(v, `${m.id} axis ${i}`).toBeCloseTo(want[i], 3));
    }
  });

  it('puts every model in the library with its weakest dimension status', () => {
    const entries = productEntries();
    expect(entries).toHaveLength(MODELS.length);
    const thor = entries.find((e) => e.ref.kind === 'product' && e.ref.id === 'nv-agx-thor-devkit')!;
    expect(thor.verification).toBe('estimated');
    const groot = entries.find((e) => e.ref.kind === 'product' && e.ref.id === 'nv-isaac-groot')!;
    expect(groot.physical).toBe(false);
  });
});

describe('parametric kit', () => {
  it('builds every part at the size its parameters state', () => {
    for (const k of KIT) {
      const p = defaultParams(k.id);
      const size = boxSize(shapeBounds(kitShape(k.id, p)!));
      // a niche is as wide as its wall panel; everything else as wide as its width parameter
      expect(size[0]).toBeCloseTo(k.id === 'kit-gallery-niche' ? p.panelWidth : p.width, 3);
      expect(size[1]).toBeCloseTo(p.depth, 3);
    }
    expect(kitEntries()).toHaveLength(KIT.length);
    // the display never overhangs the counter, wherever the accessible section puts it
    const c: Record<string, number> = { ...defaultParams('kit-demo-counter'), accessible: 900 };
    expect(boxSize(shapeBounds(kitShape('kit-demo-counter', c)!))[0]).toBeCloseTo(c.width, 3);
  });

  it('clamps parameters to their ranges and drops the accessible section to 860 mm', () => {
    const c = resolveParams('kit-demo-counter', { ...defaultParams('kit-demo-counter'), width: 99999, accessible: 1 });
    const def = KIT.find((k) => k.id === 'kit-demo-counter')!.params.find((p) => p.key === 'width')!;
    expect(c.width).toBe(def.max);
    const acc = kitShape('kit-demo-counter', { ...c, accessible: 900 })!.parts.find((x) => x.name === 'ACCESSIBLE_WORKTOP')!;
    expect(acc.kind === 'box' && acc.max[2]).toBe(ACCESSIBLE_HEIGHT);
  });
});
