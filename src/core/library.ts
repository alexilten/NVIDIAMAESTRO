import { FAMILY_BY_ID, MODELS, PHYSICAL_BY_ID } from './catalog/products';
import { SOURCE_BY_ID } from './catalog/sources';
import { KIT, defaultParams, kitShape, resolveParams } from './geometry/kit';
import { productShape } from './geometry/proxies';
import { boxSize, shapeBounds, type Shape } from './geometry/shape';
import { KIT_CATEGORY_LABEL, MODEL_KIND_LABEL, weakest, type Category, type ItemRef, type KitCategory, type ModelKind, type Placement, type Vec3, type Verification } from './schema';
import type { IngestedPart } from '../ingest/types';
import type { ExportItem } from '../export/rhino';

/**
 * One list over the three libraries the interface browses:
 *   • NVIDIA hardware (public catalog, products.ts)
 *   • the generic parametric kit (kit.ts)
 *   • the private project library (parts ingested from Rhino sources; lives only in this browser)
 */

export type Section = 'hardware' | 'kit' | 'project';
export const SECTION_LABEL: Record<Section, string> = { hardware: 'NVIDIA hardware', kit: 'Parametric kit', project: 'Project library' };

export interface LibraryEntry {
  key: string;
  section: Section;
  ref: ItemRef;
  name: string;
  subtitle: string;
  group: string;
  manufacturer?: string;
  dims: Vec3 | null;
  verification: Verification;
  lod: number | null;
  tags: string[];
  project?: string;
  physical: boolean;
  /** for products: system, rack, reference architecture, software platform… */
  kind?: ModelKind;
  status?: string;
}

export function productEntries(): LibraryEntry[] {
  return MODELS.map((m) => {
    const fam = FAMILY_BY_ID.get(m.familyId)!;
    const pa = m.physicalAssetId ? PHYSICAL_BY_ID.get(m.physicalAssetId) : undefined;
    const d = pa?.dims;
    const dims: Vec3 | null = d && d.width.value != null && d.depth.value != null && d.height.value != null ? [d.width.value, d.depth.value, d.height.value] : null;
    const verification = d ? weakest(d.width.status, d.depth.status, d.height.status) : 'placeholder';
    const lod = pa?.digitalAssets.length ? Math.max(...pa.digitalAssets.map((a) => a.lod)) : null;
    return {
      key: `product:${m.id}`, section: 'hardware' as const, ref: { kind: 'product' as const, id: m.id },
      name: m.name, subtitle: `${MODEL_KIND_LABEL[m.kind]} · ${m.manufacturer}`, group: fam.name,
      manufacturer: m.manufacturer, dims, verification: m.kind === 'software-platform' ? 'verified' : verification, lod,
      tags: [...m.tags, fam.name, m.manufacturer, m.kind, ...m.industries], physical: !!pa, kind: m.kind, status: m.status,
    };
  });
}

/** the kit the library offers; `all` adds the parts other tools make (resolving a placement needs those too) */
export function kitEntries(all = false): LibraryEntry[] {
  return KIT.filter((k) => all || !k.hidden).map((k) => {
    const params = defaultParams(k.id);
    const s = kitShape(k.id, params);
    const dims = s ? boxSize(shapeBounds(s)) : null;
    return {
      key: `kit:${k.id}`, section: 'kit' as const, ref: { kind: 'kit' as const, id: k.id, params },
      name: k.name, subtitle: 'Parametric · design inputs', group: KIT_CATEGORY_LABEL[k.category as KitCategory],
      dims, verification: k.status, lod: 1, tags: k.tags, physical: true,
    };
  });
}

export function partEntries(parts: IngestedPart[]): LibraryEntry[] {
  return parts.filter((p) => p.status !== 'rejected').map(partEntry);
}

export function partEntry(p: IngestedPart): LibraryEntry {
  return {
    key: `ingested:${p.id}@${p.version}`, section: 'project' as const, ref: { kind: 'ingested' as const, id: p.id, version: p.version },
    name: p.name, subtitle: `${p.project} · ${p.status === 'approved' ? `v${p.version} approved` : 'awaiting review'}`, group: KIT_CATEGORY_LABEL[p.category],
    dims: p.dims, verification: p.status === 'approved' ? 'project' : 'estimated', lod: 2,
    tags: [...p.tags, p.project, p.source.fileName, p.source.block, p.source.derivedFrom ?? ''], project: p.project, physical: true, status: p.status,
  };
}

export interface Resolved {
  entry: LibraryEntry;
  shape: Shape | null;
  part?: IngestedPart;
}

