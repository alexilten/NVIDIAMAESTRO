/**
 * Rhino source ingestion (runs in the browser and in Node; nothing is uploaded anywhere).
 *
 * 1. `inspectSource` opens a .3dm and lists its units, layers and block definitions, and proposes kit-of-parts
 *    candidates from the blocks.
 * 2. `extractPart` takes one block and returns
 *      • the AUTHORITATIVE geometry: every object of the block (and of the blocks nested in it) serialised
 *        exactly as openNURBS stores it, untouched, with the unit scale recorded beside it;
 *      • a SEPARATE viewport mesh in millimetres, tessellated from the B-reps for real-time display.
 *    The viewport mesh is never written back as the part's geometry: the Rhino export rebuilds the block
 *    from the serialised source objects.
 *
 * rhino3dm (openNURBS) has no B-rep mesher and these files carry no cached render meshes, so the tessellator
 * here triangulates planar trimmed faces exactly from their edge loops (most of a fabricated booth) and samples
 * the few curved faces on a grid over the untrimmed surface, counting them as approximated.
 */
import earcut from 'earcut';
import type { Vec3 } from '../core/schema';
import { MATERIALS, emptyBox, expand, type Box3, type MaterialDef } from '../core/geometry/shape';
import type { KitCategory } from '../core/schema';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RhinoModule = any;

const free = (...xs: unknown[]) => { for (const x of xs) (x as { delete?: () => void } | null)?.delete?.(); };

export const UNIT_TO_MM: Record<string, number> = {
  Millimeters: 1, Centimeters: 10, Meters: 1000, Inches: 25.4, Feet: 304.8, Yards: 914.4, Microns: 0.001, Kilometers: 1e6,
};

export function unitName(rh: RhinoModule, u: any): string {
  for (const k of Object.keys(UNIT_TO_MM)) if (rh.UnitSystem[k] === u) return k;
  return String(u?.constructor?.name ?? u);
}

// ── inspection ──────────────────────────────────────────────────────────────────────────────────────

export interface LayerInfo { index: number; path: string; color: string; objects: number }

export interface BlockCandidate {
  name: string;
  description: string;
  objectCount: number;
  nested: string[];
  /** blocks this one is used inside */
  usedIn: string[];
  /** top-level instances in the model */
  placements: number;
  category: KitCategory;
  /** a source block named in the description ("Exact copy of Show R2 block 'PANEL'") */
  derivedFrom?: string;
  /** the origin convention stated in the description, if any */
  originNote?: string;
}

