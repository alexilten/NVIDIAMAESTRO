import { VERIFICATION_RANK, weakest, type Vec3, type Verification } from '../schema';
import { RULE_DEF, inches, type NicheRuleSet, type RuleKey } from './rules';

/**
 * A niche built from its hardware and a rule set: the opening size, shelf heights, where each unit stands and where
 * each die-cut label goes. Everything here is a pure function of the spec, the rules and the hardware dimensions, so
 * the elevation, the 3D model, the label schedule and the Rhino export all read one layout.
 *
 * Frame: x across the niche from its centre line (right +), z height above the finished floor; mm.
 */

export type NicheType = 'shelf' | 'wall';
export const NICHE_TYPE_LABEL: Record<NicheType, string> = { shelf: 'Shelf niche', wall: 'Wall-hung niche' };

export interface NicheItem {
  id: string;
  /** a catalog product … */
  product?: string;
  /** … or hardware the catalog does not have yet, with dimensions from a project document */
  custom?: { name: string; width: number; depth: number; height: number; status: Verification; note?: string };
  /** … or hardware named on the drawings whose size nobody has recorded yet: listed, never drawn */
  placeholder?: string;
  /** label text when it differs from the product name */
  label?: string;
  /** wall-hung only: the unit hangs on its back with its depth running up the wall (trays) */
  upright?: boolean;
}

export interface NicheSpec {
  schema: 'maestro.niche';
  version: 1;
  id: string;
  /** graphics code, e.g. 02A; labels are numbered 02A.01, 02A.02 … */
  code: string;
  name: string;
  type: NicheType;
  rulesId: string;
  letter: 'standard' | 'small';
  /** top row first; null is an empty slot that keeps its column */
  rows: (NicheItem | null)[][];
  /** a fixed opening, when the wall is already cut */
  lockWidth?: number;
  lockHeight?: number;
  updatedAt: string;
}

/** what the generator needs to know about a unit */
export interface UnitInfo { name: string; dims: Vec3 | null; status: Verification; kind?: string }
export type UnitResolver = (item: NicheItem) => UnitInfo;

export interface PlacedUnit {
  item: NicheItem;
  name: string;
  row: number;
  col: number;
  status: Verification;
  /** catalog envelope, mm */
  dims: Vec3;
  /** as seen from the front: x0..x1 across, z0..z1 up; `protrude` from the back panel (wall-hung) or the shelf depth it uses */
  x0: number; x1: number; z0: number; z1: number;
  protrude: number;
  /** the shelf the unit stands on (shelf niches) */
  shelf?: number;
}

export interface PlacedLabel { code: string; text: string; row: number; col: number; x0: number; z0: number; w: number; cap: number; status: Verification }

export type SegKind = 'edge' | 'unit' | 'gap' | 'space';
export interface Seg { a: number; b: number; kind: SegKind }

export interface Check { level: 'error' | 'warn' | 'info'; rule?: RuleKey; text: string }

export interface Shelf { index: number; top: number; under: number; clear: number }