/** The geometry and record for a reference, or null when it no longer exists. */
export function resolveRef(ref: ItemRef, parts: IngestedPart[]): Resolved | null {
  if (ref.kind === 'product') {
    const e = productEntries().find((x) => x.ref.kind === 'product' && x.ref.id === ref.id);
    if (!e) return null;
    return { entry: e, shape: productShape(ref.id, 1) };
  }
  if (ref.kind === 'kit') {
    const base = kitEntries(true).find((x) => x.ref.kind === 'kit' && x.ref.id === ref.id);
    if (!base) return null;
    const params = resolveParams(ref.id, ref.params);
    const shape = kitShape(ref.id, params);
    return { entry: { ...base, ref: { kind: 'kit', id: ref.id, params }, dims: shape ? boxSize(shapeBounds(shape)) : base.dims }, shape };
  }
  const part = parts.find((p) => p.id === ref.id && p.version === ref.version);
  if (!part) return null;
  return { entry: partEntry(part), shape: { parts: part.mesh.map((m) => ({ kind: 'mesh' as const, name: m.material, material: m.material, positions: m.positions, indices: m.indices })), materials: part.materials }, part };
}

const HW_LAYER: Record<Category, string> = {
  'data-center': '10_NVIDIA_HARDWARE::DATA_CENTER', networking: '10_NVIDIA_HARDWARE::NETWORKING', workstation: '10_NVIDIA_HARDWARE::WORKSTATIONS',
  gpu: '10_NVIDIA_HARDWARE::GPU', edge: '10_NVIDIA_HARDWARE::EDGE', robotics: '10_NVIDIA_HARDWARE::ROBOTICS', automotive: '10_NVIDIA_HARDWARE::AUTOMOTIVE', software: '10_NVIDIA_HARDWARE',
};
const KIT_LAYER: Record<KitCategory, string> = {
  counter: '30_DISPLAY_FURNITURE::COUNTERS', kiosk: '30_DISPLAY_FURNITURE::KIOSKS', pedestal: '30_DISPLAY_FURNITURE::PEDESTALS', niche: '30_DISPLAY_FURNITURE::NICHES',
  desk: '30_DISPLAY_FURNITURE::DESKS', av: '40_MEDIA::DISPLAYS', wall: '50_EXHIBITION_ARCHITECTURE::WALLS', signage: '50_EXHIBITION_ARCHITECTURE::SIGNAGE',
  'robot-cell': '50_EXHIBITION_ARCHITECTURE::ROBOT_CELLS', other: '50_EXHIBITION_ARCHITECTURE::OTHER',
};

export const blockSlug = (s: string) => s.replace(/[^\w ()+.-]/g, '_').replace(/\s+/g, ' ').trim();

/** What the Rhino exporter needs for a placement. */
export function exportItemFor(p: Placement, parts: IngestedPart[]): ExportItem | null {
  const r = resolveRef(p.ref, parts);
  if (!r || !r.entry.dims) return null;
  const ref = p.ref;
  if (ref.kind === 'product') {
    const m = MODELS.find((x) => x.id === ref.id)!;
    const fam = FAMILY_BY_ID.get(m.familyId)!;
    if (!r.shape) return null;
    const pa = m.physicalAssetId ? PHYSICAL_BY_ID.get(m.physicalAssetId) : undefined;
    const da = pa?.digitalAssets[0];
    return {
      key: `product:${m.id}:v${da?.version ?? 0}`, blockName: `HW_${blockSlug(m.name)}`, layer: HW_LAYER[fam.category],
      description: `${m.name} (${m.manufacturer}). ${da?.provenance ?? ''} Dimensions ${r.entry.verification}: ${m.sources.map((s) => SOURCE_BY_ID.get(s)?.url ?? s).join(' ')}`.trim(),
      verification: r.entry.verification, lod: da?.lod ?? 0, source: m.sources.map((s) => SOURCE_BY_ID.get(s)?.url ?? s).join(' '), dims: r.entry.dims, shape: r.shape,
    };
  }
  if (ref.kind === 'kit') {
    const k = KIT.find((x) => x.id === ref.id)!;
    const params = resolveParams(ref.id, ref.params);
    const sig = Object.entries(params).map(([a, b]) => `${a}${b}`).join('_');
    return {
      key: `kit:${ref.id}:${sig}`, blockName: `KIT_${blockSlug(k.name)} ${Math.round(r.entry.dims[0])}x${Math.round(r.entry.dims[1])}x${Math.round(r.entry.dims[2])}`,
      layer: KIT_LAYER[k.category], description: `${k.name} — MAESTRO parametric kit. Parameters: ${JSON.stringify(params)}. ${k.note}`,
      verification: k.status, lod: 1, source: 'MAESTRO parametric kit', dims: r.entry.dims, shape: r.shape!,
    };
  }
  const part = r.part!;
  return {
    key: `ingested:${part.id}@${part.version}`, blockName: `${blockSlug(part.source.block)} v${part.version}`, layer: KIT_LAYER[part.category],
    description: `${part.name} — ${part.project}. Source geometry from ${part.source.fileName} (sha256 ${part.source.sha256.slice(0, 12)}…), block “${part.source.block}”${part.source.derivedFrom ? `, derived from “${part.source.derivedFrom}”` : ''}; scaled ${part.source.units} → mm. ${part.status === 'approved' ? `Approved ${part.approvedAt?.slice(0, 10)}.` : 'Not yet approved.'}`,
    verification: part.status === 'approved' ? 'project' : 'estimated', lod: 2, source: `${part.source.fileName}#${part.source.block}`, dims: part.dims,
    part: { geometry: part.geometry, materials: part.materials, sourceHash: part.source.sha256 },
  };
}
