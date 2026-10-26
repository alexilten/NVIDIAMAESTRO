import { extentOfShape, worldBoxes, type ShapeOf, type WorldBox } from './arrange';
import { newComposition, uid, type Extent } from './compose';
import { schedule } from './services';
import type { AccessRules, Booth, BoothColumn, BoothSide, BoothValue, Composition, Placement, ServicePoint, Vec3, Verification } from './schema';

/**
 * The exhibition booth: its plot, the circulation and accessibility check, and the service points that feed the
 * modules standing on it. Everything is computed from the composition's own geometry; nothing is redrawn.
 *
 * Circulation is checked on a plan grid. A cell is blocked when any part lower than the headroom stands on it,
 * or when it lies outside the plot on a closed side. A visitor using a wheelchair is a disc of the route width:
 * a cell is on the accessible route when such a disc, entering from the hall aisle through an open side, can be
 * centred on it without touching anything, and the floor a disc sweeps is the accessible area.
 */

const v = (value: number, status: Verification, note?: string): BoothValue => ({ value, status, note });

/**
 * Reference clearances, as the 2010 ADA Standards state them (36 in route, 60 in turning circle, 30 × 48 in clear
 * floor space, 80 in headroom). Estimated here until checked against the document and the venue's own rules,
 * which replace them per project.
 */
export const REFERENCE_RULES = {
  route: v(915, 'estimated', 'Accessible route clear width, 36 in (ADA 2010, 403.5.1). Replace with the venue rule.'),
  turning: v(1525, 'estimated', 'Turning circle diameter, 60 in (ADA 2010, 304.3.1). Many European venues ask for 1500.'),
  approach: v(1220, 'estimated', 'Clear floor space depth in front of a demo, 48 in (ADA 2010, 305.3).'),
  headroom: v(2030, 'estimated', 'Parts lower than 80 in are obstacles (ADA 2010, 307.4).'),
};

/**
 * Rule sets a booth can start from. Each value stays Estimated until it is checked against the standard and
 * the venue's own manual, which wins; a value typed in afterwards becomes Project-specific.
 */
export const RULE_PRESETS: { id: string; name: string; rules: AccessRules }[] = [
  { id: 'ada-2010', name: 'ADA 2010 (US reference)', rules: REFERENCE_RULES },
  {
    id: 'din-18040-1', name: 'DIN 18040-1 (Germany)',
    rules: {
      route: v(1200, 'estimated', 'Circulation route clear width 120 cm, with 150 × 150 cm movement areas along it (DIN 18040-1:2010-10), as summarised in secondary sources; check against the standard and the venue manual.'),
      turning: v(1500, 'estimated', 'Movement area 150 × 150 cm for turning (DIN 18040-1:2010-10), from secondary sources; check against the standard.'),
      approach: v(1500, 'estimated', 'Movement area 150 × 150 cm in front of counters and controls (DIN 18040-1:2010-10), from secondary sources; check against the standard.'),
      headroom: v(2030, 'estimated', 'No figure from DIN 18040-1 is set here: this keeps the ADA reference (80 in). Take the venue manual’s figure.'),
    },
  },
];

/** the preset a booth's rules still match exactly, if any */
export function rulePresetOf(rules: AccessRules): string | null {
  const keys = ['route', 'turning', 'approach', 'headroom'] as const;
  return RULE_PRESETS.find((p) => keys.every((k) => p.rules[k].value === rules[k].value && p.rules[k].status === rules[k].status))?.id ?? null;
}

export function defaultBooth(): Booth {
  return {
    width: v(10000, 'placeholder', 'Set from the venue’s stand allocation.'),
    depth: v(8000, 'placeholder', 'Set from the venue’s stand allocation.'),
    open: { front: true, left: true, back: false, right: false },
    aisle: v(3000, 'placeholder', 'Hall aisle width outside the open sides, from the hall plan.'),
    heightLimit: v(4000, 'placeholder', 'Construction height limit, from the venue’s technical guidelines.'),
    rules: { ...REFERENCE_RULES },
    services: [],
  };
}

export function newExhibition(name = 'Untitled exhibition'): Composition {
  return { ...newComposition(name, 'exhibition'), booth: defaultBooth() };
}

export const SIDES: BoothSide[] = ['front', 'right', 'back', 'left'];
export const SIDE_LABEL: Record<BoothSide, string> = { front: 'Front (−Y)', back: 'Back (+Y)', left: 'Left (−X)', right: 'Right (+X)' };

