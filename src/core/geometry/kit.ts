import type { ParametricKitPart } from '../schema';
import { MATERIALS, box, cbox, type Shape, type ShapePart } from './shape';

/**
 * Generic parametric kit components. These are design tools with stated parameters, not records of a
 * built object: their dimensions are whatever the designer sets. Project-built pieces (for example the
 * niches and kiosks from a past show) are not here: they come in through the Ingest workspace as fixed geometry
 * from their Rhino source and stay in the private library.
 */

export const KIT: ParametricKitPart[] = [
  {
    id: 'kit-demo-counter',
    name: 'Demo counter',
    category: 'counter',
    description: 'A laminate demo counter with a worktop, an equipment cavity with a service door, a toe kick and an optional rear display on a post mount. An accessible section can drop part of the worktop to a seated work height.',
    params: [
      { key: 'width', label: 'Width', min: 900, max: 4000, step: 10, default: 1800, unit: 'mm' },
      { key: 'depth', label: 'Depth', min: 450, max: 1200, step: 10, default: 700, unit: 'mm' },
      { key: 'height', label: 'Worktop height', min: 700, max: 1150, step: 5, default: 1000, unit: 'mm' },
      { key: 'top', label: 'Worktop thickness', min: 12, max: 60, step: 1, default: 30, unit: 'mm' },
      { key: 'accessible', label: 'Accessible section width', min: 0, max: 1500, step: 10, default: 0, unit: 'mm' },
      { key: 'screen', label: 'Display size', min: 0, max: 98, step: 1, default: 55, unit: 'count' },
      { key: 'screenCentre', label: 'Display centre height', min: 1200, max: 2200, step: 10, default: 1650, unit: 'mm' },
    ],
    status: 'estimated',
    note: 'Design inputs. The accessible section drops to 860 mm, inside the 711–864 mm (28–34 in) work-surface range of the 2010 ADA Standards §902.3.',
    tags: ['counter', 'desk', 'demo', 'kiosk', 'station'],
  },
  {
    id: 'kit-light-table',
    name: 'Hardware light table',
    category: 'pedestal',
    description: 'A plinth for displaying hardware, with an inset, back-lit opal top.',
    params: [
      { key: 'width', label: 'Width', min: 400, max: 3200, step: 10, default: 1200, unit: 'mm' },
      { key: 'depth', label: 'Depth', min: 400, max: 1600, step: 10, default: 700, unit: 'mm' },
      { key: 'height', label: 'Height', min: 300, max: 1200, step: 5, default: 900, unit: 'mm' },
      { key: 'border', label: 'Top border', min: 20, max: 150, step: 5, default: 50, unit: 'mm' },
    ],
    status: 'estimated',
    note: 'Design inputs.',
    tags: ['pedestal', 'plinth', 'light table', 'display'],
  },
  {
    id: 'kit-gallery-niche',
    name: 'Gallery wall niche',
    category: 'niche',
    description: 'A recessed, lit display niche in a wall panel with evenly spaced shelves. The origin is the front face centre at floor level; the niche extends into the wall (+Y).',
    params: [
      { key: 'panelWidth', label: 'Wall panel width', min: 600, max: 3000, step: 10, default: 1500, unit: 'mm' },
      { key: 'wallHeight', label: 'Wall height', min: 1800, max: 4000, step: 10, default: 2700, unit: 'mm' },
      { key: 'width', label: 'Opening width', min: 300, max: 2800, step: 10, default: 1200, unit: 'mm' },
      { key: 'height', label: 'Opening height', min: 300, max: 2400, step: 10, default: 1000, unit: 'mm' },
      { key: 'sill', label: 'Sill height', min: 300, max: 1800, step: 10, default: 1100, unit: 'mm' },
      { key: 'depth', label: 'Niche depth', min: 100, max: 800, step: 5, default: 250, unit: 'mm' },
      { key: 'shelves', label: 'Shelves', min: 0, max: 6, step: 1, default: 2, unit: 'count' },
    ],
    status: 'estimated',
    note: 'Design inputs.',
    tags: ['niche', 'gallery', 'wall', 'shelf', 'vitrine'],
  },
  // made by the Niches workspace from a rule set; not offered in the library on their own
  {
    id: 'kit-rule-niche',
    name: 'Hardware niche (built from rules)',
    category: 'niche',
    description: 'A niche opening in a wall panel with shelves at stated heights, generated in the Niches workspace from its hardware and a show’s placement rules. The origin is the front face centre at floor level; the niche extends into the wall (+Y).',
    params: [
      { key: 'width', label: 'Opening width', min: 100, max: 6000, step: 0.1, default: 1200, unit: 'mm' },
      { key: 'height', label: 'Opening height', min: 100, max: 3000, step: 0.1, default: 1000, unit: 'mm' },
      { key: 'sill', label: 'Sill height', min: 0, max: 2500, step: 0.1, default: 1100, unit: 'mm' },
      { key: 'depth', label: 'Clear depth', min: 30, max: 1200, step: 0.1, default: 220, unit: 'mm' },
      { key: 'void', label: 'Service void', min: 0, max: 400, step: 0.1, default: 75, unit: 'mm' },
      { key: 'wallWidth', label: 'Wall panel width', min: 200, max: 8000, step: 1, default: 1600, unit: 'mm' },
      { key: 'wallHeight', label: 'Wall height', min: 500, max: 5000, step: 1, default: 2700, unit: 'mm' },
      { key: 'shelfT', label: 'Shelf thickness', min: 5, max: 100, step: 0.1, default: 36, unit: 'mm' },
      { key: 'shelfDepth', label: 'Shelf depth', min: 30, max: 1200, step: 0.1, default: 200, unit: 'mm' },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ key: `shelf${i}`, label: `Shelf ${i} underside above sill`, min: 0, max: 3000, step: 0.1, default: 0, unit: 'mm' as const })),
    ],
    status: 'estimated',
    note: 'Generated from a niche rule set; its status in an export is the weakest of the rules and hardware it was built from.',
    tags: ['niche', 'shelf', 'hardware wall'],
    hidden: true,
  },
  {
    id: 'kit-die-cut-label',
    name: 'Die-cut label',
    category: 'signage',
    description: 'One line of die-cut vinyl type on a niche back panel, a rack door or a pedestal top, drawn as its estimated extent. The origin is the bottom centre of the label; a flat label reads from −Y.',
    params: [
      { key: 'width', label: 'Width', min: 1, max: 2000, step: 0.1, default: 100, unit: 'mm' },
      { key: 'height', label: 'Cap height', min: 1, max: 200, step: 0.1, default: 10, unit: 'mm' },
      { key: 'flat', label: 'Lies flat (pedestal top)', min: 0, max: 1, step: 1, default: 0, unit: 'count' },
      { key: 'white', label: 'White vinyl', min: 0, max: 1, step: 1, default: 0, unit: 'count' },
    ],
    status: 'estimated',
    note: 'The extent is estimated from the text length and letter height.',
    tags: ['label', 'graphics', 'vinyl'],
    hidden: true,
  },
  {
    id: 'kit-rule-pedestal',
    name: 'Hardware pedestal (built from rules)',
    category: 'pedestal',
    description: 'A pedestal or light table sized in the Niches workspace from its hardware and a show’s placement rules: matte black laminate with an opal acrylic top. The origin is the front edge centre at floor level; the pedestal extends back (+Y).',
    params: [
      { key: 'width', label: 'Width', min: 100, max: 6000, step: 0.1, default: 1463, unit: 'mm' },
      { key: 'depth', label: 'Depth', min: 100, max: 3000, step: 0.1, default: 660, unit: 'mm' },
      { key: 'height', label: 'Top above floor', min: 100, max: 1500, step: 0.1, default: 900, unit: 'mm' },
    ],
    status: 'estimated',
    note: 'Generated from a niche rule set; the 15 mm opal top follows the Berlin light table drawings.',
    tags: ['pedestal', 'light table'],
    hidden: true,
  },
  {
    id: 'kit-mounted-envelope',
    name: 'Wall-mounted hardware envelope',
    category: 'other',
    description: 'The envelope of a unit hung on a niche back panel on its back, as seen from the front. The origin is the bottom centre of its back face.',
    params: [
      { key: 'width', label: 'Width', min: 1, max: 3000, step: 0.1, default: 445, unit: 'mm' },
      { key: 'height', label: 'Height', min: 1, max: 3000, step: 0.1, default: 900, unit: 'mm' },
      { key: 'depth', label: 'Stand-off', min: 1, max: 1000, step: 0.1, default: 45, unit: 'mm' },
    ],
    status: 'estimated',
    note: 'A unit turned upright on the wall cannot be shown as its catalog model, which only turns about Z; this is its envelope at the catalog size.',
    tags: ['tray', 'wall-hung'],
    hidden: true,
  },
];

