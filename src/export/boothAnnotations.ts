import { CELL, SIDES, plotOutline, type BoothAnalysis } from '../core/booth';
import type { Composition, Vec3 } from '../core/schema';
import type { Annotation } from './rhino';

/**
 * The booth as plain Rhino curves beside the block instances: the plot and its open sides, each service point,
 * each module's approach zone, and the floor narrower than the accessible route (as merged rectangles).
 */
export function boothAnnotations(c: Composition, a: BoothAnalysis): Annotation[] {
  const b = c.booth;
  if (!b) return [];
  const W = b.width.value / 2, D = b.depth.value / 2;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec3[] => [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]];
  const out: Annotation[] = [];
  out.push({
    kind: 'polyline', layer: '50_EXHIBITION_ARCHITECTURE::BOOTH_PLOT', name: 'BOOTH_PLOT', points: plotOutline(b).map(([x, y]) => [x, y, 0] as Vec3), closed: true,
    user: { width_mm: b.width.value, depth_mm: b.depth.value, width_status: b.width.status, depth_status: b.depth.status, height_limit_mm: b.heightLimit.value, height_limit_status: b.heightLimit.status, open_sides: SIDES.filter((s) => b.open[s]).join(' ') },
  });
  const edge: Record<string, Vec3[]> = { front: [[-W, -D, 0], [W, -D, 0]], back: [[-W, D, 0], [W, D, 0]], left: [[-W, -D, 0], [-W, D, 0]], right: [[W, -D, 0], [W, D, 0]] };
  for (const s of SIDES) if (b.open[s]) out.push({ kind: 'polyline', layer: '50_EXHIBITION_ARCHITECTURE::BOOTH_PLOT', name: `OPEN_SIDE_${s.toUpperCase()}`, points: edge[s] });
  for (const k of b.columns ?? []) {
    out.push({ kind: 'polyline', layer: '50_EXHIBITION_ARCHITECTURE::COLUMNS', name: k.name, points: rect(k.x - k.w / 2, k.y - k.d / 2, k.x + k.w / 2, k.y + k.d / 2), closed: true, user: { width_mm: k.w, depth_mm: k.d, status: k.status } });
  }
  for (const l of a.loads) {
    const sp = l.point;
    out.push({ kind: 'circle', layer: '60_TECHNICAL_INFRASTRUCTURE::SERVICE_POINTS', name: sp.name, center: [sp.x, sp.y, 0], radius: 150, user: { kind: sp.kind, capacity_w: sp.capacityW ?? 'not stated', status: sp.status, stated_load_w: l.watts } });
    out.push({ kind: 'dot', layer: '60_TECHNICAL_INFRASTRUCTURE::SERVICE_POINTS', name: `${sp.name}.LABEL`, text: `${sp.name} · ${sp.kind} · ${(l.watts / 1000).toFixed(2)} kW stated`, at: [sp.x, sp.y, 300] });
  }
  for (const z of a.access) {
    const u = a.units.find((x) => x.id === z.unit);
    out.push({ kind: 'polyline', layer: '91_CLEARANCES::APPROACH_ZONES', name: `${u?.name ?? z.unit} APPROACH`, points: rect(z.zone.min[0], z.zone.min[1], z.zone.max[0], z.zone.max[1]), closed: true, user: { accessible_approach: z.approach ? 'yes' : 'no', turning_circle: z.turning ? 'yes' : 'no' } });
  }
  // narrow floor: runs along each row, then stacked where consecutive rows share a run
  const g = a.grid;
  let open = new Map<string, { i0: number; i1: number; j0: number; j1: number }>();
  const done: { i0: number; i1: number; j0: number; j1: number }[] = [];
  for (let j = 0; j < g.ny; j++) {
    const next = new Map<string, { i0: number; i1: number; j0: number; j1: number }>();
    let i = 0;
    while (i < g.nx) {
      if (g.cls[j * g.nx + i] !== CELL.tight) { i++; continue; }
      const i0 = i;
      while (i < g.nx && g.cls[j * g.nx + i] === CELL.tight) i++;
      const key = `${i0}:${i}`;
      const r = open.get(key);
      if (r) { r.j1 = j + 1; open.delete(key); next.set(key, r); } else next.set(key, { i0, i1: i, j0: j, j1: j + 1 });
    }
    done.push(...open.values());
    open = next;
  }
  done.push(...open.values());
  const X = (i: number) => g.x0 + i * g.g - g.g / 2, Y = (j: number) => g.y0 + j * g.g - g.g / 2;
  for (const r of done) out.push({ kind: 'polyline', layer: '91_CLEARANCES::NARROW_FLOOR', name: 'NARROW_FLOOR', points: rect(Math.max(X(r.i0), -W), Math.max(Y(r.j0), -D), Math.min(X(r.i1), W), Math.min(Y(r.j1), D)), closed: true, user: { route_mm: b.rules.route.value } });
  return out;
}