export function boothRect(b: Booth) {
  const w = b.width.value / 2, d = b.depth.value / 2;
  return { min: [-w, -d] as [number, number], max: [w, d] as [number, number] };
}

/** a 600 × 600 mm column at the plot centre, Placeholder until the hall plan gives its size and position */
export function addColumn(b: Booth, x = 0, y = 0, w = 600, d = 600): Booth {
  const n = (b.columns ?? []).length + 1;
  const col: BoothColumn = { id: uid('col'), name: `C${n}`, x, y, w, d, status: 'placeholder' };
  return { ...b, columns: [...(b.columns ?? []), col] };
}

/** a column's plan extent, as an obstacle full height */
export const columnExtent = (k: BoothColumn): Extent => ({ min: [k.x - k.w / 2, k.y - k.d / 2, 0], max: [k.x + k.w / 2, k.y + k.d / 2, 100000] });

export function addServicePoint(b: Booth, kind: ServicePoint['kind'], x = 0, y = 0): Booth {
  const n = b.services.length + 1;
  const sp: ServicePoint = { id: uid('sp'), name: `S${n}`, kind, x, y, status: 'placeholder' };
  return { ...b, services: [...b.services, sp] };
}

// ── units: what the checks are about ────────────────────────────────────────────────────────────────

/** A module on the booth (a group), or an item standing on its own. */
export interface Unit { id: string; name: string; items: Placement[]; extent: Extent; front: BoothSide }

export function unitsOf(c: Composition, shapeOf: ShapeOf): Unit[] {
  const out: Unit[] = [];
  const make = (id: string, name: string, items: Placement[]) => {
    const ex = items.map((p) => { const s = shapeOf(p); return s ? { p, e: extentOfShape(p, s) } : null; }).filter(Boolean) as { p: Placement; e: Extent }[];
    if (!ex.length) return;
    const extent = { min: [0, 1, 2].map((k) => Math.min(...ex.map((x) => x.e.min[k]))) as Vec3, max: [0, 1, 2].map((k) => Math.max(...ex.map((x) => x.e.max[k]))) as Vec3 };
    // the module faces where its largest item faces
    const big = [...ex].sort((a, b) => area(b.e) - area(a.e))[0].p;
    out.push({ id, name, items, extent, front: frontSide(big.rotation) });
  };
  for (const g of c.groups) make(g.id, g.name, c.items.filter((i) => i.groupId === g.id));
  for (const p of c.items.filter((i) => !i.groupId || !c.groups.some((g) => g.id === i.groupId))) make(p.id, p.name, [p]);
  return out;
}

const area = (e: Extent) => (e.max[0] - e.min[0]) * (e.max[1] - e.min[1]);

/** the side an item's front faces after a rotation about Z (front is −Y at 0°), to the nearest quarter turn */
export function frontSide(rotation: number): BoothSide {
  const q = ((Math.round(rotation / 90) % 4) + 4) % 4;
  return (['front', 'right', 'back', 'left'] as BoothSide[])[q];
}

/** the clear floor zone in front of an extent, `depth` deep */
export function approachZone(e: Extent, side: BoothSide, depth: number): { min: [number, number]; max: [number, number] } {
  const [x0, y0, x1, y1] = [e.min[0], e.min[1], e.max[0], e.max[1]];
  switch (side) {
    case 'front': return { min: [x0, y0 - depth], max: [x1, y0] };
    case 'back': return { min: [x0, y1], max: [x1, y1 + depth] };
    case 'left': return { min: [x0 - depth, y0], max: [x0, y1] };
    case 'right': return { min: [x1, y0], max: [x1 + depth, y1] };
  }
}

// ── the plan grid ───────────────────────────────────────────────────────────────────────────────────

/** cell classes inside the plot */
export const CELL = { blocked: 0, tight: 1, route: 2, turning: 3, outside: 4 } as const;

export interface Grid {
  /** cell size, mm */
  g: number;
  nx: number;
  ny: number;
  /** world coordinates of cell (0,0)'s centre */
  x0: number;
  y0: number;
  /** one CELL value per cell, row-major from the front left */
  cls: Uint8Array;
  /** clearance from each cell centre to the nearest blocked cell, mm (0 when blocked) */
  clear: Float32Array;
}

const INF = 1e20;