export interface NicheLayout {
  spec: NicheSpec;
  rules: NicheRuleSet;
  width: number;
  height: number;
  sill: number;
  top: number;
  depth: number;
  centre: number;
  /** shelf niches: shelves bottom up; the niche base is not a shelf */
  shelves: Shelf[];
  units: PlacedUnit[];
  labels: PlacedLabel[];
  /** horizontal dimension chain per row, top row first */
  rowChains: { row: number; z: number; segs: Seg[] }[];
  /** vertical chain, bottom up, from the sill */
  heightChain: { a: number; b: number; label: string }[];
  /** the label line above each shelf top (shelf niches) */
  labelOffset?: number;
  checks: Check[];
  status: Verification;
  /** every rule value the layout used, so its status can be shown */
  used: RuleKey[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const both = (mm: number) => `${Math.round(mm)} mm (${inches(mm)})`;

/** estimated width of one line of die-cut type at a cap height (a sans at about 0.62 em per character) */
export function labelWidth(text: string, cap: number): number {
  return r1(text.length * cap * 0.62 / 0.72);
}

export function faceOf(type: NicheType, u: UnitInfo, item: NicheItem): { w: number; h: number; protrude: number } | null {
  if (!u.dims) return null;
  const [w, d, h] = u.dims;
  if (type === 'wall' && item.upright) return { w, h: d, protrude: h };
  if (type === 'wall') return { w, h, protrude: d };
  return { w, h, protrude: d };
}

export function layoutNiche(spec: NicheSpec, rules: NicheRuleSet, resolve: UnitResolver): NicheLayout | null {
  const V = (k: RuleKey) => rules.values[k].value;
  const used = new Set<RuleKey>();
  const use = (k: RuleKey) => { used.add(k); return V(k); };
  const checks: Check[] = [];

  // resolve every slot; units without dimensions are reported and left out, never drawn to a guessed size
  const grid = spec.rows.map((row, ri) => row.map((item, ci) => {
    if (!item) return null;
    const info = resolve(item);
    const face = faceOf(spec.type, info, item);
    if (!face) { checks.push({ level: 'error', text: `${info.name} has no recorded dimensions, so it is left out of row ${ri + 1}. Add its size as custom hardware to place it.` }); return null; }
    return { item, info, face, row: ri, col: ci };
  }));
  const cells = grid.flat().filter((c): c is NonNullable<typeof c> => !!c);
  if (!cells.length) return null;

  // columns are shared by every row, so labels line up down the niche (each column is as wide as its widest unit)
  const ncols = Math.max(...spec.rows.map((r) => r.length));
  const colW = Array.from({ length: ncols }, (_, c) => Math.max(0, ...cells.filter((x) => x.col === c).map((x) => x.face.w)));
  const live = colW.map((w, c) => ({ w, c })).filter((x) => x.w > 0);
  const edge0 = use('edge'), gap0 = use('gap');
  const span = live.reduce((s, x) => s + x.w, 0) + gap0 * (live.length - 1);
  const natural = span + 2 * edge0;
  let width = natural, edge = edge0, gap = gap0;
  if (spec.lockWidth && spec.lockWidth > 0) {
    width = spec.lockWidth;
    const slack = width - natural;
    if (slack >= 0) {
      edge = edge0 + slack / 2;
      if (slack > 1) checks.push({ level: 'info', rule: 'edge', text: `The fixed ${both(width)} opening is wider than the rules need (${both(natural)}), so the hardware is centred with ${both(edge)} at each edge.` });
    } else {
      // squeeze the gaps first, then the edges; say which rule broke and what the rules would need
      const g = live.length > 1 ? gap0 + slack / (live.length - 1) : gap0;
      if (live.length > 1 && g >= 0) gap = g;
      else { gap = live.length > 1 ? 0 : gap0; edge = (width - (live.reduce((s, x) => s + x.w, 0) + gap * (live.length - 1))) / 2; }
      if (gap < gap0) checks.push({ level: 'error', rule: 'gap', text: `At ${both(width)} wide the gaps between units drop to ${both(gap)}, under the ${both(gap0)} rule. The rules need ${both(natural)}.` });
      if (edge < edge0 - 0.5) checks.push({ level: 'error', rule: 'edge', text: `At ${both(width)} wide the hardware comes within ${both(Math.max(edge, 0))} of the visible edge, under the ${both(edge0)} rule. The rules need ${both(natural)}.` });
    }
  }
  const colX = new Map<number, number>();
  let cursor = -width / 2 + edge;
  for (const x of live) { colX.set(x.c, cursor); cursor += x.w + gap; }

  const capKey: RuleKey = spec.letter === 'small' ? 'capSmall' : 'capStandard';
  const cap = use(capKey);
  const centre = use('centreAff');
  const units: PlacedUnit[] = [];
  const shelves: Shelf[] = [];
  const heightChain: NicheLayout['heightChain'] = [];
  let height: number, depth: number, labelOffset: number | undefined;
  const nrows = spec.rows.length;
  const labelZ = new Map<number, number>(); // row → label baseline z0

  if (spec.type === 'shelf') {
    const T = use('shelfThickness'), bottom = use('bottomSpace'), head = use('headroom');
    depth = use('depth');
    const sd = use('shelfDepth');
    // shelf s counts from the bottom; spec rows are top first
    const tallest = Array.from({ length: nrows }, (_, s) => Math.max(0, ...cells.filter((c) => c.row === nrows - 1 - s).map((c) => c.face.h)));
    const clears = tallest.map((h, s) => {
      const minKey: RuleKey = s === nrows - 1 ? 'topClearMin' : 'shelfClearMin';
      return Math.max(use(minKey), h + head);
    });
    height = bottom + clears.reduce((a, c) => a + T + c, 0);
    if (spec.lockHeight && spec.lockHeight > 0) {
      const slack = spec.lockHeight - height;
      if (Math.abs(slack) > 0.5) {
        const each = slack / nrows;
        clears.forEach((_, i) => { clears[i] += each; });
        if (slack < 0) {
          clears.forEach((c, s) => { if (c < tallest[s] + head) checks.push({ level: 'error', rule: 'headroom', text: `At ${both(spec.lockHeight!)} high, shelf ${s + 1} has ${both(c - tallest[s])} over its tallest unit, under the ${both(head)} rule. The rules need ${both(height)}.` }); });
        } else checks.push({ level: 'info', text: `The fixed ${both(spec.lockHeight)} opening is taller than the rules need (${both(height)}); each shelf space grows by ${both(each)}.` });
        height = spec.lockHeight;
      }
    }
    const sill = centre - height / 2;
    let z = sill + bottom;
    heightChain.push({ a: sill, b: z, label: 'below shelf' });
    clears.forEach((c, s) => {
      shelves.push({ index: s, under: z, top: z + T, clear: c });
      heightChain.push({ a: z, b: z + T, label: 'shelf' });
      heightChain.push({ a: z + T, b: z + T + c, label: 'clear' });
      z += T + c;
    });
    // the label line: centred in the space over the tallest unit on its shelf, then the same height above every shelf
    let best = 0;
    tallest.forEach((h, s) => { if (h > tallest[best]) best = s; });
    labelOffset = tallest[best] + (clears[best] - tallest[best]) / 2;
    for (const c of cells) {
      const s = nrows - 1 - c.row;
      const sh = shelves[s];
      const x0 = colX.get(c.col)!;
      units.push({ item: c.item, name: c.info.name, row: c.row, col: c.col, status: c.info.status, dims: c.info.dims!, x0, x1: x0 + c.face.w, z0: sh.top, z1: sh.top + c.face.h, protrude: c.face.protrude, shelf: s });
      if (c.face.protrude > depth) checks.push({ level: 'error', rule: 'depth', text: `${c.info.name} is ${both(c.face.protrude)} deep, more than the ${both(depth)} niche.` });
      else if (c.face.protrude > sd + 0.5) checks.push({ level: 'warn', rule: 'shelfDepth', text: `${c.info.name} is ${both(c.face.protrude)} deep and overhangs the ${both(sd)} shelf by ${both(c.face.protrude - sd)}.` });
    }
    shelves.forEach((sh) => labelZ.set(nrows - 1 - sh.index, sh.top + labelOffset! - cap / 2));
  } else {
    const below = use('labelBelow'), rowGap = use('rowGap');
    depth = use('depth');
    const face = Array.from({ length: nrows }, (_, r) => Math.max(0, ...cells.filter((c) => c.row === r).map((c) => c.face.h)));
    const blocks = face.map((f) => f + below + cap);
    let natural2 = 2 * edge0 + blocks.reduce((a, b) => a + b, 0) + rowGap * (nrows - 1);
    let topEdge = edge0;
    height = natural2;
    if (spec.lockHeight && spec.lockHeight > 0) {
      const slack = spec.lockHeight - natural2;
      if (slack < -0.5) checks.push({ level: 'error', rule: 'edge', text: `At ${both(spec.lockHeight)} high the hardware and labels come within ${both(Math.max(edge0 + slack / 2, 0))} of the top and bottom edges, under the ${both(edge0)} rule. The rules need ${both(natural2)}.` });
      else if (slack > 0.5) checks.push({ level: 'info', text: `The fixed ${both(spec.lockHeight)} opening is taller than the rules need (${both(natural2)}), so the hardware is centred.` });
      topEdge = edge0 + slack / 2;
      height = spec.lockHeight;
      natural2 = height;
    }
    const sill = centre - height / 2;
    let z = sill + height - topEdge;
    const chain: NicheLayout['heightChain'] = [{ a: z, b: sill + height, label: 'edge' }];
    face.forEach((f, r) => {
      const bottomZ = z - f;
      chain.push({ a: bottomZ, b: z, label: 'hardware' });
      chain.push({ a: bottomZ - below, b: bottomZ, label: 'to label' });
      chain.push({ a: bottomZ - below - cap, b: bottomZ - below, label: 'type' });
      // units hang bottom-aligned in their row, so every label in the row is the same distance below its hardware
      for (const c of cells.filter((x) => x.row === r)) {
        const x0 = colX.get(c.col)!;
        units.push({ item: c.item, name: c.info.name, row: r, col: c.col, status: c.info.status, dims: c.info.dims!, x0, x1: x0 + c.face.w, z0: bottomZ, z1: bottomZ + c.face.h, protrude: c.face.protrude });
        if (c.face.protrude > depth) checks.push({ level: 'error', rule: 'depth', text: `${c.info.name} stands ${both(c.face.protrude)} off the back panel, more than the ${both(depth)} niche.` });
        if (c.face.h < f - 0.5) checks.push({ level: 'info', text: `${c.info.name} is shorter than the tallest unit in row ${r + 1}; it hangs bottom-aligned so its label shares the row’s line.` });
      }
      labelZ.set(r, bottomZ - below - cap);
      z = bottomZ - below - cap;
      if (r < nrows - 1) { chain.push({ a: z - rowGap, b: z, label: 'to next row' }); z -= rowGap; }
    });
    chain.push({ a: sill, b: z, label: 'edge' });
    heightChain.push(...chain.reverse());
  }

  const sill = centre - height / 2;
  const top = sill + height;
  if (sill < 0) checks.push({ level: 'error', rule: 'centreAff', text: `The opening is ${both(height)} high, too tall to centre at ${both(centre)}: its sill would be below the floor.` });

  // labels: one per unit, numbered top row first, left to right, starting at the left edge of its hardware
  const labels: PlacedLabel[] = [];
  const order = [...units].sort((a, b) => a.row - b.row || a.x0 - b.x0);
  order.forEach((u, i) => {
    const text = (u.item.label ?? u.name).trim();
    const code = `${spec.code || 'N'}.${String(i + 1).padStart(2, '0')}`;
    labels.push({ code, text, row: u.row, col: u.col, x0: u.x0, z0: labelZ.get(u.row)!, w: labelWidth(text, cap), cap, status: weakest(rules.values[capKey].status, rules.values[spec.type === 'shelf' ? 'headroom' : 'labelBelow'].status) });
  });
  // a label wider than its column runs toward the next label in the row
  for (const l of labels) {
    const next = labels.filter((m) => m.row === l.row && m.x0 > l.x0).sort((a, b) => a.x0 - b.x0)[0];
    const limit = next ? next.x0 - 0.25 * gap : width / 2 - edge * 0.5;
    if (l.x0 + l.w > limit) checks.push({ level: 'warn', rule: capKey, text: `Label ${l.code} “${l.text}” is about ${both(l.w)} long at ${both(l.cap)} type and runs into ${next ? `label ${next.code}` : 'the niche edge'}. Try the smaller letter size or a shorter name.` });
    if (spec.type === 'shelf') {
      const sh = shelves[nrows - 1 - l.row];
      if (l.z0 + l.cap > sh.top + sh.clear) checks.push({ level: 'error', rule: 'headroom', text: `Label ${l.code} does not fit under the shelf above.` });
      const clash = units.find((u) => u.row === l.row && u.x1 > l.x0 && u.x0 < l.x0 + l.w && u.z1 > l.z0);
      if (clash) checks.push({ level: 'warn', rule: 'headroom', text: `Label ${l.code} overlaps ${clash.name} on shelf ${sh.index + 1}.` });
    }
  }

  const rowChains = spec.rows.map((_, r) => {
    const segs: Seg[] = [{ a: -width / 2, b: -width / 2 + edge, kind: 'edge' }];
    live.forEach((x, i) => {
      const x0 = colX.get(x.c)!;
      const u = units.find((v) => v.row === r && v.col === x.c);
      if (i > 0) segs.push({ a: x0 - gap, b: x0, kind: 'gap' });
      if (u) {
        segs.push({ a: x0, b: u.x1, kind: 'unit' });
        if (u.x1 < x0 + x.w - 0.5) segs.push({ a: u.x1, b: x0 + x.w, kind: 'space' });
      } else segs.push({ a: x0, b: x0 + x.w, kind: 'space' });
    });
    segs.push({ a: width / 2 - edge, b: width / 2, kind: 'edge' });
    const zs = units.filter((u) => u.row === r);
    return { row: r, z: zs.length ? Math.min(...zs.map((u) => u.z0)) : sill, segs };
  });

  const usedList = [...used];
  const status = [...usedList.map((k) => rules.values[k].status), ...units.map((u) => u.status)].reduce((a, b) => (VERIFICATION_RANK.indexOf(b) < VERIFICATION_RANK.indexOf(a) ? b : a), 'verified' as Verification);
  for (const k of usedList) {
    const v = rules.values[k];
    if (v.status === 'estimated' || v.status === 'placeholder') checks.push({ level: 'info', rule: k, text: `${RULE_DEF.get(k)!.label} (${both(v.value)}) is ${v.status}: ${v.note ?? 'not from a project document'}` });
  }
  return { spec, rules, width: r1(width), height: r1(height), sill: r1(sill), top: r1(top), depth, centre, shelves, units, labels, rowChains, heightChain, labelOffset, checks, status, used: usedList };
}

export const checkCounts = (l: NicheLayout | null) => ({
  errors: l?.checks.filter((c) => c.level === 'error').length ?? 0,
  warns: l?.checks.filter((c) => c.level === 'warn').length ?? 0,
});
