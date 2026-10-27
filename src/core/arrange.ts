import { updateItem, type Extent } from './compose';
import { shapeBounds, type Shape } from './geometry/shape';
import type { Composition, Placement, Vec3 } from './schema';

/**
 * Spatial helpers for Compose: placed part boxes, support surfaces, placing one item on another, and edge
 * snapping. All pure; geometry is looked up through `shapeOf` so the same code runs in the app and in tests.
 */

export type ShapeOf = (p: Placement) => Shape | null;

export interface WorldBox { item: string; name: string; min: Vec3; max: Vec3 }

/** the axis-aligned world box of a box in the item's frame, after the placement's rotation and position */
export function placeBox(p: Placement, min: Vec3, max: Vec3): { min: Vec3; max: Vec3 } {
  const a = (p.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const xs: number[] = [], ys: number[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) { xs.push(p.position[0] + x * c - y * s); ys.push(p.position[1] + x * s + y * c); }
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { min: [r(Math.min(...xs)), r(Math.min(...ys)), r(p.position[2] + min[2])], max: [r(Math.max(...xs)), r(Math.max(...ys)), r(p.position[2] + max[2])] };
}

/** every part of a placed item as a world box: a mesh part by its bounds, or, when it is large, by 1 m tiles */
export function worldBoxes(p: Placement, shape: Shape): WorldBox[] {
  return shape.parts.flatMap((part) => {
    const bs = part.kind === 'box' ? [{ min: part.min, max: part.max }] : meshBoxes(part);
    return bs.map((b) => ({ item: p.id, name: part.name, ...placeBox(p, b.min, b.max) }));
  });
}

type MeshPart = Extract<Shape['parts'][number], { kind: 'mesh' }>;
const TILE = 1000;
const tiled = new WeakMap<MeshPart, { min: Vec3; max: Vec3 }[]>();

/**
 * A mesh part's boxes. A large mesh (a whole wall run or room from a show model) by its bounds alone would block
 * all the floor it spans, so its triangles are binned into 1 m plan tiles by their centres and each tile is boxed.
 */
function meshBoxes(part: MeshPart): { min: Vec3; max: Vec3 }[] {
  const hit = tiled.get(part);
  if (hit) return hit;
  const b = shapeBounds({ parts: [part], materials: {} });
  let out = [b];
  if (b.max[0] - b.min[0] > 2 * TILE || b.max[1] - b.min[1] > 2 * TILE) {
    const P = part.positions, I = part.indices;
    const tiles = new Map<number, { min: Vec3; max: Vec3 }>();
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, c = I[t + 1] * 3, d = I[t + 2] * 3;
      const tx = Math.floor((P[a] + P[c] + P[d]) / 3 / TILE), ty = Math.floor((P[a + 1] + P[c + 1] + P[d + 1]) / 3 / TILE);
      const k = tx * 100003 + ty;
      let box = tiles.get(k);
      if (!box) { box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; tiles.set(k, box); }
      for (const v of [a, c, d]) for (let j = 0; j < 3; j++) { box.min[j] = Math.min(box.min[j], P[v + j]); box.max[j] = Math.max(box.max[j], P[v + j]); }
    }
    if (tiles.size) out = [...tiles.values()];
  }
  tiled.set(part, out);
  return out;
}

export function extentOfShape(p: Placement, shape: Shape): Extent {
  const b = shapeBounds(shape);
  return placeBox(p, b.min, b.max);
}

/** A flat surface an item can stand on, in the supporting item's own frame. */
export interface Surface { name: string; min: [number, number]; max: [number, number]; z: number }

/** named display surfaces of the kit; any other item offers the top of its envelope */
const SUPPORT = /^(WORKTOP|ACCESSIBLE_WORKTOP|LIGHT_TOP|NICHE_BASE|SHELF_\d+)$/;

export function supportSurfaces(shape: Shape): Surface[] {
  const named = shape.parts.filter((p) => p.kind === 'box' && SUPPORT.test(p.name));
  if (named.length) {
    return named
      .map((p) => (p.kind === 'box' ? { name: p.name, min: [p.min[0], p.min[1]] as [number, number], max: [p.max[0], p.max[1]] as [number, number], z: p.max[2] } : null))
      .filter((x): x is Surface => !!x)
      .sort((a, b) => a.z - b.z);
  }
  const b = shapeBounds(shape);
  return [{ name: 'TOP', min: [b.min[0], b.min[1]], max: [b.max[0], b.max[1]], z: b.max[2] }];
}

export interface PlaceResult { comp: Composition; surface: string; overhang: boolean }