/** exact squared Euclidean distance transform in one dimension (Felzenszwalb & Huttenlocher) */
function edt1(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; out[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}

/** distance, in cells, from every cell to the nearest feature cell */
function edt(feature: (i: number) => boolean, nx: number, ny: number): Float32Array {
  const n = Math.max(nx, ny);
  const f = new Float64Array(n), o = new Float64Array(n), vv = new Int32Array(n), z = new Float64Array(n + 1);
  const d = new Float64Array(nx * ny);
  for (let i = 0; i < nx * ny; i++) d[i] = feature(i) ? 0 : INF;
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) f[y] = d[y * nx + x];
    edt1(f, ny, o, vv, z);
    for (let y = 0; y < ny; y++) d[y * nx + x] = o[y];
  }
  const out = new Float32Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) f[x] = d[y * nx + x];
    edt1(f, nx, o, vv, z);
    for (let x = 0; x < nx; x++) out[y * nx + x] = Math.sqrt(o[x]);
  }
  return out;
}

/** cells reachable from the seeds through cells that pass `ok`, 4-connected */
function flood(seeds: number[], ok: (i: number) => boolean, nx: number, ny: number): Uint8Array {
  const seen = new Uint8Array(nx * ny);
  const stack: number[] = [];
  for (const s of seeds) if (ok(s) && !seen[s]) { seen[s] = 1; stack.push(s); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % nx, y = (i - x) / nx;
    const nb = [x > 0 ? i - 1 : -1, x < nx - 1 ? i + 1 : -1, y > 0 ? i - nx : -1, y < ny - 1 ? i + nx : -1];
    for (const j of nb) if (j >= 0 && !seen[j] && ok(j)) { seen[j] = 1; stack.push(j); }
  }
  return seen;
}

// ── the analysis ────────────────────────────────────────────────────────────────────────────────────

export type IssueLevel = 'error' | 'warn' | 'info';
export interface Issue { level: IssueLevel; text: string; unit?: string; at?: [number, number] }

export interface UnitAccess { unit: string; approach: boolean; turning: boolean; zone: { min: [number, number]; max: [number, number] } }

export interface UnitService {
  unit: string;
  name: string;
  liveCount: number;
  /** stated figures only */
  watts: number;
  unknownLive: number;
  /** the power point feeding it and the floor run to it (plan distance along the grid, no rise or slack) */
  power: { point: string; run: number } | null;
  data: { point: string; run: number } | null;
  needsData: boolean;
}

export interface PointLoad { point: ServicePoint; watts: number; units: string[]; unknownLive: number; over: boolean }

export interface BoothAnalysis {
  grid: Grid;
  units: Unit[];
  access: UnitAccess[];
  services: UnitService[];
  loads: PointLoad[];
  issues: Issue[];
  /** share of the plot's free floor a route-width visitor can reach */
  accessibleShare: number;
  freeArea: number;
  status: Verification;
}

/**
 * Check an exhibition's booth: plot limits, height limit, circulation, an accessible approach to every module,
 * and which service point feeds each module.
 */
