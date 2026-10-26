import type { Composition, Group, ItemRef, Placement, Vec3 } from './schema';

/**
 * Pure operations on a composition (a demo module or an exhibition layout). Every operation returns a new
 * composition and never changes an item's own geometry: a placement only carries a reference, a position
 * and a rotation about Z.
 */

let counter = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newComposition(name = 'Untitled module', kind: Composition['kind'] = 'module'): Composition {
  return { schema: 'maestro.composition', version: 1, id: uid('comp'), name, kind, items: [], groups: [], updatedAt: new Date().toISOString() };
}

const touch = (c: Composition, patch: Partial<Composition>): Composition => ({ ...c, ...patch, updatedAt: new Date().toISOString() });

/** the plan footprint of an item after rotation, as min/max offsets from its origin (assumes a centred origin) */
export function footprint(dims: Vec3, rotation: number) {
  const a = (rotation * Math.PI) / 180;
  const w = Math.abs(dims[0] * Math.cos(a)) + Math.abs(dims[1] * Math.sin(a));
  const d = Math.abs(dims[0] * Math.sin(a)) + Math.abs(dims[1] * Math.cos(a));
  return { w, d };
}

export interface Extent { min: Vec3; max: Vec3 }

/** where the next item goes: to the right of everything placed, with a gap */
export function nextSlot(c: Composition, extents: (p: Placement) => Extent | null, width: number, gap = 400): Vec3 {
  let maxX = -Infinity;
  for (const p of c.items) { const e = extents(p); if (e) maxX = Math.max(maxX, e.max[0]); }
  return Number.isFinite(maxX) ? [Math.round(maxX + gap + width / 2), 0, 0] : [0, 0, 0];
}

export function addItem(c: Composition, ref: ItemRef, name: string, dims: Vec3, position: Vec3, version = 1): { comp: Composition; id: string } {
  const p: Placement = { id: uid('it'), ref, name: uniqueName(c, name), position, rotation: 0, snapshot: { width: dims[0], depth: dims[1], height: dims[2], version } };
  return { comp: touch(c, { items: [...c.items, p] }), id: p.id };
}

function uniqueName(c: Composition, base: string) {
  const names = new Set(c.items.map((i) => i.name));
  if (!names.has(base)) return base;
  for (let k = 2; ; k++) if (!names.has(`${base} ${k}`)) return `${base} ${k}`;
}

export function removeItems(c: Composition, ids: string[]): Composition {
  const items = c.items.filter((i) => !ids.includes(i.id));
  const used = new Set(items.map((i) => i.groupId).filter(Boolean));
  return touch(c, { items, groups: c.groups.filter((g) => used.has(g.id)) });
}

