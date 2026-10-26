import { emptyBox, expand, type Box3 } from '../core/geometry/shape';
import type { Vec3 } from '../core/schema';
import { UNIT_TO_MM, apply, unitName, type RhinoModule } from './rhino';
import type { IngestedPart } from './types';

/**
 * Block fingerprints and revision diffs between two versions of a source model.
 *
 * A block's fingerprint hashes its own objects exactly as openNURBS serialises them (with their layer and
 * name), and the blocks nested in it with their transforms, all the way down. Two blocks with the same
 * fingerprint hold the same geometry, whatever they are called; a single changed control point changes it.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const free = (...xs: unknown[]) => { for (const x of xs) (x as { delete?: () => void } | null)?.delete?.(); };

/** a 53-bit string hash (cyrb53), as 14 hex digits: enough to tell blocks apart, not a security hash */
export function hash53(s: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export interface BlockPrint {
  name: string;
  description: string;
  /** own objects and nested blocks, recursively */
  hash: string;
  /** own objects only */
  ownHash: string;
  objects: number;
  nested: string[];
  /** extents of the whole block, mm */
  bbox: Box3;
  dims: Vec3;
}

export interface SourcePrint { fileName: string; units: string; blocks: Map<string, BlockPrint> }

const r3 = (v: number) => Math.round(v * 1e4) / 1e4;

/** fingerprint every block definition in an open document */
export function blockPrints(rh: RhinoModule, doc: any, fileName: string): SourcePrint {
  const units = unitName(rh, doc.settings().modelUnitSystem);
  const scale = UNIT_TO_MM[units] ?? 1;
  const layerPath = new Map<number, string>();
  for (let i = 0; i < doc.layers().count; i++) { const l = doc.layers().get(i); layerPath.set(l.index, l.fullPath); free(l); }
  const defsT = doc.instanceDefinitions();
  const objects = doc.objects();
  const nameById = new Map<string, string>();
  const raw = new Map<string, { description: string; own: string[]; own_bbox: Box3; refs: { def: string; xform: number[] }[]; count: number }>();
  for (let i = 0; i < defsT.count; i++) { const d = defsT.get(i); nameById.set(d.id, d.name); free(d); }
  for (let i = 0; i < defsT.count; i++) {
    const d = defsT.get(i);
    const own: string[] = [];
    const ownBox = emptyBox();
    const refs: { def: string; xform: number[] }[] = [];
    let count = 0;
    const ids: string[] = Array.from((d.getObjectIds() ?? []) as ArrayLike<string>);
    for (const id of ids) {
      const o = objects.findId(id);
      if (!o) continue;
      const g = o.geometry(), a = o.attributes();
      if (g instanceof rh.InstanceReference) {
        const child = nameById.get(g.parentIdefId);
        if (child) refs.push({ def: child, xform: Array.from(g.xform.toFloatArray(true) as ArrayLike<number>).map(r3) });
      } else {
        count++;
        own.push(`${layerPath.get(a.layerIndex) ?? ''}|${a.name ?? ''}|${JSON.stringify(g.encode())}`);
        const b = g.getBoundingBox?.();
        if (b) { expand(ownBox, b.min as Vec3); expand(ownBox, b.max as Vec3); free(b); }
      }
      free(g, a, o);
    }
    raw.set(d.name, { description: d.description ?? '', own: own.sort(), own_bbox: ownBox, refs, count });
    free(d);
  }
  // deep hashes and extents, children first
  const done = new Map<string, { hash: string; box: Box3 }>();
  const deep = (name: string, depth = 0): { hash: string; box: Box3 } => {
    const hit = done.get(name);
    if (hit) return hit;
    const r = raw.get(name);
    if (!r || depth > 12) return { hash: 'missing', box: emptyBox() };
    const box: Box3 = { min: [...r.own_bbox.min] as Vec3, max: [...r.own_bbox.max] as Vec3 };
    const parts = [hash53(r.own.join('\n'))];
    for (const ref of r.refs) {
      const c = deep(ref.def, depth + 1);
      parts.push(`${c.hash}@${ref.xform.join(',')}`);
      if (Number.isFinite(c.box.min[0])) {
        for (const x of [c.box.min[0], c.box.max[0]]) for (const y of [c.box.min[1], c.box.max[1]]) for (const z of [c.box.min[2], c.box.max[2]]) expand(box, apply(ref.xform, x, y, z));
      }
    }
    const out = { hash: hash53(parts.sort().join('\n')), box };
    done.set(name, out);
    return out;
  };
  const blocks = new Map<string, BlockPrint>();
  for (const [name, r] of raw) {
    const d = deep(name);
    const mm: Box3 = Number.isFinite(d.box.min[0]) ? { min: d.box.min.map((v) => v * scale) as Vec3, max: d.box.max.map((v) => v * scale) as Vec3 } : { min: [0, 0, 0], max: [0, 0, 0] };
    blocks.set(name, {
      name, description: r.description, hash: d.hash, ownHash: hash53(r.own.join('\n')), objects: r.count, nested: [...new Set(r.refs.map((x) => x.def))],
      bbox: mm, dims: [0, 1, 2].map((k) => Math.round((mm.max[k] - mm.min[k]) * 10) / 10) as Vec3,
    });
  }
  return { fileName, units, blocks };
}

// ── diff ────────────────────────────────────────────────────────────────────────────────────────────

export type Change = 'unchanged' | 'changed' | 'nested' | 'renamed' | 'added' | 'removed' | 'described';

export interface DiffRow {
  name: string;
  change: Change;
  /** for a rename, the old name */
  from?: string;
  before?: BlockPrint;
  after?: BlockPrint;
  /** after − before, mm */
  delta?: Vec3;
  detail: string;
}

export const CHANGE_LABEL: Record<Change, string> = {
  changed: 'Geometry changed', nested: 'A nested block changed', renamed: 'Renamed', added: 'Added', removed: 'Removed', described: 'Description changed', unchanged: 'Unchanged',
};

const fmt = (v: Vec3) => v.map((x) => Math.round(x)).join(' × ');

/** compare two versions of a source model, block by block */
export function diffSources(a: SourcePrint, b: SourcePrint): DiffRow[] {
  const rows: DiffRow[] = [];
  const unitsNote = a.units !== b.units ? ` (units ${a.units} → ${b.units})` : '';
  const gone = [...a.blocks.values()].filter((x) => !b.blocks.has(x.name));
  const fresh = [...b.blocks.values()].filter((x) => !a.blocks.has(x.name));
  // a removed and an added block with the same geometry is a rename
  const renamedFrom = new Map<string, BlockPrint>();
  for (const n of fresh) {
    const o = gone.find((g) => g.hash === n.hash && ![...renamedFrom.values()].includes(g));
    if (o) renamedFrom.set(n.name, o);
  }
  for (const after of b.blocks.values()) {
    const before = a.blocks.get(after.name);
    if (!before) {
      const o = renamedFrom.get(after.name);
      rows.push(o ? { name: after.name, change: 'renamed', from: o.name, before: o, after, delta: [0, 0, 0], detail: `Was “${o.name}”; same geometry.` }
        : { name: after.name, change: 'added', after, detail: `New block, ${fmt(after.dims)} mm.` });
      continue;
    }
    const delta = [0, 1, 2].map((k) => Math.round((after.dims[k] - before.dims[k]) * 10) / 10) as Vec3;
    if (before.hash === after.hash) {
      rows.push(before.description === after.description
        ? { name: after.name, change: 'unchanged', before, after, delta, detail: 'Same geometry.' }
        : { name: after.name, change: 'described', before, after, delta, detail: 'Same geometry; the description was edited.' });
    } else if (before.ownHash === after.ownHash) {
      const which = after.nested.filter((n) => a.blocks.get(n)?.hash !== b.blocks.get(n)?.hash);
      rows.push({ name: after.name, change: 'nested', before, after, delta, detail: `Its own objects are unchanged; ${which.length ? which.join(', ') : 'a nested placement'} changed.${unitsNote}` });
    } else {
      const size = delta.some((d) => Math.abs(d) > 0.05) ? `Size ${fmt(before.dims)} → ${fmt(after.dims)} mm.` : 'Same overall size; objects inside changed.';
      rows.push({ name: after.name, change: 'changed', before, after, delta, detail: `${size} ${before.objects} → ${after.objects} objects.${unitsNote}` });
    }
  }
  for (const before of gone) if (![...renamedFrom.values()].includes(before)) rows.push({ name: before.name, change: 'removed', before, detail: 'No longer in the model.' });
  const order: Change[] = ['changed', 'nested', 'renamed', 'added', 'removed', 'described', 'unchanged'];
  return rows.sort((x, y) => order.indexOf(x.change) - order.indexOf(y.change) || x.name.localeCompare(y.name));
}

/** What a revision means for the library: each part extracted from a block that changed, was renamed or removed. */
export interface Impact { part: IngestedPart; row: DiffRow; action: 'revise' | 'relink' | 'orphaned' }

export function libraryImpact(rows: DiffRow[], parts: IngestedPart[], sourceFile?: string): Impact[] {
  // the latest version of each part
  const latest = new Map<string, IngestedPart>();
  for (const p of parts) if (!latest.has(p.id) || latest.get(p.id)!.version < p.version) latest.set(p.id, p);
  const out: Impact[] = [];
  for (const p of latest.values()) {
    if (sourceFile && p.source.fileName !== sourceFile) continue;
    const row = rows.find((r) => r.name === p.source.block || r.from === p.source.block);
    if (!row) continue;
    if (row.change === 'changed' || row.change === 'nested') out.push({ part: p, row, action: 'revise' });
    else if (row.change === 'renamed') out.push({ part: p, row, action: 'relink' });
    else if (row.change === 'removed') out.push({ part: p, row, action: 'orphaned' });
  }
  return out;
}

/** a revision report as CSV, for the project record */
export function diffCsv(a: SourcePrint, b: SourcePrint, rows: DiffRow[]): string {
  const cell = (x: string | number) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
  const lines: (string | number)[][] = [['Block', 'Change', 'Was', 'W before', 'D before', 'H before', 'W after', 'D after', 'H after', 'Detail']];
  for (const r of rows) lines.push([r.name, CHANGE_LABEL[r.change], r.from ?? '', ...(r.before?.dims ?? ['', '', '']), ...(r.after?.dims ?? ['', '', '']), r.detail]);
  lines.push([]);
  lines.push([`${a.fileName} → ${b.fileName}`]);
  return lines.map((l) => l.map(cell).join(',')).join('\n') + '\n';
}