export function analyseBooth(c: Composition, shapeOf: ShapeOf, nameOf: (p: Placement) => string = (p) => p.name): BoothAnalysis | null {
  const b = c.booth;
  if (!b) return null;
  const W = b.width.value, D = b.depth.value;
  const route = b.rules.route.value, turning = b.rules.turning.value;
  const g = Math.max(40, Math.ceil(Math.max(W, D) / 250 / 5) * 5);
  const margin = Math.ceil((Math.max(route, turning) / 2 + 2 * g) / g);
  const bx = Math.ceil(W / g), by = Math.ceil(D / g);
  const nx = bx + 2 * margin, ny = by + 2 * margin;
  const x0 = -W / 2 - margin * g + g / 2, y0 = -D / 2 - margin * g + g / 2;
  const cx = (i: number) => x0 + (i % nx) * g, cy = (i: number) => y0 + Math.floor(i / nx) * g;
  const inside = (x: number, y: number) => x > -W / 2 && x < W / 2 && y > -D / 2 && y < D / 2;
  const beyondOpen = (x: number, y: number) => (b.open.front && y < -D / 2) || (b.open.back && y > D / 2) || (b.open.left && x < -W / 2) || (b.open.right && x > W / 2);

  // blocked cells: closed sides, and every part below the headroom (floor-thin parts such as graphics are walked over)
  const blocked = new Uint8Array(nx * ny);
  for (let i = 0; i < nx * ny; i++) if (!inside(cx(i), cy(i)) && !beyondOpen(cx(i), cy(i))) blocked[i] = 1;
  const boxes: WorldBox[] = c.items.flatMap((p) => { const s = shapeOf(p); return s ? worldBoxes(p, s) : []; });
  const columns = b.columns ?? [];
  for (const bx2 of [...boxes, ...columns.map(columnExtent)]) {
    if (bx2.min[2] >= b.rules.headroom.value || bx2.max[2] - Math.max(bx2.min[2], 0) <= 15) continue;
    const i0 = Math.max(0, Math.ceil((bx2.min[0] - x0) / g)), i1 = Math.min(nx - 1, Math.floor((bx2.max[0] - x0) / g));
    const j0 = Math.max(0, Math.ceil((bx2.min[1] - y0) / g)), j1 = Math.min(ny - 1, Math.floor((bx2.max[1] - y0) / g));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * nx + i] = 1;
  }

  // clearance: distance from a cell centre to the nearest blocked cell's edge
  const dist = edt((i) => blocked[i] === 1, nx, ny);
  const clear = new Float32Array(nx * ny);
  for (let i = 0; i < nx * ny; i++) clear[i] = blocked[i] ? 0 : Math.max(0, dist[i] * g - g / 2);

  // seeds: the hall aisle cells along the open sides
  const seeds: number[] = [];
  for (let i = 0; i < nx * ny; i++) if (!blocked[i] && beyondOpen(cx(i), cy(i))) seeds.push(i);
  const centres = (w: number) => flood(seeds, (i) => clear[i] >= w / 2 - 1e-6, nx, ny);
  const routeC = centres(route), turnC = centres(turning);
  // the floor a disc sweeps, plus the square corners it cannot round into (within r·√2 of a centre): a wheelchair
  // is not a disc, and a corner it cannot sweep is not floor anyone needs to reach
  const sweep = (cen: Uint8Array, w: number) => { const d2 = edt((i) => cen[i] === 1, nx, ny); return (i: number) => !blocked[i] && d2[i] * g <= (w / 2) * Math.SQRT2 + g / 2; };
  const onRoute = sweep(routeC, route), onTurn = sweep(turnC, turning);

  const cls = new Uint8Array(nx * ny);
  let free = 0, reach = 0;
  for (let i = 0; i < nx * ny; i++) {
    if (!inside(cx(i), cy(i))) { cls[i] = CELL.outside; continue; }
    if (blocked[i]) { cls[i] = CELL.blocked; continue; }
    free++;
    cls[i] = onTurn(i) ? CELL.turning : onRoute(i) ? CELL.route : CELL.tight;
    if (cls[i] !== CELL.tight) reach++;
  }
  const grid: Grid = { g, nx, ny, x0, y0, cls, clear };

  const units = unitsOf(c, shapeOf);
  const issues: Issue[] = [];
  if (!SIDES.some((s) => b.open[s])) issues.push({ level: 'error', text: 'No side is open: visitors cannot enter the booth.' });

  // plot and height limit
  for (const p of c.items) {
    const s = shapeOf(p);
    if (!s) continue;
    const e = extentOfShape(p, s);
    if (e.min[0] < -W / 2 - 1 || e.max[0] > W / 2 + 1 || e.min[1] < -D / 2 - 1 || e.max[1] > D / 2 + 1) issues.push({ level: 'error', text: `${p.name} stands outside the booth plot.`, unit: p.groupId ?? p.id, at: [(e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2] });
    if (e.max[2] > b.heightLimit.value + 0.5) issues.push({ level: 'error', text: `${p.name} is ${Math.round(e.max[2])} mm high, over the ${Math.round(b.heightLimit.value)} mm height limit.`, unit: p.groupId ?? p.id });
    for (const k of columns) {
      const ke = columnExtent(k);
      if (e.min[0] < ke.max[0] - 1 && e.max[0] > ke.min[0] + 1 && e.min[1] < ke.max[1] - 1 && e.max[1] > ke.min[1] + 1) issues.push({ level: 'error', text: `${p.name} runs into column ${k.name}.`, unit: p.groupId ?? p.id, at: [k.x, k.y] });
    }
  }
  for (const k of columns) {
    if (Math.abs(k.x) + k.w / 2 > W / 2 + 1 || Math.abs(k.y) + k.d / 2 > D / 2 + 1) issues.push({ level: 'warn', text: `Column ${k.name} is not wholly inside the plot; check its position on the hall plan.`, at: [k.x, k.y] });
  }

  // an accessible approach in front of each module
  const cellsIn = (z: { min: [number, number]; max: [number, number] }) => {
    const out: number[] = [];
    const i0 = Math.max(0, Math.ceil((z.min[0] - x0) / g)), i1 = Math.min(nx - 1, Math.floor((z.max[0] - x0) / g));
    const j0 = Math.max(0, Math.ceil((z.min[1] - y0) / g)), j1 = Math.min(ny - 1, Math.floor((z.max[1] - y0) / g));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push(j * nx + i);
    return out;
  };
  const access: UnitAccess[] = units.map((u) => {
    const zone = approachZone(u.extent, u.front, b.rules.approach.value);
    const cells = cellsIn(zone);
    const approach = cells.some((i) => routeC[i]);
    const turn = cells.some((i) => turnC[i]);
    if (!approach) issues.push({ level: 'error', text: `${u.name}: no accessible approach in front (${Math.round(route)} mm route).`, unit: u.id, at: [(zone.min[0] + zone.max[0]) / 2, (zone.min[1] + zone.max[1]) / 2] });
    else if (!turn) issues.push({ level: 'warn', text: `${u.name}: no ${Math.round(turning)} mm turning circle in front.`, unit: u.id });
    return { unit: u.id, approach, turning: turn, zone };
  });
  const accessibleShare = free ? reach / free : 0;
  if (free && accessibleShare < 0.999) issues.push({ level: 'info', text: `${Math.round((1 - accessibleShare) * 100)}% of the open floor is narrower than the ${Math.round(route)} mm route or cut off from it.` });

  // services: each module to its nearest point of the right kind, along the floor
  const run = (u: Unit, sp: ServicePoint) => Math.abs((u.extent.min[0] + u.extent.max[0]) / 2 - sp.x) + Math.abs((u.extent.min[1] + u.extent.max[1]) / 2 - sp.y);
  const nearest = (u: Unit, kinds: ServicePoint['kind'][]) => {
    const pts = b.services.filter((s) => kinds.includes(s.kind)).map((s) => ({ point: s.id, run: Math.round(run(u, s)) })).sort((a1, a2) => a1.run - a2.run);
    return pts[0] ?? null;
  };
  const services: UnitService[] = units.map((u) => {
    const s = schedule({ ...c, items: u.items }, nameOf);
    const needsData = s.rows.some((r) => r.live && r.data.length > 0);
    return {
      unit: u.id, name: u.name, liveCount: s.liveCount, watts: s.knownWatts, unknownLive: s.unknownLive,
      power: s.liveCount ? nearest(u, ['power', 'power-data']) : null,
      data: needsData ? nearest(u, ['data', 'power-data']) : null,
      needsData,
    };
  });
  const loads: PointLoad[] = b.services.map((point) => {
    const fed = services.filter((s) => s.power?.point === point.id);
    const watts = fed.reduce((t, s) => t + s.watts, 0);
    return { point, watts, units: fed.map((s) => s.unit), unknownLive: fed.reduce((t, s) => t + s.unknownLive, 0), over: point.capacityW != null && watts > point.capacityW };
  });
  for (const s of services) {
    if (s.liveCount && !s.power) issues.push({ level: 'warn', text: `${s.name} is live but the booth has no power point.`, unit: s.unit });
    if (s.needsData && !s.data) issues.push({ level: 'warn', text: `${s.name} needs data but the booth has no data point.`, unit: s.unit });
  }
  for (const l of loads) if (l.over) issues.push({ level: 'error', text: `${l.point.name} feeds ${(l.watts / 1000).toFixed(2)} kW, over its stated ${(l.point.capacityW! / 1000).toFixed(2)} kW.`, at: [l.point.x, l.point.y] });
  for (const sp of b.services) if (!inside(sp.x, sp.y)) issues.push({ level: 'warn', text: `Service point ${sp.name} is outside the booth plot.`, at: [sp.x, sp.y] });

  const vals = [b.width, b.depth, b.heightLimit, ...Object.values(b.rules)];
  const status = vals.reduce<Verification>((a, x) => (rank(x.status) < rank(a) ? x.status : a), 'verified');
  const order: Record<IssueLevel, number> = { error: 0, warn: 1, info: 2 };
  issues.sort((a1, a2) => order[a1.level] - order[a2.level]);
  return { grid, units, access, services, loads, issues, accessibleShare, freeArea: free * g * g, status };
}