export function updateItem(c: Composition, id: string, patch: Partial<Pick<Placement, 'position' | 'rotation' | 'name' | 'ref' | 'snapshot' | 'live'>>): Composition {
  return touch(c, { items: c.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
}

export function moveItems(c: Composition, ids: string[], delta: Vec3): Composition {
  return touch(c, { items: c.items.map((i) => (ids.includes(i.id) ? { ...i, position: [i.position[0] + delta[0], i.position[1] + delta[1], i.position[2] + delta[2]] as Vec3 } : i)) });
}

/** rotate items about Z, about their common centre */
export function rotateItems(c: Composition, ids: string[], deg: number): Composition {
  const sel = c.items.filter((i) => ids.includes(i.id));
  if (!sel.length) return c;
  const cx = sel.reduce((s, i) => s + i.position[0], 0) / sel.length;
  const cy = sel.reduce((s, i) => s + i.position[1], 0) / sel.length;
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return touch(c, {
    items: c.items.map((i) => {
      if (!ids.includes(i.id)) return i;
      const x = i.position[0] - cx, y = i.position[1] - cy;
      const rot = (((i.rotation + deg) % 360) + 360) % 360;
      return { ...i, rotation: rot, position: [round(cx + x * cos - y * sin), round(cy + x * sin + y * cos), i.position[2]] as Vec3 };
    }),
  });
}

/** duplicate items (and their group, as a new group) with an offset */
export function duplicateItems(c: Composition, ids: string[], offset: Vec3): { comp: Composition; ids: string[] } {
  const sel = c.items.filter((i) => ids.includes(i.id));
  const groupMap = new Map<string, Group>();
  const newGroups: Group[] = [];
  for (const i of sel) if (i.groupId && !groupMap.has(i.groupId)) {
    const g = c.groups.find((x) => x.id === i.groupId);
    const ng = { id: uid('grp'), name: `${g?.name ?? 'Group'} copy` };
    groupMap.set(i.groupId, ng); newGroups.push(ng);
  }
  let comp = touch(c, { groups: [...c.groups, ...newGroups] });
  const out: string[] = [];
  for (const i of sel) {
    const p: Placement = { ...i, id: uid('it'), name: uniqueName(comp, i.name), position: [i.position[0] + offset[0], i.position[1] + offset[1], i.position[2] + offset[2]], groupId: i.groupId ? groupMap.get(i.groupId)?.id : undefined };
    comp = touch(comp, { items: [...comp.items, p] });
    out.push(p.id);
  }
  return { comp, ids: out };
}

export function groupItems(c: Composition, ids: string[], name: string): { comp: Composition; groupId: string } {
  const g: Group = { id: uid('grp'), name };
  const items = c.items.map((i) => (ids.includes(i.id) ? { ...i, groupId: g.id } : i));
  const used = new Set(items.map((i) => i.groupId).filter(Boolean));
  return { comp: touch(c, { items, groups: [...c.groups, g].filter((x) => used.has(x.id)) }), groupId: g.id };
}

export function ungroup(c: Composition, groupId: string): Composition {
  return touch(c, { items: c.items.map((i) => (i.groupId === groupId ? { ...i, groupId: undefined } : i)), groups: c.groups.filter((g) => g.id !== groupId) });
}

/** the ids of everything in the same groups as the given ids */
export function expandToGroups(c: Composition, ids: string[]): string[] {
  const groups = new Set(c.items.filter((i) => ids.includes(i.id) && i.groupId).map((i) => i.groupId));
  return c.items.filter((i) => ids.includes(i.id) || (i.groupId && groups.has(i.groupId))).map((i) => i.id);
}

/** align items on an axis to the first item's coordinate */
export function alignItems(c: Composition, ids: string[], axis: 0 | 1 | 2): Composition {
  const first = c.items.find((i) => i.id === ids[0]);
  if (!first) return c;
  return touch(c, { items: c.items.map((i) => (ids.includes(i.id) ? { ...i, position: i.position.map((v, k) => (k === axis ? first.position[axis] : v)) as Vec3 } : i)) });
}

/** spread items evenly along X between the outermost two */
export function distributeX(c: Composition, ids: string[]): Composition {
  const sel = c.items.filter((i) => ids.includes(i.id)).sort((a, b) => a.position[0] - b.position[0]);
  if (sel.length < 3) return c;
  const x0 = sel[0].position[0], x1 = sel[sel.length - 1].position[0];
  const at = new Map(sel.map((i, k) => [i.id, round(x0 + ((x1 - x0) * k) / (sel.length - 1))]));
  return touch(c, { items: c.items.map((i) => (at.has(i.id) ? { ...i, position: [at.get(i.id)!, i.position[1], i.position[2]] as Vec3 } : i)) });
}

/** items whose referenced record changed since they were placed (dimensions or version) */
export function staleItems(c: Composition, current: (p: Placement) => { dims: Vec3; version: number } | null): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (const p of c.items) {
    const cur = current(p);
    if (!cur) { out.push({ id: p.id, reason: 'The referenced item is no longer in the library.' }); continue; }
    const s = p.snapshot;
    const moved = Math.abs(cur.dims[0] - s.width) > 0.5 || Math.abs(cur.dims[1] - s.depth) > 0.5 || Math.abs(cur.dims[2] - s.height) > 0.5;
    if (moved) out.push({ id: p.id, reason: `Catalog dimensions changed from ${fmt(s)} to ${fmt({ width: cur.dims[0], depth: cur.dims[1], height: cur.dims[2] })} since placement.` });
    else if (cur.version !== s.version) out.push({ id: p.id, reason: `A newer version (v${cur.version}) exists; this placement keeps v${s.version}.` });
  }
  return out;
}

const fmt = (s: { width: number; depth: number; height: number }) => `${Math.round(s.width)} × ${Math.round(s.depth)} × ${Math.round(s.height)} mm`;
const round = (x: number) => Math.round(x * 100) / 100;

export function parseComposition(json: string): Composition {
  const c = JSON.parse(json);
  if (c?.schema !== 'maestro.composition' || !Array.isArray(c.items)) throw new Error('Not a MAESTRO composition file.');
  for (const i of c.items) {
    if (!i.ref || !Array.isArray(i.position) || i.position.length !== 3) throw new Error(`Item ${i.name ?? i.id} is incomplete.`);
    i.rotation = Number(i.rotation) || 0;
  }
  c.groups ??= [];
  return c as Composition;
}
