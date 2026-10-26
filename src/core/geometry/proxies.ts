import { PHYSICAL_BY_ID, MODEL_BY_ID } from '../catalog/products';
import type { PhysicalAsset } from '../schema';
import { MATERIALS, box, cbox, type Shape, type ShapePart } from './shape';

/**
 * Procedural LOD 0/1 proxies built only from recorded dimensions.
 * Every detail sits inside the recorded envelope, so the proxy's bounds equal the catalog dimensions exactly
 * (tests/catalog.test.ts holds this). Details are generic, labelled as generated, and never claim to be
 * manufacturer geometry.
 */

export function hasEnvelope(pa: PhysicalAsset): boolean {
  return pa.dims.width.value != null && pa.dims.depth.value != null && pa.dims.height.value != null;
}

export function envelopeShape(pa: PhysicalAsset): Shape {
  const { width, depth, height } = pa.dims;
  const w = width.value!, d = depth.value!, h = height.value!;
  return { parts: [cbox('ENVELOPE', 'envelope', 0, 0, 0, w, d, h)], materials: MATERIALS };
}

export function productShape(modelId: string, lod: 0 | 1 = 1): Shape | null {
  const m = MODEL_BY_ID.get(modelId);
  const pa = m?.physicalAssetId ? PHYSICAL_BY_ID.get(m.physicalAssetId) : undefined;
  if (!m || !pa || !hasEnvelope(pa)) return null;
  if (lod === 0) return envelopeShape(pa);
  const w = pa.dims.width.value!, d = pa.dims.depth.value!, h = pa.dims.height.value!;
  const gen = GENERATORS[modelId] ?? generic;
  return { parts: gen(w, d, h), materials: MATERIALS };
}

type Gen = (w: number, d: number, h: number) => ShapePart[];

const generic: Gen = (w, d, h) => [cbox('BODY', 'chassis', 0, 0, 0, w, d, h)];

/** a desktop box: body, recessed front field, rear port band, feet */
const desktop = (front: string): Gen => (w, d, h) => {
  const foot = Math.min(3, h * 0.06);
  const inset = Math.min(1.2, d * 0.01);
  return [
    cbox('BODY', 'chassis', 0, inset / 2, foot, w, d - inset, h - foot),
    cbox('FRONT_FIELD', front, 0, -d / 2 + inset / 2, foot + h * 0.08, w * 0.92, inset, (h - foot) * 0.84),
    cbox('REAR_PORTS', 'ports', 0, d / 2 - 0.5, foot + h * 0.25, w * 0.8, 1, (h - foot) * 0.35),
    ...feet(w, d, foot),
  ];
};

function feet(w: number, d: number, foot: number): ShapePart[] {
  if (foot <= 0) return [];
  const fx = w * 0.35, fy = d * 0.35, s = Math.min(w, d) * 0.12;
  return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j], k) => cbox(`FOOT_${k + 1}`, 'black', i * fx, j * fy, 0, s, s, foot));
}

/** a deskside tower: plinth, body, front intake field, rear I/O band */
const tower: Gen = (w, d, h) => {
  const plinth = Math.min(12, h * 0.025);
  return [
    cbox('PLINTH', 'black', 0, 0, 0, w * 0.96, d * 0.96, plinth),
    cbox('BODY', 'graphite', 0, 0.5, plinth, w, d - 1, h - plinth),
    cbox('FRONT_INTAKE', 'grille', 0, -d / 2 + 0.5, plinth + h * 0.1, w * 0.8, 1, h * 0.72),
    cbox('REAR_IO', 'ports', 0, d / 2 - 0.5, plinth + h * 0.55, w * 0.7, 1, h * 0.3),
  ];
};

/** a rack-mount chassis between 19-inch rack ears, with a front port or intake field */
const rackChassis = (field: string, ears: boolean): Gen => (w, d, h) => {
  const ear = ears ? 9.65 : 0;
  const body = w - 2 * ear;
  const parts = [
    cbox('CHASSIS', 'chassis', 0, 15, 0, body, d - 30, h),
    cbox('FACEPLATE', 'graphite', 0, -d / 2 + 15, 0, body, 30, h),
    cbox('FRONT_FIELD', field, 0, -d / 2 + 0.5, h * 0.15, body * 0.88, 1, h * 0.7),
  ];
  if (ears) parts.push(cbox('EAR_L', 'chassis', -w / 2 + ear / 2, -d / 2 + 15, 0, ear, 30, h), cbox('EAR_R', 'chassis', w / 2 - ear / 2, -d / 2 + 15, 0, ear, 30, h));
  return parts;
};

