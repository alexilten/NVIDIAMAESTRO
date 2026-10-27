/**
 * Native Rhino .3dm export (openNURBS via McNeel rhino3dm; browser and Node).
 *
 *   • millimetre model units, Z up, front of every item toward −Y
 *   • one block definition per distinct item (product, parametric kit configuration, or ingested part version);
 *     every placement is a named block instance, so a booth never becomes one flattened mesh
 *   • procedural items are exact box extrusions (closed solids); ingested parts are rebuilt from their serialised
 *     source objects (the original NURBS/B-rep/extrusion data, scaled from source units to mm) with their nested
 *     blocks recreated, never from the viewport mesh
 *   • the NVIDIA_MAESTRO layer standard; source layer paths of ingested parts are kept under 95_SOURCE_LAYERS
 *   • identity, verification, source and LOD on every instance as user text (maestro.*)
 *   • composition groups become Rhino groups; the composition itself is stored in the document strings
 */
import type { Composition, Placement, Vec3, Verification } from '../core/schema';
import type { Shape, MaterialDef } from '../core/geometry/shape';
import type { PartGeometry } from '../ingest/rhino';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RhinoModule = any;
const free = (...xs: unknown[]) => { for (const x of xs) (x as { delete?: () => void } | null)?.delete?.(); };

export const ROOT = 'NVIDIA_MAESTRO';
export const LAYER_TREE: { name: string; color: [number, number, number]; children: string[] }[] = [
  { name: '00_REFERENCE', color: [150, 150, 150], children: ['ORIGIN'] },
  { name: '10_NVIDIA_HARDWARE', color: [118, 185, 0], children: ['DATA_CENTER', 'NETWORKING', 'WORKSTATIONS', 'GPU', 'EDGE', 'ROBOTICS', 'AUTOMOTIVE'] },
  { name: '20_DEMO_MODULES', color: [60, 60, 70], children: [] },
  { name: '30_DISPLAY_FURNITURE', color: [90, 90, 96], children: ['COUNTERS', 'KIOSKS', 'PEDESTALS', 'NICHES', 'DESKS'] },
  { name: '40_MEDIA', color: [20, 20, 24], children: ['DISPLAYS'] },
  { name: '50_EXHIBITION_ARCHITECTURE', color: [120, 120, 128], children: ['BOOTH_PLOT', 'COLUMNS', 'DECKS', 'WALLS', 'SIGNAGE', 'ROBOT_CELLS', 'OTHER'] },
  { name: '60_TECHNICAL_INFRASTRUCTURE', color: [230, 170, 30], children: ['SERVICE_POINTS'] },
  { name: '90_DIMENSIONS', color: [10, 132, 255], children: ['LABELS'] },
  { name: '91_CLEARANCES', color: [230, 40, 40], children: ['APPROACH_ZONES', 'NARROW_FLOOR'] },
  { name: '95_SOURCE_LAYERS', color: [160, 160, 160], children: [] },
];

/** Everything the exporter needs to know about one referenced item. */
export interface ExportItem {
  /** stable key: one block definition per key */
  key: string;
  blockName: string;
  description: string;
  /** layer path under NVIDIA_MAESTRO, e.g. 10_NVIDIA_HARDWARE::EDGE */
  layer: string;
  verification: Verification;
  lod: number;
  source: string;
  dims: Vec3;
  /** procedural geometry … */
  shape?: Shape;
  /** … or the source geometry of an ingested part */
  part?: { geometry: PartGeometry; materials: Record<string, MaterialDef>; sourceHash: string };
}

export type Resolver = (p: Placement) => ExportItem | null;

export interface ExportResult { bytes: Uint8Array; blocks: number; instances: number; skipped: string[]; annotations: number }