export interface SourceSummary {
  fileName: string;
  fileSize: number;
  sha256: string;
  units: string;
  unitScale: number;
  tolerance: number;
  objectCount: number;
  layers: LayerInfo[];
  blocks: BlockCandidate[];
  materialCount: number;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const h = await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function openDoc(rh: RhinoModule, bytes: Uint8Array): any {
  const doc = rh.File3dm.fromByteArray(bytes);
  if (!doc) throw new Error('This file could not be read as a Rhino .3dm model.');
  return doc;
}

const CATEGORY_RULES: [RegExp, KitCategory][] = [
  [/niche|light ?box|vitrine/i, 'niche'],
  [/light table|pedestal|plinth/i, 'pedestal'],
  [/kiosk|demo station|quad|tri station|tri panel|panel/i, 'kiosk'],
  [/counter/i, 'counter'],
  [/desk/i, 'desk'],
  [/robot|alcove/i, 'robot-cell'],
  [/oled|tv|display|led wall|monitor|screen/i, 'av'],
  [/logo|sign|banner|header/i, 'signage'],
  [/wall|column|shroud|door/i, 'wall'],
];

export function guessCategory(name: string, description = ''): KitCategory {
  for (const [re, c] of CATEGORY_RULES) if (re.test(name)) return c;
  for (const [re, c] of CATEGORY_RULES) if (re.test(description)) return c;
  return 'other';
}

export async function inspectSource(rh: RhinoModule, bytes: Uint8Array, fileName: string): Promise<SourceSummary> {
  const doc = openDoc(rh, bytes);
  try {
    const units = unitName(rh, doc.settings().modelUnitSystem);
    const layersT = doc.layers();
    const objects = doc.objects();
    const perLayer = new Map<number, number>();
    const topRefs = new Map<string, number>();
    for (let i = 0; i < objects.count; i++) {
      const o = objects.get(i);
      const a = o.attributes();
      const g = o.geometry();
      if (!a.isInstanceDefinitionObject) {
        perLayer.set(a.layerIndex, (perLayer.get(a.layerIndex) ?? 0) + 1);
        if (g instanceof rh.InstanceReference) topRefs.set(g.parentIdefId, (topRefs.get(g.parentIdefId) ?? 0) + 1);
      }
      free(a, g, o);
    }
    const layers: LayerInfo[] = [];
    for (let i = 0; i < layersT.count; i++) {
      const l = layersT.get(i);
      layers.push({ index: l.index, path: l.fullPath, color: colorHex(l.color), objects: perLayer.get(l.index) ?? 0 });
      free(l);
    }
    const defs = doc.instanceDefinitions();
    const idName = new Map<string, string>();
    for (let i = 0; i < defs.count; i++) { const d = defs.get(i); idName.set(d.id, d.name); free(d); }
    const nestedOf = new Map<string, string[]>();
    const raw: { d: any; name: string; ids: string[] }[] = [];
    for (let i = 0; i < defs.count; i++) {
      const d = defs.get(i);
      const ids = toArray(d.getObjectIds());
      const nested: string[] = [];
      for (const id of ids) {
        const o = objects.findId(id);
        if (!o) continue;
        const g = o.geometry();
        if (g instanceof rh.InstanceReference) nested.push(idName.get(g.parentIdefId) ?? '?');
        free(g, o);
      }
      nestedOf.set(d.name, [...new Set(nested)]);
      raw.push({ d, name: d.name, ids });
    }
    const blocks: BlockCandidate[] = raw.map(({ d, name, ids }) => {
      const description: string = d.description ?? '';
      const usedIn = [...nestedOf.entries()].filter(([, n]) => n.includes(name)).map(([k]) => k);
      const derived = /block '([^']+)'/i.exec(description)?.[1];
      const origin = /Origin:\s*([^.]+(?:\([^)]*\))?)/i.exec(description)?.[1]?.trim();
      const c: BlockCandidate = {
        name, description, objectCount: ids.length, nested: nestedOf.get(name) ?? [], usedIn,
        placements: topRefs.get(d.id) ?? 0, category: guessCategory(name, description), derivedFrom: derived, originNote: origin,
      };
      free(d);
      return c;
    });
    return {
      fileName, fileSize: bytes.byteLength, sha256: await sha256(bytes), units, unitScale: UNIT_TO_MM[units] ?? NaN,
      tolerance: doc.settings().modelAbsoluteTolerance, objectCount: objects.count, layers, blocks, materialCount: doc.materials().count,
    };
  } finally { free(doc); }
}

function toArray(x: any): string[] {
  if (Array.isArray(x)) return x;
  if (x && typeof x.length === 'number') return Array.from(x as ArrayLike<string>);
  return [];
}

