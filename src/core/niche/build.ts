import { addItem, groupItems, newComposition, uid } from '../compose';
import { boxSize, shapeBounds } from '../geometry/shape';
import { productEntries, resolveRef } from '../library';
import type { Composition, ItemRef, Vec3 } from '../schema';
import type { Annotation } from '../../export/rhino';
import { inches, RULE_DEF } from './rules';
import { labelColour, labelDatum, type NicheItem, type NicheLayout, type NicheSpec, type UnitInfo, type UnitResolver } from './layout';

/** Catalog products and custom hardware, as the generator sees them. */
export function catalogResolver(): UnitResolver {
  const byId = new Map(productEntries().map((e) => [e.ref.kind === 'product' ? e.ref.id : e.key, e]));
  return (item: NicheItem): UnitInfo => {
    if (item.placeholder) return { name: item.placeholder, dims: null, status: 'placeholder' };
    if (item.custom) return { name: item.custom.name, dims: [item.custom.width, item.custom.depth, item.custom.height], status: item.custom.status };
    const e = item.product ? byId.get(item.product) : undefined;
    if (!e) return { name: item.product ?? 'Unknown item', dims: null, status: 'placeholder' };
    return { name: e.name, dims: e.dims, status: e.verification, kind: e.kind };
  };
}

export function newNiche(code = '01', name = 'New niche'): NicheSpec {
  return { schema: 'maestro.niche', version: 1, id: uid('niche'), code, name, type: 'shelf', rulesId: 'gtc-berlin-2026', letter: 'standard', rows: [[]], updatedAt: new Date().toISOString() };
}

export const nicheItem = (patch: Omit<NicheItem, 'id'>): NicheItem => ({ id: uid('ni'), ...patch });

const kit = (id: string, params: Record<string, number>): ItemRef => ({ kind: 'kit', id, params });
const dimsOf = (ref: ItemRef): Vec3 | null => { const r = resolveRef(ref, []); return r?.shape ? boxSize(shapeBounds(r.shape)) : null; };

/**
 * The niche as a composition: the niche case on its wall panel, each unit at its place (catalog models where they can
 * stand as modelled, envelopes for units hung upright), and a vinyl extent for every label. One group, named for the
 * niche, so Compose and Exhibition move it as one module. The origin is the niche's front face centre at the floor.
 */
export function nicheComposition(l: NicheLayout): Composition {
  const s = l.spec;
  const v = l.rules.values;
  let c = newComposition(`${s.code} ${s.name}`.trim());
  const add = (ref: ItemRef, name: string, at: Vec3) => {
    const d = dimsOf(ref) ?? [0, 0, 0];
    const r = addItem(c, ref, name, d, at);
    c = r.comp;
  };
  if (s.type === 'pedestal' || s.type === 'rack') { flatComposition(l, add); return groupItems(c, c.items.map((i) => i.id), `${s.code} ${s.name}`.trim()).comp; }
  const params: Record<string, number> = {
    width: l.width, height: l.height, sill: l.sill, depth: l.depth, void: v.void.value,
    wallWidth: Math.ceil(l.width + 2 * 300), wallHeight: Math.max(2700, Math.ceil(l.top + 400)),
    shelfT: v.shelfThickness.value, shelfDepth: v.shelfDepth.value,
  };
  l.shelves.slice(0, 6).forEach((sh, i) => { params[`shelf${i + 1}`] = Math.round((sh.under - l.sill) * 10) / 10; });
  add(kit('kit-rule-niche', params), `${s.code} niche`, [0, 0, 0]);
  for (const u of l.units) {
    const w = u.x1 - u.x0;
    const cx = u.x0 + w / 2;
    if (s.type === 'shelf') {
      // centred on the shelf's depth, or against the back panel when deeper than the shelf
      const cy = l.depth - Math.max(v.shelfDepth.value, u.protrude) / 2;
      if (u.item.product) add({ kind: 'product', id: u.item.product }, u.name, [cx, cy, u.z0]);
      else add(kit('kit-mounted-envelope', { width: w, height: u.z1 - u.z0, depth: u.protrude }), u.name, [cx, cy + u.protrude / 2, u.z0]);
    } else if (u.item.product && !u.item.upright) {
      add({ kind: 'product', id: u.item.product }, u.name, [u.x0 + w / 2, l.depth - u.protrude / 2, u.z0]);
    } else {
      add(kit('kit-mounted-envelope', { width: w, height: u.z1 - u.z0, depth: u.protrude }), u.name, [u.x0 + w / 2, l.depth, u.z0]);
    }
  }
  for (const lb of l.labels) add(kit('kit-die-cut-label', { width: lb.w, height: lb.cap }), `${lb.code} ${lb.text}`, [lb.x0 + lb.w / 2, l.depth - 0.25, lb.z0]);
  c = groupItems(c, c.items.map((i) => i.id), `${s.code} ${s.name}`.trim()).comp;
  return c;
}

