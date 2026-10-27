import { describe, expect, it } from 'vitest';
import { SOURCE_BY_ID } from '../src/core/catalog/sources';
import { FAMILY_BY_ID, MODELS, MODEL_BY_ID, PHYSICAL, PHYSICAL_BY_ID } from '../src/core/catalog/products';
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

  it('keeps ids unique and every cross-reference resolvable', () => {
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
    expect(new Set(PHYSICAL.map((p) => p.id)).size).toBe(PHYSICAL.length);
    for (const m of MODELS) {
      expect(FAMILY_BY_ID.has(m.familyId), `${m.id} family`).toBe(true);
      for (const r of m.related ?? []) expect(MODEL_BY_ID.has(r), `${m.id} → related ${r}`).toBe(true);
      for (const r of m.implementations ?? []) {
        const impl = MODEL_BY_ID.get(r);
        expect(impl, `${m.id} → implementation ${r}`).toBeTruthy();
        expect(impl!.kind, `${r} must be a physical product`).not.toMatch(/reference-architecture|software-platform/);
      }
      if (m.physicalAssetId) expect(PHYSICAL_BY_ID.get(m.physicalAssetId)?.modelId, m.id).toBe(m.id);
      if (m.kind === 'reference-architecture' || m.kind === 'software-platform') expect(m.physicalAssetId, `${m.id} is not one object`).toBeUndefined();
    }
  });

  it('records the Spectrum-6 switches exactly as the hardware manual states them', () => {
    const want: Record<string, [number, number, number, number]> = {
      'nv-sn6600': [438, 767, 133.35, 52], 'nv-sn6600-ld': [438, 900, 88, 33], 'nv-sn6810-ld': [438, 900, 87, 32.5], 'nv-sn6800-ld': [438, 900, 220, 95],
    };
    for (const [id, [w, d, h, kg]] of Object.entries(want)) {
      const pa = PHYSICAL_BY_ID.get(`pa-${id}`)!;
      expect([pa.dims.width.value, pa.dims.depth.value, pa.dims.height.value, pa.weightKg?.value]).toEqual([w, d, h, kg]);
      expect(pa.dims.width.sourceId).toBe('nv-sn6000-hw');
    }
  });

  it('draws nothing for a product whose dimensions are not published', () => {
    // announced racks and trays without a published mechanical spec, and partner systems without one, stay placeholders
    for (const id of ['qct-arc-pro-2u', 'qct-vera-cmx', 'hp-zgx-fury-g1n', 'nv-dgx-vr-nvl72', 'nv-groq3-lpx-rack', 'nv-vera-cpu-rack', 'nv-bf4-stx-rack', 'nv-vr-nvl72-compute-tray']) expect(productShape(id), id).toBeNull();
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
      expect(size[0]).toBeCloseTo(k.id === 'kit-gallery-niche' ? p.panelWidth : k.id === 'kit-rule-niche' ? p.wallWidth : p.width, 3);
      // a rule niche also carries its back panel, the service void and the void's rear panel (18 mm each)
      // a die-cut label is 0.5 mm of vinyl
      expect(size[1]).toBeCloseTo(k.id === 'kit-rule-niche' ? p.depth + p.void + 36 : k.id === 'kit-die-cut-label' ? 0.5 : p.depth, 3);
    }
    // parts the Niches tab builds stay out of the kit list
    expect(kitEntries()).toHaveLength(KIT.filter((k) => !k.hidden).length);
    expect(kitEntries(true)).toHaveLength(KIT.length);
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
