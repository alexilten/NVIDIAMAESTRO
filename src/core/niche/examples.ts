import type { NicheItem, NicheSpec } from './layout';

/**
 * Niches from GTC Berlin 2026, rebuilt from their hardware lists and label schedules (pre-onsite deck pp.70, 72,
 * 79, 81). Partner hardware the catalog does not carry is entered with the sizes the fabrication deck records for it;
 * hardware with no recorded size is listed as a placeholder and left out of the layout until it has one.
 */

let n = 0;
const id = () => `ex-${(n++).toString(36)}`;
const product = (product: string, label?: string): NicheItem => ({ id: id(), product, label });
const spark = (name: string, w = 150, d = 150, h = 50): NicheItem => ({ id: id(), custom: { name, width: w, depth: d, height: h, status: 'project', note: 'GTC Berlin 2026 fabrication deck p.186 (partner sizes from the Taipei hardware deck)' } });
const tray = (name: string): NicheItem => ({ id: id(), upright: true, custom: { name, width: 445, depth: 900, height: 45, status: 'project', note: 'GTC Berlin 2026 fabrication deck pp.72, 75' } });
const tbd = (name: string): NicheItem => ({ id: id(), placeholder: name });

const base = (code: string, name: string, type: NicheSpec['type'], rows: (NicheItem | null)[][], letter: NicheSpec['letter'] = 'standard'): NicheSpec =>
  ({ schema: 'maestro.niche', version: 1, id: `berlin-${code.toLowerCase()}`, code, name, type, rulesId: 'gtc-berlin-2026', letter, rows, updatedAt: '2026-10-27T00:00:00.000Z' });

export interface NicheExample { spec: NicheSpec; note: string }

export const NICHE_EXAMPLES: NicheExample[] = [
  {
    spec: base('02A', 'DGX Spark', 'shelf', [
      [spark('Acer Veriton GN100 AI Mini Workstation'), spark('ASUS Ascent GX10'), null, spark('Dell Pro Max With NVIDIA GB10')],
      [spark('GIGABYTE AI TOP ATOM', 150, 150, 50), null, tbd('NVIDIA GB10 Grace Blackwell Superchip and Board'), spark('HP ZGX Nano AI Station')],
      [spark('Lenovo ThinkStation PGX'), spark('MSI EdgeXpert', 151, 151, 52), tbd('H3D LinSeer MegaCube'), tbd('XFusion FusionXpark')],
    ], 'small'),
    note: 'Built at 1253 mm in Berlin (fab deck p.55). Three units have no recorded size yet.',
  },
  {
    spec: base('03', 'RTX PRO cards PCIe', 'shelf', [
      [product('nv-rtx-pro-6000-ws')],
      [product('nv-rtx-pro-5000')],
      [product('nv-rtx-pro-6000-maxq', 'NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition')],
    ]),
    note: 'Built 660 × 1255 mm with its sill at 1047 mm in Berlin (fab deck p.59).',
  },
  {
    spec: base('07A', 'LPX (Groq) compute tray', 'wall', [[tray('NVIDIA Groq 3 LPX Compute Tray')]]),
    note: 'Built with a 1255 mm opening in Berlin (fab deck p.73).',
  },
  {
    spec: base('08A', 'Vera Rubin NVL72 trays', 'wall', [[tray('NVIDIA Vera Rubin NVL72 Compute Tray'), tray('NVIDIA Vera Rubin NVL72 Switch Tray')]]),
    note: 'Two trays hung side by side, as in the label intent example (fab deck p.119).',
  },
];

/** a fresh copy with new ids, so an example can be edited without changing the original */
export function fromExample(e: NicheExample): NicheSpec {
  return { ...e.spec, id: `niche-${Date.now().toString(36)}`, rows: e.spec.rows.map((r) => r.map((c) => (c ? { ...c, id: id() } : null))), updatedAt: new Date().toISOString() };
}