/** Plain drawing objects that go with a composition, such as a booth plot, clearance zones or service points. */
export type Annotation =
  | { kind: 'polyline'; layer: string; name: string; points: Vec3[]; closed?: boolean; user?: Record<string, string | number> }
  | { kind: 'circle'; layer: string; name: string; center: Vec3; radius: number; user?: Record<string, string | number> }
  | { kind: 'dot'; layer: string; name: string; text: string; at: Vec3 };

export function exportComposition(rh: RhinoModule, comp: Composition, resolve: Resolver, appVersion = 'dev', annotations: Annotation[] = []): ExportResult {
  const doc = new rh.File3dm();
  doc.settings().modelUnitSystem = rh.UnitSystem.Millimeters;
  doc.settings().modelAbsoluteTolerance = 0.01;
  doc.applicationName = 'NVIDIA MAESTRO';
  doc.applicationDetails = `NVIDIA MAESTRO ${appVersion} (internal working title; not an NVIDIA product)`;

  // ── layers
  const layerIndex = new Map<string, number>();
  const layerId = new Map<string, string>();
  const addLayer = (path: string, color: [number, number, number]) => {
    if (layerIndex.has(path)) return layerIndex.get(path)!;
    const parts = path.split('::');
    if (parts.length > 1) addLayer(parts.slice(0, -1).join('::'), color);
    const l = new rh.Layer();
    l.name = parts[parts.length - 1];
    l.color = { r: color[0], g: color[1], b: color[2], a: 255 };
    if (parts.length > 1) l.parentLayerId = layerId.get(parts.slice(0, -1).join('::'));
    const i = doc.layers().add(l);
    free(l);
    layerIndex.set(path, i);
    layerId.set(path, doc.layers().get(i).id);
    return i;
  };
  addLayer(ROOT, [40, 40, 40]);
  for (const t of LAYER_TREE) {
    addLayer(`${ROOT}::${t.name}`, t.color);
    for (const c of t.children) addLayer(`${ROOT}::${t.name}::${c}`, t.color);
  }
  const L = (path: string) => addLayer(path.startsWith(ROOT) ? path : `${ROOT}::${path}`, [128, 128, 128]);

  // ── materials
  const matIndex = new Map<string, number>();
  const material = (key: string, def: MaterialDef | undefined) => {
    const k = `${key}`;
    if (matIndex.has(k)) return matIndex.get(k)!;
    const m = new rh.Material();
    m.name = def?.name ?? key;
    const c = hexRgb(def?.color ?? '#999999');
    m.diffuseColor = { r: c[0], g: c[1], b: c[2], a: 255 };
    if (def?.opacity != null) m.transparency = 1 - def.opacity;
    if (def?.emissive) m.emissionColor = { r: Math.round(c[0] * def.emissive), g: Math.round(c[1] * def.emissive), b: Math.round(c[2] * def.emissive), a: 255 };
    const i = doc.materials().add(m);
    free(m);
    matIndex.set(k, i);
    return i;
  };

  const attrs = (layer: number, name: string, mat?: number, user: Record<string, string | number> = {}) => {
    const a = new rh.ObjectAttributes();
    a.layerIndex = layer;
    a.name = name;
    if (mat != null) { a.materialSource = rh.ObjectMaterialSource.MaterialFromObject; a.materialIndex = mat; }
    for (const [k, v] of Object.entries(user)) a.setUserString(`maestro.${k}`, String(v));
    return a;
  };

  // reference axes at the origin
  const ref = L('00_REFERENCE::ORIGIN');
  const addObj = (g: any, a: any) => { doc.objects().add(g, a); free(g, a); };
  addObj(new rh.LineCurve([0, 0, 0], [1000, 0, 0]), attrs(ref, 'AXIS_X'));
  addObj(new rh.LineCurve([0, 0, 0], [0, 1000, 0]), attrs(ref, 'AXIS_Y'));
  addObj(new rh.LineCurve([0, 0, 0], [0, -1000, 0]), attrs(ref, 'FRONT (−Y)'));

  // ── block definitions
  const defIds = new Map<string, string>();
  const srcDefIds = new Map<string, string>();
  const skipped: string[] = [];

  const sourceDef = (part: NonNullable<ExportItem['part']>, name: string, item: ExportItem, top: boolean): string | null => {
    const key = `${part.sourceHash}:${name}:${top ? item.key : ''}`;
    if (srcDefIds.has(key)) return srcDefIds.get(key)!;
    const d = part.geometry.defs[name];
    if (!d) return null;
    const s = part.geometry.unitScale;
    const geo: any[] = [], at: any[] = [];
    for (const o of d.objects) {
      const g = rh.CommonObject.decode(JSON.parse(o.data));
      if (!g) { skipped.push(`${name}: ${o.type}`); continue; }
      if (s !== 1) g.scale(s);
      geo.push(g);
      at.push(attrs(L(`95_SOURCE_LAYERS::${sanitizePath(o.layer)}`), o.name, material(`src:${part.sourceHash}:${o.material}`, part.materials[o.material])));
    }
    for (const inst of d.instances) {
      const child = sourceDef(part, inst.def, item, false);
      if (!child) continue;
      const m = inst.xform.slice();
      m[3] *= s; m[7] *= s; m[11] *= s; // the source frame is scaled into mm: S·X·S⁻¹
      const xf = xformFrom(rh, m);
      geo.push(new rh.InstanceReference(child, xf));
      at.push(attrs(L(`95_SOURCE_LAYERS::${sanitizePath(inst.layer)}`), inst.name));
      free(xf);
    }
    const blockName = top ? item.blockName : `SRC_${part.sourceHash.slice(0, 6)}_${name}`;
    const desc = top ? item.description : `${d.description} — source block “${name}”, scaled from ${part.geometry.sourceUnits} to millimetres.`;
    const idx = doc.instanceDefinitions().add(blockName, desc, '', '', [0, 0, 0], geo, at);
    free(...geo, ...at);
    if (idx < 0) { skipped.push(`block ${blockName}`); return null; }
    const id = doc.instanceDefinitions().get(idx).id;
    srcDefIds.set(key, id);
    return id;
  };

  const defFor = (item: ExportItem): string | null => {
    if (defIds.has(item.key)) return defIds.get(item.key)!;
    let id: string | null = null;
    if (item.part) id = sourceDef(item.part, item.part.geometry.root, item, true);
    else if (item.shape) {
      const geo: any[] = [], at: any[] = [];
      for (const p of item.shape.parts) {
        const layer = L(item.layer);
        const mat = material(`proc:${p.material}`, item.shape.materials[p.material]);
        if (p.kind === 'box') {
          geo.push(rh.Extrusion.createBoxExtrusion(new rh.Box(new rh.BoundingBox(p.min, p.max)), true));
        } else {
          const m = new rh.Mesh();
          for (let i = 0; i < p.positions.length; i += 3) m.vertices().add(p.positions[i], p.positions[i + 1], p.positions[i + 2]);
          for (let i = 0; i < p.indices.length; i += 3) m.faces().addTriFace(p.indices[i], p.indices[i + 1], p.indices[i + 2]);
          m.normals().computeNormals();
          geo.push(m);
        }
        at.push(attrs(layer, p.name, mat));
      }
      const idx = doc.instanceDefinitions().add(item.blockName, item.description, '', '', [0, 0, 0], geo, at);
      free(...geo, ...at);
      if (idx >= 0) id = doc.instanceDefinitions().get(idx).id;
    }
    if (id) defIds.set(item.key, id);
    return id;
  };

  // ── groups and placements
  const groupIndex = new Map<string, number>();
  for (const g of comp.groups) {
    const grp = new rh.Group();
    grp.name = g.name;
    groupIndex.set(g.id, doc.groups().count);
    doc.groups().add(grp);
    free(grp);
  }
  let instances = 0;
  const labels = L('90_DIMENSIONS::LABELS');
  for (const p of comp.items) {
    const item = resolve(p);
    if (!item) { skipped.push(`${p.name}: item not available`); continue; }
    const def = defFor(item);
    if (!def) { skipped.push(`${p.name}: no geometry`); continue; }
    const xf = placementXform(rh, p);
    const a = attrs(L(item.layer), p.name, undefined, {
      placement: p.id,
      ref: refString(p),
      verification: item.verification,
      lod: item.lod,
      source: item.source,
      width_mm: round(item.dims[0]), depth_mm: round(item.dims[1]), height_mm: round(item.dims[2]),
      rotation_deg: p.rotation,
    });
    if (p.groupId && groupIndex.has(p.groupId)) a.addToGroup(groupIndex.get(p.groupId)!);
    const r = new rh.InstanceReference(def, xf);
    doc.objects().addInstanceObject(r, a);
    free(r, a, xf);
    instances++;
    const dot = new rh.TextDot(`${p.name} · ${round(item.dims[0])} × ${round(item.dims[1])} × ${round(item.dims[2])} mm`, [p.position[0], p.position[1], p.position[2] + item.dims[2] + 100]);
    addObj(dot, attrs(labels, `${p.name}.LABEL`));
  }

  for (const an of annotations) {
    const layer = L(an.layer);
    if (an.kind === 'polyline') {
      const pts = an.closed ? [...an.points, an.points[0]] : an.points;
      const pl = new rh.Polyline(pts.length);
      for (const p of pts) pl.add(p[0], p[1], p[2]);
      const curve = pl.toNurbsCurve();
      addObj(curve, attrs(layer, an.name, undefined, an.user));
      free(pl);
    } else if (an.kind === 'circle') {
      const ci = new rh.Circle(an.center, an.radius);
      addObj(ci.toNurbsCurve(), attrs(layer, an.name, undefined, an.user));
      free(ci);
    } else {
      addObj(new rh.TextDot(an.text, an.at), attrs(layer, an.name));
    }
  }

  doc.strings().set('maestro.schema', 'maestro.composition');
  doc.strings().set('maestro.appVersion', appVersion);
  doc.strings().set('maestro.composition', JSON.stringify(comp));
  doc.strings().set('maestro.coordinateSystem', 'mm; Z up; item fronts face −Y; each instance origin = item origin (footprint centre at floor unless its block description says otherwise)');

  const bytes: Uint8Array = doc.toByteArray();
  free(doc);
  return { bytes, blocks: defIds.size, instances, skipped, annotations: annotations.length };
}