/**
 * A pedestal (its top at `base`, the hardware on one front line, labels flat on the top in front of it) or a row of
 * racks on the floor with a label on each door. The origin is the front edge centre at the floor, as for a niche.
 */
function flatComposition(l: NicheLayout, add: (ref: ItemRef, name: string, at: Vec3) => void) {
  const s = l.spec;
  const z = s.type === 'pedestal' ? l.base ?? 0 : 0;
  if (s.type === 'pedestal') add(kit('kit-rule-pedestal', { width: l.width, depth: l.depth, height: z }), `${s.code} pedestal`, [0, 0, 0]);
  for (const u of l.units) {
    const w = u.x1 - u.x0, cx = u.x0 + w / 2;
    // a pedestal plan runs z back from the front edge; a rack's front is the front line
    const [y0, d, h] = s.type === 'pedestal' ? [u.z0, u.z1 - u.z0, u.protrude] : [0, u.protrude, u.z1 - u.z0];
    if (u.item.product) add({ kind: 'product', id: u.item.product }, u.name, [cx, y0 + d / 2, z]);
    else add(kit('kit-mounted-envelope', { width: w, height: h, depth: d }), u.name, [cx, y0 + d, z]);
  }
  for (const lb of l.labels) {
    const name = `${lb.code} ${lb.text}`;
    if (s.type === 'pedestal') add(kit('kit-die-cut-label', { width: lb.w, height: lb.cap, flat: 1, white: 0 }), name, [lb.x0 + lb.w / 2, lb.z0, z]);
    else add(kit('kit-die-cut-label', { width: lb.w, height: lb.cap, flat: 0, white: 1 }), name, [lb.x0 + lb.w / 2, -0.25, lb.z0]);
  }
}

const csvCell = (v: string | number) => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

/**
 * The label schedule for the graphics vendor: one row per label, positions from the niche's bottom left corner (a
 * pedestal's front left corner, a rack row's left edge at the floor); the datum column says which.
 */
