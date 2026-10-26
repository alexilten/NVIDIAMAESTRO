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
  } else return null;
  return { parts, materials: MATERIALS };
}