const rank = (s: Verification) => ['placeholder', 'estimated', 'project', 'verified'].indexOf(s);

/**
 * Where a module of the given plan size can stand: the first spot, scanning from the back left, that is inside
 * the plot and keeps a route width from everything already placed.
 */
export function freeSpot(c: Composition, extents: Extent[], size: [number, number]): [number, number] | null {
  const b = c.booth;
  if (!b) return null;
  const W = b.width.value, D = b.depth.value, gap = b.rules.route.value;
  const [w, d] = size;
  extents = [...extents, ...(b.columns ?? []).map(columnExtent)];
  if (w > W || d > D) return null;
  const step = 100;
  for (let y = D / 2 - d / 2; y >= -D / 2 + d / 2; y -= step) {
    for (let x = -W / 2 + w / 2; x <= W / 2 - w / 2; x += step) {
      const clash = extents.some((e) => x - w / 2 < e.max[0] + gap && x + w / 2 > e.min[0] - gap && y - d / 2 < e.max[1] + gap && y + d / 2 > e.min[1] - gap);
      if (!clash) return [Math.round(x), Math.round(y)];
    }
  }
  return null;
}

// ── booth schedule ──────────────────────────────────────────────────────────────────────────────────

const csvCell = (x: string | number) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));

export function boothCsv(c: Composition, a: BoothAnalysis): string {
  const pt = new Map(c.booth!.services.map((s) => [s.id, s.name]));
  const acc = new Map(a.access.map((x) => [x.unit, x]));
  const head = ['Module', 'Items', 'Footprint W (mm)', 'Footprint D (mm)', 'Height (mm)', 'Faces', 'Live items', 'Stated power (W)', 'Live items without a figure', 'Power point', 'Power run (mm)', 'Data point', 'Data run (mm)', 'Accessible approach', 'Turning circle'];
  const lines: (string | number)[][] = [head];
  for (const u of a.units) {
    const s = a.services.find((x) => x.unit === u.id)!;
    const e = u.extent;
    lines.push([u.name, u.items.length, Math.round(e.max[0] - e.min[0]), Math.round(e.max[1] - e.min[1]), Math.round(e.max[2] - e.min[2]), u.front,
      s.liveCount, s.watts, s.unknownLive, s.power ? pt.get(s.power.point) ?? '' : s.liveCount ? 'none' : '', s.power?.run ?? '',
      s.data ? pt.get(s.data.point) ?? '' : s.needsData ? 'none' : '', s.data?.run ?? '', acc.get(u.id)?.approach ? 'yes' : 'NO', acc.get(u.id)?.turning ? 'yes' : 'no']);
  }
  lines.push([]);
  lines.push(['Service point', 'Kind', 'X (mm)', 'Y (mm)', 'Capacity (W)', 'Capacity status', 'Stated load (W)', 'Live items without a figure', 'Over capacity']);
  for (const l of a.loads) lines.push([l.point.name, l.point.kind, Math.round(l.point.x), Math.round(l.point.y), l.point.capacityW ?? 'not stated', l.point.status, l.watts, l.unknownLive, l.over ? 'YES' : 'no']);
  lines.push([]);
  lines.push(['Issue', 'Level']);
  for (const i of a.issues) lines.push([i.text, i.level]);
  lines.push([]);
  lines.push([`Runs are plan distances along the floor grid from the module centre; add rise and slack. Power sums stated figures only.`]);
  return lines.map((l) => l.map(csvCell).join(',')).join('\n') + '\n';
}