export function labelCsv(l: NicheLayout): string {
  const left = -l.width / 2;
  const head = ['code', 'text', 'letter_size', 'cap_height_mm', 'est_length_mm', 'x_from_left_mm', 'y_from_sill_mm', 'x_from_left_in', 'y_from_sill_in', 'material', 'hardware', 'status', 'datum'];
  const rows = l.labels.map((lb) => {
    const u = l.units.find((x) => x.row === lb.row && x.col === lb.col);
    return [lb.code, lb.text, l.spec.letter, lb.cap, Math.round(lb.w), Math.round(lb.x0 - left), Math.round(lb.z0 - l.sill), inches(lb.x0 - left), inches(lb.z0 - l.sill), labelColour(l), u?.name ?? '', lb.status, labelDatum(l)];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/**
 * Dimension lines and text for Rhino, drawn in the niche's front plane (y = −2): the opening, each row's chain, the
 * height chain and the centre line, on 90_DIMENSIONS::NICHE; label text on 90_DIMENSIONS::NICHE_LABELS. A pedestal's
 * dimensions lie on its top, 1 mm above it, as its plan does.
 */
export function nicheAnnotations(l: NicheLayout): Annotation[] {
  const out: Annotation[] = [];
  const D = '90_DIMENSIONS::NICHE';
  const plan = l.spec.type === 'pedestal';
  const niche = l.spec.type === 'shelf' || l.spec.type === 'wall';
  const P = (x: number, z: number): Vec3 => (plan ? [x, z, (l.base ?? 0) + 1] : [x, -2, z]);
  const dim = (name: string, a: Vec3, b: Vec3, at: Vec3, text: string) => {
    out.push({ kind: 'polyline', layer: D, name, points: [a, b], user: { length_mm: Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 10) / 10 } });
    out.push({ kind: 'dot', layer: D, name: `${name}.TEXT`, text, at });
  };
  const fmt = (mm: number) => `${Math.round(mm)} (${inches(mm)})`;
  const W = l.width / 2;
  const outline = plan ? 'PEDESTAL_TOP' : niche ? 'OPENING' : 'RACKS';
  out.push({ kind: 'polyline', layer: D, name: outline, points: [P(-W, l.sill), P(W, l.sill), P(W, l.top), P(-W, l.top)], closed: true, user: { width_mm: l.width, [plan ? 'depth_mm' : 'height_mm']: l.height, ...(niche ? { sill_mm: l.sill } : {}), ...(plan ? { top_aff_mm: l.base ?? 0 } : {}), rules: l.rules.id } });
  if (niche) {
    out.push({ kind: 'polyline', layer: D, name: 'CENTRE_LINE', points: [P(-W - 300, l.centre), P(W + 300, l.centre)], user: { aff_mm: l.centre } });
    out.push({ kind: 'dot', layer: D, name: 'CENTRE_LINE.TEXT', text: `CL ${Math.round(l.centre)} AFF`, at: P(W + 320, l.centre) });
  }
  dim('WIDTH', P(-W, l.top + 120), P(W, l.top + 120), P(0, l.top + 150), fmt(l.width));
  dim(plan ? 'DEPTH' : 'HEIGHT', P(-W - 180, l.sill), P(-W - 180, l.top), P(-W - 260, (l.sill + l.top) / 2), fmt(l.height));
  if (niche) dim('SILL', P(-W - 90, 0), P(-W - 90, l.sill), P(-W - 150, l.sill / 2), `${fmt(l.sill)} AFF`);
  for (const ch of l.rowChains) {
    const z = ch.z - 40;
    ch.segs.forEach((sg, i) => { if (sg.kind !== 'space' && sg.b - sg.a > 0.5) dim(`ROW_${ch.row + 1}_${i + 1}_${sg.kind.toUpperCase()}`, P(sg.a, z), P(sg.b, z), P((sg.a + sg.b) / 2, z - 25), fmt(sg.b - sg.a)); });
  }
  l.heightChain.forEach((h, i) => dim(`V_${i + 1}_${h.label.toUpperCase().replace(/\W+/g, '_')}`, P(W + 90, h.a), P(W + 90, h.b), P(W + 160, (h.a + h.b) / 2), fmt(h.b - h.a)));
  for (const lb of l.labels) {
    const at: Vec3 = plan ? [lb.x0, lb.z0 + lb.cap / 2, (l.base ?? 0) + 1] : l.spec.type === 'rack' ? [lb.x0, -1, lb.z0 + lb.cap / 2] : [lb.x0, l.depth - 1, lb.z0 + lb.cap / 2];
    out.push({ kind: 'dot', layer: '90_DIMENSIONS::NICHE_LABELS', name: lb.code, text: `${lb.code} ${lb.text}`, at });
  }
  return out;
}

/** rule values the layout used, one line each, for sheets and exports */
export function ruleLines(l: NicheLayout): string[] {
  return l.used.map((k) => {
    const v = l.rules.values[k];
    const src = l.rules.sources.find((s) => s.id === v.sourceId);
    return `${RULE_DEF.get(k)!.label}: ${Math.round(v.value * 10) / 10} mm (${inches(v.value)}) · ${v.status}${src ? ` · ${src.title}${v.ref ? ` ${v.ref}` : ''}` : ''}`;
  });
}