/**
 * Stand `itemId` on a surface of `supportId`. The item keeps its X along the surface where it fits, is centred
 * front to back on the surface, and its base goes to the surface height. If it already stands on one of the
 * support's surfaces, it moves to the next one up (and from the top one back to the lowest), so repeating the
 * command steps through shelves.
 */
export function placeOn(c: Composition, itemId: string, supportId: string, shapeOf: ShapeOf): PlaceResult | null {
  const item = c.items.find((i) => i.id === itemId);
  const sup = c.items.find((i) => i.id === supportId);
  if (!item || !sup || item.id === sup.id) return null;
  const is = shapeOf(item), ss = shapeOf(sup);
  if (!is || !ss) return null;
  const surfaces = supportSurfaces(ss);
  const base = item.position[2] + shapeBounds(is).min[2];
  const z = (s: Surface) => sup.position[2] + s.z;
  // the item's position in the support's frame
  const a = (-sup.rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const dx = item.position[0] - sup.position[0], dy = item.position[1] - sup.position[1];
  const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;

  // surfaces under the item first (by plan position, then by X alone), so it lands on the one it is over
  const inX = (s: Surface) => lx >= s.min[0] - 0.5 && lx <= s.max[0] + 0.5;
  const inXY = (s: Surface) => inX(s) && ly >= s.min[1] - 0.5 && ly <= s.max[1] + 0.5;
  const under = surfaces.filter(inXY).length ? surfaces.filter(inXY) : surfaces.filter(inX).length ? surfaces.filter(inX) : surfaces;
  const on = under.findIndex((s) => Math.abs(z(s) - base) < 1);
  // already on one → the next one up; otherwise the one nearest the item's base, the lower one on a tie
  const pick = on >= 0 ? under[(on + 1) % under.length]
    : [...under].sort((p1, p2) => Math.abs(z(p1) - base) - Math.abs(z(p2) - base) || p1.z - p2.z)[0];

  // clamp onto the chosen surface
  const ib = shapeBounds(is);
  const rel = ((item.rotation - sup.rotation) % 360 + 360) % 360;
  const quarter = Math.round(rel / 90) % 2 === 1;
  const iw = quarter ? ib.max[1] - ib.min[1] : ib.max[0] - ib.min[0];
  const id = quarter ? ib.max[0] - ib.min[0] : ib.max[1] - ib.min[1];
  const sw = pick.max[0] - pick.min[0], sd = pick.max[1] - pick.min[1];
  const cx = (pick.min[0] + pick.max[0]) / 2, cy = (pick.min[1] + pick.max[1]) / 2;
  const x = iw >= sw ? cx : Math.min(pick.max[0] - iw / 2, Math.max(pick.min[0] + iw / 2, lx));
  const y = cy;
  // back to world
  const b = (sup.rotation * Math.PI) / 180, cb = Math.cos(b), sb = Math.sin(b);
  const position: Vec3 = [
    Math.round((sup.position[0] + x * cb - y * sb) * 10) / 10,
    Math.round((sup.position[1] + x * sb + y * cb) * 10) / 10,
    Math.round((z(pick) - ib.min[2]) * 10) / 10,
  ];
  return { comp: updateItem(c, item.id, { position }), surface: pick.name, overhang: iw > sw + 0.5 || id > sd + 0.5 };
}

export interface Snap { delta: Vec3; note: string | null }

/**
 * Adjust a plan move so the moved extent's edges or centre line up with a nearby item's edges or centre, when
 * they come within `tol` mm. X and Y snap independently; the nearest candidate wins.
 */
export function snapDelta(moving: Extent, others: Extent[], delta: Vec3, tol = 40): Snap {
  const out: Vec3 = [...delta];
  const notes: string[] = [];
  for (const k of [0, 1] as const) {
    const lo = moving.min[k] + delta[k], hi = moving.max[k] + delta[k], mid = (lo + hi) / 2;
    let best: { d: number; what: string } | null = null;
    for (const o of others) {
      const omid = (o.min[k] + o.max[k]) / 2;
      const pairs: [number, number, string][] = [
        [lo, o.max[k], 'butt'], [hi, o.min[k], 'butt'], // face to face
        [lo, o.min[k], 'flush'], [hi, o.max[k], 'flush'], // edges in line
        [mid, omid, 'centred'],
      ];
      for (const [mine, theirs, what] of pairs) {
        const d = theirs - mine;
        if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, what };
      }
    }
    if (best) { out[k] = Math.round((delta[k] + best.d) * 10) / 10; notes.push(`${k === 0 ? 'X' : 'Y'} ${best.what}`); }
  }
  return { delta: out, note: notes.length ? notes.join(', ') : null };
}