/** the booth's values that are not yet confirmed, for the report */
export function unconfirmed(b: Booth): string[] {
  const named: [string, BoothValue][] = [['Booth width', b.width], ['Booth depth', b.depth], ['Aisle width', b.aisle], ['Height limit', b.heightLimit],
    ['Route width', b.rules.route], ['Turning circle', b.rules.turning], ['Approach depth', b.rules.approach], ['Headroom', b.rules.headroom]];
  return named.filter(([, x]) => x.status === 'placeholder' || x.status === 'estimated').map(([n]) => n);
}

// ── placing modules ─────────────────────────────────────────────────────────────────────────────────

/** the plan extent of a composition's items, or null when nothing has geometry */
export function planExtent(items: Placement[], shapeOf: ShapeOf): Extent | null {
  const ex = items.map((p) => { const s = shapeOf(p); return s ? extentOfShape(p, s) : null; }).filter(Boolean) as Extent[];
  if (!ex.length) return null;
  return { min: [0, 1, 2].map((k) => Math.min(...ex.map((e) => e.min[k]))) as Vec3, max: [0, 1, 2].map((k) => Math.max(...ex.map((e) => e.max[k]))) as Vec3 };
}

/**
 * Place a module (a saved composition or a template) on an exhibition as one new group: its plan centre goes to
 * `at`, turned by `rotation` degrees about Z. Items get new ids and keep their references and snapshots; the
 * group remembers which module it came from and when, so a later edit of the module is flagged.
 */