/** a graphics or network board shown upright as installed: bracket at −X, PCIe edge along the bottom */
const board = (shroud: string, intake: string, fans: number): Gen => (w, d, h) => {
  const edge = Math.min(14, h * 0.15);
  const parts = [
    cbox('SHROUD', shroud, 8, 0, edge, w - 16, d, h - edge),
    cbox('BRACKET', 'chassis', -w / 2 + 4, 0, 0, 8, d, h),
    cbox('PCIE_EDGE', 'copper', -w * 0.05, 0, 0, w * 0.35, 2, edge),
  ];
  const fan = (h - edge) * 0.6;
  for (let k = 0; k < fans; k++) parts.push(cbox(`INTAKE_${k + 1}`, intake, w * (fans === 1 ? 0.28 : k === 0 ? -0.15 : 0.25), -d / 2 + 0.5, edge + (h - edge) * 0.2, fan, 1, fan));
  return parts;
};

const GENERATORS: Record<string, Gen> = {
  'nv-dgx-spark': desktop('champagne'),
  'nv-agx-orin-devkit': (w, d, h) => {
    const foot = 4;
    return [
      cbox('BODY', 'graphite', 0, 0, foot, w, d, h - foot - 6),
      cbox('FAN_GRILLE', 'grille', 0, 0, h - 6, w * 0.82, d * 0.82, 6),
      cbox('IO_BAND', 'ports', 0, d / 2 - 0.5, foot + 10, w * 0.86, 1, 18),
      ...feet(w, d, foot),
    ];
  },
  'nv-agx-thor-devkit': (w, d, h) => [
    cbox('BODY', 'graphite', 0, 0, 0, w, d, h - 4),
    cbox('TOP_GRILLE', 'grille', 0, 0, h - 4, w * 0.9, d * 0.8, 4),
    cbox('IO_FACE', 'ports', 0, d / 2 - 0.5, 8, w * 0.9, 1, h * 0.45),
  ],
  'nv-dgx-b200': (w, d, h) => {
    const ear = 9.65; // the chassis between the rack ears is narrower than the 19-inch width
    const body = w - 2 * ear;
    return [
      cbox('CHASSIS', 'chassis', 0, 15, 0, body, d - 30, h),
      cbox('BEZEL', 'graphite', 0, -d / 2 + 15, 0, body, 30, h),
      cbox('INTAKE', 'champagne', 0, -d / 2 + 0.5, h * 0.12, body * 0.86, 1, h * 0.76),
      cbox('EAR_L', 'chassis', -w / 2 + ear / 2, -d / 2 + 15, 0, ear, 30, h),
      cbox('EAR_R', 'chassis', w / 2 - ear / 2, -d / 2 + 15, 0, ear, 30, h),
    ];
  },
  'gb-gb200-nvl72-rack': (w, d, h) => {
    const parts: ShapePart[] = [];
    const post = 40, base = 80, top = 60;
    for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(cbox('POST', 'black', i * (w / 2 - post / 2), j * (d / 2 - post / 2), 0, post, post, h));
    parts.push(cbox('BASE', 'black', 0, 0, 0, w, d, base));
    parts.push(cbox('TOP', 'black', 0, 0, h - top, w, d, top));
    // an even tray stack (illustrative zones, not the SKU's elevation)
    const u = 44.45, inner = w - 2 * post;
    const zones: [string, string, number][] = [['POWER', 'graphite', 3], ['COMPUTE', 'champagne', 10], ['SWITCH', 'nvgreen', 9], ['COMPUTE', 'champagne', 8], ['POWER', 'graphite', 3]];
    let z = base + 40;
    for (const [name, mat, n] of zones) {
      for (let k = 0; k < n && z + u < h - top - 20; k++) { parts.push(box(`${name}_TRAY`, mat, [-inner / 2, -d / 2 + post, z + 2], [inner / 2, d / 2 - post - 120, z + u - 2])); z += u; }
      z += u;
    }
    return parts;
  },
  'nv-rtx-pro-6000-maxq': board('graphite', 'black', 1),
  'nv-rtx-pro-6000-ws': board('graphite', 'black', 2),
  'nv-rtx-pro-5000': board('graphite', 'black', 1),
  'nv-connectx-9': board('grille', 'ports', 0),
  'dell-pro-max-gb300': tower,
  'gb-w775-v10': tower,
  'msi-ws300': tower,
  'smc-ars-511gd': rackChassis('grille', false),
  'nv-sn6600': rackChassis('ports', true),
  'dell-rtx-pro-server': rackChassis('grille', true),
  'hpe-rtx-pro-server': rackChassis('grille', false),
  'nv-sn6600-ld': rackChassis('ports', false),
  'nv-sn6810-ld': rackChassis('ports', false),
  'nv-sn6800-ld': rackChassis('ports', false),
};