export function placementXform(rh: RhinoModule, p: Placement) {
  const rot = rh.Transform.rotation((p.rotation * Math.PI) / 180, [0, 0, 1], [0, 0, 0]);
  const tr = rh.Transform.translationXYZ(p.position[0], p.position[1], p.position[2]);
  const xf = rh.Transform.multiply(tr, rot);
  free(rot, tr);
  return xf;
}

function xformFrom(rh: RhinoModule, m: number[]) {
  const xf = new rh.Transform(1);
  const keys = ['m00', 'm01', 'm02', 'm03', 'm10', 'm11', 'm12', 'm13', 'm20', 'm21', 'm22', 'm23', 'm30', 'm31', 'm32', 'm33'];
  keys.forEach((k, i) => { xf[k] = m[i]; });
  return xf;
}

export const refString = (p: Placement) => p.ref.kind === 'kit' ? `kit:${p.ref.id}?${new URLSearchParams(Object.entries(p.ref.params).map(([k, v]) => [k, String(v)])).toString()}` : p.ref.kind === 'ingested' ? `ingested:${p.ref.id}@${p.ref.version}` : `product:${p.ref.id}`;

const round = (x: number) => Math.round(x * 10) / 10;
const sanitizePath = (p: string) => p.split('::').map((s) => s.replace(/[^\w .()+-]/g, '_').trim() || 'Default').join('::');
function hexRgb(h: string): [number, number, number] {
  const v = parseInt(h.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** a document string by key (the table is indexed; entries come back as [key, value]) */
export function docString(doc: any, key: string): string | null {
  const t = doc.strings();
  for (let i = 0; i < t.count; i++) {
    const kv = t.get(i) as unknown;
    if (Array.isArray(kv) && kv[0] === key) return kv[1];
    if (kv && typeof kv === 'object' && (kv as { key?: string }).key === key) return (kv as { value: string }).value;
  }
  return null;
}

// ── reading a MAESTRO export back ──────────────────────────────────────────────────────────────────

export interface ReadBack {
  units: string;
  composition: Composition | null;
  layers: string[];
  blocks: { name: string; bbox: { min: Vec3; max: Vec3 } | null }[];
  instances: { name: string; block: string; layer: string; origin: Vec3; user: Record<string, string> }[];
  groups: number;
}

/** Reopen a .3dm and report what is in it (used by the round-trip tests and the export check). */
export function readBack(rh: RhinoModule, bytes: Uint8Array): ReadBack {
  const doc = rh.File3dm.fromByteArray(bytes);
  const units = Object.keys(rh.UnitSystem).find((k) => rh.UnitSystem[k] === doc.settings().modelUnitSystem) ?? '?';
  const layers: string[] = [];
  for (let i = 0; i < doc.layers().count; i++) { const l = doc.layers().get(i); layers.push(l.fullPath); free(l); }
  const layerPath = (i: number) => layers[i] ?? '?';
  const defs = doc.instanceDefinitions();
  const defName = new Map<string, string>();
  const blocks: ReadBack['blocks'] = [];
  const objects = doc.objects();
  for (let i = 0; i < defs.count; i++) {
    const d = defs.get(i);
    defName.set(d.id, d.name);
    let bb: { min: Vec3; max: Vec3 } | null = null;
    for (const id of Array.from(d.getObjectIds() as ArrayLike<string>)) {
      const o = objects.findId(id);
      if (!o) continue;
      const g = o.geometry();
      if (!(g instanceof rh.InstanceReference)) {
        const b = g.getBoundingBox();
        const mn = b.min as number[], mx = b.max as number[];
        bb = bb ? { min: [Math.min(bb.min[0], mn[0]), Math.min(bb.min[1], mn[1]), Math.min(bb.min[2], mn[2])], max: [Math.max(bb.max[0], mx[0]), Math.max(bb.max[1], mx[1]), Math.max(bb.max[2], mx[2])] } : { min: [mn[0], mn[1], mn[2]], max: [mx[0], mx[1], mx[2]] };
        free(b);
      }
      free(g, o);
    }
    blocks.push({ name: d.name, bbox: bb });
    free(d);
  }
  const instances: ReadBack['instances'] = [];
  for (let i = 0; i < objects.count; i++) {
    const o = objects.get(i);
    const a = o.attributes();
    const g = o.geometry();
    if (!a.isInstanceDefinitionObject && g instanceof rh.InstanceReference) {
      const m = g.xform.toFloatArray(true) as number[];
      const user: Record<string, string> = {};
      const keys = a.getUserStrings() as unknown as [string, string][];
      for (const kv of Array.from(keys ?? [])) { const [k, v] = Array.isArray(kv) ? kv : [kv, a.getUserString(kv)]; user[k] = v; }
      instances.push({ name: a.name, block: defName.get(g.parentIdefId) ?? '?', layer: layerPath(a.layerIndex), origin: [m[3], m[7], m[11]], user });
    }
    free(g, a, o);
  }
  let composition: Composition | null = null;
  const raw = docString(doc, 'maestro.composition');
  if (raw) { try { composition = JSON.parse(raw); } catch { composition = null; } }
  const groups = doc.groups().count;
  free(doc);
  return { units, composition, layers, blocks, instances, groups };
}