export function placeModule(target: Composition, src: Composition, shapeOf: ShapeOf, at: [number, number], rotation = 0, template = false): { comp: Composition; ids: string[]; groupId: string } {
  const e = planExtent(src.items, shapeOf);
  const pc = e ? [(e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2] : [0, 0];
  const a = (rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const gid = uid('grp');
  const names = new Set(target.items.map((i) => i.name));
  const ids: string[] = [];
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const items = src.items.map((i) => {
    let name = i.name;
    for (let k = 2; names.has(name); k++) name = `${i.name} ${k}`;
    names.add(name);
    const id = uid('it');
    ids.push(id);
    const x = i.position[0] - pc[0], y = i.position[1] - pc[1];
    return { ...i, id, name, groupId: gid, rotation: (((i.rotation + rotation) % 360) + 360) % 360, position: [r1(at[0] + x * cos - y * sin), r1(at[1] + x * sin + y * cos), i.position[2]] as Vec3 };
  });
  const base = src.groups.length === 1 ? src.groups[0].name : src.name;
  let gname = base;
  for (let k = 2; target.groups.some((g) => g.name === gname); k++) gname = `${base} ${k}`;
  const group = { id: gid, name: gname, source: { id: src.id, name: src.name, updatedAt: src.updatedAt, template } };
  return { comp: { ...target, items: [...target.items, ...items], groups: [...target.groups, group], updatedAt: new Date().toISOString() }, ids, groupId: gid };
}

/**
 * Replace a placed module with the current version of the module it was placed from, at the same plan centre
 * and turned the same way. The group keeps its id and name, so tags and document links still point at it;
 * edits made to its items on the booth since it was placed are replaced by the source.
 */
export function refreshModule(target: Composition, groupId: string, src: Composition, shapeOf: ShapeOf): { comp: Composition; ids: string[] } | null {
  const g = target.groups.find((x) => x.id === groupId);
  const mine = target.items.filter((i) => i.groupId === groupId);
  const e = planExtent(mine, shapeOf);
  if (!g || !e || !src.items.length) return null;
  const at: [number, number] = [(e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2];
  // how the module was turned when it was placed: an item against the same item in the source
  const key = (i: Placement) => JSON.stringify(i.ref);
  const pair = mine.map((m) => ({ m, s: src.items.find((x) => key(x) === key(m)) })).find((x) => x.s);
  const rotation = pair ? ((((pair.m.rotation - pair.s!.rotation) % 360) + 360) % 360) : 0;
  const rest: Composition = { ...target, items: target.items.filter((i) => i.groupId !== groupId), groups: target.groups.filter((x) => x.id !== groupId) };
  const r = placeModule(rest, src, shapeOf, at, rotation, g.source?.template ?? false);
  const placed = r.comp.groups.find((x) => x.id === r.groupId)!;
  const groups = target.groups.map((x) => (x.id === groupId ? { ...placed, id: groupId, name: g.name } : x));
  const items = r.comp.items.map((i) => (i.groupId === r.groupId ? { ...i, groupId } : i));
  return { comp: { ...r.comp, items, groups }, ids: r.ids };
}

/** groups placed from a saved module that has been edited since */
export function changedModules(c: Composition, saved: Composition[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const g of c.groups) {
    if (!g.source || g.source.template) continue;
    const m = saved.find((s) => s.id === g.source!.id);
    if (m && m.updatedAt > g.source.updatedAt) out.set(g.id, `${m.name} was edited after it was placed here.`);
  }
  return out;
}