function colorHex(c: any): string {
  if (!c) return '#888888';
  const r = c.r ?? c[0] ?? 128, g = c.g ?? c[1] ?? 128, b = c.b ?? c[2] ?? 128;
  return '#' + [r, g, b].map((v: number) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// ── extraction ──────────────────────────────────────────────────────────────────────────────────────

export interface SourceObject {
  /** openNURBS serialisation of the geometry (CommonObject.encode), unchanged from the source file */
  data: string;
  type: string;
  layer: string;
  name: string;
  material: string;
}

export interface SourceInstance { def: string; xform: number[]; layer: string; name: string }

export interface SourceDef { name: string; description: string; objects: SourceObject[]; instances: SourceInstance[] }

export interface PartGeometry {
  root: string;
  defs: Record<string, SourceDef>;
  /** source model units and the factor to millimetres; the stored geometry is in source units */
  sourceUnits: string;
  unitScale: number;
}

export interface ViewMesh { material: string; positions: Float32Array; indices: Uint32Array }

export interface ExtractStats {
  objects: number;
  breps: number;
  extrusions: number;
  meshes: number;
  curves: number;
  skipped: number;
  skippedTypes: string[];
  faces: number;
  approximatedFaces: number;
  triangles: number;
  nestedInstances: number;
}

export interface ExtractedPart {
  geometry: PartGeometry;
  mesh: ViewMesh[];
  materials: Record<string, MaterialDef>;
  bbox: Box3;
  stats: ExtractStats;
}

/** Extract one block definition (by name) with its nested blocks. */
export function extractPart(rh: RhinoModule, doc: any, blockName: string): ExtractedPart {
  const units = unitName(rh, doc.settings().modelUnitSystem);
  const scale = UNIT_TO_MM[units];
  if (!scale) throw new Error(`Unsupported model units: ${units}`);
  const defsT = doc.instanceDefinitions();
  const byName = new Map<string, any>();
  const nameById = new Map<string, string>();
  for (let i = 0; i < defsT.count; i++) { const d = defsT.get(i); byName.set(d.name, d); nameById.set(d.id, d.name); }
  if (!byName.has(blockName)) throw new Error(`Block “${blockName}” is not in this file.`);

  const layerPath = new Map<number, string>();
  const layerMat = new Map<number, number>();
  const layerColor = new Map<number, string>();
  for (let i = 0; i < doc.layers().count; i++) {
    const l = doc.layers().get(i);
    layerPath.set(l.index, l.fullPath); layerMat.set(l.index, l.renderMaterialIndex); layerColor.set(l.index, colorHex(l.color));
    free(l);
  }
  const materials: Record<string, MaterialDef> = {};
  const matKey = (a: any): string => {
    const fromObject = a.materialSource === rh.ObjectMaterialSource.MaterialFromObject;
    const idx = fromObject ? a.materialIndex : layerMat.get(a.layerIndex) ?? -1;
    const path = layerPath.get(a.layerIndex) ?? 'Default';
    let key = path.split('::').pop() ?? 'Default';
    let color = layerColor.get(a.layerIndex) ?? '#999999';
    let transparency = 0;
    if (idx >= 0) {
      const m = doc.materials().findIndex(idx) ?? doc.materials().get(idx);
      if (m) {
        if (m.name) key = m.name;
        color = colorHex(m.diffuseColor);
        transparency = m.transparency ?? 0;
        free(m);
      }
    }
    if (!materials[key]) materials[key] = materialFromName(key, color, transparency);
    return key;
  };

  const stats: ExtractStats = { objects: 0, breps: 0, extrusions: 0, meshes: 0, curves: 0, skipped: 0, skippedTypes: [], faces: 0, approximatedFaces: 0, triangles: 0, nestedInstances: 0 };
  const geomDefs: Record<string, SourceDef> = {};
  const acc = new Map<string, { p: number[]; i: number[] }>();
  const bbox = emptyBox();
  const objects = doc.objects();
  const triCache = new Map<string, Tri | null>();

  const visit = (name: string, xf: number[] | null, depth: number) => {
    if (depth > 12) throw new Error('Block nesting deeper than 12 levels.');
    const d = byName.get(name);
    const record = !geomDefs[name];
    if (record) geomDefs[name] = { name, description: d.description ?? '', objects: [], instances: [] };
    for (const id of toArray(d.getObjectIds())) {
      const o = objects.findId(id);
      if (!o) continue;
      const g = o.geometry();
      const a = o.attributes();
      const layer = layerPath.get(a.layerIndex) ?? 'Default';
      if (g instanceof rh.InstanceReference) {
        const child = nameById.get(g.parentIdefId);
        const m: number[] = Array.from(g.xform.toFloatArray(true));
        if (child) {
          if (record) geomDefs[name].instances.push({ def: child, xform: m, layer, name: a.name ?? '' });
          stats.nestedInstances += record ? 1 : 0;
          visit(child, xf ? mul(xf, m) : m, depth + 1);
        }
      } else {
        const type = g.constructor?.name ?? 'Geometry';
        const isAnnotation = /Dim|Text|Leader|Annotation|Hatch|ClippingPlane/.test(type);
        if (isAnnotation) {
          if (record) { stats.skipped++; if (!stats.skippedTypes.includes(type)) stats.skippedTypes.push(type); }
        } else {
          const key = matKey(a);
          if (record) {
            geomDefs[name].objects.push({ data: JSON.stringify(g.encode()), type, layer, name: a.name ?? '', material: key });
            stats.objects++;
            if (g instanceof rh.Brep) stats.breps++;
            else if (g instanceof rh.Extrusion) stats.extrusions++;
            else if (g instanceof rh.Mesh) stats.meshes++;
            else if (g instanceof rh.Curve) stats.curves++;
          }
          let tri = triCache.get(id);
          if (tri === undefined) { tri = tessellate(rh, g, stats, record); triCache.set(id, tri); }
          if (tri) {
            const t = acc.get(key) ?? { p: [], i: [] };
            const base = t.p.length / 3;
            for (let k = 0; k < tri.p.length; k += 3) {
              let x = tri.p[k], y = tri.p[k + 1], z = tri.p[k + 2];
              if (xf) [x, y, z] = apply(xf, x, y, z);
              x *= scale; y *= scale; z *= scale;
              t.p.push(x, y, z);
              expand(bbox, [x, y, z]);
            }
            for (const v of tri.i) t.i.push(base + v);
            acc.set(key, t);
          }
        }
      }
      free(g, a, o);
    }
  };
  try {
    visit(blockName, null, 0);
  } finally {
    for (const d of byName.values()) free(d);
  }
  const mesh: ViewMesh[] = [...acc.entries()].map(([material, t]) => ({ material, positions: new Float32Array(t.p), indices: new Uint32Array(t.i) }));
  stats.triangles = mesh.reduce((n, m) => n + m.indices.length / 3, 0);
  return { geometry: { root: blockName, defs: geomDefs, sourceUnits: units, unitScale: scale }, mesh, materials, bbox, stats };
}

/** row-major 4×4 product a·b */
export function mul(a: number[], b: number[]): number[] {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return r;
}

export function apply(m: number[], x: number, y: number, z: number): Vec3 {
  const w = m[12] * x + m[13] * y + m[14] * z + m[15] || 1;
  return [(m[0] * x + m[1] * y + m[2] * z + m[3]) / w, (m[4] * x + m[5] * y + m[6] * z + m[7]) / w, (m[8] * x + m[9] * y + m[10] * z + m[11]) / w];
}

// ── materials ───────────────────────────────────────────────────────────────────────────────────────

/** A display material for a source material or layer name. Colour comes from the source; finish from the name. */
export function materialFromName(name: string, color: string, transparency = 0): MaterialDef {
  const n = name.toLowerCase();
  const base: MaterialDef = { name, color, roughness: 0.6, metalness: 0 };
  if (/walnut|wood|timber|oak/.test(n)) return { ...base, color: color === '#000000' ? MATERIALS.walnut.color : color, roughness: 0.55 };
  if (/emissive|led|content|light strip|lightbox/.test(n)) return { ...base, emissive: 0.85, roughness: 0.3 };
  if (/opal|acrylic/.test(n)) return { ...base, emissive: 0.35, roughness: 0.2 };
  if (/screen|display(?! back)/.test(n)) return { ...base, roughness: 0.15, metalness: 0.2 };
  if (/stainless|metal|chrome|edge banding|aluminium|aluminum|pewter/.test(n)) return { ...base, roughness: 0.3, metalness: 0.85 };
  if (/fabric|carpet|seg/.test(n)) return { ...base, roughness: 0.95 };
  if (/glass|tinted/.test(n)) return { ...base, roughness: 0.05, opacity: 0.4 };
  if (/laminate|matte|black/.test(n)) return { ...base, roughness: 0.75 };
  if (transparency > 0.05) return { ...base, opacity: 1 - transparency };
  return base;
}

// ── tessellation ────────────────────────────────────────────────────────────────────────────────────

interface Tri { p: number[]; i: number[] }

function tessellate(rh: RhinoModule, g: any, stats: ExtractStats, count: boolean): Tri | null {
  if (g instanceof rh.Brep) return tessBrep(rh, g, stats, count);
  if (g instanceof rh.Extrusion) {
    const b = g.toBrep(true);
    if (!b) return null;
    try { return tessBrep(rh, b, stats, count); } finally { free(b); }
  }
  if (g instanceof rh.Mesh) return tessMesh(g);
  return null;
}

function tessMesh(m: any): Tri {
  const v = m.vertices(), f = m.faces();
  const p: number[] = [], i: number[] = [];
  for (let k = 0; k < v.count; k++) { const q = v.get(k); p.push(q[0], q[1], q[2]); }
  for (let k = 0; k < f.count; k++) {
    const [a, b, c, d] = f.get(k);
    i.push(a, b, c);
    if (d !== c) i.push(a, c, d);
  }
  free(v, f);
  return { p, i };
}

function tessBrep(rh: RhinoModule, brep: any, stats: ExtractStats, count: boolean): Tri {
  const out: Tri = { p: [], i: [] };
  const faces = brep.faces();
  const edges = brep.edges();
  for (let fi = 0; fi < faces.count; fi++) {
    const face = faces.get(fi);
    const srf = face.underlyingSurface();
    if (count) stats.faces++;
    let ok = false;
    if (srf?.isPlanar?.()) ok = planarFace(rh, face, srf, edges, out);
    if (!ok) { gridFace(face, srf, out); if (count) stats.approximatedFaces++; }
    free(srf, face);
  }
  free(faces, edges);
  return out;
}

function sampleEdge(e: any): number[][] {
  const dom = e.domain as number[];
  if (e.isLinear()) return [e.pointAt(dom[0]), e.pointAt(dom[1])];
  if (e.degree === 1) {
    const nc = e.toNurbsCurve();
    if (nc) {
      const pts = nc.points();
      const r: number[][] = [];
      for (let k = 0; k < pts.count; k++) { const q = pts.get(k); r.push([q[0] / (q[3] || 1), q[1] / (q[3] || 1), q[2] / (q[3] || 1)]); }
      free(pts, nc);
      if (e.proxyCurveIsReversed) r.reverse();
      if (r.length >= 2) return r;
    }
  }
  const n = Math.min(96, Math.max(12, (e.spanCount ?? 1) * 8));
  const r: number[][] = [];
  for (let k = 0; k <= n; k++) r.push(e.pointAt(dom[0] + ((dom[1] - dom[0]) * k) / n));
  return r;
}

function planarFace(rh: RhinoModule, face: any, srf: any, edges: any, out: Tri): boolean {
  const loops = face.loops;
  const rings: number[][][] = [];
  for (let li = 0; li < loops.count; li++) {
    const loop = loops.get(li);
    const trims = loop.trims;
    const ring: number[][] = [];
    for (let ti = 0; ti < trims.count; ti++) {
      const t = trims.get(ti);
      if (t.edgeIndex < 0) { free(t); continue; }
      const e = edges.get(t.edgeIndex);
      const pts = sampleEdge(e);
      if (t.isReversed) pts.reverse();
      for (let k = 0; k < pts.length - 1; k++) ring.push(pts[k]);
      free(e, t);
    }
    const isOuter = loop.loopType === rh.BrepLoopType.Outer;
    if (ring.length >= 3) { if (isOuter) rings.unshift(ring); else rings.push(ring); }
    free(trims, loop);
  }
  free(loops);
  if (!rings.length) return false;

  // the face normal: the surface normal, flipped when the face is reversed
  const dom0 = srf.domain(0), dom1 = srf.domain(1);
  let n = srf.normalAt((dom0[0] + dom0[1]) / 2, (dom1[0] + dom1[1]) / 2) as number[];
  if (face.orientationIsReversed) n = n.map((x) => -x);
  const len = Math.hypot(n[0], n[1], n[2]);
  if (!len) return false;
  n = n.map((x) => x / len);
  // an in-plane basis
  const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(ref, n)), v = cross(n, u);
  const flat: number[] = [], holes: number[] = [], pts: number[][] = [];
  rings.forEach((r, k) => {
    if (k > 0) holes.push(pts.length);
    for (const q of r) { pts.push(q); flat.push(dot(q, u), dot(q, v)); }
  });
  const tris = earcut(flat, holes.length ? holes : undefined, 2);
  if (!tris.length) return false;
  const base = out.p.length / 3;
  for (const q of pts) out.p.push(q[0], q[1], q[2]);
  for (let k = 0; k < tris.length; k += 3) {
    const a = pts[tris[k]], b = pts[tris[k + 1]], c = pts[tris[k + 2]];
    const tn = cross(sub(b, a), sub(c, a));
    if (dot(tn, n) < 0) out.i.push(base + tris[k], base + tris[k + 2], base + tris[k + 1]);
    else out.i.push(base + tris[k], base + tris[k + 1], base + tris[k + 2]);
  }
  return true;
}

function gridFace(face: any, srf: any, out: Tri) {
  if (!srf) return;
  const d0 = srf.domain(0), d1 = srf.domain(1);
  const nu = Math.min(48, Math.max(6, (srf.spanCount(0) ?? 1) * (srf.degree(0) > 1 ? 8 : 1)));
  const nv = Math.min(48, Math.max(6, (srf.spanCount(1) ?? 1) * (srf.degree(1) > 1 ? 8 : 1)));
  const base = out.p.length / 3;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const q = srf.pointAt(d0[0] + ((d0[1] - d0[0]) * i) / nu, d1[0] + ((d1[1] - d1[0]) * j) / nv);
    out.p.push(q[0], q[1], q[2]);
  }
  const rev = face.orientationIsReversed;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (rev) out.i.push(a, c, b, b, c, d); else out.i.push(a, b, c, b, d, c);
  }
}

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** per-material extents of an extracted part (mm), for dimension checks against drawings */
export function measureByMaterial(mesh: ViewMesh[]): { material: string; size: Vec3; min: Vec3; max: Vec3 }[] {
  return mesh.map((m) => {
    const b = emptyBox();
    for (let i = 0; i < m.positions.length; i += 3) expand(b, m.positions, i);
    return { material: m.material, min: b.min, max: b.max, size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] as Vec3 };
  });
}