export const KIT_BY_ID = new Map(KIT.map((k) => [k.id, k]));

export function defaultParams(id: string): Record<string, number> {
  const k = KIT_BY_ID.get(id);
  return Object.fromEntries((k?.params ?? []).map((p) => [p.key, p.default]));
}

/** clamp and snap parameters to their definitions, filling missing ones */
export function resolveParams(id: string, params: Record<string, number>): Record<string, number> {
  const k = KIT_BY_ID.get(id);
  if (!k) return params;
  const out: Record<string, number> = {};
  for (const p of k.params) {
    const v = Number.isFinite(params[p.key]) ? params[p.key] : p.default;
    out[p.key] = Math.min(p.max, Math.max(p.min, Math.round(v / p.step) * p.step));
  }
  return out;
}

/** 16:9 panel dimensions for a diagonal in inches (active area; bezel added separately) */
export function panel169(diagonalIn: number) {
  const dmm = diagonalIn * 25.4;
  const k = Math.sqrt(16 * 16 + 9 * 9);
  return { w: (dmm * 16) / k, h: (dmm * 9) / k };
}

export const ACCESSIBLE_HEIGHT = 860;

export function kitShape(id: string, raw: Record<string, number>): Shape | null {
  const p = resolveParams(id, raw);
  const parts: ShapePart[] = [];
  if (id === 'kit-demo-counter') {
    const { width: w, depth: d, height: h, top, accessible, screen, screenCentre } = p;
    const toe = 80, kick = 60;
    const acc = Math.min(accessible, w - 300);
    const mainW = w - acc;
    const mainX = acc / 2; // the accessible section sits at the left end
    // the toe kick runs under the main section only, leaving knee and toe clearance at the accessible end
    parts.push(box('TOE_KICK', 'black', [mainX - mainW / 2 + kick, -d / 2 + kick, 0], [w / 2 - kick, d / 2, toe]));
    parts.push(cbox('BODY', 'laminateBlack', mainX, 0, toe, mainW, d, h - top - toe));
    parts.push(cbox('WORKTOP', 'walnut', mainX, 0, h - top, mainW, d, top));
    parts.push(cbox('SERVICE_DOOR', 'graphite', mainX, d / 2 - 1, toe + 40, Math.min(600, mainW * 0.5), 2, h - top - toe - 80));
    if (acc > 0) {
      const ax = -w / 2 + acc / 2;
      parts.push(cbox('ACCESSIBLE_APRON', 'laminateBlack', ax, d / 2 - 60, toe, acc, 120, ACCESSIBLE_HEIGHT - top - toe));
      parts.push(cbox('ACCESSIBLE_WORKTOP', 'walnut', ax, 0, ACCESSIBLE_HEIGHT - top, acc, d, top));
    }
    if (screen > 0) {
      const s = panel169(screen);
      const bezel = 12, sd = 30;
      const sw = s.w + 2 * bezel, sh = s.h + 2 * bezel;
      const z0 = Math.max(h + 40, screenCentre - sh / 2);
      // centred on the main section, moved in so it never overhangs the counter's ends
      const sx = sw >= w ? 0 : Math.max(-w / 2 + sw / 2, Math.min(w / 2 - sw / 2, mainX));
      parts.push(cbox('DISPLAY_POST', 'graphite', sx, d / 2 - 40, h, 80, 40, z0 + sh * 0.5 - h));
      parts.push(cbox('DISPLAY', 'screen', sx, d / 2 - 40 - 20 - sd / 2, z0, sw, sd, sh));
    }
  } else if (id === 'kit-light-table') {
    const { width: w, depth: d, height: h, border } = p;
    // the opal top sits 1 mm below a border frame, so the two faces never coincide
    const iw = w - 2 * border, id = d - 2 * border;
    parts.push(cbox('BODY', 'laminateBlack', 0, 0, 0, w, d, h - 6));
    parts.push(box('FRAME_FRONT', 'laminateBlack', [-w / 2, -d / 2, h - 6], [w / 2, -id / 2, h]));
    parts.push(box('FRAME_BACK', 'laminateBlack', [-w / 2, id / 2, h - 6], [w / 2, d / 2, h]));
    parts.push(box('FRAME_LEFT', 'laminateBlack', [-w / 2, -id / 2, h - 6], [-iw / 2, id / 2, h]));
    parts.push(box('FRAME_RIGHT', 'laminateBlack', [iw / 2, -id / 2, h - 6], [w / 2, id / 2, h]));
    parts.push(cbox('LIGHT_TOP', 'opal', 0, 0, h - 6, iw, id, 5));
  } else if (id === 'kit-gallery-niche') {
    const { panelWidth: pw, wallHeight: wh, width: ow, height: oh, sill, depth: nd, shelves } = p;
    const w = Math.min(ow, pw - 100);
    const t = 18;
    const top = Math.min(sill + oh, wh - 50);
    // wall panel in four pieces around the opening, then the niche box behind it
    parts.push(box('WALL_LEFT', 'laminateBlack', [-pw / 2, 0, 0], [-w / 2, t, wh]));
    parts.push(box('WALL_RIGHT', 'laminateBlack', [w / 2, 0, 0], [pw / 2, t, wh]));
    parts.push(box('WALL_BELOW', 'laminateBlack', [-w / 2, 0, 0], [w / 2, t, sill]));
    parts.push(box('WALL_ABOVE', 'laminateBlack', [-w / 2, 0, top], [w / 2, t, wh]));
    parts.push(box('NICHE_BACK', 'opal', [-w / 2, nd - t, sill], [w / 2, nd, top]));
    parts.push(box('NICHE_LEFT', 'white', [-w / 2, t, sill], [-w / 2 + t, nd - t, top]));
    parts.push(box('NICHE_RIGHT', 'white', [w / 2 - t, t, sill], [w / 2, nd - t, top]));
    parts.push(box('NICHE_BASE', 'white', [-w / 2, t, sill], [w / 2, nd - t, sill + t]));
    parts.push(box('NICHE_HEAD', 'white', [-w / 2, t, top - t], [w / 2, nd - t, top]));
    const n = Math.round(shelves);
    for (let i = 1; i <= n; i++) {
      const z = sill + ((top - sill) * i) / (n + 1);
      parts.push(box(`SHELF_${i}`, 'white', [-w / 2 + t, t + 10, z - 9], [w / 2 - t, nd - t, z + 9]));
    }
  } else if (id === 'kit-rule-niche') {
    const { width: w, height: h, sill, depth: nd, void: vd, wallWidth, wallHeight, shelfT: T, shelfDepth: sd } = p;
    const t = 18;
    const pw = Math.max(wallWidth, w + 2 * t), wh = Math.max(wallHeight, sill + h + t);
    const top = sill + h;
    parts.push(box('WALL_LEFT', 'laminateBlack', [-pw / 2, 0, 0], [-w / 2, t, wh]));
    parts.push(box('WALL_RIGHT', 'laminateBlack', [w / 2, 0, 0], [pw / 2, t, wh]));
    parts.push(box('WALL_BELOW', 'laminateBlack', [-w / 2, 0, 0], [w / 2, t, sill]));
    parts.push(box('WALL_ABOVE', 'laminateBlack', [-w / 2, 0, top], [w / 2, t, wh]));
    // the niche case: lining inside the opening, the matte white back panel at the clear depth, and the void behind it
    parts.push(box('NICHE_BACK', 'white', [-w / 2 - t, nd, sill - t], [w / 2 + t, nd + t, top + t]));
    parts.push(box('NICHE_LEFT', 'white', [-w / 2 - t, t, sill - t], [-w / 2, nd, top + t]));
    parts.push(box('NICHE_RIGHT', 'white', [w / 2, t, sill - t], [w / 2 + t, nd, top + t]));
    parts.push(box('NICHE_BASE', 'white', [-w / 2, t, sill - t], [w / 2, nd, sill]));
    parts.push(box('NICHE_HEAD', 'white', [-w / 2, t, top], [w / 2, nd, top + t]));
    if (vd > 0) parts.push(box('VOID_REAR', 'laminateBlack', [-w / 2 - t, nd + t + vd, sill - t], [w / 2 + t, nd + 2 * t + vd, top + t]));
    for (let i = 1; i <= 6; i++) {
      const u = p[`shelf${i}`];
      if (!(u > 0)) continue;
      parts.push(box(`SHELF_${i}`, 'opal', [-w / 2, Math.max(t, nd - sd), sill + u], [w / 2, nd, sill + u + T]));
    }
  } else if (id === 'kit-die-cut-label') {
    const { width: w, height: h } = p;
    const m = p.white ? 'white' : 'black';
    parts.push(p.flat ? box('VINYL', m, [-w / 2, 0, 0], [w / 2, h, 0.5]) : box('VINYL', m, [-w / 2, -0.25, 0], [w / 2, 0.25, h]));
  } else if (id === 'kit-rule-pedestal') {
    const { width: w, depth: d, height: h } = p;
    const t = Math.min(15, h / 2);
    parts.push(box('BODY', 'laminateBlack', [-w / 2, 0, 0], [w / 2, d, h - t]));
    parts.push(box('TOP', 'opal', [-w / 2, 0, h - t], [w / 2, d, h]));
  } else if (id === 'kit-mounted-envelope') {
    const { width: w, height: h, depth: d } = p;
    parts.push(box('ENVELOPE', 'graphite', [-w / 2, -d, 0], [w / 2, 0, h]));
  } else return null;
  return { parts, materials: MATERIALS };
}
